/**
 * Bloo Webhook Controller
 * Handles incoming Bloo messages, normalizes data, finds users, and creates tasks/events/goals
 * 
 * Location: /controllers/blooWebhookController.ts (optional - currently integrated in route.ts)
 * Route: /api/webhooks/bloo
 */

import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export interface BlooWebhookPayload {
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
}

export interface AIAnalysisResult {
  type: "task" | "event" | "goal" | null;
  title: string;
  date: string | null;
  time?: string | null;
}

export interface ProcessedMessage {
  userId: string;
  action: AIAnalysisResult["type"];
  title: string;
  date: string | null;
  time: string | null;
  originalMessage: string;
}

/**
 * Sanitize text by removing control characters and normalizing whitespace
 */
export function sanitizeText(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalize phone to international format
 * Examples:
 *   9881234567 → +919881234567 (India, 10 digit)
 *   919881234567 → +919881234567 (India, 12 digit)
 *   19881234567 → +19881234567 (US, 11 digit)
 *   +919881234567 → +919881234567 (already normalized)
 */
export function normalizePhone(phoneInput: string): string {
  console.log(`[BlooController] Normalizing phone: ${phoneInput}`);

  let cleaned = phoneInput.replace(/[^\d+]/g, "");

  if (cleaned.startsWith("+")) {
    const normalized = "+" + cleaned.slice(1).replace(/\D/g, "");
    console.log(`[BlooController] Already prefixed: ${normalized}`);
    return normalized;
  }

  cleaned = cleaned.replace(/\+/g, "");

  if (cleaned.length === 10) {
    const result = "+91" + cleaned;
    console.log(`[BlooController] 10-digit Indian: ${result}`);
    return result;
  }

  if (cleaned.length === 11 && cleaned.startsWith("1")) {
    const result = "+" + cleaned;
    console.log(`[BlooController] 11-digit US: ${result}`);
    return result;
  }

  if (cleaned.length === 12 && cleaned.startsWith("91")) {
    const result = "+" + cleaned;
    console.log(`[BlooController] 12-digit Indian: ${result}`);
    return result;
  }

  if (cleaned.length > 10) {
    const result = "+" + cleaned;
    console.log(`[BlooController] Custom format: ${result}`);
    return result;
  }

  const result = "+91" + cleaned;
  console.log(`[BlooController] Fallback (short): ${result}`);
  return result;
}

/**
 * Extract message text from any field
 */
export function extractText(payload: BlooWebhookPayload): string | null {
  const raw = payload.message ?? payload.text ?? payload.body ?? null;

  if (!raw || typeof raw !== "string") {
    console.log("[BlooController] No message text found");
    return null;
  }

  const sanitized = sanitizeText(raw);
  return sanitized.length ? sanitized : null;
}

/**
 * Extract sender phone from any field
 */
export function extractSenderPhone(payload: BlooWebhookPayload): string | null {
  const candidates: unknown[] = [
    payload.phone,
    payload.sender,
    payload.from,
    payload.phoneNumber,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    if (typeof candidate === "string") {
      console.log(`[BlooController] Found phone (string): ${candidate}`);
      return candidate;
    }

    if (typeof candidate === "object") {
      const obj = candidate as Record<string, unknown>;
      const phone =
        obj.address || obj.phoneNumber || obj.phone || obj.handle || obj.from;

      if (typeof phone === "string") {
        console.log(`[BlooController] Found phone (object): ${phone}`);
        return phone;
      }
    }
  }

  console.log("[BlooController] No sender phone found");
  return null;
}

/**
 * Analyze message with Gemini AI
 */
export async function analyzeWithGemini(text: string): Promise<AIAnalysisResult> {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.log("[BlooController] Gemini API key not configured");
      return { type: null, title: "", date: null };
    }

    const prompt = `Analyze this message and extract the user's intent.

USER MESSAGE:
"${text}"

Determine if it's:
- TASK: Action to complete ("buy X", "do X", "remind me to X")
- GOAL: Something to learn/achieve ("learn X", "get X", "become X")
- EVENT: Scheduled meeting/appointment ("meeting with X", "lunch at Xpm", "on X date")
- IGNORE: Just chat/greeting with no actionable intent

Also extract:
- Clean title (remove filler words like "maybe", "or something", "i think")
- Date if mentioned (convert to YYYY-MM-DD, today=2026-03-18)
- Time if mentioned (as HH:MM)

RESPOND with ONLY this JSON (no markdown):
{
  "type": "task" | "goal" | "event" | "ignore",
  "title": "cleaned message or empty if unclear",
  "date": "YYYY-MM-DD" or null,
  "time": "HH:MM" or null
}`;

    console.log("[BlooController] Calling Gemini API...");

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 200,
          },
        }),
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      console.log(`[BlooController] Gemini error: ${response.status}`);
      return { type: null, title: "", date: null };
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log(`[BlooController] Could not parse response: ${responseText}`);
      return { type: null, title: "", date: null };
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      type?: string;
      title?: string;
      date?: string | null;
      time?: string | null;
    };

    const typeStr = parsed.type?.toLowerCase();
    
    if (typeStr === "ignore") {
      console.log("[BlooController] Non-actionable message");
      return { type: null, title: "", date: null };
    }

    const type =
      typeStr === "task"
        ? "task"
        : typeStr === "goal"
          ? "goal"
          : typeStr === "event"
            ? "event"
            : null;

    const title = sanitizeText(parsed.title || "");
    const date = parsed.date || null;
    const time = parsed.time || null;

    console.log("[BlooController] Analysis result:", { type, title, date, time });
    return { type, title, date, time };
  } catch (error) {
    console.log("[BlooController] Gemini error:", error);
    return { type: null, title: "", date: null };
  }
}

/**
 * Find user by normalized phone number
 */
export async function findUserByPhone(
  phone: string
): Promise<{ userId: string; phone: string } | null> {
  try {
    const admin = getSupabaseAdminClient();
    console.log(`[BlooController] Looking up user: ${phone}`);

    const { data: profile, error } = await admin
      .from("user_profiles")
      .select("user_id, phone")
      .eq("phone", phone)
      .maybeSingle();

    if (error) {
      console.log("[BlooController] Lookup error:", error);
      return null;
    }

    if (!profile?.user_id) {
      console.log(`[BlooController] User not found: ${phone}`);
      return null;
    }

    console.log(`[BlooController] User found: ${profile.user_id}`);
    return { userId: profile.user_id, phone: profile.phone };
  } catch (error) {
    console.log("[BlooController] Exception during lookup:", error);
    return null;
  }
}

/**
 * Create task for user
 */
export async function createTask(
  userId: string,
  title: string,
  options: {
    date?: string | null;
    time?: string | null;
    originalMessage?: string;
  } = {}
): Promise<boolean> {
  try {
    const admin = getSupabaseAdminClient();
    console.log(`[BlooController] Creating task: ${title}`);

    // Get or create default list
    const { data: listData } = await admin
      .from("task_lists")
      .select("id")
      .eq("user_id", userId)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();

    let listId = listData?.id as string | undefined;

    if (!listId) {
      console.log("[BlooController] Creating default task list");
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
        console.log("[BlooController] Failed to create list:", listError);
        return false;
      }

      listId = createdList.id as string;
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
        ? ((existing[0]?.position as number) ?? 0) + 1
        : 0;

    // Insert task
    const { error } = await admin.from("tasks").insert({
      user_id: userId,
      list_id: listId,
      title: title.slice(0, 200),
      notes: `From Bloo webhook`,
      due_date: options.date || null,
      due_time: options.time || null,
      is_completed: false,
      is_starred: false,
      position: nextPosition,
      priority: "medium",
      progress: 0,
      metadata: {
        source: "bloo_webhook",
        originalMessage: options.originalMessage?.slice(0, 500) || "",
      },
    });

    if (error) {
      console.log("[BlooController] Failed to create task:", error);
      return false;
    }

    console.log("[BlooController] Task created");
    return true;
  } catch (error) {
    console.log("[BlooController] Task creation error:", error);
    return false;
  }
}

/**
 * Create goal for user
 */
export async function createGoal(
  userId: string,
  title: string,
  options: {
    date?: string | null;
    originalMessage?: string;
  } = {}
): Promise<boolean> {
  try {
    const admin = getSupabaseAdminClient();
    console.log(`[BlooController] Creating goal: ${title}`);

    const { error } = await admin.from("goals").insert({
      user_id: userId,
      title: title.slice(0, 200),
      description: `From Bloo webhook: ${options.originalMessage?.slice(0, 300) || ""}`,
      category: "personal",
      priority: "medium",
      progress: 0,
      target_date: options.date || null,
    });

    if (error) {
      console.log("[BlooController] Failed to create goal:", error);
      return false;
    }

    console.log("[BlooController] Goal created");
    return true;
  } catch (error) {
    console.log("[BlooController] Goal creation error:", error);
    return false;
  }
}

/**
 * Create event for user
 */
export async function createEvent(
  userId: string,
  title: string,
  options: {
    date: string; // Required for events
    time?: string | null;
    originalMessage?: string;
  }
): Promise<boolean> {
  try {
    const admin = getSupabaseAdminClient();
    console.log(`[BlooController] Creating event: ${title} on ${options.date}`);

    const { error } = await admin.from("calendar_events").insert({
      user_id: userId,
      title: title.slice(0, 200),
      description: `From Bloo webhook: ${options.originalMessage?.slice(0, 300) || ""}`,
      event_date: options.date,
      start_time: options.time || null,
      end_time: null,
      location: null,
      category: "other",
      priority: "medium",
      source: "webhook",
      source_id: "bloo",
      is_completed: false,
    });

    if (error) {
      console.log("[BlooController] Failed to create event:", error);
      return false;
    }

    console.log("[BlooController] Event created");
    return true;
  } catch (error) {
    console.log("[BlooController] Event creation error:", error);
    return false;
  }
}
