import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from("user_profiles")
      .select("user_id, bloo_bound_number, phone")
      .limit(20);
    return NextResponse.json({
      ok: true,
      webhook_url: "https://calenderapp-apng.onrender.com/api/webhooks/bloo",
      bloo_api_key: !!process.env.BLOO_API_KEY ? "set" : "MISSING",
      gemini_api_key: !!process.env.GEMINI_API_KEY ? "set" : "MISSING",
      db_connected: !error,
      db_error: error?.message ?? null,
      user_count: data?.length ?? 0,
      users_with_bloo: data?.filter((u: any) => u.bloo_bound_number).length ?? 0,
      users_with_phone: data?.filter((u: any) => u.phone).length ?? 0,
      profiles: data?.map((u: any) => ({
        user_id: u.user_id?.slice(0, 8),
        bloo_bound_number: u.bloo_bound_number ?? null,
        phone: u.phone ? u.phone.slice(0, 4) + "***" : null,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

function normalizePhone(raw: string): string {
  // Normalize phone to +<digits> format for consistent API calls
  // Handles: " +1 (626) 742-3142 ", "+1(626)742-3142", "6267423142", etc.
  const cleaned = raw.replace(/\s+/g, "").replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) return "+" + digitsOnly(cleaned);
  const digits = digitsOnly(cleaned);
  if (digits.length >= 11) return "+" + digits;  // Assume already has country code
  if (digits.length === 10) return "+1" + digits;  // US number without country code
  return "+" + digits;  // Fallback
}

function phonesMatch(a: string, b: string): boolean {
  // Compare two phone numbers flexibly - handles different formats:
  // +1234567890, 1234567890, (123) 456-7890, +1 (626) 742-3142, etc.
  // All normalized to digit comparison (full comparison + last 10 digits fallback)
  if (!a || !b) return false;
  const da = digitsOnly(a);
  const db = digitsOnly(b);
  if (da === db) return true;  // Exact digit match
  const la = da.slice(-10);    // Last 10 digits
  const lb = db.slice(-10);
  return la.length === 10 && la === lb;  // Fallback: last 10 digits match
}

function getTodayTomorrow() {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  const tmr = new Date(now);
  tmr.setDate(now.getDate() + 1);
  return { today: fmt(now), tomorrow: fmt(tmr) };
}

function extractText(p: Record<string, unknown>): string | null {
  const raw = p.text ?? p.message ?? p.body ?? p.content ?? null;
  if (!raw || typeof raw !== "string") return null;
  const s = raw.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  return s.length ? s : null;
}

function extractSenderPhone(p: Record<string, unknown>): string | null {
  const candidates = [p.external_id, p.phone, p.sender, p.from, p.phoneNumber, p.from_number];
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 4) return c;
    if (c && typeof c === "object") {
      const o = c as Record<string, unknown>;
      const inner = o.address ?? o.phoneNumber ?? o.phone ?? o.handle ?? o.number;
      if (typeof inner === "string" && inner.length > 4) return inner as string;
    }
  }
  return null;
}

function extractBlooNumber(p: Record<string, unknown>): string | null {
  const candidates = [p.internal_id, p.channel_id, p.to, p.toNumber, p.recipient];
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 4) return c;
  }
  return null;
}

function extractImageUrl(p: Record<string, unknown>): string | null {
  // Check for image attachment in Bloo payload
  const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"];
  
  // Check attachments array for image files
  if (Array.isArray(p.attachments)) {
    for (const att of p.attachments) {
      if (att && typeof att === "object") {
        const url = (att as any).url;
        if (typeof url === "string" && url.length > 10) {
          const lowerUrl = url.toLowerCase();
          if (imageExtensions.some(ext => lowerUrl.includes(ext))) {
            console.log("[Webhook] Found image URL in attachments:", url.slice(0, 50) + "...");
            return url;
          }
        }
      }
    }
  }
  return null;
}

function extractAudioUrl(p: Record<string, unknown>): string | null {
  // Check for audio attachment in Bloo payload
  
  // PRIMARY: Check attachments array (Bloo stores URLs here)
  if (Array.isArray(p.attachments)) {
    for (const att of p.attachments) {
      if (att && typeof att === "object") {
        const url = (att as any).url;
        if (typeof url === "string" && url.length > 10 && (url.includes("http") || url.includes("/"))) {
          console.log("[Webhook] Found audio URL in attachments:", url.slice(0, 50) + "...");
          return url;
        }
      }
    }
  }
  
  // FALLBACK: Check other possible fields
  const candidates = [
    p.audio_url, p.voice_url, p.media_url, p.attachment_url,
    (p.media as any)?.url, (p.attachment as any)?.url,
    (p.audio as any)?.url, (p.voice as any)?.url
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 10 && (c.includes("http") || c.includes("/"))) {
      return c;
    }
  }
  return null;
}

// ─── SPEECH-TO-TEXT ───────────────────────────────────────────────────────────
async function transcribeAudio(audioUrl: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("[Webhook] GEMINI_API_KEY not set for transcription");
    return null;
  }

  try {
    // Download audio file
    console.log("[Webhook] Downloading audio from:", audioUrl.slice(0, 50) + "...");
    const audioResponse = await fetch(audioUrl, { signal: AbortSignal.timeout(30000) });
    if (!audioResponse.ok) {
      console.error("[Webhook] Failed to download audio:", audioResponse.status);
      return null;
    }
    
    const audioBuffer = await audioResponse.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString("base64");
    
    // Detect audio type from URL or use default
    const audioMimeType = audioUrl.includes(".ogg") ? "audio/ogg" : 
                        audioUrl.includes(".wav") ? "audio/wav" :
                        audioUrl.includes(".mp3") ? "audio/mpeg" : "audio/ogg";
    
    console.log("[Webhook] Transcribing audio (size: " + (audioBuffer.byteLength / 1024).toFixed(1) + "KB)...");

    // Use Gemini to transcribe audio
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    const result = await model.generateContent({
      contents: [{
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: audioMimeType,
              data: base64Audio,
            },
          },
          {
            text: "Transcribe this audio message exactly. Return ONLY the transcribed text, nothing else."
          }
        ],
      }],
      generationConfig: { maxOutputTokens: 300, temperature: 0.1 },
    });

    const transcription = result.response.text().trim();
    console.log("[Webhook] ✅ Transcribed:", transcription);
    return transcription;

  } catch (e: any) {
    console.error("[Webhook] Transcription error:", e?.message);
    return null;
  }
}

// ─── IMAGE SCANNING ───────────────────────────────────────────────────────────
async function scanImage(imageUrl: string): Promise<{ title: string; description: string; date?: string; time?: string; type?: "task" | "goal" | "event" } | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("[Webhook] GEMINI_API_KEY not set for image scanning");
    return null;
  }

  try {
    console.log("[Webhook] 📸 Downloading image from:", imageUrl.slice(0, 50) + "...");
    const imageResponse = await fetch(imageUrl, { signal: AbortSignal.timeout(30000) });
    if (!imageResponse.ok) {
      console.error("[Webhook] Failed to download image:", imageResponse.status);
      return null;
    }
    
    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString("base64");
    
    // Detect image type from URL
    const imageMimeType = imageUrl.toLowerCase().includes(".png") ? "image/png" :
                         imageUrl.toLowerCase().includes(".gif") ? "image/gif" :
                         imageUrl.toLowerCase().includes(".webp") ? "image/webp" :
                         imageUrl.toLowerCase().includes(".bmp") ? "image/bmp" :
                         "image/jpeg";
    
    console.log("[Webhook] 📸 Scanning image (size: " + (imageBuffer.byteLength / 1024).toFixed(1) + "KB, type: " + imageMimeType + ")...");

    // Use Gemini Vision to extract event/task/goal details
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    const result = await model.generateContent({
      contents: [{
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: imageMimeType,
              data: base64Image,
            },
          },
          {
            text: `Analyze this image and extract event/task/goal details. Return ONLY valid JSON, no markdown, no explanation.

CRITICAL INSTRUCTIONS:
1. Look for text fields like "EVENT NAME HERE", "Title:", "Task:", "Goal:" - use EXACTLY what you see
2. For times like "10:00 AM - 12:00 PM" or "10:00 AM - 12:00 PM", extract ONLY the START time (10:00)
3. For dates, look for explicit dates mentioned (e.g., "26 March 2026") and convert to YYYY-MM-DD
4. If you see a calendared event/task/goal, it's type="event" for scheduled items, type="task" for action items, type="goal" for habits
5. Extract the actual visible text, not generic placeholders

JSON format (MUST be valid JSON):
{"title":"exact title from image","description":"brief description","date":"YYYY-MM-DD or null","time":"HH:MM or null","type":"event|task|goal"}

Return ONLY the JSON object, nothing else - no markdown, no extra text.`
          }
        ],
      }],
      generationConfig: { maxOutputTokens: 500, temperature: 0.1 },
    });

    const rawText = result.response.text().trim().replace(/```json|```/g, "").trim();
    // Fix 3: safe JSON parse — Gemini occasionally wraps output even with instructions
    let analyzed: any;
    try {
      analyzed = JSON.parse(rawText);
    } catch {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) { console.error("[Webhook] 📸 Could not parse image JSON:", rawText.slice(0, 100)); return null; }
      try { analyzed = JSON.parse(jsonMatch[0]); } catch { return null; }
    }
    console.log("[Webhook] 📸 Image analysis:", analyzed);
    return analyzed;

  } catch (e: any) {
    console.error("[Webhook] Image scanning error:", e?.message);
    return null;
  }
}

// ─── AI INTENT ────────────────────────────────────────────────────────────────
type Intent = {
  type: "task" | "goal" | "event" | "delete_task" | "delete_event" | "delete_goal" | "query" | null;
  title: string;
  date: string | null;
  time: string | null;
  queryRange?: "today" | "tomorrow" | "this_week" | "date";
};

// ─── CONVERSATION HISTORY (Fix 1 + 2) ─────────────────────────────────────────
// SQL migration (run once in Supabase SQL editor):
//   CREATE TABLE IF NOT EXISTS bloo_conversations (
//     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//     user_id uuid NOT NULL,
//     role text NOT NULL CHECK (role IN ('user', 'model')),
//     text text NOT NULL,
//     created_at timestamptz NOT NULL DEFAULT now()
//   );
//   CREATE INDEX IF NOT EXISTS bloo_conv_user_created ON bloo_conversations (user_id, created_at DESC);

type HistoryTurn = { role: "user" | "model"; text: string };

async function loadHistory(admin: ReturnType<typeof getSupabaseAdminClient>, userId: string): Promise<HistoryTurn[]> {
  try {
    const { data } = await admin
      .from("bloo_conversations")
      .select("role, text")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(6); // last 3 pairs of turns (Fix 2: context window bound)
    if (!data?.length) return [];
    return (data as Array<{ role: string; text: string }>)
      .reverse()
      .map(r => ({ role: r.role as "user" | "model", text: String(r.text || "").slice(0, 500) })); // Fix 2: 500-char cap
  } catch {
    return []; // table may not exist yet — graceful degradation
  }
}

async function saveHistory(admin: ReturnType<typeof getSupabaseAdminClient>, userId: string, userText: string, modelText: string): Promise<void> {
  try {
    await admin.from("bloo_conversations").insert([
      { user_id: userId, role: "user",  text: userText.slice(0, 500) },
      { user_id: userId, role: "model", text: modelText.slice(0, 500) },
    ]);
    // Prune to last 20 rows to prevent unbounded growth
    const { data: all } = await admin
      .from("bloo_conversations")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (all && all.length > 20) {
      const ids = all.slice(0, all.length - 20).map((r: any) => r.id);
      await admin.from("bloo_conversations").delete().in("id", ids);
    }
  } catch (e: any) {
    console.error("[Webhook] saveHistory error:", e?.message);
  }
}

// Extract actionable intent from ANY message - strip ALL narrative filler
async function extractActionableIntent(text: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("[Webhook] 🔴 No GEMINI_API_KEY - skipping extraction");
    return text;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    console.log("[Webhook] 🔄 Extracting actionable intent from:", text.slice(0, 100));
    
    const result = await model.generateContent({
      contents: [{
        role: "user",
        parts: [{
          text: `EXTRACT ONLY ACTIONABLE INTENT from this message. Find what the user ACTUALLY WANTS TO DO.

Message: "${text}"

Rules:
1. Remove ALL narrative/story context ("I saw", "I was", "I think", "I'm feeling")
2. Remove ALL small talk ("how are you", "thanks", "okay", questions for info)
3. Remove ALL filler words and conversational phrases
4. Extract ONLY concrete actions: tasks (do/buy/call), events (meetings/appointments with time), goals (habits/learning)
5. VERY IMPORTANT: Keep dates and times with meetings/appointments/dinners/appointments/calls!
   - "meeting tomorrow at 2 pm" → keep as "meeting tomorrow at 2 pm"
   - "dentist Friday" → keep as "dentist Friday"
   - "call mom" → "call mom" (no redundant date needed)
   - "lunch Friday 1pm" → keep as "lunch Friday 1pm"
6. If multiple actions exist, combine them into one concise statement
7. Keep under 20 words
8. Return ONLY the cleaned actionable text, NOTHING else

Examples:
- "Hey! How are you? I was thinking, I need to buy milk and also call mom tomorrow" → "buy milk, call mom tomorrow"
- "So I saw this guy wearing a watch and honestly I want to buy a watch too" → "buy a watch"
- "I'm so busy, I finished my project, and now I need to update the spreadsheet and then schedule a meeting with Sarah on Friday" → "update spreadsheet, schedule meeting with Sarah Friday"
- "Hi, just wanted to chat but also I have a dentist appointment next Tuesday at 2pm" → "dentist appointment Tuesday 2pm"
- "meeting tomorrow at 2pm" → "meeting tomorrow at 2pm"
- "Morning jog tomorrow 6am" → "morning jog tomorrow 6am"

Cleaned intent:`
        }]
      }],
      generationConfig: { maxOutputTokens: 100, temperature: 0.1 },
    });

    const cleaned = result.response.text().trim();
    console.log("[Webhook] ✅ Extraction result:", cleaned);
    
    // Use extracted result if it has meaningful content
    if (cleaned.length > 0) {
      // Check if we got actual content (not just acknowledgments like "ok" or "thanks")
      const isMeaningful = !/^(ok|okay|sure|yes|no|thanks|thank you|cool|got it|understood)$/i.test(cleaned) && cleaned.length > 2;
      
      if (isMeaningful) {
        console.log("[Webhook] 🧹 Using extracted actionable intent");
        return cleaned;
      }
    }
    
    console.log("[Webhook] Original text is purely conversational/small talk, keeping as-is");
    return text;
  } catch (e: any) {
    console.log("[Webhook] ❌ Extraction error:", e?.message);
    return text;
  }
}

async function analyzeIntent(text: string, history: HistoryTurn[]): Promise<Intent> {
  const { today, tomorrow } = getTodayTomorrow();
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return fallbackIntent(text);

  // Skip narrative extraction for delete/query commands — don't strip the intent verb
  const isDeleteOrQuery = /\b(delete|remove|cancel|what'?s on|show me|list my|what do i have|my tasks|my calendar|my events|my goals)\b/i.test(text);
  let cleanedText = text;
  if (!isDeleteOrQuery) {
    cleanedText = await extractActionableIntent(text);
    if (/^(ok|okay|sure|yes|no|thanks|thank you|cool|got it|understood|hi|hey|hello)$/i.test(cleanedText.trim())) {
      console.log("[Webhook] 💬 Detected pure conversational message");
      return { type: null, title: text, date: null, time: null };
    }
    console.log("[Webhook] 📝 Cleaned text:", cleanedText);
  }

  // ── Fix 1: Build multi-turn contents from history ──────────────────────────
  // Cap to last 3 pairs (Fix 2: context window bound, each already capped at 500 chars in loadHistory)
  const cappedHistory = history.slice(-6);
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
  for (const turn of cappedHistory) {
    const last = contents[contents.length - 1];
    // Fix 1: merge consecutive same-role turns (mirrors the web fix)
    if (last && last.role === turn.role) {
      last.parts[0].text += "\n" + turn.text;
    } else {
      contents.push({ role: turn.role, parts: [{ text: turn.text }] });
    }
  }
  // Append current user message
  const lastContent = contents[contents.length - 1];
  if (lastContent && lastContent.role === "user") {
    lastContent.parts[0].text += "\n" + cleanedText;
  } else {
    contents.push({ role: "user", parts: [{ text: cleanedText }] });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    // Fix 1: pass systemInstruction so history context is used correctly
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: `You are a calendar assistant. Classify the user's latest message using conversation history for pronoun resolution.
Today=${today}. Tomorrow=${tomorrow}.
Return ONLY a single JSON object — no markdown, no extra text.

Format: {"type":"...","title":"...","date":"YYYY-MM-DD or null","time":"HH:MM or null","queryRange":"today|tomorrow|this_week|date or null"}

Types:
- "task"         = create action item (buy milk, call mom, fix bug)
- "goal"         = create habit/learning goal (learn piano, exercise daily)
- "event"        = create scheduled item with date or time
- "delete_task"  = delete/remove/cancel a task  ("delete task X", "remove X")
- "delete_event" = delete/cancel an event ("cancel dentist", "remove Friday meeting")
- "delete_goal"  = delete a goal ("remove my running goal")
- "query"        = read existing items ("what's on my calendar", "show tasks", "what do I have today/this week")
- null           = pure conversation (hi, thanks, how are you)

Rules:
- For "query": set queryRange to "today","tomorrow","this_week", or "date" (+ date field).
- For "delete_*": set title to the item name. If user says "it"/"that" with no clear name, set title to "".
- For "event": set date if mentioned; if no date use "event" type anyway.
- Resolve pronouns ("change it","delete that","move it to Friday") using the conversation history above.`,
    });

    // Fix 3: use JSON mode — guarantees raw JSON output (no markdown fences)
    const result = await model.generateContent({
      contents,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
        maxOutputTokens: 200,
      },
    });

    const raw = result.response.text().trim();
    console.log("[Webhook] 📊 Gemini classification:", raw);

    // Fix 3: safe JSON parse with regex fallback
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return fallbackIntent(cleanedText);
      try { parsed = JSON.parse(jsonMatch[0]); } catch { return fallbackIntent(cleanedText); }
    }

    const VALID_TYPES = ["task","goal","event","delete_task","delete_event","delete_goal","query"];
    const type = VALID_TYPES.includes(parsed.type) ? parsed.type as Intent["type"] : null;

    return {
      type,
      title: String(parsed.title ?? cleanedText).trim(),
      date: parsed.date ?? null,
      time: parsed.time ?? null,
      queryRange: parsed.queryRange ?? undefined,
    };
  } catch (e: any) {
    console.log("[Webhook] analyzeIntent failed:", e?.message);
    return fallbackIntent(cleanedText);
  }
}

function fallbackIntent(text: string): Intent {
  const { today, tomorrow } = getTodayTomorrow();
  const lower = text.toLowerCase().trim();
  
  // Note: Text should already be cleaned by extraction function before reaching here
  // This fallback just handles dates/times and type classification
  
  // Extract date/time FIRST (before type classification)
  let date: string | null = null;
  if (lower.includes("tomorrow")) date = tomorrow;
  else if (lower.includes("today")) date = today;
  else if (/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(lower)) {
    // For weekdays, default to nearest future date (simplified - just use today for now)
    date = today;  // TODO: Calculate next occurrence of that weekday
  }
  
  let time: string | null = null;
  // Try multiple time patterns: "2 pm", "2pm", "2 p.m.", "14:00", "2:30 pm", "at 2"
  let tmMatch = lower.match(/(?:at\s+)?(\d{1,2}):(\d{2})\s*(?:p\.m\.|pm|a\.m\.|am)?/i);  // HH:MM format with optional am/pm
  if (!tmMatch) {
    tmMatch = lower.match(/(?:at\s+)?(\d{1,2})\s*(?::(\d{2}))?\s*(?:p\.m\.|pm|a\.m\.|am)/i);  // H AM/PM or HH:MM AM/PM
  }
  if (!tmMatch && /(?:at\s+)?\d{1,2}(?!\d)/.test(lower)) {
    // Try matching just a number "at 2" or "2" (without am/pm, assume PM)
    const numMatch = lower.match(/(?:at\s+)?(\d{1,2})(?!\d)/);
    if (numMatch) {
      const h = parseInt(numMatch[1]);
      // If hour is 1-11, assume PM; if 12, assume AM; if 0-23, use as-is
      const finalH = (h >= 1 && h <= 11) ? h + 12 : h;
      time = `${String(finalH).padStart(2, "0")}:00`;
      tmMatch = null; // Mark as matched to skip below
    }
  }
  
  if (tmMatch && tmMatch.length >= 1) {
    let h = parseInt(tmMatch[1]);
    const m = tmMatch[2] ? parseInt(tmMatch[2]) : 0;
    let period = tmMatch[3] ? tmMatch[3].toLowerCase() : "";
    
    // Normalize period: convert "p.m." → "pm", "a.m." → "am"
    period = period.replace(/\./g, "");
    
    // Convert to 24-hour format if AM/PM specified
    if (period) {
      if ((period === "pm" || period === "p") && h !== 12) h += 12;
      if ((period === "am" || period === "a") && h === 12) h = 0;
    }
    time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  
  // Now classify intent type
  const isGoal = /\b(learn|study|master|improve|practice|habit|daily|every day|each day|consistently)\b/.test(lower);
  const isEvent = /\b(meeting|appointment|dentist|doctor|lunch|dinner|call with|schedule|book|reserve|reschedule|plan|arrange|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(lower)
    || /\d{1,2}:\d{2}|\d\s*(am|pm)/.test(lower);
  const isTask = /\b(buy|get|purchase|send|call|email|message|write|create|make|fix|repair|clean|cook|do|check|review|complete|finish|start|begin|try|build|process|handle|organize|prepare|setup)\b/i.test(lower);
  
  let type: Intent["type"] = null;  // DEFAULT: conversational
  if (isGoal && !isEvent) {
    type = "goal";
  } else if (isEvent) {
    type = "event";  // EVENT: has event keywords or is scheduled for a specific time
  } else if (isTask) {
    type = "task";   // TASK: has action keywords but no event/goal keywords
  }
  
  return { type, title: text.trim(), date, time };
}

// ─── QUERY CALENDAR (Fix 4) ───────────────────────────────────────────────────
async function queryCalendar(admin: ReturnType<typeof getSupabaseAdminClient>, userId: string, range: string | undefined, date: string | null): Promise<string> {
  const { today, tomorrow } = getTodayTomorrow();

  let startDate: string;
  let endDate: string;
  let label: string;

  if (range === "tomorrow") {
    startDate = endDate = tomorrow; label = "tomorrow";
  } else if (range === "this_week") {
    startDate = today;
    const end = new Date(today); end.setDate(end.getDate() + 7);
    endDate = end.toISOString().split("T")[0]; label = "this week";
  } else if (range === "date" && date) {
    startDate = endDate = date; label = date;
  } else {
    startDate = endDate = today; label = "today";
  }

  const [eventsResult, tasksResult] = await Promise.all([
    admin.from("calendar_events")
      .select("title, event_date, start_time")
      .eq("user_id", userId).eq("is_completed", false)
      .gte("event_date", startDate).lte("event_date", endDate)
      .not("start_time", "is", null)           // Fix 7 equivalent: only timed events in schedule view
      .order("event_date", { ascending: true }).order("start_time", { ascending: true }).limit(10),
    admin.from("tasks")
      .select("title, due_date")
      .eq("user_id", userId).eq("is_completed", false)
      .gte("due_date", startDate).lte("due_date", endDate)
      .order("due_date", { ascending: true }).limit(10),
  ]);

  const events: Array<{ title: string; event_date: string; start_time: string | null }> = eventsResult.data ?? [];
  const tasks: Array<{ title: string; due_date: string | null }> = tasksResult.data ?? [];

  if (events.length === 0 && tasks.length === 0) {
    return `Nothing scheduled for ${label}.`;
  }

  const lines: string[] = [`📅 Your schedule for ${label}:\n`];
  if (events.length > 0) {
    lines.push("Events:");
    for (const e of events) lines.push(`  • ${e.title}${e.start_time ? ` at ${e.start_time}` : ""} (${e.event_date})`);
  }
  if (tasks.length > 0) {
    if (events.length > 0) lines.push("");
    lines.push("Tasks due:");
    for (const t of tasks) lines.push(`  • ${t.title}`);
  }
  return lines.join("\n");
}

// ─── DELETE HELPERS (Fix 5) ───────────────────────────────────────────────────
async function deleteByTitle(admin: ReturnType<typeof getSupabaseAdminClient>, table: string, userId: string, titleQuery: string): Promise<{ deleted: boolean; foundTitle: string | null }> {
  const { data, error } = await admin.from(table)
    .select("id, title").eq("user_id", userId)
    .ilike("title", `%${titleQuery}%`).limit(1);
  if (error || !data?.length) return { deleted: false, foundTitle: null };
  const { error: delErr } = await admin.from(table).delete().eq("id", data[0].id);
  return { deleted: !delErr, foundTitle: data[0].title };
}

// ─── SEND BLOO ────────────────────────────────────────────────────────────────
async function sendBloo(toPhone: string, message: string, fromBlooNumber?: string | null, protocol?: string | null): Promise<void> {
  const key = process.env.BLOO_API_KEY;
  if (!key) { console.log("[Webhook] BLOO_API_KEY not set — cannot send reply"); return; }
  const phone = normalizePhone(toPhone);
  console.log(`[Webhook] SEND→${phone} (from=${fromBlooNumber ?? 'default'}, protocol=${protocol ?? 'default'}): "${message.slice(0, 80)}"`);
  try {
    // Include the sending number and protocol so Bloo knows which channel/device to use
    const payload: Record<string, string> = { text: message };
    if (fromBlooNumber) {
      payload.number = normalizePhone(fromBlooNumber);
    }
    // Send via same protocol as incoming message (iMessage → iMessage, SMS → SMS)
    if (protocol && protocol.toLowerCase() === 'imessage') {
      payload.protocol = 'imessage';
    }
    const res = await fetch(
      `https://backend.blooio.com/v2/api/chats/${encodeURIComponent(phone)}/messages`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      }
    );
    const body = await res.text();
    console.log(`[Webhook] Bloo API ${res.status}: ${body.slice(0, 300)}`);
  } catch (e: any) {
    console.error("[Webhook] Bloo send error:", e?.message);
  }
}

// ─── DB HELPERS ───────────────────────────────────────────────────────────────
async function getOrCreateTaskList(admin: any, userId: string): Promise<string | null> {
  const { data: lists } = await admin.from("task_lists").select("id").eq("user_id", userId).limit(1);
  if (lists?.length) return lists[0].id;
  const { data: nl, error } = await admin.from("task_lists")
    .insert({ user_id: userId, name: "My Tasks", color: "#3b82f6", is_visible: true, position: 0 })
    .select("id").single();
  if (error) { console.error("[Webhook] create list error:", error.message); return null; }
  return nl?.id ?? null;
}

// ─── MAIN POST HANDLER ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {

  try {
    // 1. Read body
    let rawBody = "";
    try { rawBody = await req.text(); } catch (e: any) {
      console.error("[Webhook] Read body error:", e?.message);
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    if (!rawBody.trim()) return NextResponse.json({ ok: true }, { status: 200 });

    // 2. Parse JSON
    let payload: Record<string, unknown>;
    try { payload = JSON.parse(rawBody); } catch {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // 3. Only process inbound user messages — silently skip everything else
    const event = String(payload.event ?? "").toLowerCase();
    if (event !== "message.received") {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    console.log("[Webhook] ======== INCOMING", new Date().toISOString(), "========");
    console.log("[Webhook] event:", payload.event, "| keys:", Object.keys(payload).join(", "));
    console.log("[Webhook] Full payload:", JSON.stringify(payload, null, 2).slice(0, 2000));

    // 4. Extract fields - Try text first, then voice, then image
    let text = extractText(payload);
    const senderPhone = extractSenderPhone(payload);  // external_id → reply TO this
    const blooNumber = extractBlooNumber(payload);    // internal_id → identifies WHICH user
    const protocol = String(payload.protocol ?? '').toLowerCase();  // imessage or sms
    let audioUrl: string | null = null;
    let imageUrl: string | null = null;
    let imageData: { title: string; description: string; date?: string; time?: string; type?: "task" | "goal" | "event" } | null = null;

    // If no text, check for audio URL and transcribe IMMEDIATELY (synchronous)
    if (!text) {
      audioUrl = extractAudioUrl(payload);
      if (audioUrl) {
        console.log("[Webhook] 🎙️ Voice message detected, transcribing now...");
        text = await transcribeAudio(audioUrl);
        if (text) {
          console.log("[Webhook] 🎙️ Voice → Text: " + text);
        }
      }
    }

    // ALWAYS check for image (even if text exists) - image data should enhance/override text
    imageUrl = extractImageUrl(payload);
    if (imageUrl) {
      console.log("[Webhook] 📸 Image detected, scanning now...");
      imageData = await scanImage(imageUrl);
      if (imageData && imageData.title) {
        console.log("[Webhook] 📸 Image scanned → Title: " + imageData.title);
        // If image has a real event name (not a command), use it as primary text
        if (imageData.title.length > 5 && !imageData.title.toLowerCase().includes("schedule")) {
          text = imageData.title;
          console.log("[Webhook] 📸 Using image title as primary text");
        }
      }
    }

    // If still no text after audio/image, use image title as fallback
    if (!text && imageData && imageData.title) {
      text = imageData.title;
      console.log("[Webhook] 📸 Using image title (fallback)");
    }

    // Log what we found
    console.log("[Webhook] text:", text ?? "(no text/voice/image)");
    console.log("[Webhook] senderPhone:", senderPhone, "| blooNumber:", blooNumber);

    if (!text || !senderPhone) {
      console.log("[Webhook] Missing text/voice or sender → skip");
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // Guard: skip our own bot reply messages (extra safety against loops)
    const BOT_PREFIXES = ["✅ Task created:", "🎯 Goal set:", "📅 Event added:", "✅ Added:", "⚠️", "❌", "👋 Hi! I received"];
    if (BOT_PREFIXES.some(p => text.startsWith(p))) {
      console.log("[Webhook] Skip — looks like a bot reply, not a user message");
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const replyTo = senderPhone;  // Send reply back to the personal phone number

    // 5. Find user
    // ┌─ USER PROFILE LOOKUP (Multi-User Shared Bloo Support) ─┐
    // │                                                         │
    // │ Scenario: Multiple users share the SAME Bloo number   │
    // │ Each user has a DIFFERENT personal phone               │
    // │                                                         │
    // │ Bloo payload contains:                               │
    // │  - external_id = sender's personal phone number       │
    // │  - internal_id = shared Bloo bound number             │
    // │                                                         │
    // │ MATCHING PRIORITY (for shared Bloo):                  │
    // │  1. PRIMARY: Match external_id with phone             │
    // │     (WHO sent the message → correct user account)     │
    // │  2. FALLBACK: Match internal_id with bloo_bound_num   │
    // │     (if phone not registered yet)                     │
    // │                                                         │
    // │ Example: 3 users, 1 Bloo number                       │
    // │  User 1: +8090995623  ) ──┐                           │
    // │  User 2: +8080603212  ) ── Shared: +16267423142       │
    // │  User 3: +9920261793  ) ──┘                           │
    // │                                                         │
    // │ Message from User 2 → Task created in User 2 account  │
    // └─────────────────────────────────────────────────────────┘
    const admin = getSupabaseAdminClient();
    const { data: allProfiles, error: dbErr } = await admin
      .from("user_profiles")
      .select("user_id, phone, bloo_bound_number");

    if (dbErr) {
      console.error("[Webhook] DB error:", dbErr.message);
      sendBloo(replyTo, "⚠️ Oops! I'm having trouble connecting. Please try again in a moment! 🔄", blooNumber, protocol).catch(e => console.error("[Webhook] Send error:", e?.message));
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    console.log(`[Webhook] Searching ${allProfiles?.length ?? 0} profiles | blooNumber=${blooNumber} | senderPhone=${senderPhone}`);

    let userId: string | null = null;

    // PRIMARY MATCH: Try to find user by SENDER'S PHONE (external_id from Bloo)
    // This is critical for multi-user shared Bloo: match by WHO SENT the message
    if (senderPhone && allProfiles) {
      const normSender = normalizePhone(senderPhone);
      for (const p of allProfiles) {
        if (p.phone && phonesMatch(normSender, p.phone)) {
          userId = p.user_id;
          console.log(`[Webhook] ✅ PRIMARY MATCH: phone "${p.phone}" → user ${p.user_id}`);
          break;
        }
      }
    }

    // FALLBACK MATCH: If no phone match, try to find user by Bloo bound number (internal_id from Bloo)
    // This catches users who may not have registered their phone number yet
    if (!userId && blooNumber && allProfiles) {
      const normBloo = normalizePhone(blooNumber);
      for (const p of allProfiles) {
        if (p.bloo_bound_number && phonesMatch(normBloo, p.bloo_bound_number)) {
          userId = p.user_id;
          console.log(`[Webhook] ✅ FALLBACK MATCH: bloo_bound_number "${p.bloo_bound_number}" → user ${p.user_id}`);
          break;
        }
      }
    }

    if (!userId) {
      console.log("[Webhook] ❌ No user found for blooNumber:", blooNumber, "senderPhone:", senderPhone);
      console.log("[Webhook] All bloo_bound_numbers:", allProfiles?.map((p: any) => p.bloo_bound_number));
      console.log("[Webhook] All phones:", allProfiles?.map((p: any) => p.phone));
      await sendBloo(
        replyTo,
        "👋 Hi! I'm Cal, your calendar assistant. 📱\n\nI couldn't recognize your account. Please:\n\n1. Open the Calendar app\n2. Go to Settings ⚙️\n3. Save your:\n   📞 Personal phone: +919920261793\n   📲 Bloo bound number: +1(626)742-3142\n\nThen message me again and I'll create tasks, events, and goals for you! 🚀",
        blooNumber,
        protocol
      );
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // 6. Load conversation history (Fix 1 + 2) + analyze intent with context
    const history = await loadHistory(admin, userId);
    const quickIntent = await analyzeIntent(text, history);
    console.log("[Webhook] Quick Intent (AI-analyzed):", JSON.stringify(quickIntent));

    const sourceType = imageUrl ? "image" : audioUrl ? "voice" : "text";

    // 7. Merge image data into intent if available
    let finalIntent = { ...quickIntent };
    const finalDescription = `via Bloo (${sourceType})`;

    if (imageData) {
      if (imageData.title && imageData.title.length > 5 && !imageData.title.toLowerCase().includes("schedule")) {
        finalIntent.title = imageData.title;
      }
      if (imageData.type) finalIntent.type = imageData.type as Intent["type"];
      const userHasDateContext = /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(String(text || ""));
      if (imageData.date && !userHasDateContext) finalIntent.date = imageData.date;
      if (imageData.time) finalIntent.time = imageData.time;
    }

    // 7a. Fix 6: Ambiguity guard for delete — resolve pronoun from history or ask for clarification
    const VAGUE_PRONOUN = /^(it|that|this|the event|the task|the meeting|the appointment|the goal)$/i;
    if (finalIntent.type === "delete_task" || finalIntent.type === "delete_event" || finalIntent.type === "delete_goal") {
      if (!finalIntent.title || VAGUE_PRONOUN.test(finalIntent.title.trim())) {
        // Try resolving from last bot confirmation message in history
        const lastConfirm = [...history].reverse().find(t =>
          t.role === "model" && /✅ Task created:|📅 Event added:|🎯 Goal set:/.test(t.text)
        );
        const nameMatch = lastConfirm?.text.match(/"([^"]+)"/);
        if (nameMatch) {
          finalIntent.title = nameMatch[1];
          console.log("[Webhook] 🔍 Resolved pronoun delete to:", finalIntent.title);
        } else {
          const typeLabel = finalIntent.type === "delete_task" ? "task" : finalIntent.type === "delete_event" ? "event" : "goal";
          const clarify = `Which ${typeLabel} would you like to delete? Please give me the name.`;
          await sendBloo(replyTo, clarify, blooNumber, protocol);
          await saveHistory(admin, userId, text, clarify);
          return NextResponse.json({ ok: true }, { status: 200 });
        }
      }
    }

    // 8. DB operations
    let dbSuccess = false;
    let dbError = "";
    let sentResponse = "";

    try {
      if (finalIntent.type === "task") {
        const listId = await getOrCreateTaskList(admin, userId);
        if (!listId) {
          dbError = "Could not create task list";
        } else {
          const { error } = await admin.from("tasks").insert({
            user_id: userId, list_id: listId,
            title: finalIntent.title.slice(0, 200), notes: finalDescription,
            due_date: finalIntent.date ?? null, due_time: finalIntent.time ?? null,
            is_completed: false, is_starred: false, position: 0, priority: "medium", progress: 0,
          });
          if (error) { dbError = error.message; } else { dbSuccess = true; console.log("[Webhook] ✅ Task inserted"); }
        }

      } else if (finalIntent.type === "goal") {
        const { error } = await admin.from("goals").insert({
          user_id: userId, title: finalIntent.title.slice(0, 200), description: finalDescription,
          category: "personal", priority: "medium", progress: 0, target_date: finalIntent.date ?? null,
        });
        if (error) { dbError = error.message; } else { dbSuccess = true; console.log("[Webhook] ✅ Goal inserted"); }

      } else if (finalIntent.type === "event") {
        if (finalIntent.date) {
          const { error } = await admin.from("calendar_events").insert({
            user_id: userId, title: finalIntent.title.slice(0, 200), description: finalDescription,
            event_date: finalIntent.date, start_time: finalIntent.time ?? null,
            is_completed: false, category: "other", priority: "medium",
          });
          if (error) { dbError = error.message; } else { dbSuccess = true; console.log("[Webhook] ✅ Event inserted"); }
        } else {
          // No date — store as task (Fix 5: guard against empty updates)
          const listId = await getOrCreateTaskList(admin, userId);
          if (!listId) { dbError = "Could not create task list"; } else {
            const { error } = await admin.from("tasks").insert({
              user_id: userId, list_id: listId, title: finalIntent.title.slice(0, 200), notes: finalDescription,
              due_time: finalIntent.time ?? null, is_completed: false, is_starred: false, position: 0, priority: "medium", progress: 0,
            });
            if (error) { dbError = error.message; } else { dbSuccess = true; console.log("[Webhook] ✅ Task (no date) inserted"); }
          }
        }

      } else if (finalIntent.type === "delete_task") {
        // Fix 5: delete task by title
        const { deleted, foundTitle } = await deleteByTitle(admin, "tasks", userId, finalIntent.title);
        if (deleted) { dbSuccess = true; finalIntent.title = foundTitle ?? finalIntent.title; console.log("[Webhook] ✅ Task deleted"); }
        else { dbError = `No task found matching "${finalIntent.title}"`; }

      } else if (finalIntent.type === "delete_event") {
        const { deleted, foundTitle } = await deleteByTitle(admin, "calendar_events", userId, finalIntent.title);
        if (deleted) { dbSuccess = true; finalIntent.title = foundTitle ?? finalIntent.title; console.log("[Webhook] ✅ Event deleted"); }
        else { dbError = `No event found matching "${finalIntent.title}"`; }

      } else if (finalIntent.type === "delete_goal") {
        const { deleted, foundTitle } = await deleteByTitle(admin, "goals", userId, finalIntent.title);
        if (deleted) { dbSuccess = true; finalIntent.title = foundTitle ?? finalIntent.title; console.log("[Webhook] ✅ Goal deleted"); }
        else { dbError = `No goal found matching "${finalIntent.title}"`; }

      } else if (finalIntent.type === "query") {
        // Fix 4: calendar query
        sentResponse = await queryCalendar(admin, userId, finalIntent.queryRange, finalIntent.date);
        dbSuccess = true;

      } else {
        // Conversational — no DB needed
        dbSuccess = true;
      }
    } catch (err: any) {
      dbError = err?.message || "Unknown error";
      console.error("[Webhook] DB operation error:", dbError);
    }

    // 9. Send response + save history
    if (finalIntent.type === "task" && dbSuccess) {
      sentResponse = `✅ Task created: "${finalIntent.title}"`;
    } else if (finalIntent.type === "goal" && dbSuccess) {
      sentResponse = `🎯 Goal set: "${finalIntent.title}"`;
    } else if (finalIntent.type === "event" && dbSuccess) {
      if (finalIntent.date) {
        const dateStr = finalIntent.time ? `${finalIntent.date} at ${finalIntent.time}` : finalIntent.date;
        sentResponse = `📅 Event added: "${finalIntent.title}" — ${dateStr}`;
      } else {
        sentResponse = `✅ Added: "${finalIntent.title}" (include a date like "tomorrow" or "Friday" to create a calendar event)`;
      }
    } else if (finalIntent.type === "delete_task" && dbSuccess) {
      sentResponse = `🗑️ Task deleted: "${finalIntent.title}"`;
    } else if (finalIntent.type === "delete_event" && dbSuccess) {
      sentResponse = `🗑️ Event deleted: "${finalIntent.title}"`;
    } else if (finalIntent.type === "delete_goal" && dbSuccess) {
      sentResponse = `🗑️ Goal deleted: "${finalIntent.title}"`;
    } else if (finalIntent.type === "query" && dbSuccess) {
      // sentResponse already set by queryCalendar above
    } else if (dbError) {
      sentResponse = `❌ ${dbError.slice(0, 80)}. Please try again.`;
    } else {
      // Conversational
      const casualQuestion = /\b(how are you|how are you doing|what's up|what are you doing|how's it going|how's your day)\b/i.test(text.toLowerCase());
      const { data: profileData } = await admin
        .from("user_profiles").select("has_received_welcome").eq("user_id", userId).maybeSingle();
      const alreadyWelcomed = profileData?.has_received_welcome === true;

      if (!alreadyWelcomed) {
        sentResponse = "Hey there! 👋 I'm Cal, your calendar assistant! 📱\n\nWhat would you like to create today?\n\n📝 **TASK** - \"Buy groceries\" or \"Call mom\"\n📅 **EVENT** - \"Meeting tomorrow at 2pm\" or \"Dinner Friday 7pm\"\n🎯 **GOAL** - \"Learn guitar daily\" or \"Exercise 3x week\"\n\nOr just chat with me! 💬";
        await admin.from("user_profiles").update({ has_received_welcome: true }).eq("user_id", userId);
      } else if (casualQuestion) {
        sentResponse = "😊 Doing great, thanks! What would you like to create? A task, event, or goal?";
      } else {
        sentResponse = "Hey! 👋 What can I help you create today? Try: \"Buy milk\" (task), \"Meeting Friday 2pm\" (event), or \"Learn Spanish\" (goal).";
      }
    }

    await sendBloo(replyTo, sentResponse, blooNumber, protocol);

    // Save this exchange to conversation history (enables follow-up pronoun resolution)
    await saveHistory(admin, userId, text, sentResponse);

    console.log("[Webhook] ======== DONE (response sent) ========\n");
    return NextResponse.json({ ok: true }, { status: 200 });

  } catch (err: any) {
    console.error("[Webhook] ❌ Unhandled exception:", err?.message);
    console.error("[Webhook] Stack:", err?.stack);
    return NextResponse.json({ ok: true }, { status: 200 });
  }
}

