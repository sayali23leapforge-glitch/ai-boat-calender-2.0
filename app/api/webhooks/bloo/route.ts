import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

/**
 * Transcribe audio file to text using Gemini API
 * Gemini can handle audio files via URL directly
 */
async function transcribeAudio(audioUrl: string): Promise<string | null> {
  try {
    console.log("[BlooWebhook] 🎤 Transcribing audio with Gemini...", audioUrl);

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      console.warn("[BlooWebhook] GEMINI_API_KEY not configured");
      return null;
    }

    // Use Gemini API with audio file URL
    console.log("[BlooWebhook] Calling Gemini API with audio URL...");
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Upload the audio file using file upload API
    console.log("[BlooWebhook] Downloading and uploading audio to Gemini...");
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      console.error("[BlooWebhook] Failed to download audio:", audioResponse.status);
      return null;
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString("base64");
    console.log("[BlooWebhook] Audio downloaded, size:", audioBuffer.byteLength, "bytes");
    console.log("[BlooWebhook] Converted to base64 for Gemini");

    // Call Gemini API with inline data
    const result = await model.generateContent([
      {
        inlineData: {
          data: base64Audio,
          mimeType: "audio/mpeg",
        },
      },
      "Please transcribe this audio message. Return only the transcribed text, nothing else.",
    ]);

    const response = result.response;
    const transcribedText = response.text();

    if (transcribedText && transcribedText.trim()) {
      console.log("[BlooWebhook] ✅ Audio transcribed:", transcribedText.trim());
      return transcribedText.trim();
    }

    console.warn("[BlooWebhook] No text in Gemini response");
    return null;

  } catch (error) {
    console.error("[BlooWebhook] Transcription error:", error);
    return null;
  }
}

/**
 * Fallback: Transcription service (not currently used)
 */
async function transcribeWithWhisper(audioBase64: string, mimeType: string): Promise<string | null> {
  return null;
}

/**
 * Send response message back to user via Bloo API
 */
async function sendBlooReply(
  recipientPhone: string,
  message: string,
  protocol?: string
): Promise<boolean> {
  try {
    const blooApiKey = process.env.BLOO_API_KEY;

    console.log("[BlooWebhook] ========== ATTEMPTING BLOO REPLY ==========");
    console.log("[BlooWebhook] Recipient:", recipientPhone);
    console.log("[BlooWebhook] Message:", message);
    console.log("[BlooWebhook] Protocol:", protocol || "default");
    console.log("[BlooWebhook] Has API Key:", !!blooApiKey);

    if (!blooApiKey) {
      console.error("[BlooWebhook] ❌ BLOO_API_KEY not configured!");
      return false;
    }

    // Normalize phone for Bloo API - keep the + prefix
    const normalizedPhone = recipientPhone.replace(/\s+/g, "").replace(/[^\d+]/g, "");
    console.log("[BlooWebhook] Normalized phone for Bloo:", normalizedPhone);
    
    // Use v2 endpoint with proper parameters for replying on the same channel
    const endpoint = `https://backend.blooio.com/v2/api/chats/${normalizedPhone}/messages`;
    console.log("[BlooWebhook] Endpoint:", endpoint);
    console.log("[BlooWebhook] Message text:", message);

    const payload: any = {
      text: message,
    };
    
    // Don't specify protocol - let BlueBubbles choose the best available protocol
    // This avoids forcing iMessage on contacts that don't support it
    console.log("[BlooWebhook] Letting BlueBubbles auto-select protocol");
    
    console.log("[BlooWebhook] Posting payload:", JSON.stringify(payload));

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${blooApiKey}`,
      },
      body: JSON.stringify(payload),
    });

    console.log("[BlooWebhook] Response status:", response.status);
    const responseText = await response.text();
    console.log("[BlooWebhook] Response body:", responseText);

    if (response.ok) {
      console.log("[BlooWebhook] ✅ Bloo reply sent successfully!");
      return true;
    } else {
      console.error("[BlooWebhook] ❌ Bloo API error:", response.status, responseText);
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

  // **IMPROVED: Detect specific time patterns - MUST have am/pm or colon**
  // Matches: "2:30 pm", "1 pm", "10am", "2:30", BUT NOT bare "7" or "10"
  const specificTimeMatch = cleaned.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m|p\.m)/i);
  
  // Detect time of day keywords
  const timeOfDayMatch = cleaned.match(/\b(morning|afternoon|evening|tonight|night|noon|midnight)\b/i);
  const hasTime = specificTimeMatch || timeOfDayMatch;
  
  // **IMPROVED: Detect date patterns - includes "DD Month" or "Month DD" format**
  // Matches: "7 april", "april 7", "tomorrow", "monday", etc.
  const datePatterns = /\b(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)|(\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next|today|tonight|this week|this month)\b)/i;
  const dateMatch = datePatterns.test(cleaned);
  const hasDate = dateMatch;

  // Detect goal/learning keywords
  const goalKeywords = /\b(learn|study|master|improve|practice|get better|become|achieve|complete|finish|accomplish)\b/i;
  const isGoal = goalKeywords.test(cleaned);

  // **EVENT keywords**
  const eventKeywords = /\b(schedule|meeting|event|recital|concert|performance|appointment|presentation|show|rehearsal|practice|session|class|lecture|seminar|conference|summit|interview|date|call|zoom|webinar|demo|review)\b/i;
  const isEvent = eventKeywords.test(cleaned);

  // **Determine type**
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

  // **Parse specific date: "7 April" or "April 7" format (2026 reference)**
  let date: string | null = null;
  const monthMap: { [key: string]: number } = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
  };

  // Try to match "DD Month" format (e.g., "7 april")
  const dayMonthMatch = cleaned.match(/\b(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/i);
  if (dayMonthMatch) {
    const day = dayMonthMatch[1];
    const month = monthMap[dayMonthMatch[2].toLowerCase()];
    if (month) {
      date = `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      console.log(`[BlooWebhook] Parsed date from "DD Month": ${date}`);
    }
  }

  // Try to match "Month DD" format (e.g., "april 7")
  if (!date) {
    const monthDayMatch = cleaned.match(/(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})\b/i);
    if (monthDayMatch) {
      const month = monthMap[monthDayMatch[1].toLowerCase()];
      const day = monthDayMatch[2];
      if (month) {
        date = `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        console.log(`[BlooWebhook] Parsed date from "Month DD": ${date}`);
      }
    }
  }

  // Fallback to day names (Monday, Tuesday, etc.)
  if (!date) {
    if (cleaned.includes("monday")) date = "2026-04-07";
    else if (cleaned.includes("tuesday")) date = "2026-04-08";
    else if (cleaned.includes("wednesday")) date = "2026-04-09";
    else if (cleaned.includes("thursday")) date = "2026-04-10";
    else if (cleaned.includes("friday")) date = "2026-04-11";
    else if (cleaned.includes("saturday")) date = "2026-04-12";
    else if (cleaned.includes("sunday")) date = "2026-04-13";
    else if (cleaned.includes("tomorrow")) date = "2026-04-07"; // Current date is 2026-04-06
    else if (cleaned.includes("today")) date = "2026-04-06";
    
    if (date) console.log(`[BlooWebhook] Parsed date from day name: ${date}`);
  }

  // **Parse time: "2:30 pm" or "morning" format**
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
    if (timeWord === "morning") time = "09:00";
    else if (timeWord === "afternoon") time = "14:00";
    else if (timeWord === "evening") time = "18:00";
    else if (timeWord === "night" || timeWord === "tonight") time = "20:00";
    else if (timeWord === "noon") time = "12:00";
    else if (timeWord === "midnight") time = "00:00";
    
    console.log(`[BlooWebhook] Parsed time of day "${timeWord}" as ${time}`);
  }

  // **Extract title: remove time/date refs but keep event name**
  let title = cleaned
    // Remove "on DATE" or "at TIME" patterns
    .replace(/\b(on|at)\s+\d{1,2}\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi, "")
    .replace(/\b(on|at|in)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|tonight)\b/gi, "")
    // Remove specific times "2:30 pm" or "10 am"
    .replace(/\b\d{1,2}(?::\d{2})?\s*(am|pm|a\.m|p\.m)\b/gi, "")
    // Remove time of day keywords
    .replace(/\b(morning|afternoon|evening|tonight|night|noon|midnight)\b/gi, "")
    // Remove extra prepositions
    .replace(/\b(at|on|in|for|the|a|an)\s+/gi, "")
    // Clean up extra whitespace
    .replace(/\s+/g, " ")
    .trim();

  // If title is empty, use original text
  if (!title || title.length < 2) {
    title = text;
    console.log(`[BlooWebhook] Title was empty, using original: "${title}"`);
  }

  // Capitalize first letter
  title = title.charAt(0).toUpperCase() + title.slice(1);
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
 * Detect if message is trying to create an account
 */
function isAccountCreationMessage(text: string): boolean {
  const lower = text.toLowerCase().trim();
  
  const creationKeywords = [
    "create account",
    "create my account",
    "new account",
    "signup",
    "sign up",
    "register",
    "join",
  ];
  
  for (const keyword of creationKeywords) {
    if (lower.includes(keyword)) {
      console.log(`[BlooWebhook] Detected account creation message: "${text}" (keyword: "${keyword}")`);
      return true;
    }
  }
  
  return false;
}

/**
 * Detect if message looks like email and password format
 */
function parseEmailPassword(text: string): { email: string; password: string } | null {
  // Try to parse "email password" format
  const parts = text.trim().split(/\s+/);
  
  if (parts.length >= 2) {
    const potentialEmail = parts[0];
    const potentialPassword = parts.slice(1).join(" ");
    
    // Simple email validation
    if (potentialEmail.includes("@") && potentialEmail.includes(".") && potentialPassword.length >= 6) {
      console.log(`[BlooWebhook] Parsed email and password from: "${text}"`);
      return {
        email: potentialEmail,
        password: potentialPassword,
      };
    }
  }
  
  return null;
}

/**
 * Check if there's a pending account creation request for this phone
 */
async function getPendingAccountCreation(
  admin: any,
  normalizedPhone: string
): Promise<any | null> {
  try {
    console.log(`[BlooWebhook] Checking for pending account creation for: ${normalizedPhone}`);
    
    const { data, error } = await admin
      .from("pending_account_creations")
      .select("*")
      .eq("phone", normalizedPhone)
      .eq("status", "awaiting_email_password")
      .maybeSingle();

    if (error) {
      console.error("[BlooWebhook] Error checking pending creation:", error);
      return null;
    }

    if (data) {
      console.log(`[BlooWebhook] Found pending account creation request`);
      return data;
    }

    return null;
  } catch (error) {
    console.error("[BlooWebhook] Error in getPendingAccountCreation:", error);
    return null;
  }
}

/**
 * Create a pending account creation request
 */
async function createPendingAccountCreation(
  admin: any,
  normalizedPhone: string
): Promise<boolean> {
  try {
    console.log(`[BlooWebhook] Creating pending account creation request for: ${normalizedPhone}`);
    
    const { error } = await admin
      .from("pending_account_creations")
      .insert({
        phone: normalizedPhone,
        status: "awaiting_email_password",
        created_at: new Date().toISOString(),
      });

    if (error) {
      console.error("[BlooWebhook] Error creating pending request:", error);
      return false;
    }

    console.log(`[BlooWebhook] Pending account creation request created`);
    return true;
  } catch (error) {
    console.error("[BlooWebhook] Error in createPendingAccountCreation:", error);
    return false;
  }
}

/**
 * Create a new user account
 */
async function createUserAccount(
  email: string,
  password: string,
  phone: string
): Promise<{ userId: string; error: string | null }> {
  try {
    console.log(`[BlooWebhook] Creating user account for email: ${email}`);
    
    const admin = getSupabaseAdminClient();

    // Create auth user
    const { data: { user }, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
    });

    if (authError || !user) {
      console.error("[BlooWebhook] Auth error:", authError);
      return { userId: "", error: authError?.message || "Failed to create auth user" };
    }

    console.log(`[BlooWebhook] Auth user created: ${user.id}`);

    // Create user profile
    const { error: profileError } = await admin
      .from("user_profiles")
      .insert({
        user_id: user.id,
        email,
        phone,
        full_name: "",
        avatar_url: null,
        theme: "light",
        language: "en",
        timezone: "UTC",
      });

    if (profileError) {
      console.error("[BlooWebhook] Profile error:", profileError);
      return { userId: user.id, error: profileError.message };
    }

    console.log(`[BlooWebhook] User account created successfully: ${user.id}`);
    return { userId: user.id, error: null };

  } catch (error) {
    console.error("[BlooWebhook] Error in createUserAccount:", error);
    return { userId: "", error: String(error) };
  }
}

/**
 * Delete pending account creation request
 */
async function deletePendingAccountCreation(
  admin: any,
  id: string
): Promise<boolean> {
  try {
    console.log(`[BlooWebhook] Deleting pending account creation: ${id}`);
    
    const { error } = await admin
      .from("pending_account_creations")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("[BlooWebhook] Error deleting pending request:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[BlooWebhook] Error in deletePendingAccountCreation:", error);
    return false;
  }
}

/**
 * Send welcome message to new user
 */
async function sendWelcomeMessage(normalizedPhone: string): Promise<boolean> {
  const welcomeMessage = `Welcome to Calendar App! 🚀 Your calendar is now linked to this number.

To create a task, just text me something like:
• 'Remind me to call the team tomorrow at 10am' — creates a task
• 'Set a goal to run 5 miles' — creates a goal  
• 'Meeting tomorrow at 3pm' — creates an event

What's on your mind today?`;

  try {
    return await sendBlooReply(normalizedPhone, welcomeMessage);
  } catch (error) {
    console.error("[BlooWebhook] Error sending welcome message:", error);
    return false;
  }
}

/**
 * Detect if a message is casual chat vs action-based (task/event/goal creation)
 */
function isCasualMessage(text: string): boolean {
  const lower = text.toLowerCase().trim();
  
  // Casual greeting keywords
  const casualKeywords = [
    "hi", "hey", "hello", "greetings",
    "how are you", "how's it", "how you doing", "whats up", "what's up",
    "sup", "yo", "hola", "namaste",
    "good morning", "good afternoon", "good evening", "good night",
    "thanks", "thank you", "thank you so much", "appreciate",
    "lol", "haha", "lmao", "rofl", "hehe",
    "yeah", "yep", "yes", "nope", "no", "ok", "okay", "ok cool",
    "love it", "nice", "cool", "awesome", "great", "awesome sauce",
    "omg", "omg yes", "omg no", "wow", "wait", "what",
    "when", "where", "who", "how",
    "right", "exactly", "true", "totally", "absolutely",
  ];

  // Check if message is very short and contains casual keywords
  if (lower.length < 50) {
    for (const keyword of casualKeywords) {
      if (lower === keyword || lower.startsWith(keyword + " ") || lower.endsWith(" " + keyword)) {
        console.log(`[BlooWebhook] Detected casual message: "${text}" (keyword: "${keyword}")`);
        return true;
      }
    }
  }

  // Check if it's just casual conversation without action keywords
  const actionKeywords = [
    "create", "make", "add", "schedule", "book", "remind", "remember", "set", "buy",
    "call", "email", "message", "do", "need to", "gotta", "should", "must",
    "learn", "study", "practice", "finish", "complete", "start", "begin",
  ];
  
  const hasActionKeyword = actionKeywords.some(kw => lower.includes(kw));
  
  // If it's very short and no action keyword, it's likely casual
  if (lower.length < 30 && !hasActionKeyword) {
    console.log(`[BlooWebhook] Detected casual short message: "${text}"`);
    return true;
  }

  return false;
}

/**
 * Generate a casual reply using Gemini API
 */
async function generateCasualReply(userMessage: string): Promise<string> {
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      console.warn("[BlooWebhook] GEMINI_API_KEY not configured for casual reply");
      return "Hey! 👋";
    }

    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `You are a friendly casual chat assistant. The user just sent you this message: "${userMessage}"

Generate a short, casual, friendly reply (1-2 sentences max). Keep it natural and conversational.
Examples:
- User: "hi" → You: "Hey! What's on your mind?"
- User: "how are you" → You: "Doing great! How about you?"
- User: "thanks" → You: "You got it! Anytime 😊"
- User: "cool" → You: "Right? Pretty awesome!"

Now reply to this message with just the reply text, nothing else.`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const replyText = response.text().trim();

    console.log(`[BlooWebhook] Generated casual reply: "${replyText}"`);
    return replyText;

  } catch (error) {
    console.error("[BlooWebhook] Error generating casual reply:", error);
    return "Hey! 👋"; // Fallback reply
  }
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

    // Extract protocol to maintain same channel for replies
    const protocol = (payload as any).protocol as string | undefined;
    console.log("[BlooWebhook] Incoming protocol:", protocol || "not specified");

    // Extract message and sender
    const rawText = extractText(payload);
    const rawSender = extractSenderPhone(payload);

    console.log("[BlooWebhook] Extracted text:", rawText);
    console.log("[BlooWebhook] Extracted sender:", rawSender);

    // Try to transcribe audio if no text but has attachments
    let finalText = rawText;
    let audioUrl: string | null = null;
    if (!rawText) {
      audioUrl = extractAudioUrl(payload);
      if (audioUrl) {
        console.log("[BlooWebhook] No text found, attempting audio transcription...");
        finalText = await transcribeAudio(audioUrl);
        if (finalText) {
          console.log("[BlooWebhook] ✅ Successfully transcribed audio to:", finalText);
        } else {
          console.warn("[BlooWebhook] Audio transcription failed or not available");
        }
      }
    }

    // If no text and no audio, return early
    if (!finalText && !audioUrl) {
      console.log("[BlooWebhook] No message text or audio attachment, returning 200");
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
      console.log("[BlooWebhook] User not found for phone:", normalizedPhone);
      
      // ================================================================
      // HANDLE ACCOUNT CREATION FLOW
      // ================================================================
      
      // Ensure finalText is not null at this point
      if (!finalText) {
        console.log("[BlooWebhook] finalText is null, cannot check account creation");
        return NextResponse.json({ message: "No text to process" }, { status: 200 });
      }
      
      // FIRST: Check if there's a pending account creation request (in case user is replying with email/password)
      const pendingCreation = await getPendingAccountCreation(admin, normalizedPhone);
      
      if (pendingCreation) {
        console.log("[BlooWebhook] Pending account creation found, checking for email/password");
        
        // User is responding with email and password
        const credentials = parseEmailPassword(finalText);
        
        if (credentials) {
          console.log("[BlooWebhook] Email and password provided, creating account...");
          
          // Create the account
          const { userId, error: createError } = await createUserAccount(
            credentials.email,
            credentials.password,
            normalizedPhone
          );
          
          if (createError) {
            console.error("[BlooWebhook] Account creation failed:", createError);
            const errorReply = `❌ Account creation failed: ${createError}`;
            sendBlooReply(normalizedPhone, errorReply).catch(err =>
              console.error("[BlooWebhook] Failed to send error reply:", err)
            );
            
            // Keep pending request for retry
            return NextResponse.json({ message: "Account creation failed" }, { status: 200 });
          }
          
          console.log("[BlooWebhook] Account created successfully:", userId);
          
          // Delete the pending request
          await deletePendingAccountCreation(admin, pendingCreation.id);
          
          // Send welcome message
          await sendWelcomeMessage(normalizedPhone);
          
          // Send confirmation
          const confirmReply = `✓ Account created! Welcome to Calendar App! 🎉`;
          sendBlooReply(normalizedPhone, confirmReply).catch(err =>
            console.error("[BlooWebhook] Failed to send confirmation:", err)
          );
          
          return NextResponse.json({ message: "Account created" }, { status: 200 });
        } else {
          console.log("[BlooWebhook] Invalid email/password format");
          const retryReply = `❌ Invalid format. Please reply with: **email password** (e.g., user@example.com mypassword123)`;
          sendBlooReply(normalizedPhone, retryReply).catch(err =>
            console.error("[BlooWebhook] Failed to send retry request:", err)
          );
          
          return NextResponse.json({ message: "Invalid format" }, { status: 200 });
        }
      }
      
      // SECOND: Check if this is an account creation request
      const isCreationRequest = isAccountCreationMessage(finalText);
      
      if (isCreationRequest) {
        console.log("[BlooWebhook] First-time account creation request");
        
        // Create pending request and ask for email/password
        const created = await createPendingAccountCreation(admin, normalizedPhone);
        
        if (created) {
          const askReply = `Welcome! 🎉 To create your account, reply with: **email password**\n\nExample: user@example.com mypassword123`;
          sendBlooReply(normalizedPhone, askReply).catch(err =>
            console.error("[BlooWebhook] Failed to send ask message:", err)
          );
        } else {
          const errorReply = `❌ Failed to start account creation. Please try again later.`;
          sendBlooReply(normalizedPhone, errorReply).catch(err =>
            console.error("[BlooWebhook] Failed to send error:", err)
          );
        }
        
        return NextResponse.json({ message: "Account creation initiated" }, { status: 200 });
      }
      
      // Not a creation request and user doesn't exist - just return
      console.log("[BlooWebhook] Message from unregistered user, ignoring");
      return NextResponse.json(
        { message: "User not registered" },
        { status: 200 }
      );
    }

    const userId = profile.user_id;
    console.log("[BlooWebhook] User found:", userId);

    // Ensure finalText is not null
    if (!finalText) {
      console.log("[BlooWebhook] finalText is null for existing user, cannot process");
      return NextResponse.json({ message: "No text to process" }, { status: 200 });
    }

    // If existing user is trying to create account, tell them account already exists
    const isCreationRequest = isAccountCreationMessage(finalText);
    if (isCreationRequest) {
      console.log("[BlooWebhook] Existing user trying to create account");
      const existingAccountReply = `⚠️ Account already exists for this number! You're all set! 🎉`;
      
      // Await the reply to ensure it's sent before returning
      const replySent = await sendBlooReply(normalizedPhone, existingAccountReply, protocol);
      if (!replySent) {
        console.error("[BlooWebhook] Failed to send existing account message");
      }
      
      return NextResponse.json({ message: "Account already exists" }, { status: 200 });
    }

    // If no transcribed text but has audio, acknowledge and ask for text
    if (!finalText && audioUrl) {
      console.log("[BlooWebhook] Voice message received but transcription not available");
      const replyMessage = "🎤 Voice message received! Send a text message to create tasks, events, or goals.";
      
      sendBlooReply(normalizedPhone, replyMessage).catch(err =>
        console.error("[BlooWebhook] Failed to send voice acknowledgment:", err)
      );
      
      return NextResponse.json({ message: "Voice message acknowledged" }, { status: 200 });
    }

    // At this point, finalText must be non-null (guaranteed by earlier checks)
    if (!finalText) {
      console.log("[BlooWebhook] No valid text after all processing");
      return NextResponse.json(
        { message: "Could not process message" },
        { status: 200 }
      );
    }

    // ========================================================================
    // CHECK IF MESSAGE IS CASUAL OR ACTION-BASED
    // ========================================================================
    const isCasual = isCasualMessage(finalText);
    
    if (isCasual) {
      console.log("[BlooWebhook] Message is casual chat, generating casual reply...");
      
      try {
        const casualReply = await generateCasualReply(finalText);
        
        // Send casual reply with protocol to maintain same channel
        const replySent = await sendBlooReply(normalizedPhone, casualReply, protocol);
        if (!replySent) {
          console.error("[BlooWebhook] Failed to send casual reply");
        }
        
        console.log("[BlooWebhook] Casual reply sent, returning 200");
        return NextResponse.json({ message: "Casual reply sent" }, { status: 200 });
      } catch (error) {
        console.error("[BlooWebhook] Error handling casual message:", error);
        // Fallback: still return success
        await sendBlooReply(normalizedPhone, "Hey! 👋", protocol).catch(err =>
          console.error("[BlooWebhook] Failed to send fallback reply:", err)
        );
        return NextResponse.json({ message: "Casual reply sent" }, { status: 200 });
      }
    }

    // ========================================================================
    // MESSAGE IS ACTION-BASED: ANALYZE AND CREATE TASK/EVENT/GOAL
    // ========================================================================
    
    // Analyze message with Gemini AI
    console.log("[BlooWebhook] Analyzing message for action intent...");
    const aiAnalysis = await analyzeWithGemini(finalText);

    if (!aiAnalysis.type) {
      console.log("[BlooWebhook] AI analysis did not identify actionable intent");
      // Fallback to casual reply for unclear message
      try {
        const casualReply = await generateCasualReply(finalText);
        sendBlooReply(normalizedPhone, casualReply).catch(err =>
          console.error("[BlooWebhook] Failed to send reply:", err)
        );
      } catch (error) {
        console.error("[BlooWebhook] Error generating fallback reply:", error);
      }
      return NextResponse.json(
        { message: "Message acknowledged" },
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
        
        // Send confirmation message back to user with protocol to maintain iMessage
        const replyMessage = `✓ Task created: ${aiAnalysis.title}`;
        await sendBlooReply(normalizedPhone, replyMessage, protocol).catch(err => 
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
        
        // Send confirmation message back to user with protocol to maintain iMessage
        const replyMessage = `✓ Goal created: ${aiAnalysis.title}`;
        await sendBlooReply(normalizedPhone, replyMessage, protocol).catch(err => 
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
        
        // Send confirmation message back to user with protocol to maintain iMessage
        const replyMessage = `✓ Event created: ${aiAnalysis.title}`;
        await sendBlooReply(normalizedPhone, replyMessage, protocol).catch(err => 
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
