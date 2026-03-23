import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { randomUUID } from "crypto";

type AttachmentInput = {
  data?: string;
  url?: string;
  filename?: string;
  mimeType?: string;
  contentType?: string;
};

type WebhookPayload = {
  type?: string;
  text?: string;
  body?: string;
  sender?: unknown;
  from?: unknown;
  handle?: unknown;
  senderPhone?: unknown;
  message?: {
    text?: string;
    body?: string;
    sender?: unknown;
    from?: unknown;
    handle?: unknown;
    senderPhone?: unknown;
    attachments?: AttachmentInput[];
    conversationId?: string;
    chatId?: string;
  };
  attachments?: AttachmentInput[];
  conversationId?: string;
  chatId?: string;
};

function sanitizeText(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
}

function normalizePhone(phoneInput: string): string {
  let cleaned = phoneInput.replace(/[^\d+]/g, "");

  if (cleaned.startsWith("+")) {
    return "+" + cleaned.slice(1).replace(/\D/g, "");
  }

  cleaned = cleaned.replace(/\+/g, "");

  if (cleaned.length === 10) {
    return "+91" + cleaned;
  }
  if (cleaned.length === 11 && cleaned.startsWith("1")) {
    return "+" + cleaned;
  }
  if (cleaned.length === 12 && cleaned.startsWith("91")) {
    return "+" + cleaned;
  }
  if (cleaned.length > 10) {
    return "+" + cleaned;
  }

  return "+91" + cleaned;
}

function extractText(payload: WebhookPayload): string | null {
  const raw =
    payload.text ??
    payload.body ??
    payload.message?.text ??
    payload.message?.body ??
    null;

  if (!raw || typeof raw !== "string") return null;
  const sanitized = sanitizeText(raw);
  return sanitized.length ? sanitized : null;
}

function extractSenderPhone(payload: WebhookPayload): string | null {
  const candidates: unknown[] = [
    payload.sender,
    payload.from,
    payload.handle,
    payload.senderPhone,
    payload.message?.sender,
    payload.message?.from,
    payload.message?.handle,
    payload.message?.senderPhone,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (typeof candidate === "string") return candidate;
    if (typeof candidate === "object") {
      const obj = candidate as Record<string, unknown>;
      // Check multiple possible property names for phone
      const phone = 
        obj.address || 
        obj.phoneNumber || 
        obj.phone || 
        obj.handle ||
        obj.from;
      if (typeof phone === "string") return phone;
    }
  }

  return null;
}

function extractAttachments(payload: WebhookPayload): AttachmentInput[] {
  if (Array.isArray(payload.attachments)) return payload.attachments;
  if (Array.isArray(payload.message?.attachments)) return payload.message?.attachments ?? [];
  return [];
}

function parseCommand(text: string): { action: "task" | "goal" | "event" | null; title: string } {
  const lower = text.toLowerCase();
  const patterns = [
    { action: "task" as const, keyword: "create task" },
    { action: "goal" as const, keyword: "create goal" },
    { action: "event" as const, keyword: "create event" },
  ];

  for (const pattern of patterns) {
    if (lower.includes(pattern.keyword)) {
      const regex = new RegExp(`${pattern.keyword}\\s*[:\\-]?\\s*(.*)$`, "i");
      const match = text.match(regex);
      const title = sanitizeText(match?.[1] ?? "");
      return { action: pattern.action, title };
    }
  }

  return { action: null, title: "" };
}

async function analyzeWithGemini(text: string): Promise<{ action: "task" | "goal" | "event" | null; title: string; date: string | null }> {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.log("Gemini API key not configured, skipping AI analysis");
      return { action: null, title: "", date: null };
    }

    const prompt = `You are an ULTRA-FUZZY intelligent assistant that extracts user intent from MESSY, RAMBLING natural language messages.

IGNORE these FILLER WORDS/PHRASES (they don't affect intent):
- "or something", "or whatever", "or anything", "or like"
- "maybe", "i think", "i guess", "possibly", "sort of", "kind of", "like", "i dunno"
- "kinda", "pretty much", "you know", "basically", "honestly", "literally"
- "i might want to", "i could", "it would be nice to", "we should"
- Extra rambling, parenthetical comments, uncertain language

USER MESSAGE TO ANALYZE:
"${text}"

STEP 1: IDENTIFY THE CORE ACTION (ignore all filler/uncertainty)
Extract what the user ACTUALLY wants to do/achieve, ignoring all the extra words.

STEP 2: IDENTIFY THE TYPE
- TASK: Something they need to complete/action ("do X", "complete X", "remind me to X")
  * Examples: "buy a car or something" → TASK "buy a car"
  * "maybe i should call mom or whatever" → TASK "call mom"
  * "fixx bugs tmmorow or like whenever" → TASK "fix bugs"
  * "tmmorow buy milk or something" → TASK "buy milk" + DATE "2026-02-19"

- GOAL: Something they want to learn/achieve/become ("learn X", "get X", "become X")
  * Examples: "i wanna maybe learn coding or something" → GOAL "learn coding"
  * "like, get healthier i guess" → GOAL "get healthier"
  * "masteer python maybe kinda" → GOAL "master python"

- EVENT: Scheduled meeting/appointment ("meeting/lunch/doctor with X", "at X time", "on X date")
  * Examples: "meting with john tomorrow or maybe next day" → EVENT, extract "meeting with john", date "2026-02-19" (tomorrow)
  * "doctr appt like next week or whenever" → EVENT "doctor appointment", date "2026-02-25"
  * "lunch with sara tomorrow at 6 or something" → EVENT "lunch with sara", date "2026-02-19"

- IGNORE: Just chat/question/greeting with NO actionable intent
  * "hello", "how are you", "what's up", "how's it going", "just saying hi"

STEP 3: EXTRACT THE CLEAN TITLE
- Remove all filler words, typos, grammar errors
- Keep ONLY the essential action/goal/event
- Examples:
  * "remind me too buy a car or like something idk" → "buy a car"
  * "schdule meating wth john tomorrow at 3pm or whatever" → "meeting with john"
  * "i wanna lern coding maybe i dunno" → "learn coding"
  * "lunch with sara tomorrow or whenever" → "lunch with sara"
  * "buy milk tmmorow pls or something" → "buy milk"

STEP 4: EXTRACT THE DATE
- Find ANY date/time: "tomorrow", "tmrw", "next week", "monday", "feb 15", "tonight", etc.
- Convert: "tmrw"→tomorrow, "nxt"→next, "wk"→week, "mon"→monday
- Convert to YYYY-MM-DD (today=2026-02-18, current year=2026)
- If message has "tomorrow" or "tmrw" or "tonight" → "2026-02-19"
- If "next monday" or "mon" → next Monday date
- If has date like "feb 15" or "2/15" → "2026-02-15"
- If no date mentioned → null
- Ignore "if you can", "whenever", "or maybe later" - just extract the first date mentioned

RESPOND ONLY WITH THIS JSON (no markdown, no extra text):
{
  "type": "task" | "goal" | "event" | "ignore",
  "title": "cleaned core action/event (empty string if unclear)",
  "date": "YYYY-MM-DD" or null
}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 200,
          },
        }),
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      console.log("Gemini API error:", response.status);
      return { action: null, title: "", date: null };
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log("Could not parse Gemini response:", responseText);
      return { action: null, title: "", date: null };
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      type?: string;
      title?: string;
      date?: string | null;
    };

    const type = parsed.type?.toLowerCase();
    const action =
      type === "task"
        ? "task"
        : type === "goal"
          ? "goal"
          : type === "event"
            ? "event"
            : null;

    const title = sanitizeText(parsed.title || "");
    const date = parsed.date || null;

    console.log("Gemini analysis:", { action, title, date });
    return { action, title, date };
  } catch (error) {
    console.log("Gemini analysis error:", error);
    return { action: null, title: "", date: null };
  }
}

function extractDateFromText(text: string): { date: string | null; invalid: boolean } {
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const date = `${iso[1]}-${iso[2]}-${iso[3]}`;
    return { date, invalid: !isValidISODate(date) };
  }

  const us = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (us) {
    const mm = us[1].padStart(2, "0");
    const dd = us[2].padStart(2, "0");
    const date = `${us[3]}-${mm}-${dd}`;
    return { date, invalid: !isValidISODate(date) };
  }

  return { date: null, invalid: false };
}

function isValidISODate(date: string): boolean {
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function getConversationId(payload: WebhookPayload): string {
  return (
    payload.conversationId ||
    payload.chatId ||
    payload.message?.conversationId ||
    payload.message?.chatId ||
    "imessage"
  );
}

async function getAttachmentBuffer(
  attachment: AttachmentInput
): Promise<{ buffer: Uint8Array; contentType?: string; fileName: string } | null> {
  const fileName = attachment.filename || `attachment-${Date.now()}`;
  const contentType = attachment.mimeType || attachment.contentType || undefined;

  if (attachment.data && typeof attachment.data === "string") {
    const data = attachment.data;
    const base64Match = data.match(/^data:([^;]+);base64,(.*)$/);
    if (base64Match) {
      const mime = base64Match[1];
      const buffer = Uint8Array.from(Buffer.from(base64Match[2], "base64"));
      return { buffer, contentType: mime, fileName };
    }

    const buffer = Uint8Array.from(Buffer.from(data, "base64"));
    return { buffer, contentType, fileName };
  }

  if (attachment.url && typeof attachment.url === "string") {
    const response = await fetch(attachment.url);
    if (!response.ok) return null;
    const buffer = new Uint8Array(await response.arrayBuffer());
    const responseType = response.headers.get("content-type") || contentType;
    return { buffer, contentType: responseType || undefined, fileName };
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    let payload = (await req.json()) as WebhookPayload;

    console.log("BLUEBUBBLES RAW PAYLOAD:", JSON.stringify(payload, null, 2));

    // Only process new-message events, ignore others
    const eventType = (payload as any).type;
    if (eventType && eventType !== "new-message") {
      console.log(`Ignoring event type: ${eventType}`);
      return NextResponse.json({ message: "Event ignored" }, { status: 200 });
    }

    // Unwrap BlueBubbles data wrapper if present
    if (payload.type && (payload as any).data) {
      payload = (payload as any).data as WebhookPayload;
    }

    const rawText = extractText(payload);
    const rawSender = extractSenderPhone(payload);
    const attachments = extractAttachments(payload);

    console.log("Extracted sender:", rawSender);
    console.log("Extracted text:", rawText);
    console.log("Extracted attachments:", attachments);

    if (!rawText && attachments.length === 0) {
      return NextResponse.json({ message: "No message content provided." }, { status: 400 });
    }

    if (!rawSender) {
      return NextResponse.json({ message: "Missing sender phone number." }, { status: 400 });
    }

    const normalizedPhone = normalizePhone(String(rawSender));
    const admin = getSupabaseAdminClient();

    const { data: profile, error: profileError } = await admin
      .from("user_profiles")
      .select("user_id, phone")
      .eq("phone", normalizedPhone)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json({ message: "Failed to resolve sender." }, { status: 500 });
    }

    if (!profile?.user_id) {
      return NextResponse.json({ message: "This number is not registered." }, { status: 200 });
    }

    const userId = profile.user_id;
    const responseMessages: string[] = [];

    if (attachments.length > 0) {
      const conversationId = getConversationId(payload);
      const uploaded: string[] = [];

      for (const attachment of attachments) {
        const resolved = await getAttachmentBuffer(attachment);
        if (!resolved) continue;

        const contentType = resolved.contentType || "application/octet-stream";
        const isImage = contentType.startsWith("image/");
        const bucket = isImage ? "images" : "documents";
        const safeName = resolved.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const filePath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`;

        const { error: uploadError } = await admin.storage
          .from(bucket)
          .upload(filePath, resolved.buffer, {
            contentType,
            upsert: true,
          });

        if (uploadError) continue;

        const { data: publicUrlData } = admin.storage.from(bucket).getPublicUrl(filePath);
        const publicUrl = publicUrlData.publicUrl;

        const { error: insertError } = await admin.from("image_uploads").insert({
          id: randomUUID(),
          user_id: userId,
          conversation_id: conversationId,
          sender: normalizedPhone,
          image_url: publicUrl,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        if (!insertError) uploaded.push(publicUrl);
      }

      if (uploaded.length > 0) {
        responseMessages.push(`Saved ${uploaded.length} attachment(s).`);
      }
    }

    if (rawText) {
      let { action, title } = parseCommand(rawText);
      let { date, invalid } = extractDateFromText(rawText);

      // If strict command didn't match, try Gemini AI analysis
      if (!action) {
        console.log("No strict command match, trying Gemini AI analysis...");
        const aiAnalysis = await analyzeWithGemini(rawText);
        action = aiAnalysis.action;
        title = aiAnalysis.title;
        date = aiAnalysis.date;
      }

      if (invalid) {
        return NextResponse.json(
          { message: "Invalid date format. Please resend using YYYY-MM-DD or MM/DD/YYYY." },
          { status: 200 }
        );
      }

      if (!action) {
        return NextResponse.json(
          { message: "I didn't understand that. Try: 'create task: Buy milk', 'create goal: Learn Spanish', or 'create event: Meeting tomorrow at 2pm'." },
          { status: 200 }
        );
      }

      if (!title) {
        return NextResponse.json(
          { message: `Please provide more details about what you want to ${action}.` },
          { status: 200 }
        );
      }

      if (action === "task") {
        const { data: listData } = await admin
          .from("task_lists")
          .select("id")
          .eq("user_id", userId)
          .order("position", { ascending: true })
          .limit(1)
          .maybeSingle();

        let listId = listData?.id as string | undefined;

        if (!listId) {
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
            return NextResponse.json({ message: "Failed to create task list." }, { status: 500 });
          }

          listId = createdList.id as string;
        }

        const { data: existing } = await admin
          .from("tasks")
          .select("position")
          .eq("list_id", listId)
          .order("position", { ascending: false })
          .limit(1);

        const nextPosition = existing && existing.length > 0 ? (existing[0].position ?? 0) + 1 : 0;

        const { error: taskError } = await admin.from("tasks").insert({
          user_id: userId,
          list_id: listId,
          title: title.slice(0, 200),
          notes: "",
          due_date: date || null,
          is_completed: false,
          is_starred: false,
          position: nextPosition,
          priority: "medium",
          due_time: null,
          progress: 0,
          metadata: {},
        });

        if (taskError) {
          return NextResponse.json({ message: "Failed to create task." }, { status: 500 });
        }

        responseMessages.push("Task created successfully.");
      } else if (action === "goal") {
        const { error: goalError } = await admin.from("goals").insert({
          user_id: userId,
          title: title.slice(0, 200),
          description: "",
          category: "personal",
          priority: "medium",
          progress: 0,
          target_date: date || null,
        });

        if (goalError) {
          return NextResponse.json({ message: "Failed to create goal." }, { status: 500 });
        }

        responseMessages.push("Goal created successfully.");
      } else if (action === "event") {
        if (!date) {
          return NextResponse.json(
            { message: "Please include a date for the event (YYYY-MM-DD or MM/DD/YYYY)." },
            { status: 200 }
          );
        }

        const { error: eventError } = await admin.from("calendar_events").insert({
          user_id: userId,
          title: title.slice(0, 200),
          description: "",
          event_date: date,
          start_time: null,
          end_time: null,
          location: null,
          category: "other",
          priority: "medium",
          source: "manual",
          source_id: "imessage",
          is_completed: false,
        });

        if (eventError) {
          return NextResponse.json({ message: "Failed to create event." }, { status: 500 });
        }

        responseMessages.push("Event created successfully.");
      }
    }

    if (responseMessages.length === 0) {
      responseMessages.push("Message received.");
    }

    return NextResponse.json({ message: responseMessages.join(" ") }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ message: "Webhook processing failed." }, { status: 500 });
  }
}
