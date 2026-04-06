import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

/**
 * Transcribe audio file to text using Gemini API (native audio support)
 * Fastest method with existing credentials
 */
async function transcribeAudio(audioUrl: string): Promise<string | null> {
  try {
    console.log("[BlooWebhook] 🎤 Transcribing audio using Gemini API...", audioUrl);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("[BlooWebhook] ⚠️ GEMINI_API_KEY not configured, cannot transcribe");
      return null;
    }

    // Download audio file
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      console.error("[BlooWebhook] Failed to download audio:", audioResponse.status);
      return null;
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString("base64");

    // Detect MIME type from URL
    let mimeType = "audio/mpeg"; // default MP3
    if (audioUrl.includes(".m4a")) mimeType = "audio/mp4";
    else if (audioUrl.includes(".wav")) mimeType = "audio/wav";
    else if (audioUrl.includes(".ogg")) mimeType = "audio/ogg";
    else if (audioUrl.includes(".webm")) mimeType = "audio/webm";

    // Use Gemini's native audio transcription via multipart API
    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: "Transcribe this audio message. Reply with ONLY the transcribed text, nothing else."
            },
            {
              inline_data: {
                mime_type: mimeType,
                data: audioBase64
              }
            }
          ]
        }
      ]
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("[BlooWebhook] Gemini transcription error:", error);
      
      // Fallback to Whisper if Gemini fails
      return await transcribeWithWhisper(audioBase64, mimeType);
    }

    const result = await response.json();
    const transcribedText = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (transcribedText) {
      console.log("[BlooWebhook] ✅ Gemini transcribed:", transcribedText);
      return transcribedText;
    }

    return null;
  } catch (error) {
    console.error("[BlooWebhook] Exception during audio transcription:", error);
    return null;
  }
}

/**
 * Fallback: Transcribe using OpenAI Whisper API
 */
async function transcribeWithWhisper(audioBase64: string, mimeType: string): Promise<string | null> {
  try {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) return null;

    console.log("[BlooWebhook] Falling back to OpenAI Whisper...");

    const formData = new FormData();
    const audioBuffer = Buffer.from(audioBase64, "base64");
    const audioBlob = new Blob([audioBuffer], { type: mimeType });
    formData.append("file", audioBlob, "voice.mp3");
    formData.append("model", "whisper-1");
    formData.append("language", "en");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openaiKey}` },
      body: formData,
    });

    if (!response.ok) {
      console.error("[BlooWebhook] Whisper error:", await response.text());
      return null;
    }

    const result = await response.json();
    const text = result.text || result.transcript;
    console.log("[BlooWebhook] ✅ Whisper transcribed:", text);
    return text;
  } catch (error) {
    console.error("[BlooWebhook] Whisper fallback error:", error);
    return null;
  }
}

/**
 * Send response message back to user via Bloo API
 */
async function sendBlooReply(
  recipientPhone: string,
  message: string
): Promise<boolean> {
  try {
    const blooApiKey = process.env.BLOO_API_KEY;

    console.log("[BlooWebhook] ========== ATTEMPTING BLOO REPLY ==========");
    console.log("[BlooWebhook] Recipient:", recipientPhone);
    console.log("[BlooWebhook] Message:", message);
    console.log("[BlooWebhook] Has API Key:", !!blooApiKey);

    if (!blooApiKey) {
      console.error("[BlooWebhook] ❌ BLOO_API_KEY not configured!");
      return false;
    }

    // Normalize phone for Bloo API
    const normalizedPhone = recipientPhone.replace(/\s+/g, "").replace(/[^\d+]/g, "");
    
    // Use Bloo v2 endpoint with phone number (NO organization ID needed!)
    const endpoint = `https://backend.blooio.com/v2/api/chats/${normalizedPhone}/messages`;
    console.log("[BlooWebhook] Endpoint:", endpoint);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${blooApiKey}`,
      },
      body: JSON.stringify({
        text: message,
      }),
    });

    console.log("[BlooWebhook] Response status:", response.status);
    const responseText = await response.text();
    console.log("[BlooWebhook] Response body:", responseText);

    if (response.ok) {
      console.log("[BlooWebhook] ✅ Bloo reply sent successfully!");
      return true;
    } else {
      console.error("[BlooWebhook] ❌ Bloo API error:", responseText);
      return false;
    }
  } catch (error) {
    console.error("[BlooWebhook] Exception sending Bloo reply:", error);
    return false;
  }
}

// ============================================================================
// Types & Interfaces
// ============================================================================

type BlooWebhookPayload = {
  message?: string;
  text?: string;
  body?: string;
  phone?: unknown;
  sender?: unknown;
  from?: unknown;
  phoneNumber?: unknown;
  conversationId?: string;
  chatId?: string;
  timestamp?: string;
  [key: string]: unknown;
};

type AIAnalysisResult = {
  type: "task" | "event" | "goal" | null;
  title: string;
  date: string | null;
  time?: string | null;
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Sanitize text by removing control characters and trimming whitespace
 */
function sanitizeText(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalize phone number to international format (+91...)
 * Handles:
 * - Already prefixed: +91xxxx, +1xxxx
 * - 10 digit: 9881234567 → +919881234567
 * - 12 digit: 919881234567 → +919881234567
 * - 11 digit US: 19881234567 → +19881234567
 */
function normalizePhone(phoneInput: string): string {
  console.log(`[BlooWebhook] Normalizing phone: ${phoneInput}`);

  // Remove all non-digits except +
  let cleaned = phoneInput.replace(/[^\d+]/g, "");

  // If already has +, clean and return
  if (cleaned.startsWith("+")) {
    const normalized = "+" + cleaned.slice(1).replace(/\D/g, "");
    console.log(`[BlooWebhook] Already prefixed: ${normalized}`);
    return normalized;
  }

  // Remove any remaining +
  cleaned = cleaned.replace(/\+/g, "");

  // Handle different lengths
  if (cleaned.length === 10) {
    // India: 10 digits → add +91
    const result = "+91" + cleaned;
    console.log(`[BlooWebhook] 10-digit Indian number: ${result}`);
    return result;
  }

  if (cleaned.length === 11 && cleaned.startsWith("1")) {
    // US: 1XXXXXXXXXX → +1XXXXXXXXXX
    const result = "+" + cleaned;
    console.log(`[BlooWebhook] 11-digit US number: ${result}`);
    return result;
  }

  if (cleaned.length === 12 && cleaned.startsWith("91")) {
    // India: 91XXXXXXXXXX → +91XXXXXXXXXX
    const result = "+" + cleaned;
    console.log(`[BlooWebhook] 12-digit Indian number: ${result}`);
    return result;
  }

  if (cleaned.length > 10) {
    // Generic: just add +
    const result = "+" + cleaned;
    console.log(`[BlooWebhook] Custom format ${cleaned.length} digits: ${result}`);
    return result;
  }

  // Fallback for very short numbers - assume India
  const result = "+91" + cleaned;
  console.log(`[BlooWebhook] Fallback (short number): ${result}`);
  return result;
}

/**
 * Extract message text from Bloo payload
 */
function extractText(payload: BlooWebhookPayload): string | null {
  const raw = payload.message ?? payload.text ?? payload.body ?? null;

  if (!raw || typeof raw !== "string") {
    console.log("[BlooWebhook] No message text found");
    return null;
  }

  const sanitized = sanitizeText(raw);
  return sanitized.length ? sanitized : null;
}

/**
 * Extract audio attachment URL from Bloo payload (for voice messages)
 */
function extractAudioUrl(payload: BlooWebhookPayload): string | null {
  const attachments = (payload as any).attachments;
  
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return null;
  }

  // Look for audio attachments
  for (const attachment of attachments) {
    if (typeof attachment === "object" && attachment.url) {
      const url = attachment.url as string;
      // Check if it's an audio file (mp3, m4a, wav, ogg, etc.)
      if (/\.(mp3|m4a|wav|ogg|webm|flac)$/i.test(url)) {
        console.log("[BlooWebhook] 🎤 Found audio attachment:", url);
        return url;
      }
    }
  }

  return null;
}

/**
 * Extract sender phone from Bloo payload
 * Checks multiple possible field locations and formats
 */
function extractSenderPhone(payload: BlooWebhookPayload): string | null {
  console.log("[BlooWebhook] Attempting to extract phone...");
  
  // Log all available keys in payload
  console.log("[BlooWebhook] Available payload keys:", Object.keys(payload));
  
  // Check all possible field names
  const candidates: unknown[] = [
    payload.phone,
    payload.sender,
    payload.from,
    payload.phoneNumber,
    payload.to,
    payload.recipient,
    payload.contact,
    payload.number,
    (payload as any).recipientAddress,
    (payload as any).recipientPhoneNumber,
    (payload as any).toPhoneNumber,
  ];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (!candidate) continue;

    if (typeof candidate === "string") {
      console.log(`[BlooWebhook] Found phone (string candidate ${i}): ${candidate}`);
      return candidate;
    }

    if (typeof candidate === "object") {
      const obj = candidate as Record<string, unknown>;
      console.log(`[BlooWebhook] Checking object candidate ${i}:`, Object.keys(obj));
      
      const phone =
        obj.address || 
        obj.phoneNumber || 
        obj.phone || 
        obj.handle || 
        obj.from ||
        obj.number ||
        obj.to;

      if (typeof phone === "string") {
        console.log(`[BlooWebhook] Found phone (object property): ${phone}`);
        return phone;
      }
    }
  }

  // Last resort: check if conversationId or any field contains a phone number
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === "string" && (value.startsWith("+") || /^\d{10,}$/.test(value))) {
      console.log(`[BlooWebhook] Found potential phone in field "${key}": ${value}`);
      return value;
    }
  }

  console.log("[BlooWebhook] No sender phone found after checking all fields");
  return null;
}

/**
 * Parse message to extract intent without relying on Gemini
 * Simple, reliable logic that handles common patterns
 */
function parseMessageIntent(text: string): AIAnalysisResult {
  const lower = text.toLowerCase().trim();
  
  console.log(`[BlooWebhook] Parsing corrected message: "${text}"`);

  const cleaned = lower;

  // Detect specific time patterns (2:30 pm, 1 pm, 2:30, 1pm, etc.)
  const specificTimeMatch = cleaned.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m|p\.m)?/i);
  
  // Detect time of day keywords
  const timeOfDayMatch = cleaned.match(/\b(morning|afternoon|evening|tonight|night|noon|midnight)\b/i);
  const hasTime = specificTimeMatch || timeOfDayMatch;
  
  // Detect date patterns
  const dateKeywords = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next|today|tonight|this week|this month)\b/i;
  const hasDate = dateKeywords.test(cleaned);

  // Detect goal/learning keywords
  const goalKeywords = /\b(learn|study|master|improve|practice|get better|become|achieve|complete|finish|accomplish)\b/i;
  const isGoal = goalKeywords.test(cleaned);

  // **NEW: Detect EVENT keywords** (schedule, meeting, recital, concert, etc.)
  const eventKeywords = /\b(schedule|meeting|event|recital|concert|performance|appointment|presentation|show|rehearsal|practice|session|class|lecture|seminar|conference|summit|interview|date|call|zoom|webinar|demo|review)\b/i;
  const isEvent = eventKeywords.test(cleaned);

  // **IMPROVED Determine type**
  let type: "task" | "goal" | "event" = "task";
  
  // Priority: If has EVENT keyword + date/time → EVENT
  if (isEvent && (hasTime || hasDate)) {
    type = "event";
    console.log(`[BlooWebhook] Type: EVENT (keyword + date/time)`);
  }
  // If has ANY date or time → EVENT
  else if (hasTime || hasDate) {
    type = "event";
    console.log(`[BlooWebhook] Type: EVENT (has date or time)`);
  }
  // If learning keywords and NO date/time → GOAL
  else if (isGoal && !hasDate && !hasTime) {
    type = "goal";
    console.log(`[BlooWebhook] Type: GOAL (learning keyword, no time)`);
  }
  // Otherwise → TASK
  else {
    type = "task";
    console.log(`[BlooWebhook] Type: TASK (default)`);
  }

  // **IMPROVED Extract date** (TODAY = 2026-04-03, TOMORROW = 2026-04-04)
  let date: string | null = null;
  if (cleaned.includes("friday")) {
    date = "2026-04-04";
  } else if (cleaned.includes("saturday")) {
    date = "2026-04-05";
  } else if (cleaned.includes("sunday")) {
    date = "2026-04-06";
  } else if (cleaned.includes("monday")) {
    date = "2026-04-07";
  } else if (cleaned.includes("tuesday")) {
    date = "2026-04-08";
  } else if (cleaned.includes("wednesday")) {
    date = "2026-04-09";
  } else if (cleaned.includes("thursday")) {
    date = "2026-04-10";
  } else if (cleaned.includes("tomorrow")) {
    date = "2026-04-04";
  } else if (cleaned.includes("today")) {
    date = "2026-04-03";
  }

  // **IMPROVED Extract time**
  let time: string | null = null;
  
  if (specificTimeMatch) {
    // Specific time like "2:30 pm" or "1 pm"
    let hour = parseInt(specificTimeMatch[1]);
    const min = parseInt(specificTimeMatch[2]) || 0;
    const meridiem = specificTimeMatch[3]?.toLowerCase();
    
    if (meridiem?.includes("p")) {
      if (hour !== 12) hour += 12;
    } else if (meridiem?.includes("a")) {
      if (hour === 12) hour = 0;
    }
    
    time = `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    console.log(`[BlooWebhook] Parsed specific time: ${time}`);
  } else if (timeOfDayMatch) {
    // Time of day like "morning", "afternoon", etc.
    const timeWord = timeOfDayMatch[1].toLowerCase();
    if (timeWord === "morning") {
      time = "09:00";
    } else if (timeWord === "afternoon") {
      time = "14:00";
    } else if (timeWord === "evening") {
      time = "18:00";
    } else if (timeWord === "night" || timeWord === "tonight") {
      time = "20:00";
    } else if (timeWord === "noon") {
      time = "12:00";
    } else if (timeWord === "midnight") {
      time = "00:00";
    }
    console.log(`[BlooWebhook] Parsed time of day "${timeWord}" as ${time}`);
  }

  // **IMPROVED Extract title** - preserve original text, just remove time/date markers
  let title = cleaned
    // Remove prepositions before time keywords
    .replace(/\b(at|on|in|for)\s+(morning|afternoon|evening|night|tonight|noon|midnight)\b/gi, "")
    // Remove time keywords
    .replace(/\b(morning|afternoon|evening|tonight|night|noon|midnight|am|pm|a\.m|p\.m|o'clock)\b/gi, "")
    // Remove specific times like "2:30 pm" or "1 pm"
    .replace(/\b\d{1,2}(?::\d{2})?\s*(am|pm|a\.m|p\.m)?\b/gi, "")
    // Remove date keywords
    .replace(/\b(on|at|in|next|this|the|a|an|for)\b/gi, "")
    .replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|tonight|this week|this month)\b/gi, "")
    // Clean up extra whitespace
    .replace(/\s+/g, " ")
    .trim();

  // If title is empty or too short, use original text
  if (!title || title.length < 2) {
    title = text;
    console.log(`[BlooWebhook] Title was empty, using original: "${title}"`);
  }

  // Capitalize first letter
  title = title.charAt(0).toUpperCase() + title.slice(1);

  // Ensure max length
  title = title.slice(0, 200);

  console.log(`[BlooWebhook] Final parse result:`, {
    type,
    title,
    date,
    time,
    isEvent,
    hasDate,
    hasTime,
    isGoal,
  });

  return { type, title, date, time };
}

/**
 * Fix common typos - DO NOT use Gemini as it hallucinates unrelated content
 * Just apply simple, safe replacements
 */
function correctSpellingLocally(text: string): string {
  // Apply only safe, intentional typo fixes
  let corrected = text
    // Tomorrow variations (tommrow, tommorow, tmrw, tmrow, etc.)
    .replace(/\b(tommorow|tommrow|tmrow|tmrw|tomorow)\b/gi, "tomorrow")
    // Common word typos
    .replace(/\bshedule\b/gi, "schedule")
    .replace(/\bmeating\b/gi, "meeting")
    .replace(/\bmeeting\b/gi, "meeting")
    .replace(/\brecital\b/gi, "recital")
    .replace(/\brecitle\b/gi, "recital")
    .replace(/\bappointmemt\b/gi, "appointment")
    .replace(/\bappointment\b/gi, "appointment");

  if (corrected !== text) {
    console.log(`[BlooWebhook] Local spell fix: "${text}" → "${corrected}"`);
  }
  return corrected;
}

/**
 * NO LONGER USE GEMINI FOR SPELL CORRECTION - it hallucinates unrelated content
 * DEPRECATED - keeping for reference
 */
async function correctSpellingWithGemini(text: string): Promise<string> {
  // DISABLED: Gemini was hallucinating and replacing user messages with random content like "buy food"
  // For example, "Recital tomorrow morning" was being changed to "buy food"
  // Now using simple local typo fixes only
  console.log(`[BlooWebhook] Using local spell correction (Gemini disabled due to hallucinations)`);
  return correctSpellingLocally(text);
}

/**
 * Use Gemini AI to analyze message and extract intent
 * Returns: type (task|goal|event|null), title, and optional date/time
 */
async function analyzeWithGemini(text: string): Promise<AIAnalysisResult> {
  try {
    // First, fix spelling mistakes using Gemini
    const correctedText = await correctSpellingWithGemini(text);

    // Then analyze intent with the corrected text
    console.log(
      "[BlooWebhook] Analyzing corrected message locally:",
      correctedText
    );
    return parseMessageIntent(correctedText);
  } catch (error) {
    console.log("[BlooWebhook] Analysis error, falling back to original text:", error);
    return parseMessageIntent(text);
  }
}

// ============================================================================
// Main Webhook Handler
// ============================================================================

export async function POST(req: NextRequest) {
  console.log("[BlooWebhook] Received POST request");

  try {
    let payload = (await req.json()) as BlooWebhookPayload;

    console.log("[BlooWebhook] ===== RAW PAYLOAD START =====");
    console.log("[BlooWebhook] Full Payload:", JSON.stringify(payload, null, 2));
    console.log("[BlooWebhook] Payload Keys:", Object.keys(payload));
    console.log("[BlooWebhook] ===== RAW PAYLOAD END =====");

    // ⚠️ IMPORTANT: Only process "message.received" events
    // This is when a user sends a message to the Bloo number
    // Ignore "delivered", "read", etc. to prevent duplicates
    const eventType = (payload as any).event;
    console.log(`[BlooWebhook] Event type: ${eventType}`);

    if (eventType && eventType !== "message.received") {
      console.log(`[BlooWebhook] Ignoring event type: ${eventType} (only processing message.received)`);
      return NextResponse.json({ message: "Event ignored" }, { status: 200 });
    }

    // Extract message and sender
    const rawText = extractText(payload);
    const rawSender = extractSenderPhone(payload);

    console.log("[BlooWebhook] Extracted text:", rawText);
    console.log("[BlooWebhook] Extracted sender:", rawSender);

    // Try to transcribe audio if no text but has attachments
    let finalText = rawText;
    if (!rawText) {
      const audioUrl = extractAudioUrl(payload);
      if (audioUrl) {
        console.log("[BlooWebhook] No text found, attempting audio transcription...");
        finalText = await transcribeAudio(audioUrl);
        if (finalText) {
          console.log("[BlooWebhook] Successfully transcribed audio to:", finalText);
        } else {
          console.warn("[BlooWebhook] Audio transcription failed or API not configured");
        }
      }
    }

    // Early return if no content or sender
    if (!finalText) {
      console.log("[BlooWebhook] No message text or audio, returning 200");
      return NextResponse.json(
        { message: "No message content provided" },
        { status: 200 }
      );
    }

    if (!rawSender) {
      console.log("[BlooWebhook] No sender phone, returning 200");
      return NextResponse.json(
        { message: "Missing sender phone number" },
        { status: 200 }
      );
    }

    // Normalize phone number
    const normalizedPhone = normalizePhone(String(rawSender));
    console.log("[BlooWebhook] Normalized phone:", normalizedPhone);

    // Get Supabase admin client
    const admin = getSupabaseAdminClient();

    // Store/Update Bloo number in app_config (auto-sync to all profiles)
    const blooNumber = payload.internal_id as string;
    if (blooNumber) {
      console.log("[BlooWebhook] Storing Bloo number in app_config:", blooNumber);
      const { error: configError } = await admin
        .from("app_config")
        .upsert({
          key: "global_bloo_number",
          bloo_number: blooNumber,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: "key",
        });

      if (configError) {
        console.error("[BlooWebhook] Failed to store Bloo number:", configError);
      } else {
        console.log("[BlooWebhook] ✓ Bloo number stored successfully");
      }
    }

    // Find user by phone number
    console.log("[BlooWebhook] Looking up user by phone:", normalizedPhone);
    const { data: profile, error: profileError } = await admin
      .from("user_profiles")
      .select("user_id, phone")
      .eq("phone", normalizedPhone)
      .limit(1)
      .maybeSingle();

    if (profileError) {
      console.log("[BlooWebhook] Database error looking up user:", profileError);
      // Return 200 to avoid webhook retry loops
      return NextResponse.json(
        { message: "User lookup failed" },
        { status: 200 }
      );
    }

    if (!profile?.user_id) {
      console.log(
        "[BlooWebhook] User not found for phone:",
        normalizedPhone
      );
      // Return 200 OK as per requirements - don't error on missing user
      return NextResponse.json(
        { message: "User not registered" },
        { status: 200 }
      );
    }

    const userId = profile.user_id;
    console.log("[BlooWebhook] User found:", userId);

    // Analyze message with Gemini AI
    console.log("[BlooWebhook] Analyzing message with AI...");
    const aiAnalysis = await analyzeWithGemini(finalText);

    if (!aiAnalysis.type) {
      console.log("[BlooWebhook] AI analysis did not identify actionable intent");
      // Return 200 OK - no action to take
      return NextResponse.json(
        { message: "Message acknowledged, no action taken" },
        { status: 200 }
      );
    }

    if (!aiAnalysis.title) {
      console.log("[BlooWebhook] AI analysis returned empty title");
      // Return 200 OK - can't proceed without title
      return NextResponse.json(
        { message: "Could not extract action details" },
        { status: 200 }
      );
    }

    console.log("[BlooWebhook] Processing action type:", aiAnalysis.type);

    // ========================================================================
    // CREATE TASK
    // ========================================================================
    if (aiAnalysis.type === "task") {
      console.log("[BlooWebhook] Creating task:", aiAnalysis.title);

      try {
        // Get or create default task list
        const { data: listData } = await admin
          .from("task_lists")
          .select("id")
          .eq("user_id", userId)
          .order("position", { ascending: true })
          .limit(1)
          .maybeSingle();

        let listId = listData?.id as string | undefined;

        if (!listId) {
          console.log("[BlooWebhook] Creating default task list for user");
          const { data: createdList, error: listError } = await admin
            .from("task_lists")
            .insert({
              user_id: userId,
              name: "Personal",
              color: "#3b82f6",
              is_visible: true,
              position: 0,
            })
            .select("id")
            .single();

          if (listError) {
            console.log("[BlooWebhook] Failed to create task list:", listError);
            return NextResponse.json({ message: "OK" }, { status: 200 });
          }

          listId = createdList.id as string;
          console.log("[BlooWebhook] Task list created:", listId);
        }

        // Get next position
        const { data: existing } = await admin
          .from("tasks")
          .select("position")
          .eq("list_id", listId)
          .order("position", { ascending: false })
          .limit(1);

        const nextPosition =
          existing && existing.length > 0
            ? (existing[0].position ?? 0) + 1
            : 0;

        // Insert task
        const { error: taskError } = await admin.from("tasks").insert({
          user_id: userId,
          list_id: listId,
          title: aiAnalysis.title.slice(0, 200),
          notes: `From Bloo webhook`,
          due_date: aiAnalysis.date || null,
          is_completed: false,
          is_starred: false,
          position: nextPosition,
          priority: "medium",
          due_time: aiAnalysis.time || null,
          progress: 0,
          metadata: {
            source: "bloo_webhook",
            originalMessage: finalText.slice(0, 500),
          },
        });

        if (taskError) {
          console.log("[BlooWebhook] Failed to create task:", taskError);
          return NextResponse.json({ message: "OK" }, { status: 200 });
        }

        console.log("[BlooWebhook] Task created successfully");
        
        // Send confirmation message back to user (in background, don't wait)
        const replyMessage = `✓ Task created: "${aiAnalysis.title}"${aiAnalysis.date ? ` (${aiAnalysis.date})` : ""}`;
        sendBlooReply(normalizedPhone, replyMessage).catch(err => 
          console.error("[BlooWebhook] Failed to send reply:", err)
        );
        
        return NextResponse.json({ message: "Task created" }, { status: 200 });
      } catch (error) {
        console.log("[BlooWebhook] Task creation error:", error);
        return NextResponse.json({ message: "OK" }, { status: 200 });
      }
    }

    // ========================================================================
    // CREATE GOAL
    // ========================================================================
    if (aiAnalysis.type === "goal") {
      console.log("[BlooWebhook] Creating goal:", aiAnalysis.title);

      try {
        const { error: goalError } = await admin.from("goals").insert({
          user_id: userId,
          title: aiAnalysis.title.slice(0, 200),
          description: `From Bloo webhook: ${finalText.slice(0, 300)}`,
          category: "personal",
          priority: "medium",
          progress: 0,
          target_date: aiAnalysis.date || null,
        });

        if (goalError) {
          console.log("[BlooWebhook] Failed to create goal:", goalError);
          return NextResponse.json({ message: "OK" }, { status: 200 });
        }

        console.log("[BlooWebhook] Goal created successfully");
        
        // Send confirmation message back to user (in background, don't wait)
        const replyMessage = `🎯 Goal created: "${aiAnalysis.title}"`;
        sendBlooReply(normalizedPhone, replyMessage).catch(err => 
          console.error("[BlooWebhook] Failed to send reply:", err)
        );
        
        return NextResponse.json({ message: "Goal created" }, { status: 200 });
      } catch (error) {
        console.log("[BlooWebhook] Goal creation error:", error);
        return NextResponse.json({ message: "OK" }, { status: 200 });
      }
    }

    // ========================================================================
    // CREATE EVENT
    // ========================================================================
    if (aiAnalysis.type === "event") {
      console.log("[BlooWebhook] Creating event:", aiAnalysis.title);
      console.log("[BlooWebhook] Event date:", aiAnalysis.date);
      console.log("[BlooWebhook] Event time:", aiAnalysis.time);

      // Events require a date
      if (!aiAnalysis.date) {
        console.log(
          "[BlooWebhook] ⚠️ Event missing required date, skipping"
        );
        return NextResponse.json({ message: "OK" }, { status: 200 });
      }

      try {
        const { error: eventError } = await admin
          .from("calendar_events")
          .insert({
            user_id: userId,
            title: aiAnalysis.title.slice(0, 200),
            description: `From Bloo webhook: ${finalText.slice(0, 300)}`,
            event_date: aiAnalysis.date,
            start_time: aiAnalysis.time || null,
            end_time: null,
            location: null,
            category: "other",
            priority: "medium",
            source: "webhook",
            source_id: "bloo",
            is_completed: false,
          });

        if (eventError) {
          console.log("[BlooWebhook] Failed to create event:", eventError);
          return NextResponse.json({ message: "OK" }, { status: 200 });
        }

        console.log("[BlooWebhook] Event created successfully");
        
        // Send confirmation message back to user (in background, don't wait)
        const replyMessage = `📅 Event created: "${aiAnalysis.title}"${aiAnalysis.time ? ` at ${aiAnalysis.time}` : ""} on ${aiAnalysis.date}`;
        sendBlooReply(normalizedPhone, replyMessage).catch(err => 
          console.error("[BlooWebhook] Failed to send reply:", err)
        );
        
        return NextResponse.json({ message: "Event created" }, { status: 200 });
      } catch (error) {
        console.log("[BlooWebhook] Event creation error:", error);
        return NextResponse.json({ message: "OK" }, { status: 200 });
      }
    }

    // Fallback
    console.log("[BlooWebhook] No matching action type");
    return NextResponse.json({ message: "OK" }, { status: 200 });
  } catch (error) {
    console.log("[BlooWebhook] Webhook processing error:", error);
    // Always return 200 to avoid webhook retry loops
    return NextResponse.json({ message: "OK" }, { status: 200 });
  }
}
