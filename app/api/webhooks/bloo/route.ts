import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

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
  summary?: string;
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
 * Normalize phone number to international format (+XX...)
 * Handles:
 * - Already prefixed: +91xxxx, +1xxxx, +44xxxx, etc.
 * - Country code + digits: 919881234567 → +919881234567
 * - Ambiguous 10 digit: Only auto-prefix +91 if explicitly asked
 * - US 11-digit: 13477604418 → +13477604418
 */
function normalizePhone(phoneInput: string): string {
  console.log(`[BlooWebhook] Normalizing phone: ${phoneInput}`);

  // Remove all non-digits except + and remove ALL spaces
  let cleaned = phoneInput
    .replace(/\s+/g, "")  // Remove spaces first
    .replace(/[^\d+]/g, "");

  // If already has +, clean and return
  if (cleaned.startsWith("+")) {
    const normalized = "+" + cleaned.slice(1).replace(/\D/g, "");
    console.log(`[BlooWebhook] Already prefixed: ${normalized}`);
    return normalized;
  }

  // Remove any remaining +
  cleaned = cleaned.replace(/\+/g, "");

  // For any number > 10 digits, assume it already has country code
  if (cleaned.length > 10) {
    const result = "+" + cleaned;
    console.log(`[BlooWebhook] Country code included (${cleaned.length} digits): ${result}`);
    return result;
  }

  // For 10-digit numbers, only auto-prefix +91 if it looks like Indian format
  // Otherwise, require user to provide country code
  if (cleaned.length === 10) {
    // If it starts with 6, 7, 8, or 9, it's likely Indian (91xxxxxxxxxx)
    if (/^[6789]/.test(cleaned)) {
      const result = "+91" + cleaned;
      console.log(`[BlooWebhook] 10-digit Indian number detected: ${result}`);
      return result;
    }
    
    // Ambiguous - return with + only
    // User should provide country code for non-Indian 10-digit numbers
    const result = "+" + cleaned;
    console.log(`[BlooWebhook] 10-digit ambiguous number (not Indian format): ${result}`);
    return result;
  }

  // Less than 10 digits - might be incomplete
  const result = "+" + cleaned;
  console.log(`[BlooWebhook] Short number (${cleaned.length} digits): ${result}`);
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
 * Use Gemini AI to analyze message and understand user intent intelligently
 * Returns structured: type (goal|task|event), title, date, time, summary
 */
async function analyzeMessageWithAI(text: string): Promise<AIAnalysisResult & { summary: string }> {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.log("[BlooWebhook] Gemini API key not configured, using fallback parsing");
      const fallback = parseMessageIntent(text);
      return { ...fallback, summary: fallback.summary || fallback.title };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `You are an intelligent assistant that understands user intent from casual messages.
Analyze this message and determine what the user wants to create.

Message: "${text}"

Respond with ONLY valid JSON (no markdown, no extra text):
{
  "type": "goal" | "task" | "event",
  "title": "extracted title without action words",
  "date": "YYYY-MM-DD or null",
  "time": "HH:MM or null",
  "summary": "What user said in simple terms"
}

TYPE RULES:
- "goal": Learning, improving, building habits (remind me to learn, want to achieve, build habit)
- "event": Has specific date/time (tomorrow at 7pm, meeting on friday)
- "task": Simple action without date/time (buy groceries, call mom)

TITLE RULES:
- Remove action words: "create goal/task/event", "remind me (to)", "tell me to"
- Remove time/date keywords
- Keep the core action/object
- Start with capital letter

DATE RULES:
- Today: 2026-03-22
- Tomorrow: 2026-03-23
- Friday: 2026-03-28
- Saturday: 2026-03-29
- Sunday: 2026-03-23
- Monday: 2026-03-24
- Tuesday: 2026-03-25
- Wednesday: 2026-03-26
- Thursday: 2026-03-27
- Every day/everyday (recurring): null
- If no date mentioned: null

TIME RULES:
- Extract only if explicitly mentioned (e.g., "6pm", "at 7 o'clock")
- Return in "HH:MM" 24-hour format
- "6pm" → "18:00"
- "7am" → "07:00"
- If not mentioned: null

EXAMPLES:
"buy groceries" → {"type":"task", "title":"Buy groceries", "date":null, "time":null, "summary":"User wants to buy groceries"}
"Create goal to run 6k everyday" → {"type":"goal", "title":"Run 6k everyday", "date":null, "time":null, "summary":"User wants to build habit of 6k running"}
"remind me to learn coding" → {"type":"goal", "title":"Learn coding", "date":null, "time":null, "summary":"User wants to learn coding"}
"baseball match tomorrow at 7pm" → {"type":"event", "title":"Baseball match", "date":"2026-03-23", "time":"19:00", "summary":"User has baseball match tomorrow at 7pm"}
"deadline tomorrow at 2pm" → {"type":"event", "title":"Deadline", "date":"2026-03-23", "time":"14:00", "summary":"User has deadline tomorrow at 2pm"}`;

    const response = await model.generateContent(prompt);
    const responseText = response.response.text().trim();

    // Parse JSON response
    try {
      const result = JSON.parse(responseText);
      console.log("[BlooWebhook] AI Analysis:", result);
      return result;
    } catch (e) {
      console.log("[BlooWebhook] Failed to parse AI response:", responseText);
      // Fallback to regex parsing with summary
      const fallback = parseMessageIntent(text);
      return { ...fallback, summary: fallback.summary || fallback.title };
    }
  } catch (error) {
    console.log("[BlooWebhook] AI analysis error, using fallback:", error);
    const fallback = parseMessageIntent(text);
    return { ...fallback, summary: fallback.summary || fallback.title };
  }
}

/**
 * Parse message to extract intent without relying on Gemini
 * Simple, reliable logic that handles common patterns
 */
function parseMessageIntent(text: string): AIAnalysisResult {
  const lower = text.toLowerCase().trim();
  
  console.log(`[BlooWebhook] Parsing corrected message: "${text}"`);

  // First, remove common action phrases BEFORE type detection
  // This prevents "create a goal" from being detected as EVENT due to time in it
  let cleaned = lower
    .replace(/\b(create\s+(task|goal|event|reminder))\b/gi, "")  // Remove "create task/goal/event/reminder"
    .replace(/\b(remind\s+me\s+to|remind\s+me)\b/gi, "")  // Remove "remind me" and "remind me to"
    .trim();

  // Detect time patterns (must have am/pm or colon to avoid false matches like "6k")
  const timeMatch = cleaned.match(/(\d{1,2}):(\d{2})\s*(am|pm|a\.m|p\.m)?|(\d{1,2})\s+(am|pm|a\.m|p\.m)|\b(morning|afternoon|evening|tonight|noon)\b/i);
  const hasTime = timeMatch ? timeMatch[0] : null;
  
  // Detect date patterns (including recurring like "everyday", "daily")
  const dateKeywords = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next|today|tonight|this week|this month|everyday|daily)\b/i;
  const hasDate = dateKeywords.test(cleaned);

  // Detect goal/learning keywords
  const goalKeywords = /\b(learn|study|master|improve|practice|get better|become|achieve|complete|finish|accomplish|run|exercise|workout|gym|build habit)\b/i;
  const isGoal = goalKeywords.test(cleaned);

  // Determine type (check GOAL first to prevent false time matches from becoming events)
  let type: "task" | "goal" | "event" = "task";
  
  // If goal keywords found AND no explicit date → GOAL
  if (isGoal && !hasDate) {
    type = "goal";
  }
  // If has date or time → EVENT
  else if (hasTime || hasDate) {
    type = "event";
  }
  // Otherwise → TASK (default)

  // Extract date (simple approach)
  let date: string | null = null;
  if (cleaned.includes("friday")) {
    date = "2026-03-21";
  } else if (cleaned.includes("saturday")) {
    date = "2026-03-22";
  } else if (cleaned.includes("sunday")) {
    date = "2026-03-23";
  } else if (cleaned.includes("monday")) {
    date = "2026-03-24";
  } else if (cleaned.includes("tuesday")) {
    date = "2026-03-25";
  } else if (cleaned.includes("wednesday")) {
    date = "2026-03-26";
  } else if (cleaned.includes("thursday")) {
    date = "2026-03-27";
  } else if (cleaned.includes("tomorrow")) {
    date = "2026-03-19";
  } else if (cleaned.includes("today")) {
    date = "2026-03-18";
  }

  // Extract time (only if explicitly specified with am/pm or colon format)
  let time: string | null = null;
  const timeParse = cleaned.match(/(\d{1,2}):(\d{2})\s*(am|pm|a\.m|p\.m)?|(\d{1,2})\s+(am|pm|a\.m|p\.m)/i);
  if (timeParse) {
    let hour = parseInt(timeParse[1] || timeParse[4]);
    const min = timeParse[2] ? parseInt(timeParse[2]) : 0;
    const meridiem = (timeParse[3] || timeParse[5])?.toLowerCase();
    
    if (meridiem && (meridiem.includes("p"))) {
      if (hour !== 12) hour += 12;
    } else if (meridiem && (meridiem.includes("a"))) {
      if (hour === 12) hour = 0;
    }
    
    time = `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }

  // Create title from cleaned text (remove time/date keywords and common phrases)
  let title = cleaned
    .replace(/\b(create\s+(task|goal|event|reminder))\b/gi, "")  // Remove "create task", "create goal", etc.
    .replace(/\b(remind\s+me\s+to|remind\s+me)\b/gi, "")  // Remove "remind me" and "remind me to"
    .replace(/\b(at|on|in|this|next)\b/g, "")
    .replace(/\b(morning|afternoon|evening|tonight|noon|am|pm|a\.m|p\.m|o'clock)\b/g, "")
    .replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|this week|this month)\b/g, "")
    .replace(/\d{1,2}:?\d{2}/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Capitalize first letter
  if (title) {
    title = title.charAt(0).toUpperCase() + title.slice(1);
  }

  // Ensure we have a title
  if (!title) {
    title = text;
  }

  console.log(`[BlooWebhook] Local parse result:`, {
    type,
    title,
    date,
    time,
    hasTime: !!timeMatch,
    hasDate,
    isGoal,
  });

  return { type, title, date, time, summary: title };
}

/**
 * Use Gemini to fix spelling and grammar mistakes in the message
 * This is simpler than full intent analysis - just returns corrected text
 */
async function correctSpellingWithGemini(text: string): Promise<string> {
  try {
    // First pass: Apply hardcoded common typo fixes
    let corrected = text
      .replace(/\bbut\b/g, "buy")  // "but" → "buy"
      .replace(/\bby\b/g, "buy")
      .replace(/\blean\b/g, "learn")
      .replace(/\bmetting\b/g, "meeting")
      .replace(/\btommrow\b/g, "tomorrow")
      .replace(/\btmrw\b/g, "tomorrow")
      .replace(/\bshedule\b/g, "schedule")
      .replace(/\bmeating\b/g, "meeting");

    // If hardcoded fixes have already corrected something significantly, use that
    if (corrected !== text) {
      console.log(`[BlooWebhook] Local typo fix applied: "${text}" → "${corrected}"`);
      return corrected;
    }

    // Skip Gemini for short, already-correct messages
    if (text.length < 50 && !text.match(/[a-z]{2,}ing\s+[a-z]{2,}/i)) {
      console.log(`[BlooWebhook] Message too short or already correct, skipping Gemini: "${text}"`);
      return text;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.log("[BlooWebhook] Gemini API key not configured, using local spelling fixes only");
      return corrected;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `Fix ONLY spelling mistakes and typos. Keep the same meaning.
Be aggressive - fix common typos like "by"→"buy", "abt"→"about", "tmrw"→"tomorrow".
Return ONLY the corrected text, nothing else. Do NOT change the meaning.
Original: "${text}"
Corrected:`;

    const response = await model.generateContent(prompt);
    const geminiCorrected = response.response.text().trim();

    // Validate Gemini's response - check if it's reasonable
    if (!geminiCorrected || geminiCorrected.length === 0) {
      console.log(`[BlooWebhook] Gemini returned empty response, using original: "${text}"`);
      return text;
    }

    // Check if Gemini's response is completely different (hallucination detection)
    const originalWords = new Set(text.toLowerCase().split(/\s+/));
    const correctedWords = geminiCorrected.toLowerCase().split(/\s+/);
    
    // Count matching words
    let matchCount = 0;
    for (const word of correctedWords) {
      if (originalWords.has(word)) matchCount++;
    }

    // If less than 50% of words match original, it's likely Gemini hallucinated
    const matchRatio = correctedWords.length > 0 ? matchCount / correctedWords.length : 0;
    if (matchRatio < 0.5 && correctedWords.length > 5) {
      console.log(`[BlooWebhook] Gemini hallucinated (${(matchRatio * 100).toFixed(0)}% match), using original: "${text}"`);
      return text;
    }

    // Check if response is way longer than original (sign of hallucination)
    if (geminiCorrected.length > text.length * 2) {
      console.log(`[BlooWebhook] Gemini response too long (${geminiCorrected.length} vs ${text.length}), using original: "${text}"`);
      return text;
    }

    console.log(`[BlooWebhook] Gemini spell correction: "${text}" → "${geminiCorrected}"`);
    return geminiCorrected;
  } catch (error) {
    console.log("[BlooWebhook] Spell correction error, using local fixes:", error);
    // Fallback to local fixes
    return text
      .replace(/\bbut\b/g, "buy")  // "but" → "buy"
      .replace(/\bby\b/g, "buy")
      .replace(/\blean\b/g, "learn")
      .replace(/\bmetting\b/g, "meeting")
      .replace(/\btommrow\b/g, "tomorrow")
      .replace(/\btmrw\b/g, "tomorrow")
      .replace(/\bshedule\b/g, "schedule")
      .replace(/\bmeating\b/g, "meeting");
  }
}

/**
 * Use Gemini AI to analyze message and extract intent
 * Returns: type (task|goal|event|null), title, and optional date/time
 */
// ============================================================================
// Bloo Message Sending
// ============================================================================

/**
 * Send acknowledgment message back to user via Bloo API
 */
async function sendBlooMessage(toPhone: string, message: string): Promise<boolean> {
  try {
    const BLOO_API_KEY = process.env.BLOO_API_KEY;

    if (!BLOO_API_KEY) {
      console.log("[BlooWebhook] ⚠️ Bloo API key not configured");
      return false;
    }

    // Normalize phone
    const normalizedPhone = toPhone.replace(/\s+/g, "").replace(/[^\d+]/g, "");

    console.log("[BlooWebhook] Sending Bloo message to:", normalizedPhone);

    // Set up timeout using AbortController (15 seconds for slow connections)
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log("[BlooWebhook] ⏱️ Fetch timeout after 15 seconds");
      abortController.abort();
    }, 15000);

    console.log("[BlooWebhook] Making API request to: https://backend.blooio.com/v2/api/chats/" + normalizedPhone + "/messages");
    
    // Use correct Blooio API endpoint: https://backend.blooio.com/v2/api/chats/{phone}/messages
    const response = await fetch(`https://backend.blooio.com/v2/api/chats/${normalizedPhone}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${BLOO_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: message,
      }),
      signal: abortController.signal,
    });

    clearTimeout(timeoutId);
    
    console.log("[BlooWebhook] Response status:", response.status);

    if (response.ok) {
      const data = await response.json();
      console.log("[BlooWebhook] ✅ Bloo message sent successfully:", data);
      return true;
    } else {
      const error = await response.text();
      console.log("[BlooWebhook] ❌ Bloo API returned error (status " + response.status + "):", error);
      return false;
    }
  } catch (error: any) {
    console.log("[BlooWebhook] ❌ Error sending Bloo message:", error.message);
    console.log("[BlooWebhook] Error type:", error.name);
    console.log("[BlooWebhook] Note: Task was created successfully, only acknowledgment failed");
    
    // Task was created, even if message fails
    // In production, consider using Twilio SMS as fallback
    return false;
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

    // ⚠️ IMPORTANT: Process ONLY incoming messages from users
    // - message.received = User sent to us (PROCESS)
    // - message.sent = We sent to user (IGNORE - these are our acknowledgments)
    // - message.delivered, message.read, etc. = Status updates (IGNORE)
    const eventType = (payload as any).event;
    console.log(`[BlooWebhook] Event type: ${eventType}`);

    // ONLY process message.received (user's incoming messages)
    // Ignore message.sent (our outgoing acknowledgments)
    if (eventType !== "message.received") {
      console.log(`[BlooWebhook] Ignoring event type: ${eventType} (only processing message.received)`);
      return NextResponse.json({ message: "Event ignored" }, { status: 200 });
    }

    // Extract message and sender/recipient
    const rawText = extractText(payload);
    
    // Determine which phone to use based on event type
    let userPhone: string | null = null;
    
    // For message.received: external_id is the sender's phone (who sent us the message)
    userPhone = extractSenderPhone(payload);
    
    console.log("[BlooWebhook] Incoming message from sender - sender phone:", userPhone);
    console.log("[BlooWebhook] Extracted text:", rawText);
    console.log("[BlooWebhook] User phone to look up:", userPhone);

    // Early return if no content or phone
    if (!rawText) {
      console.log("[BlooWebhook] No message text, returning 200");
      return NextResponse.json(
        { message: "No message content provided" },
        { status: 200 }
      );
    }

    if (!userPhone) {
      console.log("[BlooWebhook] No user phone found, returning 200");
      return NextResponse.json(
        { message: "No user phone found" },
        { status: 200 }
      );
    }

    // Normalize phone number
    const normalizedPhone = normalizePhone(String(userPhone));
    console.log("[BlooWebhook] Normalized phone:", normalizedPhone);

    // Get Supabase admin client
    const admin = getSupabaseAdminClient();

    // Find user by phone number
    console.log("[BlooWebhook] Looking up user by registered phone:", normalizedPhone);
    
    // Get all profiles
    const { data: allProfiles, error: allError } = await admin
      .from("user_profiles")
      .select("user_id, phone, bloo_bound_number");

    console.log("[BlooWebhook] All profiles:", allProfiles?.length || 0);

    let profile = null;
    if (!allError && allProfiles) {
      // Find by comparing normalized phones (always by registered phone)
      profile = allProfiles.find((p: any) => {
        const storedPhone = p.phone ? p.phone.replace(/\s+/g, "") : null;
        const match = storedPhone === normalizedPhone;
        if (match) {
          console.log("[BlooWebhook] Match found by registered phone! Stored:", p.phone, "Normalized:", storedPhone, "Searching for:", normalizedPhone);
        }
        return match;
      }) || null;
    }

    console.log("[BlooWebhook] Lookup result:", { foundUser: !!profile?.user_id, profile });

    if (allError) {
      console.log("[BlooWebhook] Database error looking up user:", allError);
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
      
      // Debug: Show available data
      if (allProfiles) {
        console.log("[BlooWebhook] Available data in database:", allProfiles.map((p: any) => ({ 
          userId: p.user_id,
          registerredPhone: p.phone ? p.phone.replace(/\s+/g, "") : null,
          blooNumber: p.bloo_bound_number ? p.bloo_bound_number.replace(/\s+/g, "") : null
        })));
      }
      
      // Return 200 OK as per requirements - don't error on missing user
      return NextResponse.json(
        { message: "User not registered" },
        { status: 200 }
      );
    }

    const userId = profile.user_id;
    console.log("[BlooWebhook] User found:", userId);

    // Analyze message with AI to determine intent
    console.log("[BlooWebhook] Analyzing message with AI...");
    const aiAnalysis = await analyzeMessageWithAI(rawText);

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
            originalMessage: rawText.slice(0, 500),
          },
        });

        if (taskError) {
          console.log("[BlooWebhook] Failed to create task:", taskError);
          return NextResponse.json({ message: "OK" }, { status: 200 });
        }

        console.log("[BlooWebhook] Task created successfully");
        
        // Send confirmation message
        const confirmMessage = `✅ Task created: ${aiAnalysis.title}`;
        await sendBlooMessage(normalizedPhone, confirmMessage);
        
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
          description: `From Bloo webhook: ${rawText.slice(0, 300)}`,
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
        
        // Send confirmation message
        const confirmMessage = `🎯 Goal created: ${aiAnalysis.title}`;
        await sendBlooMessage(normalizedPhone, confirmMessage);
        
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

      // Events require a date - if missing date but has goal keywords, create as goal instead
      if (!aiAnalysis.date) {
        console.log("[BlooWebhook] ⚠️ Event missing required date, checking if it's a goal...");
        
        // Check if it should be a goal instead
        const goalKeywords = /\b(learn|study|master|improve|practice|get better|become|achieve|complete|finish|accomplish|run|exercise|workout|gym)\b/i;
        if (goalKeywords.test(rawText.toLowerCase())) {
          console.log("[BlooWebhook] Converting to GOAL since no date provided");
          
          try {
            const { error: goalError } = await admin.from("goals").insert({
              user_id: userId,
              title: aiAnalysis.title.slice(0, 200),
              description: `From Bloo webhook: ${rawText.slice(0, 300)}`,
              category: "personal",
              priority: "medium",
              progress: 0,
              target_date: null,
            });

            if (goalError) {
              console.log("[BlooWebhook] Failed to create goal:", goalError);
              return NextResponse.json({ message: "OK" }, { status: 200 });
            }

            console.log("[BlooWebhook] Goal created successfully (converted from event)");
            
            // Send acknowledgment
            const ackMessage = `🎯 Goal: ${aiAnalysis.title}`;
            await sendBlooMessage(normalizedPhone, ackMessage);
            
            return NextResponse.json({ message: "Goal created" }, { status: 200 });
          } catch (error) {
            console.log("[BlooWebhook] Goal conversion error:", error);
            return NextResponse.json({ message: "OK" }, { status: 200 });
          }
        }
        
        // Not a goal - send message asking for date
        const ackMessage = `⚠️ Need a date for: "${aiAnalysis.title}" (e.g., "tomorrow" or "Friday")`;
        await sendBlooMessage(normalizedPhone, ackMessage);
        return NextResponse.json({ message: "OK" }, { status: 200 });
      }

      try {
        const { error: eventError } = await admin
          .from("calendar_events")
          .insert({
            user_id: userId,
            title: aiAnalysis.title.slice(0, 200),
            description: `From Bloo webhook: ${rawText.slice(0, 300)}`,
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
        
        // Send confirmation message
        const dateStr = aiAnalysis.date ? new Date(aiAnalysis.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'today';
        const timeStr = aiAnalysis.time ? ` at ${aiAnalysis.time}` : '';
        const confirmMessage = `📅 Event created: ${aiAnalysis.title} on ${dateStr}${timeStr}`;
        await sendBlooMessage(normalizedPhone, confirmMessage);
        
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

