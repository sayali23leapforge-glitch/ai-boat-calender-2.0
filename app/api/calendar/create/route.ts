import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { queueEventGmailReminders, queueRelatedQuestionAlert } from "@/lib/reminders";

export const runtime = "edge";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * Accepts:
 * - "14:00" / "14:00:00"
 * - "2pm" / "2 pm" / "2:30pm" / "2:30 pm"
 * - "2" or "14" (treated as 24h hour => "02:00" / "14:00")
 *
 * Returns "HH:MM:SS" or null if not parseable.
 */
function normalizeTimeToHHMMSS(input: any): string | null {
  if (input === null || input === undefined) return null;
  const s = String(input).trim().toLowerCase();
  if (!s) return null;

  // Already HH:MM:SS
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;

  // HH:MM
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const [h, m] = s.split(":").map((x) => Number(x));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;
    return `${pad2(h)}:${pad2(m)}:00`;
  }

  // H am/pm or H:MM am/pm
  // examples: "2pm", "2 pm", "2:30pm", "2:30 pm"
  const ap = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (ap) {
    let h = Number(ap[1]);
    const m = ap[2] ? Number(ap[2]) : 0;
    const mer = ap[3];

    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    if (h < 1 || h > 12 || m < 0 || m > 59) return null;

    if (mer === "pm" && h !== 12) h += 12;
    if (mer === "am" && h === 12) h = 0;

    return `${pad2(h)}:${pad2(m)}:00`;
  }

  // Bare hour like "14" or "2"
  if (/^\d{1,2}$/.test(s)) {
    const h = Number(s);
    if (!Number.isFinite(h) || h < 0 || h > 23) return null;
    return `${pad2(h)}:00:00`;
  }

  return null;
}

function isValidYMD(s: any): boolean {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
}

function getYmdInTimeZone(timeZone: string, dateObj = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(dateObj); // YYYY-MM-DD
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function resolveDateToken(dateLike: any, tz: string): string | null {
  if (dateLike === null || dateLike === undefined) return null;
  const raw = String(dateLike).trim().toLowerCase();
  if (!raw) return null;

  if (isValidYMD(raw)) return raw;

  const today = getYmdInTimeZone(tz);
  if (raw === "today") return today;
  if (raw === "tomorrow") return addDaysYmd(today, 1);

  return null;
}

function hhmmssToMinutes(t: string): number | null {
  const m = String(t || "").match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function minutesToHHMMSS(mins: number): string {
  const m = ((mins % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${pad2(hh)}:${pad2(mm)}:00`;
}

/**
 * Accepts either:
 * 1) { event: { user_id, title, event_date, start_time?, end_time?, ... } }
 * OR
 * 2) { event: { user_id, title, date, time?, endTime?, ... } }  <-- tool-style
 *
 * Normalizes into DB shape:
 * event_date, start_time, end_time (HH:MM:SS)
 *
 * IMPORTANT GUARD:
 * - If caller sent time/start_time but it is not parseable => 400 (don’t silently create all-day).
 * - If caller sent endTime/end_time but start missing/invalid => 400.
 * - All-day events still allowed by omitting both time + endTime entirely.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const raw = body?.event ?? body;

    const tz = String(body?.timezone || raw?.timezone || "Asia/Kolkata");

    // date normalization: supports event_date/date + tokens today/tomorrow
    const rawDate = raw?.event_date ?? raw?.date ?? null;
    const event_date = resolveDateToken(rawDate, tz);

    // Accept both DB and tool-style keys
    const rawStart = raw?.start_time ?? raw?.time ?? null;
    const rawEnd = raw?.end_time ?? raw?.endTime ?? null;

    const callerProvidedStart = rawStart !== null && rawStart !== undefined && String(rawStart).trim() !== "";
    const callerProvidedEnd = rawEnd !== null && rawEnd !== undefined && String(rawEnd).trim() !== "";

    const start_time = normalizeTimeToHHMMSS(rawStart);
    const end_time_in = normalizeTimeToHHMMSS(rawEnd);

    // ✅ Guard 1: they tried to send a start time but it didn't parse
    if (callerProvidedStart && !start_time) {
      return NextResponse.json(
        {
          error: "Invalid start time format",
          hint: 'Use "14:00", "14:00:00", "2pm", "2 pm", "2:30pm", or a bare hour like "14".',
          debug: { rawStart },
        },
        { status: 400 }
      );
    }

    // ✅ Guard 2: they sent an end time without a valid start time
    if (callerProvidedEnd && !start_time) {
      return NextResponse.json(
        {
          error: "End time provided without a valid start time",
          debug: { rawStart, rawEnd },
        },
        { status: 400 }
      );
    }

    // ✅ Guard 3: they tried to send an end time but it didn't parse
    if (callerProvidedEnd && !end_time_in) {
      return NextResponse.json(
        {
          error: "Invalid end time format",
          hint: 'Use "15:00", "15:00:00", "3pm", "3 pm", "3:30pm", etc.',
          debug: { rawEnd },
        },
        { status: 400 }
      );
    }

    // Optional: if start is provided (timed event) but end missing, auto add 60 mins
    let end_time: string | null = end_time_in;
    if (start_time && !end_time) {
      const sMin = hhmmssToMinutes(start_time);
      if (sMin !== null) end_time = minutesToHHMMSS(sMin + 60);
    }

    const normalized = {
      ...raw,
      event_date,
      start_time: start_time ?? null,
      end_time: end_time ?? null,
    };

    if (!normalized?.user_id || !normalized?.title || !isValidYMD(normalized?.event_date)) {
      return NextResponse.json(
        {
          error: "Missing/invalid required event fields",
          required: ["user_id", "title", "event_date(YYYY-MM-DD)"],
          debug: {
            hasBodyEventWrapper: Boolean(body?.event),
            rawKeys: raw ? Object.keys(raw) : [],
            receivedRaw: raw ?? null,
            normalized: {
              user_id: normalized?.user_id ?? null,
              title: normalized?.title ?? null,
              event_date: normalized?.event_date ?? null,
              start_time: normalized?.start_time ?? null,
              end_time: normalized?.end_time ?? null,
            },
          },
        },
        { status: 400 }
      );
    }

    const insertEvent = {
      user_id: normalized.user_id,
      title: normalized.title,
      description: normalized.description ?? null,
      event_date: normalized.event_date,
      start_time: normalized.start_time ?? null,
      end_time: normalized.end_time ?? null,
      location: normalized.location ?? null,
      category: normalized.category ?? "other",
      priority: normalized.priority ?? "medium",
      source: normalized.source ?? "manual",
      source_id: normalized.source_id ?? null,
      is_completed: normalized.is_completed ?? false,
    };

    const admin = getSupabaseAdminClient();

    const { data, error } = await admin
      .from("calendar_events")
      .insert(insertEvent)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message, debug: { insertEvent } }, { status: 500 });
    }

    if (data?.id && data?.user_id) {
      try {
        await admin
          .from("reminders")
          .delete()
          .eq("entity_type", "EVENT")
          .eq("entity_id", data.id)
          .in("status", ["PENDING", "PROCESSING", "FAILED"]);

        await queueEventGmailReminders({
          admin,
          userId: data.user_id,
          eventId: data.id,
          title: String(data.title || ""),
          description: String(data.description || ""),
          eventDate: data.event_date || null,
          startTime: data.start_time || null,
          clientTimezone: tz,
          priority: data.priority || null,
        });

        if (data.start_time && data.end_time) {
          const { data: overlaps } = await admin
            .from("calendar_events")
            .select("id,title,start_time,end_time")
            .eq("user_id", data.user_id)
            .eq("event_date", data.event_date)
            .neq("id", data.id)
            .not("start_time", "is", null)
            .not("end_time", "is", null)
            .lt("start_time", data.end_time)
            .gt("end_time", data.start_time)
            .limit(1);

          if ((overlaps || []).length > 0) {
            const conflict = overlaps![0];
            await queueRelatedQuestionAlert({
              admin,
              userId: data.user_id,
              entityType: "EVENT",
              entityId: data.id,
              title: String(data.title || "Event"),
              question: `This overlaps with "${conflict.title}". Should I suggest alternate slots?`,
              clientTimezone: tz,
            });
          }
        }
      } catch (reminderError) {
        console.error("Failed to queue timeline alerts for event create:", reminderError);
      }
    }

    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 });
  }
}
