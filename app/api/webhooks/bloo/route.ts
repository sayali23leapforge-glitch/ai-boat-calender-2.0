import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

/**
 * Send response message back to user via Bloo API
 */
async function sendBlooReply(
  recipientPhone: string,
  message: string
): Promise<boolean> {
  try {
    const blooApiKey = process.env.BLOO_API_KEY;
    const blooOrgId = process.env.BLOO_ORG_ID;
    const blooBaseUrl = process.env.BLOO_BASE_URL || "https://api.blooio.com";

    console.log("[BlooWebhook] ========== ATTEMPTING BLOO REPLY ==========");
    console.log("[BlooWebhook] Recipient:", recipientPhone);
    console.log("[BlooWebhook] Message:", message);
    console.log("[BlooWebhook] Has API Key:", !!blooApiKey);
    console.log("[BlooWebhook] Has Org ID:", !!blooOrgId);
    console.log("[BlooWebhook] Base URL:", blooBaseUrl);

    if (!blooApiKey) {
      console.error("[BlooWebhook] ❌ BLOO_API_KEY not configured!");
      return false;
    }

    if (!blooOrgId) {
      console.error("[BlooWebhook] ❌ BLOO_ORG_ID not configured!");
      return false;
    }

    // Try Bloo REST API with multiple endpoint possibilities
    const endpoints = [
      `${blooBaseUrl}/v1/messages`,
      `${blooBaseUrl}/messages/send`,
      `${blooBaseUrl}/api/messages/send`,
    ];

    for (const endpoint of endpoints) {
      try {
        console.log(`[BlooWebhook] Trying endpoint: ${endpoint}`);

        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${blooApiKey}`,
            "X-Organization-ID": blooOrgId,
            "X-Org-ID": blooOrgId,
          },
          body: JSON.stringify({
            to: recipientPhone,
            text: message,
            body: message,
            message: message,
            recipient: recipientPhone,
            phoneNumber: recipientPhone,
          }),
        });

        console.log(`[BlooWebhook] Response status from ${endpoint}:`, response.status);
        const responseText = await response.text();
        console.log(`[BlooWebhook] Response body:`, responseText);

        if (response.ok) {
          console.log("[BlooWebhook] ✅ Bloo reply sent successfully!");
          return true;
        }
      } catch (endpointError) {
        console.warn(`[BlooWebhook] Endpoint ${endpoint} failed:`, endpointError);
      }
    }

    console.error("[BlooWebhook] ❌ All Bloo API endpoints failed");
    return false;
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

  // Detect specific time patterns (2:30 pm, etc.)
  const specificTimeMatch = cleaned.match(/(\d{1,2}):(\d{2})\s*(am|pm|a\.m|p\.m)?/i);
  
  // Detect time of day keywords
  const timeOfDayMatch = cleaned.match(/\b(morning|afternoon|evening|tonight|night|noon|midnight)\b/i);
  const hasTime = specificTimeMatch || timeOfDayMatch;
  
  // Detect date patterns
  const dateKeywords = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next|today|tonight|this week|this month)\b/i;
  const hasDate = dateKeywords.test(cleaned);

  // Detect goal/learning keywords
  const goalKeywords = /\b(learn|study|master|improve|practice|get better|become|achieve|complete|finish|accomplish)\b/i;
  const isGoal = goalKeywords.test(cleaned);

  // **NEW: Detect EVENT keywords** (recital, concert, meeting, etc.)
  const eventKeywords = /\b(meeting|event|recital|concert|performance|appointment|presentation|show|rehearsal|practice|session|class|lecture|seminar|conference|summit|interview|date|call|zoom|webinar|demo|review)\b/i;
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
    // Specific time like "2:30 pm"
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
    // Remove time keywords
    .replace(/\b(at|on|in|for)\s+(morning|afternoon|evening|night|tonight|noon|midnight)\b/gi, "")
    .replace(/\b(morning|afternoon|evening|tonight|night|noon|midnight|am|pm|a\.m|p\.m|o'clock)\b/gi, "")
    // Remove specific times like "2:30"
    .replace(/\d{1,2}:(\d{2})?\s*(am|pm|a\.m|p\.m)?/gi, "")
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
    .replace(/\btommrow\b/gi, "tomorrow")
    .replace(/\btmrw\b/gi, "tomorrow")
    .replace(/\btmrow\b/gi, "tomorrow")
    .replace(/\bshedule\b/gi, "schedule")
    .replace(/\bmeating\b/gi, "meeting")
    .replace(/\bmeeting\b/gi, "meeting")
    .replace(/\brecital\b/gi, "recital")
    .replace(/\brecitle\b/gi, "recital");

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
        
        // Send confirmation message back to user
        const replyMessage = `✓ Task created: "${aiAnalysis.title}"${aiAnalysis.date ? ` (${aiAnalysis.date})` : ""}`;
        await sendBlooReply(normalizedPhone, replyMessage);
        
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
        
        // Send confirmation message back to user
        const replyMessage = `🎯 Goal created: "${aiAnalysis.title}"`;
        await sendBlooReply(normalizedPhone, replyMessage);
        
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
        
        // Send confirmation message back to user
        const replyMessage = `📅 Event created: "${aiAnalysis.title}"${aiAnalysis.time ? ` at ${aiAnalysis.time}` : ""} on ${aiAnalysis.date}`;
        await sendBlooReply(normalizedPhone, replyMessage);
        
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
