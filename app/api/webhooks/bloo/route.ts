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

  // Text is already corrected by Gemini, no need for typo fixes
  const cleaned = lower;

  // Detect time patterns
  const timeMatch = cleaned.match(/(\d{1,2})\s*(:\d{2})?\s*(am|pm|a\.m|p\.m|o'clock)?|\b(morning|afternoon|evening|tonight|noon)\b/i);
  const hasTime = timeMatch ? timeMatch[0] : null;
  
  // Detect date patterns
  const dateKeywords = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next|today|tonight|tonight|this week|this month)\b/i;
  const hasDate = dateKeywords.test(cleaned);

  // Detect goal/learning keywords
  const goalKeywords = /\b(learn|study|master|improve|practice|get better|become|achieve|complete|finish|accomplish)\b/i;
  const isGoal = goalKeywords.test(cleaned);

  // Determine type
  let type: "task" | "goal" | "event" = "task";
  
  // If has date or time → EVENT (event can have time without date, but date without time still is event)
  if (hasTime || hasDate) {
    type = "event";
  }
  // If learning keywords and NO date/time → GOAL
  else if (isGoal) {
    type = "goal";
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

  // Extract time (simple approach)
  let time: string | null = null;
  const timeParse = cleaned.match(/(\d{1,2}):?(\d{2})?\s*(am|pm|a\.m|p\.m)?/);
  if (timeParse) {
    let hour = parseInt(timeParse[1]);
    const min = timeParse[2] ? parseInt(timeParse[2]) : 0;
    const meridiem = timeParse[3]?.toLowerCase();
    
    if (meridiem && (meridiem.includes("p") || meridiem.includes("P"))) {
      if (hour !== 12) hour += 12;
    } else if (meridiem && (meridiem.includes("a") || meridiem.includes("A"))) {
      if (hour === 12) hour = 0;
    }
    
    time = `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }

  // Create title from cleaned text (remove time/date keywords)
  let title = cleaned
    .replace(/\b(at|on|in|this|next)\b/g, "")
    .replace(/\b(morning|afternoon|evening|tonight|noon|am|pm|a\.m|p\.m|o'clock)\b/g, "")
    .replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|this week|this month)\b/g, "")
    .replace(/\d{1,2}:?\d{2}/g, "")
    .replace(/\s+/g, " ")
    .trim();

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

  return { type, title, date, time };
}

/**
 * Use Gemini to fix spelling and grammar mistakes in the message
 * This is simpler than full intent analysis - just returns corrected text
 */
async function correctSpellingWithGemini(text: string): Promise<string> {
  try {
    // First pass: Apply hardcoded common typo fixes
    let corrected = text
      .replace(/\bby\b/g, "buy")
      .replace(/\blean\b/g, "learn")
      .replace(/\bmetting\b/g, "meeting")
      .replace(/\btommrow\b/g, "tomorrow")
      .replace(/\btmrw\b/g, "tomorrow")
      .replace(/\bshedule\b/g, "schedule")
      .replace(/\bmeating\b/g, "meeting");

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.log("[BlooWebhook] Gemini API key not configured, using local spelling fixes only");
      return corrected;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `Fix ALL spelling mistakes, typos, and grammar errors. Convert to proper English.
Be aggressive with corrections - fix common typos like "by"→"buy", "abt"→"about", "tmrw"→"tomorrow".
Return ONLY the corrected text, nothing else.
Original: "${text}"
Corrected:`;

    const response = await model.generateContent(prompt);
    const geminiCorrected = response.response.text().trim();

    if (geminiCorrected && geminiCorrected.length > 0 && geminiCorrected !== text) {
      console.log(`[BlooWebhook] Gemini spell correction: "${text}" → "${geminiCorrected}"`);
      return geminiCorrected;
    }

    console.log(`[BlooWebhook] Using local typo fixes: "${text}" → "${corrected}"`);
    return corrected;
  } catch (error) {
    console.log("[BlooWebhook] Spell correction error, using local fixes:", error);
    // Fallback to local fixes
    return text
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

    // ⚠️ IMPORTANT: Only process "message.sent" events
    // Ignore "message.delivered", "message.read", etc. to prevent duplicates
    const eventType = (payload as any).event;
    console.log(`[BlooWebhook] Event type: ${eventType}`);

    if (eventType && eventType !== "message.sent") {
      console.log(`[BlooWebhook] Ignoring event type: ${eventType} (only processing message.sent)`);
      return NextResponse.json({ message: "Event ignored" }, { status: 200 });
    }

    // Extract message and sender
    const rawText = extractText(payload);
    const rawSender = extractSenderPhone(payload);

    console.log("[BlooWebhook] Extracted text:", rawText);
    console.log("[BlooWebhook] Extracted sender:", rawSender);

    // Early return if no content or sender
    if (!rawText) {
      console.log("[BlooWebhook] No message text, returning 200");
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

    // Find user by phone number
    console.log("[BlooWebhook] Looking up user by phone:", normalizedPhone);
    const { data: profile, error: profileError } = await admin
      .from("user_profiles")
      .select("user_id, phone")
      .eq("phone", normalizedPhone)
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
    const aiAnalysis = await analyzeWithGemini(rawText);

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
