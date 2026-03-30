import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { serverCreateTask, serverCreateEvent, serverCreateGoal } from "@/lib/server-actions";

type AllowedView =
  | "tasks"
  | "calendar"
  | "goals"
  | "priorities"
  | "focus"
  | "google"
  | "upload";

type Priority = "critical" | "high" | "medium" | "low";

type ToolCall =
  | { id?: string; name: "ui_console_log"; arguments: { message: string } }
  | { id?: string; name: "ui_alert"; arguments: { message: string } }
  | { id?: string; name: "set_active_view"; arguments: { view: AllowedView } }
  | {
      id?: string;
      name: "request_disambiguation";
      arguments: {
        prompt: string;
        kind: "task" | "event" | "goal" | "slot";
        choices: Array<{
          key: string;
          title: string;
          subtitle?: string;
          payload?: { date?: string; time?: string; endTime?: string; durationMinutes?: number };
        }>;
        pendingTool: ToolCall;
      };
    }
  | { id?: string; name: "create_task_list"; arguments: { name: string; color?: string } }
  | {
      id?: string;
      name: "create_task";
      arguments: {
        title: string;
        notes?: string;
        dueDate?: string;
        dueTime?: string;
        priority?: Priority;
        goal?: string;
        estimatedHours?: number;
        location?: string;
        syncToCalendar?: boolean;
        listName?: string;
      };
    }
  | {
      id?: string;
      name: "create_event";
      arguments: {
        title: string;
        description?: string;
        date: string;
        time?: string;
        endTime?: string;
        location?: string;
        category?: string;
        priority?: Priority;
      };
    }
  | {
      id?: string;
      name: "create_goal";
      arguments: {
        title: string;
        description?: string;
        targetDate?: string;
        metric?: string;
      };
    }
  | {
      id?: string;
      name: "update_task_by_title";
      arguments: {
        titleQuery: string;
        title?: string;
        notes?: string;
        dueDate?: string;
        dueTime?: string;
        priority?: Priority;
        goal?: string;
        estimatedHours?: number;
        location?: string;
        progress?: number;
      };
    }
  | { id?: string; name: "complete_task_by_title"; arguments: { titleQuery: string; completed?: boolean } }
  | { id?: string; name: "star_task_by_title"; arguments: { titleQuery: string; starred?: boolean } }
  | { id?: string; name: "delete_task_by_title"; arguments: { titleQuery: string } }
  | {
      id?: string;
      name: "update_event_by_title";
      arguments: {
        titleQuery: string;
        title?: string;
        description?: string;
        date?: string;
        time?: string;
        endTime?: string;
        location?: string;
        category?: string;
        priority?: Priority;
        isCompleted?: boolean;
      };
    }
  | { id?: string; name: "delete_event_by_title"; arguments: { titleQuery: string } }
  | {
      id?: string;
      name: "update_goal_by_title";
      arguments: {
        titleQuery: string;
        title?: string;
        description?: string;
        targetDate?: string;
        progress?: number;
      };
    }
  | { id?: string; name: "delete_goal_by_title"; arguments: { titleQuery: string } }
  | {
      id?: string;
      name: "get_agenda";
      arguments: { range: "today" | "tomorrow" | "this_week" | "date"; date?: string };
    }
  | {
      id?: string;
      name: "get_agenda_v2";
      arguments: {
        range: "today" | "tomorrow" | "this_week" | "date";
        date?: string;
        includeFreeSlots?: boolean;
        durationMinutes?: number;
      };
    }
  | {
      id?: string;
      name: "detect_event_conflicts";
      arguments: {
        proposed: {
          date: string;
          startTime?: string;
          endTime?: string;
          excludeEventId?: string;
        };
      };
    };

type ChatApiResponse = {
  assistantText: string;
  toolCalls: ToolCall[];
  requestId?: string;
  silentMode?: boolean; // If true, don't show assistant message, show toast instead
  successMessage?: string; // Toast message to show (e.g., "✓ Task added")
  pendingEventDraft?: PendingEventDraft | null;
};

type PendingEventDraft = {
  kind: "event_conflict_resolution";
  date: string;
  requestedStartTime?: string;
  requestedEndTime?: string;
  durationMinutes: number;
  pendingTool: {
    id?: string;
    name: "create_event" | "update_event_by_title";
    arguments: Record<string, any>;
  };
  slots: Array<{ start_time: string; end_time: string; reason: string }>;
  createdAt: string;
};


type RecentEntities = {
  lastTaskTitle?: string | null;
  lastEventTitle?: string | null;
  lastGoalTitle?: string | null;
  lastTaskListName?: string | null;
  lastActiveView?: AllowedView | null;
  updatedAt?: number | null;
};

function extractReminderPreferenceInstruction(message: string): string | null {
  const text = (message || "").trim();
  if (!text) return null;

  const lowered = text.toLowerCase();
  const preferencePattern =
    /\b(stop emailing me about|don't email me about|do not email me about|no email reminders for|email me about)\b/;

  if (!preferencePattern.test(lowered)) {
    return null;
  }

  return text;
}

async function appendReminderPreference(params: {
  userId: string;
  instruction: string;
}) {
  const admin = getSupabaseAdminClient();

  const { data: profileExisting } = await admin
    .from("user_profiles")
    .select("id, reminder_prefs")
    .eq("user_id", params.userId)
    .maybeSingle();

  const now = new Date().toISOString();
  const line = `[${now}] ${params.instruction}`;
  const merged = profileExisting?.reminder_prefs
    ? `${profileExisting.reminder_prefs}\n${line}`
    : line;

  if (profileExisting?.id) {
    await admin
      .from("user_profiles")
      .update({ reminder_prefs: merged })
      .eq("id", profileExisting.id);
    return;
  }

  // Fallback path for projects that still store reminder prefs in user_preferences.
  const { data: legacyExisting } = await admin
    .from("user_preferences")
    .select("id, reminder_prefs")
    .eq("user_id", params.userId)
    .maybeSingle();

  if (legacyExisting?.id) {
    await admin
      .from("user_preferences")
      .update({
        reminder_prefs: legacyExisting.reminder_prefs
          ? `${legacyExisting.reminder_prefs}\n${line}`
          : line,
      })
      .eq("id", legacyExisting.id);
    return;
  }

  await admin.from("user_preferences").insert({
    user_id: params.userId,
    reminder_prefs: line,
  });
}

function makeRequestId() {
  const g: any = globalThis as any;
  if (g?.crypto?.randomUUID) return g.crypto.randomUUID();
  return `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function safeJsonParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function extractFirstJsonObject(text: string): any | null {
  if (!text) return null;
  let s = text.trim();
  s = s.replace(/^```(json)?/i, "").replace(/```$/i, "").trim();
  const direct = safeJsonParse<any>(s);
  if (direct) return direct;
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (depth === 0) {
      const candidate = s.slice(start, i + 1);
      const parsed = safeJsonParse<any>(candidate);
      if (parsed) return parsed;
      const nextStart = s.indexOf("{", i + 1);
      if (nextStart >= 0) {
        i = nextStart - 1;
        depth = 0;
        continue;
      }
      return null;
    }
  }
  return null;
}

// Helper to normalize time tokens
function normalizeTimeTokens(input: string): string {
  let s = (input || "").trim();
  if (!s) return s;
  s = s.replace(/\b(tmrw|tmrw\.|tom)\b/gi, "tomorrow");
  s = s.replace(/\btdy\b/gi, "today");
  // normalize "2pm" => "2 pm"
  s = s.replace(/\b(\d{1,2})(:\d{2})?\s*(am|pm)\b/gi, (_m, hh, mm, ap) => {
    const h = String(hh);
    const m = mm ? String(mm) : "";
    return `${h}${m} ${String(ap).toLowerCase()}`;
  });
  return s;
}

// Helper to normalize user text for LLM
function normalizeUserTextForLLM(input: string): string {
  let s = String(input || "").trim();
  if (!s) return s;
  // Apply time token normalization
  s = normalizeTimeTokens(s);
  return s;
}

// ============
// Time helpers
// ============

/**
 * Parse common time tokens into HH:MM (24h).
 * Supports:
 *  - "2 pm", "2pm", "2:30 pm", "2:30pm"
 *  - "14:00", "9:05"
 */
function parseTimeToHHMM(input?: string): string | undefined {
  if (!input) return undefined;
  const s = String(input).trim().toLowerCase();
  if (!s) return undefined;

  // Already HH:MM or H:MM
  if (/^\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{1}:\d{2}$/.test(s)) return `0${s}`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s.slice(0, 5);

  // "2 pm" or "2:30 pm" etc.
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (m) {
    let hh = Number(m[1]);
    const mm = m[2] ? Number(m[2]) : 0;
    const ap = m[3].toLowerCase();
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return undefined;
    if (hh < 1 || hh > 12 || mm < 0 || mm > 59) return undefined;
    if (ap === "pm" && hh !== 12) hh += 12;
    if (ap === "am" && hh === 12) hh = 0;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }

  // "2pm" without space
  const m2 = s.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/i);
  if (m2) {
    return parseTimeToHHMM(`${m2[1]}${m2[2] ? `:${m2[2]}` : ""} ${m2[3]}`);
  }

  return undefined;
}

function normalizeHHMM(t?: string): string | undefined {
  // NOTE: now parses "2 pm" too
  return parseTimeToHHMM(t);
}

function toMinutes(hhmm?: string): number | null {
  const t = normalizeHHMM(hhmm);
  if (!t) return null;
  const [hh, mm] = t.split(":");
  const h = Number(hh);
  const m = Number(mm);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function minutesToHHMM(mins: number): string {
  const m = ((mins % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function getYmdInTimeZone(timeZone: string, dateObj = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(dateObj);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (year && month && day) return `${year}-${month}-${day}`;
  // Fallback (should rarely happen)
  const iso = new Date(dateObj).toISOString().slice(0, 10);
  return iso;
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

function sanitizeTimeZone(input?: string | null): string | undefined {
  const tz = String(input || "").trim();
  if (!tz) return undefined;
  try {
    // Throws RangeError for invalid IANA timezones.
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return undefined;
  }
}

function weekdayTokenToIndex(token: string): number | undefined {
  const t = (token || "").trim().toLowerCase();
  if (!t) return undefined;
  if (t === "sunday" || t === "sun") return 0;
  if (t === "monday" || t === "mon") return 1;
  if (t === "tuesday" || t === "tue" || t === "tues") return 2;
  if (t === "wednesday" || t === "wed") return 3;
  if (t === "thursday" || t === "thu" || t === "thur" || t === "thurs") return 4;
  if (t === "friday" || t === "fri") return 5;
  if (t === "saturday" || t === "sat") return 6;
  return undefined;
}

function ymdWeekdayIndex(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y || 1970, (m || 1) - 1, d || 1));
  return dt.getUTCDay();
}

function resolveWeekdayExpressionToYmd(input: string, tz: string): string | undefined {
  const s = String(input || "").trim().toLowerCase();
  if (!s) return undefined;

  const m = s.match(
    /\b(?:(next|this)\s+)?(monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat|sunday|sun)\b/i
  );
  if (!m) return undefined;

  const modifier = (m[1] || "").toLowerCase();
  const target = weekdayTokenToIndex(m[2] || "");
  if (target === undefined) return undefined;

  const today = getYmdInTimeZone(tz);
  const current = ymdWeekdayIndex(today);
  let delta = (target - current + 7) % 7;

  // "next Thursday" should always mean a future date, never today.
  if (modifier === "next" && delta === 0) delta = 7;

  return addDaysYmd(today, delta);
}

function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function isAmbiguousTitleQuery(s: string | undefined): boolean {
  const t = (s || "").trim().toLowerCase();
  if (!t) return true;
  return (
    t === "it" ||
    t === "that" ||
    t === "this" ||
    t === "that one" ||
    t === "this one" ||
    t === "the meeting" ||
    t === "the event" ||
    t === "meeting" ||
    t === "event" ||
    t === "task" ||
    t === "goal"
  );
}

function parseDurationMinutesFromText(text: string): number | null {
  const s = (text || "").toLowerCase();
  const m = s.match(/(\d+)\s*(min|mins|minute|minutes|hr|hrs|hour|hours)\b/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2];
  if (unit.startsWith("h")) return n * 60;
  return n;
}

function looksLikeFreeTimeQuery(text: string): boolean {
  const s = (text || "").toLowerCase();
  return /\b(free|available|availability|slot|open time|open slots|when can i|when am i free)\b/.test(s);
}

function resolveSlotSelectionFromReply(
  reply: string,
  draft?: PendingEventDraft | null
): { slot?: { start_time: string; end_time: string; reason: string }; cancel?: boolean } {
  if (!draft || !Array.isArray(draft.slots) || draft.slots.length === 0) return {};
  const text = (reply || "").trim().toLowerCase();
  if (!text) return {};

  if (/\b(cancel|skip|nevermind|never mind|leave it|don't schedule|do not schedule)\b/.test(text)) {
    return { cancel: true };
  }

  const ordinals: Array<{ re: RegExp; idx: number }> = [
    { re: /\b(first|1st|option\s*1|slot\s*1|#1)\b/, idx: 0 },
    { re: /\b(second|2nd|option\s*2|slot\s*2|#2)\b/, idx: 1 },
    { re: /\b(third|3rd|option\s*3|slot\s*3|#3)\b/, idx: 2 },
    { re: /\b(fourth|4th|option\s*4|slot\s*4|#4)\b/, idx: 3 },
    { re: /\b(fifth|5th|option\s*5|slot\s*5|#5)\b/, idx: 4 },
  ];
  for (const o of ordinals) {
    if (o.re.test(text) && draft.slots[o.idx]) return { slot: draft.slots[o.idx] };
  }

  if (/\b(next|another slot|any slot|best slot|available slot)\b/.test(text)) {
    return { slot: draft.slots[0] };
  }

  const explicitTime = extractTimeFromUserText(text);
  if (explicitTime) {
    const exact = draft.slots.find((s) => normalizeHHMM(s.start_time) === explicitTime);
    if (exact) return { slot: exact };

    const target = toMinutes(explicitTime);
    if (target !== null) {
      const nearest = [...draft.slots]
        .map((s) => ({ s, d: Math.abs((toMinutes(s.start_time) ?? target) - target) }))
        .sort((a, b) => a.d - b.d)[0]?.s;
      if (nearest) return { slot: nearest };
    }
  }

  return {};
}

function scoreMatch(title: string, q: string): number {
  const t = (title || "").toLowerCase();
  const query = (q || "").toLowerCase().trim();
  if (!query) return 0;
  if (t === query) return 100;
  if (t.startsWith(query)) return 80;
  if (t.includes(query)) return 60;
  return 0;
}

// ✅ resolve planner date tokens like "today"/"tomorrow" into YYYY-MM-DD
function resolveDateToken(dateLike: any, tz: string): string | undefined {
  const raw = String(dateLike || "").trim().toLowerCase();
  if (!raw) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const today = getYmdInTimeZone(tz);
  if (raw === "today") return today;
  if (raw === "tomorrow") return addDaysYmd(today, 1);
  return resolveWeekdayExpressionToYmd(raw, tz);
}

// ✅ extract date from user message if planner forgot to include it
function extractDateFromUserText(text: string, tz: string): string | undefined {
  const s = String(text || "").toLowerCase();

  const m = s.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (m?.[1]) return m[1];

  // Prefer explicit weekday references over generic words like "today"
  // when both appear in the same sentence.
  const weekdayDate = resolveWeekdayExpressionToYmd(s, tz);
  if (weekdayDate) return weekdayDate;

  const today = getYmdInTimeZone(tz);
  if (/\btomorrow\b/.test(s)) return addDaysYmd(today, 1);
  if (/\btoday\b/.test(s)) return today;

  return undefined;
}

function extractTimeFromUserText(text: string): string | undefined {
  const s = String(text || "").toLowerCase();
  if (!s) return undefined;

  const timeMatch =
    s.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i) ||
    s.match(/\b(\d{1,2}:\d{2})\b/);

  if (!timeMatch) return undefined;

  if (timeMatch.length >= 4) {
    return parseTimeToHHMM(`${timeMatch[1]}${timeMatch[2] ? `:${timeMatch[2]}` : ""} ${timeMatch[3]}`);
  }

  if (timeMatch.length === 2) {
    return parseTimeToHHMM(timeMatch[1]);
  }

  return undefined;
}

function extractTimeRangeFromUserText(text: string): { time?: string; endTime?: string } {
  const s = String(text || "").toLowerCase();
  if (!s) return {};

  // "from 10:00 am to 11:00 am", "10am-11am", "10:00 to 11:00"
  const range =
    s.match(
      /\b(?:from\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*(?:to|\-|\–)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i
    ) ||
    s.match(/\b(?:from\s+)?(\d{1,2}:\d{2})\s*(?:to|\-|\–)\s*(\d{1,2}:\d{2})\b/i);

  if (range) {
    if (range.length >= 7) {
      const start = parseTimeToHHMM(`${range[1]}${range[2] ? `:${range[2]}` : ""} ${range[3]}`);
      const end = parseTimeToHHMM(`${range[4]}${range[5] ? `:${range[5]}` : ""} ${range[6]}`);
      return { time: start, endTime: end };
    }
    if (range.length === 3) {
      const start = parseTimeToHHMM(range[1]);
      const end = parseTimeToHHMM(range[2]);
      return { time: start, endTime: end };
    }
  }

  const single = extractTimeFromUserText(s);
  return single ? { time: single } : {};
}

/**
 * Pull a time (and optional endTime) from recent message history.
 * Used when user replies only with date token (e.g. "tomorrow") and planner drops the earlier time.
 */
function extractTimeFromHistory(rawMessages: any[]): { time?: string; endTime?: string } {
  const msgs = Array.isArray(rawMessages) ? rawMessages : [];
  // Look back across recent user messages for a time expression
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m?.role !== "user") continue;
    const txt = normalizeUserTextForLLM(String(m?.content || ""));
    // Skip pure date token replies
    if (/^(today|tomorrow|\d{4}-\d{2}-\d{2})$/i.test(txt.trim())) continue;

    // Try "from 2pm to 3pm" / "2pm-3pm" / "2 pm to 3 pm"
    const range =
      txt.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*(?:to|\-|\–)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i) ||
      txt.match(/(\d{1,2}:\d{2})\s*(?:to|\-|\–)\s*(\d{1,2}:\d{2})/i);

    if (range) {
      if (range.length >= 7) {
        const start = parseTimeToHHMM(`${range[1]}${range[2] ? `:${range[2]}` : ""} ${range[3]}`);
        const end = parseTimeToHHMM(`${range[4]}${range[5] ? `:${range[5]}` : ""} ${range[6]}`);
        if (start) return { time: start, endTime: end };
      }
      if (range.length === 3) {
        const start = parseTimeToHHMM(range[1]);
        const end = parseTimeToHHMM(range[2]);
        if (start) return { time: start, endTime: end };
      }
    }

    // Single time like "2pm" / "2 pm" / "14:30"
    const single =
      txt.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i) ||
      txt.match(/\b(\d{1,2}:\d{2})\b/);

    if (single) {
      if (single.length >= 4) {
        const start = parseTimeToHHMM(`${single[1]}${single[2] ? `:${single[2]}` : ""} ${single[3]}`);
        if (start) return { time: start };
      }
      if (single.length === 2) {
        const start = parseTimeToHHMM(single[1]);
        if (start) return { time: start };
      }
    }
  }
  return {};
}

function isDateOnlyReply(text: string): boolean {
  const t = (text || "").trim().toLowerCase();
  return (
    t === "today" ||
    t === "tomorrow" ||
    /^\d{4}-\d{2}-\d{2}$/.test(t) ||
    /\b(?:(next|this)\s+)?(monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat|sunday|sun)\b/i.test(
      t
    )
  );
}

// ======================
// DB fetch via admin key
// ======================
type DbEvent = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  category: string | null;
  priority: string | null;
  is_completed: boolean | null;
};

async function fetchEventsForRangeAdmin(params: {
  userId: string;
  startDate: string;
  endDate: string;
}): Promise<DbEvent[]> {
  const { userId, startDate, endDate } = params;
  const admin = getSupabaseAdminClient();

  const { data, error } = await admin
    .from("calendar_events")
    .select("id,user_id,title,description,event_date,start_time,end_time,location,category,priority,is_completed")
    .eq("user_id", userId)
    .gte("event_date", startDate)
    .lte("event_date", endDate)
    .order("event_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) throw new Error(error.message);
  return (data as any[]) as DbEvent[];
}

async function fetchEventsByTitleAdmin(params: {
  userId: string;
  titleQuery: string;
  startDate: string;
  endDate: string;
  limit: number;
}): Promise<DbEvent[]> {
  const { userId, titleQuery, startDate, endDate, limit } = params;
  const admin = getSupabaseAdminClient();

  const { data, error } = await admin
    .from("calendar_events")
    .select("id,user_id,title,description,event_date,start_time,end_time,location,category,priority,is_completed")
    .eq("user_id", userId)
    .gte("event_date", startDate)
    .lte("event_date", endDate)
    .ilike("title", `%${titleQuery}%`)
    .order("event_date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data as any[]) as DbEvent[];
}

// ===================================
// Smart slot suggestions (same day)
// ===================================
function buildBusyIntervalsForDate(events: DbEvent[], windowStart: number, windowEnd: number) {
  const hasAllDay = events.some((e) => !e.start_time || !e.end_time);
  if (hasAllDay) return [{ start: windowStart, end: windowEnd, source: "all_day" as const }];

  const intervals = events
    .map((e) => {
      const s = toMinutes(e.start_time?.slice(0, 5) || undefined);
      const en = toMinutes(e.end_time?.slice(0, 5) || undefined);
      if (s === null || en === null) return null;
      const start = Math.max(windowStart, s);
      const end = Math.min(windowEnd, en);
      if (end <= start) return null;
      return { start, end, source: e };
    })
    .filter(Boolean) as { start: number; end: number; source: DbEvent }[];

  intervals.sort((a, b) => a.start - b.start);

  const merged: { start: number; end: number; source: DbEvent | "merged" }[] = [];
  for (const iv of intervals) {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push({ start: iv.start, end: iv.end, source: iv.source });
      continue;
    }
    if (iv.start <= last.end) {
      last.end = Math.max(last.end, iv.end);
      last.source = "merged";
    } else {
      merged.push({ start: iv.start, end: iv.end, source: iv.source });
    }
  }
  return merged;
}

function suggestSlots(params: {
  events: DbEvent[];
  preferredStartTime?: string;
  durationMinutes: number;
  windowStart: string;
  windowEnd: string;
  limit: number;
}) {
  const windowStartMin = toMinutes(params.windowStart) ?? 9 * 60;
  const windowEndMin = toMinutes(params.windowEnd) ?? 21 * 60;
  const dur = Math.max(5, Math.min(24 * 60, params.durationMinutes || 30));
  const prefMin = toMinutes(params.preferredStartTime);

  const busy = buildBusyIntervalsForDate(params.events, windowStartMin, windowEndMin);

  const free: { start: number; end: number }[] = [];
  let cursor = windowStartMin;
  for (const b of busy) {
    if (b.start > cursor) free.push({ start: cursor, end: b.start });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < windowEndMin) free.push({ start: cursor, end: windowEndMin });

  const candidates: { start: number; end: number }[] = [];
  for (const f of free) {
    let s = f.start;
    while (s + dur <= f.end) {
      candidates.push({ start: s, end: s + dur });
      s += 15;
      if (candidates.length > 300) break;
    }
  }

  const scored = candidates
    .map((c) => {
      const distance = prefMin === null ? 0 : Math.abs(c.start - prefMin);
      const score = 100000 - distance;
      const reason =
        prefMin === null
          ? "Available"
          : distance === 0
          ? "Exact match"
          : `Closest available (${Math.round(distance)} min away)`;
      return { ...c, score, reason };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, params.limit);

  return scored.map((s) => ({
    start_time: minutesToHHMM(s.start),
    end_time: minutesToHHMM(s.end),
    score: s.score,
    reason: s.reason,
  }));
}

// ===============================
// Deterministic task list fallback
// ===============================
function inferListNameHeuristic(title: string, notes?: string): string {
  const t = `${title || ""} ${notes || ""}`.toLowerCase();

  if (/\b(invoice|gst|payment|pay|rent|salary|tax|bank|emi|bill|cash|upi|electricity)\b/.test(t)) return "Finance";
  if (/\b(buy|order|purchase|grocery|groceries|milk|vegetable|amazon|flipkart|shopping)\b/.test(t)) return "Shopping";
  if (/\b(gym|workout|doctor|dentist|medicine|health|walk|run|yoga)\b/.test(t)) return "Health";
  if (/\b(study|homework|assignment|exam|revision|lecture|class|project)\b/.test(t)) return "Study";
  if (/\b(call|email|follow up|client|supplier|meeting|proposal|deliver|deploy|bug|fix)\b/.test(t)) return "Work";

  return "Quick Tasks";
}

// ===================================
// Planner JSON schema (multi-intent)
// ===================================
type PlannerItem =
  | {
      kind: "task";
      title: string;
      notes?: string;
      dueDate?: string;
      dueTime?: string;
      priority?: Priority;
      estimatedHours?: number;
      location?: string;
      syncToCalendar?: boolean;
      listName?: string;
    }
  | {
      kind: "event";
      title: string;
      description?: string;
      date: string;
      time?: string;
      endTime?: string;
      location?: string;
      category?: string;
      priority?: Priority;
    }
  | {
      kind: "goal";
      title: string;
      description?: string;
      targetDate?: string;
      metric?: string;
    }
  | {
      kind: "query_agenda";
      range: "today" | "tomorrow" | "this_week" | "date";
      date?: string;
    }
  | {
      kind: "query_agenda_v2";
      range: "today" | "tomorrow" | "this_week" | "date";
      date?: string;
      includeFreeSlots?: boolean;
      durationMinutes?: number;
    }
  | {
      kind: "update_event";
      titleQuery: string;
      date?: string;
      time?: string;
      endTime?: string;
      title?: string;
      description?: string;
      location?: string;
      category?: string;
      priority?: Priority;
      isCompleted?: boolean;
    }
  | {
      kind: "update_task";
      titleQuery: string;
      title?: string;
      notes?: string;
      dueDate?: string;
      dueTime?: string;
      priority?: Priority;
      estimatedHours?: number;
      location?: string;
      progress?: number;
    }
  | { kind: "complete_task"; titleQuery: string; completed?: boolean }
  | { kind: "delete_task"; titleQuery: string }
  | { kind: "delete_event"; titleQuery: string }
  | { kind: "create_task_list"; name: string; color?: string };

type PlannerOutput = {
  assistantText?: string;
  isConversationOnly?: boolean;
  items: PlannerItem[];
};

// ===========================
// OpenAI call helper
// ===========================
async function callGemini(
  geminiApiKey: string,
  messages: any[],
  imageAttachments?: Array<{ data: string; mimeType: string }>,
  options?: { jsonMode?: boolean }
) {
  const systemMsg = messages.find((m: any) => m.role === "system")?.content || "";

  // Build proper multi-turn conversation from non-system messages.
  // Gemini requires roles to strictly alternate between "user" and "model".
  const nonSystem = messages.filter((m: any) => m.role !== "system");

  // Merge consecutive same-role messages so the sequence always alternates.
  const normalized: Array<{ role: string; content: string }> = [];
  for (const m of nonSystem) {
    const role = m.role === "assistant" ? "model" : "user";
    const text = typeof m.content === "string" ? m.content : "";
    if (normalized.length > 0 && normalized[normalized.length - 1].role === role) {
      // Merge into the previous turn to keep alternation valid.
      normalized[normalized.length - 1].content += "\n" + text;
    } else {
      normalized.push({ role, content: text });
    }
  }

  // Gemini requires the final turn to be a "user" turn.
  if (!normalized.length || normalized[normalized.length - 1].role !== "user") {
    normalized.push({ role: "user", content: "" });
  }

  // Convert to Gemini contents format; attach images to the last user message only.
  const contents = normalized.map((m, idx) => {
    const isLast = idx === normalized.length - 1;
    const parts: any[] = [];
    if (isLast && m.role === "user" && imageAttachments?.length) {
      // Gemini Vision requires inline_data parts before the text part.
      parts.push(
        ...imageAttachments.map((img) => ({
          inline_data: { mime_type: img.mimeType, data: img.data },
        }))
      );
    }
    parts.push({ text: m.content });
    return { role: m.role, parts };
  });

  const requestBody: Record<string, any> = { contents };
  if (systemMsg) {
    requestBody.system_instruction = { parts: [{ text: systemMsg }] };
  }
  if (options?.jsonMode) {
    requestBody.generationConfig = { responseMimeType: "application/json" };
  }

  const geminiResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!geminiResp.ok) {
    const errText = await geminiResp.text();
    console.error("Gemini error:", errText);
    return { ok: false, status: geminiResp.status, data: null as any, errText };
  }

  const data = await geminiResp.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return {
    ok: true,
    status: 200,
    data: { choices: [{ message: { content } }] },
    errText: "",
  };
}

// ===========================
// Deterministic pre-filter: catches obvious greetings/pleasantries
// without spending an LLM call on them.
// ===========================
function isObviouslyNonActionable(text: string): boolean {
  const t = text.trim();
  // Pattern covers greetings, pleasantries, single-word acks, and filler phrases
  const PATTERN =
    /^(hi+|hello+|hey+|yo+|howdy|good\s+(morning|afternoon|evening|night|day)|thanks+|thank\s+you|ty|thx|ok+|okay|k|sure|got\s+it|sounds\s+good|yep+|yup+|nope|nah|bye+|goodbye|see\s+ya|cya|cool+|great+|awesome+|perfect+|nice+|wow+|lol+|haha+|hehe+|👍|✅|🙏)[\s!?.🙂😊]*$/i;
  const CHAT_PATTERN =
    /^(what'?s\s+up|wassup|sup|how\s+are\s+you|how'?s\s+it\s+going|how'?s\s+your\s+day|what'?s\s+new|tell\s+me\s+something|you\s+there)[\s!?.🙂😊]*$/i;
  return PATTERN.test(t) || CHAT_PATTERN.test(t);
}

// ===========================
// Intent classifier for non-interactive clients (voice, iMessage)
// Returns "action" | "ambiguous" | "non_actionable"
// ===========================
async function classifyVoiceIntent(
  geminiApiKey: string,
  text: string
): Promise<"action" | "ambiguous" | "non_actionable"> {
  const prompt = `Classify the following voice message into exactly one category. Reply with ONLY the category word, nothing else.

Categories:
- action: The user is explicitly requesting something to be done, tracked, or created. Must have a clear intent to log/track (e.g., "remind me to call the dentist", "add a task to buy milk", "schedule a meeting tomorrow at 3", "don't forget to pay rent on Friday").
- ambiguous: A possible action is mentioned but the user is NOT clearly asking for it to be tracked (e.g., "I should probably call the dentist", "I might need to fix the bugs", "I was thinking about going to the gym").
- non_actionable: A greeting, pleasantry, acknowledgment, question, or statement with no request to create or track anything (e.g., "hi", "thanks", "ok", "sounds good", "how are you", "what's on my calendar today").

Voice message: "${text.replace(/"/g, "'")}"

Reply with exactly one word: action, ambiguous, or non_actionable`;

  const resp = await callGemini(geminiApiKey, [{ role: "user", content: prompt }]);
  if (!resp.ok) return "action"; // fail open — let Planner handle it
  const result = (resp.data?.choices?.[0]?.message?.content || "").trim().toLowerCase();
  if (result === "non_actionable") return "non_actionable";
  if (result === "ambiguous") return "ambiguous";
  return "action";
}

function formatEventLine(e: DbEvent) {
  const st = e.start_time ? e.start_time.slice(0, 5) : "All day";
  const en = e.end_time ? e.end_time.slice(0, 5) : "";
  const time = e.start_time ? `${st}–${en}` : st;
  return `• ${time} — ${e.title}${e.location ? ` (${e.location})` : ""}`;
}

function groupEventsByDate(events: DbEvent[]) {
  const map = new Map<string, DbEvent[]>();
  for (const e of events) {
    const key = e.event_date || "unknown";
    const arr = map.get(key) || [];
    arr.push(e);
    map.set(key, arr);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const requestId = makeRequestId();

  console.log(`[POST /api/chat] Incoming request - ID: ${requestId}`);

  try {
    const body = await req.json();

    const clientRequestId: string = (body?.requestId || "").trim();
    const rid = clientRequestId || requestId;

    const rawMessages = Array.isArray(body?.messages) ? body.messages : [];
    const context = body?.context ?? {};

    // Download image URLs server-side and convert to base64 for Gemini Vision.
    // The widget sends public Supabase Storage URLs instead of base64 payloads to
    // avoid hitting the browser→API request body size limit.
    const imageUrls: string[] = Array.isArray(body?.imageUrls) ? body.imageUrls : [];
    let imageAttachments: Array<{ data: string; mimeType: string }> | undefined;
    if (imageUrls.length > 0) {
      const downloaded = await Promise.all(
        imageUrls.map(async (url: string) => {
          try {
            const res = await fetch(url);
            if (!res.ok) { console.warn(`[/api/chat] Image download failed: ${url}`); return null; }
            const buffer = await res.arrayBuffer();
            const rawType = res.headers.get('content-type')?.split(';')[0].trim() ?? '';
            const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
            type ValidMime = (typeof validTypes)[number];
            const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
            const extMap: Record<string, ValidMime> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
            const mimeType: ValidMime = validTypes.includes(rawType as ValidMime)
              ? rawType as ValidMime
              : (ext && extMap[ext]) ? extMap[ext] : 'image/jpeg';
            return { data: Buffer.from(buffer).toString('base64'), mimeType };
          } catch (err) {
            console.error(`[/api/chat] Failed to download image ${url}:`, err);
            return null;
          }
        })
      );
      const valid = downloaded.filter(Boolean) as Array<{ data: string; mimeType: string }>;
      if (valid.length > 0) imageAttachments = valid;
    }
    const tzFromContext = sanitizeTimeZone(context?.timezone);
    const tzFromBody = sanitizeTimeZone(body?.timezone);
    const tzFromHeader = sanitizeTimeZone(req.headers.get("x-timezone") || req.headers.get("timezone"));
    const tz: string = tzFromContext || tzFromBody || tzFromHeader || "Asia/Kolkata";
    const pendingEventDraft: PendingEventDraft | null =
      context?.pendingEventDraft && typeof context.pendingEventDraft === "object"
        ? (context.pendingEventDraft as PendingEventDraft)
        : null;

    const recentEntities: RecentEntities =
      context?.recentEntities && typeof context.recentEntities === "object" ? context.recentEntities : {};

    const userIdFromBody: string = (body?.userId || body?.user_id || body?.uid || "").trim();

    console.log("[/api/chat] Received userId:", { 
      fromBody: userIdFromBody, 
      bodyKeys: Object.keys(body || {}),
      bodyUserId: body?.userId 
    });
    console.log("[/api/chat] Timezone resolved:", {
      tz,
      fromContext: context?.timezone || null,
      fromBody: body?.timezone || null,
      fromHeader: req.headers.get("x-timezone") || req.headers.get("timezone") || null,
    });

    if (!rawMessages.length) {
      return NextResponse.json(
        { assistantText: "Send a message to start.", toolCalls: [], requestId: rid } satisfies ChatApiResponse,
        { status: 400 }
      );
    }

    const lastUserMsg = [...rawMessages]
      .reverse()
      .find((m: any) => m?.role === "user" && typeof m?.content === "string");

    const lastUserTextRaw = (lastUserMsg?.content || "").toString();
    const lastUserText = normalizeUserTextForLLM(lastUserTextRaw);

    // Fast-path: resolve a previously suggested conflict slot from follow-up user reply.
    if (pendingEventDraft?.kind === "event_conflict_resolution") {
      const selection = resolveSlotSelectionFromReply(lastUserText, pendingEventDraft);
      if (selection.cancel) {
        return NextResponse.json({
          assistantText: "Okay, I won't schedule that meeting for now.",
          toolCalls: [{ id: `${rid}:view`, name: "set_active_view", arguments: { view: "calendar" } }],
          requestId: rid,
          pendingEventDraft: null,
        } satisfies ChatApiResponse);
      }

      if (selection.slot) {
        const baseArgs: Record<string, any> = {
          ...pendingEventDraft.pendingTool.arguments,
          date: pendingEventDraft.date,
          time: selection.slot.start_time,
          endTime: selection.slot.end_time,
        };
        const patchedTool: ToolCall =
          pendingEventDraft.pendingTool.name === "create_event"
            ? {
                id: pendingEventDraft.pendingTool.id,
                name: "create_event",
                arguments: {
                  title: String(baseArgs.title || "New event"),
                  description: baseArgs.description,
                  date: String(baseArgs.date),
                  time: baseArgs.time,
                  endTime: baseArgs.endTime,
                  location: baseArgs.location,
                  category: baseArgs.category,
                  priority: baseArgs.priority,
                },
              }
            : {
                id: pendingEventDraft.pendingTool.id,
                name: "update_event_by_title",
                arguments: {
                  titleQuery: String(baseArgs.titleQuery || baseArgs.title || "event"),
                  title: baseArgs.title,
                  description: baseArgs.description,
                  date: String(baseArgs.date),
                  time: baseArgs.time,
                  endTime: baseArgs.endTime,
                  location: baseArgs.location,
                  category: baseArgs.category,
                  priority: baseArgs.priority,
                  isCompleted: baseArgs.isCompleted,
                },
              };

        return NextResponse.json({
          assistantText: `Perfect — scheduling it at ${selection.slot.start_time} on ${pendingEventDraft.date}.`,
          toolCalls: [
            { id: `${rid}:view`, name: "set_active_view", arguments: { view: "calendar" } },
            { ...patchedTool, id: `${rid}:slot_apply` },
          ],
          requestId: rid,
          pendingEventDraft: null,
        } satisfies ChatApiResponse);
      }
    }

    if (!lastUserText.trim()) {
      return NextResponse.json(
        { assistantText: "Send a message to start.", toolCalls: [], requestId: rid } satisfies ChatApiResponse,
        { status: 400 }
      );
    }

    const reminderInstruction = extractReminderPreferenceInstruction(lastUserTextRaw);
    if (userIdFromBody && reminderInstruction) {
      appendReminderPreference({
        userId: userIdFromBody,
        instruction: reminderInstruction,
      }).catch((error) => {
        console.error("Failed to update reminder preferences:", error);
      });
    }

    // Get Gemini API key from environment (Supabase table may not exist yet)
    let geminiApiKey = process.env.GEMINI_API_KEY;
    
    // Try to get from api_keys table if available
    if (!geminiApiKey) {
      try {
        const { data: apiKeyData } = await supabase
          .from("api_keys")
          .select("api_key")
          .eq("service_name", "gemini")
          .maybeSingle();
        
        if (apiKeyData?.api_key) {
          geminiApiKey = apiKeyData.api_key;
        }
      } catch (e) {
        // api_keys table may not exist yet, continue with env var
        console.debug('api_keys table not yet available:', e instanceof Error ? e.message : 'unknown error');
      }
    }
    
    if (!geminiApiKey) {
      return NextResponse.json(
        {
          assistantText: "Gemini API key is not configured. Add it to env or api_keys table.",
          toolCalls: [],
          requestId: rid,
        } satisfies ChatApiResponse,
        { status: 500 }
      );
    }

    // --- DETERMINISTIC PRE-FILTER: short-circuit obvious greetings/pleasantries ---
    if (isObviouslyNonActionable(lastUserText)) {
      console.log("[/api/chat] Pre-filter: obvious non-actionable message, skipping planner");
      const greetResp = await callGemini(geminiApiKey, [
        { role: "system", content: "You are a friendly assistant. Reply naturally and briefly to the user's message. 1-2 sentences max." },
        { role: "user", content: lastUserText },
      ], imageAttachments);
      const greetText = greetResp.data?.choices?.[0]?.message?.content || "Hey! How can I help?";
      return NextResponse.json({
        assistantText: greetText,
        toolCalls: [],
        requestId: rid,
      } satisfies ChatApiResponse);
    }
    // --- END PRE-FILTER ---

    // Parse early so the pre-flight gate can use it before the Planner runs
    const executeServerIntents = Boolean(body?.executeServerIntents);

    // Pre-flight intent gate for non-interactive clients (voice shortcut, iMessage)
    // This is a hard code-level guard — the Planner never runs for non-actionable messages.
    if (executeServerIntents) {
      const intentClass = await classifyVoiceIntent(geminiApiKey, lastUserText);

      if (intentClass === "non_actionable") {
        const lower = lastUserText.toLowerCase().trim();
        let reply = "Got it!";
        if (/^(hi|hello|hey|good morning|good evening|good night|howdy)/i.test(lower)) {
          reply = "Hey! Say something like 'Remind me to call the dentist tomorrow' to create a task.";
        } else if (/^(thanks|thank you|thx|ty)/i.test(lower)) {
          reply = "You're welcome!";
        }
        return NextResponse.json({ assistantText: reply, toolCalls: [], requestId: rid } satisfies ChatApiResponse);
      }

      if (intentClass === "ambiguous") {
        return NextResponse.json({
          assistantText: "Did you want me to create a task for this, or were you just letting me know?",
          toolCalls: [],
          requestId: rid,
        } satisfies ChatApiResponse);
      }

      // intentClass === "action" — proceed to Planner
    }

    // Keep the last 6 messages (3 full turns) to provide conversation context without
    // blowing up the Gemini context window. Each message is capped at 1,500 chars as a
    // hard safety valve — real conversations average ~300 chars/turn.
    const HISTORY_TURNS = 6;
    const MSG_CHAR_CAP = 1500;
    const contextMessages = rawMessages.slice(-HISTORY_TURNS).map((m: any) => {
      if (m?.role === "user" && typeof m?.content === "string") {
        const normalized = normalizeUserTextForLLM(m.content);
        return { role: "user", content: normalized.slice(0, MSG_CHAR_CAP) };
      }
      const content = typeof m?.content === "string" ? m.content.slice(0, MSG_CHAR_CAP) : (m?.content ?? "");
      return { role: m?.role, content };
    });

    const durationFromText = parseDurationMinutesFromText(lastUserText);
    const durationHint = (() => {
      const dur = durationFromText;
      const looksLikeFollowup =
        /\b(make it|change it|set it|move it|reschedule it|extend it|shorten it)\b/i.test(lastUserText) ||
        /\b(\bit\b|\bthat\b|\bthis\b)\b/i.test(lastUserText);

      if (!dur || !looksLikeFollowup) return "";
      return `\nFOLLOWUP DURATION HINT: The user likely wants the LAST EVENT duration to be ${dur} minutes.\nIf updating an event time range, set endTime = startTime + ${dur} minutes (same date unless user specifies otherwise).`;
    })();

    const recentEntitiesBlock = `
RecentEntities (from client, most recent user targets):
- lastEventTitle: ${recentEntities?.lastEventTitle ? JSON.stringify(recentEntities.lastEventTitle) : "null"}
- lastTaskTitle: ${recentEntities?.lastTaskTitle ? JSON.stringify(recentEntities.lastTaskTitle) : "null"}
- lastGoalTitle: ${recentEntities?.lastGoalTitle ? JSON.stringify(recentEntities.lastGoalTitle) : "null"}
- lastTaskListName: ${recentEntities?.lastTaskListName ? JSON.stringify(recentEntities.lastTaskListName) : "null"}
- lastActiveView: ${recentEntities?.lastActiveView ? JSON.stringify(recentEntities.lastActiveView) : "null"}

If the user says "it/that/this" and does NOT provide a clear title:
- For event updates/deletes: use lastEventTitle as titleQuery.
- For task updates/completes/deletes: use lastTaskTitle as titleQuery.
- For goal updates/deletes: use lastGoalTitle as titleQuery.
`.trim();

    const plannerSystem = `
You are the "Planner" for a personal assistant.

CRITICAL: Return ONLY a valid JSON object:
{
  "assistantText": string (optional, for clarifications/questions),
  "isConversationOnly": boolean (if true: user is chatting/asking, NOT requesting creation),
  "items": [ ...PlannerItem ]
}

=== INTENT CLASSIFICATION (MANDATORY FIRST STEP) ===
Before emitting any items, you MUST classify the user's message.

EXCEPTION — these are NEVER isConversationOnly=true, always set isConversationOnly=false and emit the appropriate item:
- Any message asking about the user's calendar, agenda, schedule, or free time: "What's on my calendar today/tomorrow/this week?", "What do I have scheduled?", "Am I free on Friday?", "Show me my agenda", "When am I free?", "What's on my schedule this week?"
- These MUST emit kind="query_agenda_v2" with the correct range field (see Rules for items below).
- Example: "What's on my calendar this week?" => { kind: "query_agenda_v2", range: "this_week" }
- Example: "What do I have today?" => { kind: "query_agenda_v2", range: "today" }
- Example: "Show me tomorrow's schedule" => { kind: "query_agenda_v2", range: "tomorrow" }

SET isConversationOnly=true AND items=[] for ALL of the following:
- Greetings: "Hi", "Hello", "Hey", "Good morning", "Yo", "Howdy"
- Pleasantries / acknowledgments: "Thanks", "Thank you", "OK", "Okay", "Sure", "Got it", "Sounds good", "Yep", "Yup", "Cool", "Great", "Awesome", "Perfect", "Nice"
- Pure factual questions (no data retrieval needed): "What is X?", "Did you add that?", "How are you?"
- Filler / vague / unclear: "Hmm", "Interesting", "Ok then", any message ≤ 3 words that contains NO clear action verb or subject to create
- Statements of fact with no request: "I had a dentist visit", "It's raining today"

SET isConversationOnly=false ONLY when the message CLEARLY implies something to create, retrieve, or track:
- Explicit creation: "Add a task for...", "Create an event...", "Schedule a meeting..."
- Clear intent to track: "Remind me to...", "I need to...", "Don't forget to..."
- Deliverable with deadline: "Submit the report by Friday", "Pay rent on the 1st"
- Appointment being booked: "Meeting with John at 3pm tomorrow"
- Calendar/agenda lookup: "What's on my calendar?", "Show my schedule", "Am I free tomorrow?"

=== AMBIGUOUS INTENT ===
If you CANNOT confidently determine whether the user wants something created
(e.g., "dentist appointment", "gym tomorrow", "call mom"):
- Set isConversationOnly=true
- Set assistantText to EXACTLY ONE clarifying question:
  "Did you want me to create a task/event for this, or were you just letting me know?"
- Set items: []

NEVER guess or assume. When in doubt, ask. Do NOT create tasks from ambiguous messages.

=== CRITICAL RULES FOR ITEMS ===
- ONLY emit items if isConversationOnly=false
- If isConversationOnly=true, ALWAYS set items: [] (empty array)
- Create actions ONLY for the LATEST user message
- NEVER re-emit past tasks/events again
- Filter out creation attempts when user is just chatting

=== MESSAGE ANALYSIS ===
LATEST USER MESSAGE:
"""${lastUserText}"""

Before planning, ask yourself:
1. Is this a greeting or casual message? → isConversationOnly=true
2. Is this seeking information (not creating)? → isConversationOnly=true
3. Does this request creation/action? → isConversationOnly=false
4. Is this a follow-up to a past topic? → Check context, may be conversation-only

ABSOLUTE DATE RULE:
- For ANY event/task due date, output a real date string in YYYY-MM-DD
- Convert words like "today", "tomorrow", and weekdays (e.g., "Thursday", "next Friday") into YYYY-MM-DD
- Use the nearest upcoming occurrence in the user's timezone for weekday references

TIME EXTRACTION FOR EVENTS:
- ALWAYS look for time mentions in user message (e.g., "2pm", "14:00", "2:30 pm", "at 3")
- Convert times to HH:MM format (24-hour): "2pm" → "14:00", "2:30am" → "02:30"
- If time is mentioned, ALWAYS include "time" field in event (never omit)
- If NO time mentioned, OMIT the "time" field (creates all-day event)

PRIORITY EXTRACTION:
- Look for urgency/priority words in user message
- "critical", "urgent", "asap" => priority: "critical"
- "high priority", "important" => priority: "high"
- "medium", "normal" => priority: "medium"
- "low", "whenever" => priority: "low"
- If no priority word mentioned, default to "medium"

INTENT GATE — final check before emitting any task/event/goal:

NEVER emit a task/event/goal if the message is any of:
- A greeting or pleasantry: "Hi", "Hello", "Hey", "Good morning", "Thanks", "Thank you", "OK", "Okay", "Sure", "Yep", "Got it", "Sounds good", "No problem", "You're welcome"
- A vague acknowledgment with no clear action: "Noted", "I see", "Interesting", "Makes sense"
- A question asking for information (not requesting something to be tracked): "How many tasks do I have?", "What time is it?" — NOTE: calendar/agenda queries ("What's on my calendar?", "What do I have today?") are EXCEPTIONS and MUST emit query_agenda_v2
- A short filler message: one or two words with no actionable content
- Unclear or ambiguous messages where you cannot confidently identify WHAT needs to be done

ONLY emit a task/event/goal when the message clearly implies:
- Something needs to be done: "Remind me to...", "I need to...", "Don't forget to...", "Make sure to..."
- A deliverable or deadline: "Submit the report by Friday", "Pay rent on the 1st"
- An explicit instruction to track/create: "Add a task for...", "Create an event for...", "Schedule a meeting..."
- A clear appointment or scheduled event with a specific date/time

WHEN INTENT IS AMBIGUOUS (a possible action is visible but the user may just be sharing, not requesting tracking):
- Respond ONLY with assistantText asking ONE clarifying question. Set items: [].
- Use: "Did you want me to create a task for this, or were you just letting me know?"

=== EXAMPLES ===
- "Hi" → assistantText: "Hey! How can I help?", isConversationOnly: true, items: []
- "Thanks" → assistantText: "You're welcome!", isConversationOnly: true, items: []
- "OK" → assistantText: "Got it!", isConversationOnly: true, items: []
- "I had a meeting today" → assistantText: "Did you want me to log something from that meeting, or were you just letting me know?", isConversationOnly: true, items: []
- "I should probably call the dentist" → assistantText: "Did you want me to create a task to call the dentist?", isConversationOnly: true, items: []
- "Remind me to call the dentist tomorrow" → isConversationOnly: false, items: [{ kind: "task", title: "Call the dentist", dueDate: "YYYY-MM-DD" }]
- "Add a task: finish the report by Friday" → isConversationOnly: false, items: [{ kind: "task", title: "Finish the report", dueDate: "YYYY-MM-DD" }]

Rules for items:
- If user asks about their calendar/agenda/schedule/events => kind="query_agenda_v2"
  - "today" / "today's agenda" / "what's on today" => range="today"
  - "tomorrow" / "tomorrow's schedule" => range="tomorrow"
  - "this week" / "next 7 days" / "week" / "weekly" => range="this_week"
  - specific date (e.g. "on Friday", "April 10") => range="date", date="YYYY-MM-DD"
  - IMPORTANT: range MUST be one of exactly: "today", "tomorrow", "this_week", "date" — no other values
- If user asks "when am I free / available / free slots" => query_agenda_v2 with includeFreeSlots=true, range="today" or "date"
- If message contains multiple intents, emit multiple items
- Goal/objective/target => kind="goal"
- Meeting/appointment/event with date/time => kind="event"
- Update/reschedule/move an existing event => kind="update_event"
- Delete/remove/cancel an existing event => kind="delete_event"
- Task/to-do/action items => kind="task"
- Update an existing task => kind="update_task"
- Complete/done/finish an existing task => kind="complete_task"
- Delete/remove an existing task => kind="delete_task"
- Delete/remove an existing goal => kind="delete_goal"
- Create task list => kind="create_task_list"
- For tasks: infer listName from context (Work/Study/Health/Shopping/Personal)
- Keep titles short; put details in notes/description
- Output must be strict JSON (no code fences, no trailing commas)

Delete/cancel intent keywords: "delete", "remove", "cancel", "get rid of", "clear", "erase" → ALWAYS use kind="delete_event" or kind="delete_task", never kind="update_event" or kind="update_task"

Timezone: ${tz}
Today: ${getYmdInTimeZone(tz)} (THIS IS THE CURRENT DATE — use this year when resolving any relative date like "today", "tomorrow", "next week")
Tomorrow: ${addDaysYmd(getYmdInTimeZone(tz), 1)}
Now ISO: ${new Date().toISOString()}

${recentEntitiesBlock}
${durationHint}
${imageAttachments && imageAttachments.length > 0 ? `
=== IMAGE ATTACHED ===
You can see the attached image(s) above. Read every title, date, time, and location visible.

RULES — follow exactly based on what you find:

A) EXACTLY ONE EVENT, date is unambiguous AND in the future (on or after today ${getYmdInTimeZone(tz)}):
   → isConversationOnly=false, emit the event item directly. Do NOT ask.
   Example: "Sarah's Birthday Bash, April 12 2026, 7 PM–11 PM, 42 Maple St"
   → kind="event", title="Sarah's Birthday Bash", date="2026-04-12", time="19:00", endTime="23:00", location="42 Maple St"

A2) EXACTLY ONE EVENT, but the date shown in the image is IN THE PAST (before today ${getYmdInTimeZone(tz)}):
   → isConversationOnly=true, items=[]
   → assistantText MUST include all event details AND ask about the year, so details survive in history.
   Format (fill in real values from the image):
   "The image shows:
   📅 [Title] — [date from image], [time], [location]
   That date has already passed. Did you mean [same month/day next year], or a different date?"

B) TWO OR MORE DISTINCT EVENTS found in the image:
   → isConversationOnly=true, items=[]
   → assistantText must list every event, numbered, with date/time/location, then ask which to add.
   Format:
   "I found [N] events in this image:
   1. [Title] — [Date], [Time], [Location]
   2. [Title] — [Date], [Time], [Location]
   ...
   Which would you like to add to your calendar? Reply with numbers (e.g. \"1 and 3\") or \"all\"."

C) DATE IS AMBIGUOUS (day+month only with no year, or format like M/D/YY that could be read two ways):
   → isConversationOnly=true, items=[]
   → assistantText MUST include ALL event details from the image AND ask about the date.
   CRITICAL: Include the title, time, and location so they survive in conversation history and can be used when the user replies.
   Format (fill in real values from the image):
   "I found this event in the image:
   📅 [Title] — [ambiguous date], [time], [location]
   Is the date [interpretation A, e.g. March 4, 2026] or [interpretation B, e.g. April 3, 2026]?"

D) NO EVENTS FOUND:
   → isConversationOnly=true, items=[]
   → Tell user nothing was detected and ask them to describe the event.

Time conversion: "7:00 PM" → "19:00", "6:30 PM" → "18:30", "11:00 PM" → "23:00".
Year inference: if only month+day given (no year), use ${new Date().getFullYear()} unless that date has already passed, then use ${new Date().getFullYear() + 1}.` : ''}
`.trim();

    // Conversation history is now passed as proper multi-turn contents via contextMessages.
    // The historyBlock workaround (400-char truncated text injected into the system prompt)
    // is no longer needed and has been removed.
    const planner = await callGemini(geminiApiKey, [
      { role: "system", content: plannerSystem },
      ...contextMessages
    ], imageAttachments, { jsonMode: true });

    if (!planner.ok) {
      return NextResponse.json(
        { assistantText: `Gemini API error: ${planner.status}`, toolCalls: [], requestId: rid } satisfies ChatApiResponse,
        { status: planner.status }
      );
    }

    const plannerMsg = planner.data?.choices?.[0]?.message?.content || "";
    const extracted = extractFirstJsonObject(plannerMsg);
    const plan = extracted as PlannerOutput | null;

    console.log("[/api/chat] Planner response:", { 
      rid, 
      plannerMsgLength: plannerMsg?.length,
      plannerMsgPreview: plannerMsg?.substring(0, 200),
      extracted: extracted ? JSON.stringify(extracted).substring(0, 300) : null,
      planItems: plan?.items?.length,
      planItemsPreview: plan?.items?.slice(0, 2)
    });

    if (!plan || !Array.isArray((plan as any).items)) {
      console.error("[/api/chat] planner parse failed", { rid, plannerMsg });
      return NextResponse.json({
        assistantText: "I couldn’t parse that cleanly. Try: 'meet tomorrow 2pm with Rahul' or 'agenda tomorrow'.",
        toolCalls: [],
        requestId: rid,
      } satisfies ChatApiResponse);
    }

    // --- CONVERSATION-ONLY MESSAGE HANDLING ---
    if ((plan as any).isConversationOnly === true) {
      const plannerText = (plan as any).assistantText as string | undefined;

      // If the planner already composed a reply (e.g. event list, date clarification),
      // use it directly — no second Gemini call needed.
      if (plannerText && plannerText.trim().length > 0) {
        console.log("[/api/chat] Using planner assistantText directly:", { rid, text: plannerText.substring(0, 100) });
        return NextResponse.json({
          assistantText: plannerText.trim(),
          toolCalls: [],
          requestId: rid,
        } satisfies ChatApiResponse);
      }

      console.log("[/api/chat] Detected conversation-only message, generating natural response");

      // Planner had no specific reply — fall back to a lightweight Gemini call
      // for greetings, casual chat, and open-ended questions.
      const conversationSystem = `You are Bloo, a friendly personal productivity assistant. The user is chatting casually — you do NOT need to create any tasks, events, or goals right now.

Style rules:
- Sound natural and human, like a WhatsApp message from a helpful friend.
- Keep it short: 1-2 sentences, ideally under 25 words.
- Never write long paragraphs, bullet lists, or markdown formatting.
- For greetings/casual chat, reply warm and light.
- For factual questions, answer directly in plain words.
- If the user hints at scheduling or planning, gently suggest: "Want me to add that as a task or event?"
- Do not use emojis unless the user used them first.
- Never say "As an AI" or refer to yourself as a language model.

CRITICAL: You have NO access to the user's calendar, tasks, events, or any personal data.
- NEVER say "Here's what I found on your calendar", "You have X events", or anything that implies you retrieved real data.
- If the user asks about their calendar or schedule, say only: "I'll pull that up for you!" — the system will fetch the real data separately.
`;

      const conversationResp = await callGemini(geminiApiKey, [
        { role: "system", content: conversationSystem },
        ...contextMessages
      ], imageAttachments);

      if (!conversationResp.ok) {
        return NextResponse.json({
          assistantText: "I'm having trouble responding right now. Please try again.",
          toolCalls: [],
          requestId: rid,
        } satisfies ChatApiResponse);
      }

      const conversationalText = conversationResp.data?.choices?.[0]?.message?.content || "Got it!";

      console.log("[/api/chat] Conversational response sent:", { rid, responseLength: conversationalText?.length });

      return NextResponse.json({
        assistantText: conversationalText,
        toolCalls: [],
        requestId: rid,
      } satisfies ChatApiResponse);
    }
    // --- END CONVERSATION-ONLY HANDLING ---

    // Fix up ambiguous titleQuery using RecentEntities
    const fixedItems: PlannerItem[] = (plan.items || []).map((it: any) => {
      if (!it || typeof it !== "object") return it;

      if (it.kind === "update_event" || it.kind === "delete_event") {
        const tq = String(it.titleQuery || "").trim();
        if (isAmbiguousTitleQuery(tq) && recentEntities?.lastEventTitle) {
          return { ...it, titleQuery: recentEntities.lastEventTitle };
        }
      }

      if (it.kind === "update_task" || it.kind === "complete_task" || it.kind === "delete_task") {
        const tq = String(it.titleQuery || "").trim();
        if (isAmbiguousTitleQuery(tq) && recentEntities?.lastTaskTitle) {
          return { ...it, titleQuery: recentEntities.lastTaskTitle };
        }
      }

      return it;
    });

    plan.items = fixedItems;

    // Normalize title for deduplication (remove punctuation, extra spaces, etc)
    const normalizeTitle = (title: string): string => {
      return title
        .toLowerCase()
        .trim()
        .replace(/[^\w\s]/g, '') // Remove special characters
        .replace(/\s+/g, ' ') // Normalize spaces
        .trim();
    };

    const normalizeDateForKey = (value?: string | null): string => {
      const raw = String(value || "").trim().toLowerCase();
      if (!raw) return "";
      if (raw === "today") return getYmdInTimeZone(tz);
      if (raw === "tomorrow") return addDaysYmd(getYmdInTimeZone(tz), 1);
      const match = raw.match(/\d{4}-\d{2}-\d{2}/);
      return match?.[0] || raw;
    };

    const normalizeTimeForKey = (value?: string | null): string => {
      if (!value) return "";
      return parseTimeToHHMM(value) || String(value).trim().toLowerCase();
    };

    const makeTaskSignature = (title: string, dueDate?: string | null, dueTime?: string | null): string =>
      `${normalizeTitle(title)}|${normalizeDateForKey(dueDate)}|${normalizeTimeForKey(dueTime)}`;

    const makeEventSignature = (title: string, date?: string | null, time?: string | null): string =>
      `${normalizeTitle(title)}|${normalizeDateForKey(date)}|${normalizeTimeForKey(time)}`;

    // Aggressive deduplication: filter by normalized title + kind + dueDate + dueTime
    const seenItems = new Set<string>();
    const originalItemCount = plan.items.length;
    
    plan.items = plan.items.filter((item: any) => {
      if (!item || !item.title || !item.kind) return true; // Keep items without required fields
      
      const itemKind = item.kind;
      const dueDate = item.dueDate || item.date || "";
      const dueTime = item.dueTime || item.time || "";
      const itemSignature =
        itemKind === "task"
          ? makeTaskSignature(item.title, dueDate, dueTime)
          : itemKind === "event"
          ? makeEventSignature(item.title, dueDate, dueTime)
          : normalizeTitle(item.title);
      const itemKey = `${itemKind}:${itemSignature}`;
      
      if (seenItems.has(itemKey)) {
        console.log("[/api/chat] FILTERED DUPLICATE:", { 
          kind: itemKind, 
          title: item.title,
          signature: itemSignature,
          dueDate,
          dueTime,
          itemKey 
        });
        return false;
      }
      seenItems.add(itemKey);
      return true;
    });

    console.log("[/api/chat] Aggressive deduplication:", { 
      originalCount: originalItemCount,
      afterDedup: plan.items.length,
      filtered: originalItemCount - plan.items.length,
      items: plan.items.map((i: any) => ({ kind: i.kind, title: i.title }))
    });

    // Extract all previously created items from database (not messages)
    const extractPreviouslyCreatedItems = async (userId: string): Promise<{ taskSignatures: Set<string>; goalTitles: Set<string>; eventSignatures: Set<string> }> => {
      const taskSignatures = new Set<string>();
      const goalTitles = new Set<string>();
      const eventSignatures = new Set<string>();

      try {
        const admin = getSupabaseAdminClient();
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

        // Query recently created tasks (last hour)
        const { data: tasks, error: tasksError } = await admin
          .from('tasks')
          .select('title,due_date,due_time')
          .eq('user_id', userId)
          .gt('created_at', oneHourAgo);

        if (!tasksError && tasks) {
          tasks.forEach((task: any) => {
            if (task.title) {
              taskSignatures.add(makeTaskSignature(task.title, task.due_date, task.due_time));
            }
          });
        }

        // Query recently created goals (last hour)
        const { data: goals, error: goalsError } = await admin
          .from('goals')
          .select('title')
          .eq('user_id', userId)
          .gt('created_at', oneHourAgo);

        if (!goalsError && goals) {
          goals.forEach((goal: any) => {
            if (goal.title) goalTitles.add(normalizeTitle(goal.title));
          });
        }

        // Query recently created events (last hour)
        const { data: events, error: eventsError } = await admin
          .from('calendar_events')
          .select('title,event_date,start_time')
          .eq('user_id', userId)
          .gt('created_at', oneHourAgo);

        if (!eventsError && events) {
          events.forEach((event: any) => {
            if (event.title) {
              eventSignatures.add(makeEventSignature(event.title, event.event_date, event.start_time));
            }
          });
        }

        console.log("[/api/chat] Previously created items from database:", {
          taskCount: taskSignatures.size,
          goalCount: goalTitles.size,
          eventCount: eventSignatures.size,
          tasks: Array.from(taskSignatures),
          goals: Array.from(goalTitles),
          events: Array.from(eventSignatures)
        });
      } catch (err) {
        console.error("[/api/chat] Error extracting previously created items:", err);
      }

      return { taskSignatures, goalTitles, eventSignatures };
    };

    const { taskSignatures: prevTaskSignatures, goalTitles: prevGoalTitles, eventSignatures: prevEventSignatures } = await extractPreviouslyCreatedItems(userIdFromBody);

    const clientToolCalls: ToolCall[] = [];
    const serverToolCalls: Array<{ name: ToolCall["name"]; arguments: any }> = [];
    const processedTaskSignatures = new Set<string>([...prevTaskSignatures]); // Track created tasks + previously created
    const processedGoalTitles = new Set<string>([...prevGoalTitles]); // Track created goals + previously created
    const processedEventSignatures = new Set<string>([...prevEventSignatures]); // Track created events + previously created

    function pushClient(tc: ToolCall) {
      clientToolCalls.push(tc);
    }
    function pushServer(name: ToolCall["name"], args: any) {
      serverToolCalls.push({ name, arguments: args });
    }

    const pendingFollowups: string[] = [];

    // Precompute carry-forward time for date-only followups
    const carry = isDateOnlyReply(lastUserText) ? extractTimeFromHistory(rawMessages) : {};

    for (const item of plan.items) {
      if (!item || typeof item !== "object") continue;

      if (item.kind === "query_agenda") {
        pushServer("get_agenda", { range: item.range, date: item.date });
        continue;
      }

      if (item.kind === "query_agenda_v2") {
        pushServer("get_agenda_v2", {
          range: item.range,
          date: item.date,
          includeFreeSlots: item.includeFreeSlots ?? looksLikeFreeTimeQuery(lastUserText),
          durationMinutes: item.durationMinutes ?? durationFromText ?? 60,
        });
        continue;
      }

      if (item.kind === "create_task_list") {
        const listName = (item as any).name || (item as any).listName || "New List";
        pushClient({ name: "create_task_list", arguments: { name: listName, color: (item as any).color } });
        continue;
      }

      if (item.kind === "task") {
        const dateFromLatestUserText = extractDateFromUserText(lastUserText, tz);
        const resolvedDueDate =
          dateFromLatestUserText ||
          resolveDateToken((item as any).dueDate, tz) ||
          undefined;
        const resolvedDueTime =
          normalizeHHMM((item as any).dueTime || (item as any).time) ||
          extractTimeFromUserText(lastUserText) ||
          undefined;
        const taskSignature = makeTaskSignature(item.title || "", resolvedDueDate, resolvedDueTime);

        if (processedTaskSignatures.has(taskSignature)) {
          console.log("[/api/chat] SKIPPING PROCESSED TASK:", { 
            title: item.title, 
            taskSignature,
            dueDate: resolvedDueDate,
            dueTime: resolvedDueTime,
          });
          continue;
        }
        processedTaskSignatures.add(taskSignature);

        const listName = (item.listName && item.listName.trim()) || inferListNameHeuristic(item.title, item.notes);

        console.log("[/api/chat] Creating task:", { title: item.title, taskSignature });

        pushClient({
          name: "create_task",
          arguments: {
            title: item.title,
            notes: item.notes,
            dueDate: resolvedDueDate,
            dueTime: resolvedDueTime,
            priority: item.priority,
            estimatedHours: item.estimatedHours,
            location: item.location,
            syncToCalendar: false, // Let task creation API handle calendar sync
            listName,
          },
        });
        continue;
      }

      if (item.kind === "event") {
        // --- Date resolution ---
        const dateFromLatestUserText = extractDateFromUserText(lastUserText, tz);
        const resolvedDate =
          dateFromLatestUserText ||
          resolveDateToken((item as any).date, tz) ||
          (/^\d{4}-\d{2}-\d{2}$/.test(String((item as any).date || "")) ? String((item as any).date) : undefined);

        if (!resolvedDate) {
          pendingFollowups.push("What date is the meeting on? (Example: 2026-01-10)");
          continue;
        }

        // --- Time resolution ---
        // Prefer planner output; then parse explicit range/time from latest user text;
        // finally use carry-forward time for date-only follow-ups.
        const parsedRange = extractTimeRangeFromUserText(lastUserText);
        const rawStart =
          (item as any).time ||
          parsedRange.time ||
          (isDateOnlyReply(lastUserText) ? carry.time : undefined);
        const rawEnd =
          (item as any).endTime ||
          parsedRange.endTime ||
          (isDateOnlyReply(lastUserText) ? carry.endTime : undefined);

        const start = normalizeHHMM(rawStart);
        const end = normalizeHHMM(rawEnd);

        (item as any).date = resolvedDate;
        (item as any).time = start;
        (item as any).endTime = end;

        // Deduplicate: use normalized title + date + time for comparison
        const eventSignature = makeEventSignature(item.title || "", resolvedDate, start);
        if (processedEventSignatures.has(eventSignature)) {
          console.log("[/api/chat] SKIPPING PROCESSED EVENT:", { 
            title: item.title, 
            eventSignature,
            date: resolvedDate,
            time: start
          });
          continue;
        }
        processedEventSignatures.add(eventSignature);

        if (resolvedDate && start) {
          pushServer("detect_event_conflicts", {
            proposed: { date: resolvedDate, startTime: start, endTime: end || undefined },
          });
        }

        console.log("[/api/chat] Creating event:", { title: item.title, eventSignature, date: resolvedDate, time: start });
        pushClient({
          name: "create_event",
          arguments: {
            title: item.title,
            description: item.description,
            date: resolvedDate as any,
            time: start,
            endTime: end,
            location: item.location,
            category: item.category,
            priority: item.priority,
          },
        });
        continue;
      }

      if (item.kind === "goal") {
        // Deduplicate: use normalized title for comparison
        const normalizedTitle = normalizeTitle(item.title || "");
        if (processedGoalTitles.has(normalizedTitle)) {
          console.log("[/api/chat] SKIPPING PROCESSED GOAL:", { 
            title: item.title, 
            normalized: normalizedTitle 
          });
          continue;
        }
        processedGoalTitles.add(normalizedTitle);

        console.log("[/api/chat] Creating goal:", { title: item.title, normalized: normalizedTitle });
        pushClient({
          name: "create_goal",
          arguments: {
            title: item.title,
            description: item.description,
            targetDate: item.targetDate,
            metric: item.metric,
          },
        });
        continue;
      }

      if (item.kind === "update_event") {
        const dateFromLatestUserText = extractDateFromUserText(lastUserText, tz);
        const resolvedDate =
          dateFromLatestUserText ||
          resolveDateToken((item as any).date, tz) ||
          (/^\d{4}-\d{2}-\d{2}$/.test(String((item as any).date || "")) ? String((item as any).date) : undefined);

        const parsedRange = extractTimeRangeFromUserText(lastUserText);
        const start = normalizeHHMM(item.time || parsedRange.time);
        const end = normalizeHHMM(item.endTime || parsedRange.endTime);

        (item as any).date = resolvedDate;

        if ((resolvedDate || undefined) && (start || end)) {
          pushServer("detect_event_conflicts", {
            proposed: {
              date: resolvedDate || getYmdInTimeZone(tz),
              startTime: start,
              endTime: end,
            },
          });
        }

        pushClient({
          name: "update_event_by_title",
          arguments: {
            titleQuery: item.titleQuery,
            title: item.title,
            description: item.description,
            date: resolvedDate,
            time: start,
            endTime: end,
            location: item.location,
            category: item.category,
            priority: item.priority,
            isCompleted: item.isCompleted,
          },
        });
        continue;
      }

      if (item.kind === "update_task") {
        const resolvedDueDate =
          extractDateFromUserText(lastUserText, tz) ||
          resolveDateToken((item as any).dueDate, tz) ||
          (/^\d{4}-\d{2}-\d{2}$/.test(String((item as any).dueDate || "")) ? String((item as any).dueDate) : undefined);
        const resolvedDueTime =
          normalizeHHMM((item as any).dueTime || (item as any).time) ||
          extractTimeFromUserText(lastUserText) ||
          undefined;

        pushClient({
          name: "update_task_by_title",
          arguments: {
            titleQuery: item.titleQuery,
            title: item.title,
            notes: item.notes,
            dueDate: resolvedDueDate,
            dueTime: resolvedDueTime,
            priority: item.priority,
            estimatedHours: item.estimatedHours,
            location: item.location,
            progress: item.progress,
          },
        });
        continue;
      }

      if (item.kind === "complete_task") {
        pushClient({ name: "complete_task_by_title", arguments: { titleQuery: item.titleQuery, completed: item.completed } });
        continue;
      }

      if (item.kind === "delete_task") {
        const tq = String(item.titleQuery || "").trim();
        if (isAmbiguousTitleQuery(tq) && !recentEntities?.lastTaskTitle) {
          pendingFollowups.push("Which task did you want to delete? I don't have a recent one on record — could you tell me the name?");
          continue;
        }
        pushClient({ name: "delete_task_by_title", arguments: { titleQuery: item.titleQuery } });
        continue;
      }

      if (item.kind === "delete_event") {
        const tq = String(item.titleQuery || "").trim();
        if (isAmbiguousTitleQuery(tq) && !recentEntities?.lastEventTitle) {
          pendingFollowups.push("Which event did you want to delete? I don't have a recent one on record — could you tell me the name?");
          continue;
        }
        pushClient({ name: "delete_event_by_title", arguments: { titleQuery: item.titleQuery } });
        continue;
      }
    }

    if (pendingFollowups.length > 0 && clientToolCalls.length === 0 && serverToolCalls.length === 0) {
      return NextResponse.json({
        assistantText: pendingFollowups[0],
        toolCalls: [{ id: `${rid}:view`, name: "set_active_view", arguments: { view: "calendar" } }],
        requestId: rid,
      } satisfies ChatApiResponse);
    }

    const uid = userIdFromBody;
    const serverResults: Record<string, any> = {};

    if (!uid && serverToolCalls.length > 0) {
      return NextResponse.json(
        {
          assistantText: "Please sign in again — I need your session to read your calendar for agenda/conflicts.",
          toolCalls: [],
          requestId: rid,
        } satisfies ChatApiResponse
      );
    }

    // server-side disambiguation for event update/delete
    {
      const firstEventAction = clientToolCalls.find(
        (tc) => tc.name === "update_event_by_title" || tc.name === "delete_event_by_title"
      ) as ToolCall | undefined;

      if (uid && firstEventAction) {
        const titleQuery = String((firstEventAction as any).arguments?.titleQuery || "").trim();
        if (titleQuery && !isAmbiguousTitleQuery(titleQuery)) {
          const today = getYmdInTimeZone(tz);
          const start = addDaysYmd(today, -30);
          const end = addDaysYmd(today, 90);

          const rawMatches = await fetchEventsByTitleAdmin({
            userId: uid,
            titleQuery,
            startDate: start,
            endDate: end,
            limit: 25,
          });

          const scored = rawMatches
            .map((e) => ({ e, s: scoreMatch(e.title, titleQuery) }))
            .filter((x) => x.s > 0)
            .sort((a, b) => b.s - a.s);

          const bestScore = scored[0]?.s ?? 0;
          const best = scored.filter((x) => x.s === bestScore).map((x) => x.e);

          if (best.length > 1) {
            const choices = best.slice(0, 8).map((ev) => {
              const st = ev.start_time ? ev.start_time.slice(0, 5) : "All day";
              const en = ev.end_time ? ev.end_time.slice(0, 5) : "";
              const time = ev.start_time ? `${st}–${en}` : st;
              return {
                key: ev.id,
                title: ev.title,
                subtitle: `${ev.event_date} • ${time}`,
              };
            });

            const filteredClient = clientToolCalls.filter((x) => x !== firstEventAction);

            return NextResponse.json({
              assistantText: "",
              toolCalls: [
                { id: `${rid}:view`, name: "set_active_view", arguments: { view: "calendar" } },
                ...filteredClient.map((tc, idx) => ({ ...tc, id: tc.id || `${rid}:c_${idx}` })),
                {
                  id: `${rid}:disambig_evt`,
                  name: "request_disambiguation",
                  arguments: {
                    prompt: `I found multiple events matching "${titleQuery}". Which one do you mean?`,
                    kind: "event",
                    choices,
                    pendingTool: firstEventAction,
                  },
                },
              ],
              requestId: rid,
            } satisfies ChatApiResponse);
          }
        }
      }
    }

    for (const st of serverToolCalls) {
      if (st.name === "get_agenda") {
        const range = st.arguments?.range as "today" | "tomorrow" | "this_week" | "date";
        const today = getYmdInTimeZone(tz);
        let start = today;
        let end = today;

        if (range === "tomorrow") {
          start = addDaysYmd(today, 1);
          end = start;
        } else if (range === "this_week") {
          start = today;
          end = addDaysYmd(today, 7);
        } else if (range === "date") {
          const d = (st.arguments?.date || "").trim();
          if (d) {
            start = d;
            end = d;
          }
        }

        const events = await fetchEventsForRangeAdmin({ userId: uid, startDate: start, endDate: end });
        serverResults["agenda"] = { range, startDate: start, endDate: end, events };
        continue;
      }

      if (st.name === "get_agenda_v2") {
        const range = st.arguments?.range as "today" | "tomorrow" | "this_week" | "date";
        const includeFreeSlots = Boolean(st.arguments?.includeFreeSlots);
        const durationMinutes = Number(st.arguments?.durationMinutes || 60);

        const today = getYmdInTimeZone(tz);
        let start = today;
        let end = today;

        if (range === "tomorrow") {
          start = addDaysYmd(today, 1);
          end = start;
        } else if (range === "this_week") {
          start = today;
          end = addDaysYmd(today, 7);
        } else if (range === "date") {
          const d = (st.arguments?.date || "").trim();
          if (d) {
            start = d;
            end = d;
          }
        }

        console.log("[/api/chat] get_agenda_v2 query:", { uid, range, start, end, tz });
        const events = await fetchEventsForRangeAdmin({ userId: uid, startDate: start, endDate: end });
        console.log("[/api/chat] get_agenda_v2 result:", { eventCount: events.length, firstEvent: events[0] || null });

        let slots: Array<{ start_time: string; end_time: string; reason: string }> = [];
        if (includeFreeSlots) {
          const day = start;
          const dayEvents = events.filter((e) => e.event_date === day);
          slots = suggestSlots({
            events: dayEvents,
            preferredStartTime: undefined,
            durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : 60,
            windowStart: "09:00",
            windowEnd: "21:00",
            limit: 6,
          }).map((s) => ({ start_time: s.start_time, end_time: s.end_time, reason: s.reason }));
        }

        serverResults["agenda_v2"] = {
          range,
          startDate: start,
          endDate: end,
          events,
          includeFreeSlots,
          durationMinutes,
          slots,
        };
        continue;
      }

      if (st.name === "detect_event_conflicts") {
        const proposed = st.arguments?.proposed || {};
        const date = resolveDateToken(proposed?.date, tz) || String(proposed?.date || "").trim();
        const startTime = normalizeHHMM(proposed?.startTime);
        const endTime = normalizeHHMM(proposed?.endTime);

        // Never check conflicts for past dates — old deleted events would cause false positives
        const today = getYmdInTimeZone(tz);
        if (date < today) {
          serverResults["conflicts"] = { ok: true, hasTime: false, conflicts: [], note: "Past date — no conflict check." };
          continue;
        }

        const events = await fetchEventsForRangeAdmin({ userId: uid, startDate: date, endDate: date });

        if (!startTime) {
          serverResults["conflicts"] = { ok: true, hasTime: false, conflicts: [], note: "No start time." };
          continue;
        }

        const dur = durationFromText ?? 60;
        const pStart = toMinutes(startTime);
        const pEnd = toMinutes(endTime || minutesToHHMM((pStart ?? 0) + dur));
        const conflicts: any[] = [];

        if (pStart !== null && pEnd !== null) {
          for (const e of events) {
            // Only check timed events — all-day/untimed events do not block specific time slots
            if (!e.start_time || !e.end_time) continue;
            const es = toMinutes(e.start_time.slice(0, 5));
            const ee = toMinutes(e.end_time.slice(0, 5));
            if (es === null || ee === null) continue;
            if (overlap(pStart, pEnd, es, ee)) {
              conflicts.push({
                id: e.id,
                title: e.title,
                start_time: e.start_time,
                end_time: e.end_time,
                location: e.location,
              });
            }
          }
        }

        serverResults["conflicts"] = {
          ok: true,
          date,
          startTime,
          endTime: endTime || minutesToHHMM((pStart ?? 0) + dur),
          conflicts,
          durationMinutes: dur,
        };
        continue;
      }
    }

    const conflicts = serverResults?.conflicts?.conflicts || [];
    const hasConflict = Array.isArray(conflicts) && conflicts.length > 0;

    if (hasConflict) {
      const date = serverResults?.conflicts?.date as string;
      const startTime = serverResults?.conflicts?.startTime as string;
      const endTime = (serverResults?.conflicts?.endTime as string) || undefined;
      const dur = Number(serverResults?.conflicts?.durationMinutes || 60);

      const events = await fetchEventsForRangeAdmin({ userId: uid, startDate: date, endDate: date });
      const slots = suggestSlots({
        events,
        preferredStartTime: startTime,
        durationMinutes: dur,
        windowStart: "09:00",
        windowEnd: "21:00",
        limit: 5,
      });

      const eventActionTool = clientToolCalls.find(
        (tc) => tc.name === "create_event" || tc.name === "update_event_by_title"
      ) as
        | {
            id?: string;
            name: "create_event" | "update_event_by_title";
            arguments: Record<string, any>;
          }
        | undefined;

      const filteredClient = clientToolCalls.filter(
        (tc) => tc.name !== "create_event" && tc.name !== "update_event_by_title"
      );

      const conflictLines = conflicts
        .slice(0, 5)
        .map((c: any) => `• ${c.title} (${(c.start_time || "").slice(0, 5)}–${(c.end_time || "").slice(0, 5)})`)
        .join("\n");

      const slotLines = slots.map((s) => `• ${s.start_time}–${s.end_time} (${s.reason})`).join("\n");

      const slotChoices = slots.map((s, idx) => ({
        key: `slot_${idx + 1}`,
        title: `${s.start_time}–${s.end_time}`,
        subtitle: s.reason,
        payload: { date, time: s.start_time, endTime: s.end_time, durationMinutes: dur },
      }));

      const toolCallsWithIds: ToolCall[] = [
        { id: `${rid}:view`, name: "set_active_view", arguments: { view: "calendar" } },
        ...filteredClient.map((tc, idx) => ({ ...tc, id: tc.id || `${rid}:c_${idx}` })),
      ];
      if (eventActionTool && slotChoices.length > 0) {
        toolCallsWithIds.push({
          id: `${rid}:slot_pick`,
          name: "request_disambiguation",
          arguments: {
            prompt: `Pick a slot to schedule "${eventActionTool.arguments.title || "this event"}":`,
            kind: "slot",
            choices: slotChoices,
            pendingTool: eventActionTool as unknown as ToolCall,
          },
        });
      }

      const slotExample = slots[0]?.start_time ? `(e.g., "move it to ${slots[0].start_time}")` : "";
      const slotsSection = slotLines
        ? `\n\nSuggested open slots (${dur} min):\n${slotLines}\n\nReply with one of the suggested times ${slotExample}.`
        : `\n\nNo open slots found in the 09:00–21:00 window for that day.`;

      return NextResponse.json({
        assistantText:
          `That time conflicts with your calendar on ${date} (${startTime}${endTime ? `–${endTime}` : ""}).\n\nConflicts:\n${conflictLines}${slotsSection}`,
        toolCalls: toolCallsWithIds,
        requestId: rid,
        pendingEventDraft:
          eventActionTool && slots.length
            ? {
                kind: "event_conflict_resolution",
                date,
                requestedStartTime: startTime,
                requestedEndTime: endTime,
                durationMinutes: dur,
                pendingTool: eventActionTool,
                slots: slots.map((s) => ({
                  start_time: s.start_time,
                  end_time: s.end_time,
                  reason: s.reason,
                })),
                createdAt: new Date().toISOString(),
              }
            : null,
      } satisfies ChatApiResponse);
    }

    if (serverResults?.agenda?.events) {
      const range = serverResults.agenda.range;
      const events: DbEvent[] = serverResults.agenda.events || [];
      if (!events.length) {
        return NextResponse.json({
          assistantText: range === "today" ? "You have nothing scheduled today." : "Nothing scheduled in that range.",
          toolCalls: [{ id: `${rid}:view`, name: "set_active_view", arguments: { view: "calendar" } }],
          requestId: rid,
        } satisfies ChatApiResponse);
      }

      const lines = events.slice(0, 25).map((e) => formatEventLine(e));

      return NextResponse.json({
        assistantText: `Here’s your agenda (${range}):\n\n${lines.join("\n")}`,
        toolCalls: [{ id: `${rid}:view`, name: "set_active_view", arguments: { view: "calendar" } }],
        requestId: rid,
      } satisfies ChatApiResponse);
    }

    if (serverResults?.agenda_v2) {
      const { range, events, includeFreeSlots, durationMinutes, slots, startDate } = serverResults.agenda_v2 as any;

      if (!events?.length) {
        const msg =
          range === "today" ? "You have nothing scheduled today." : "Nothing scheduled in that range.";
        const extra =
          includeFreeSlots && slots?.length
            ? `\n\nFree slots (${durationMinutes} min):\n${slots
                .map((s: any) => `• ${s.start_time}–${s.end_time} (${s.reason})`)
                .join("\n")}`
            : "";
        return NextResponse.json({
          assistantText: msg + extra,
          toolCalls: [{ id: `${rid}:view`, name: "set_active_view", arguments: { view: "calendar" } }],
          requestId: rid,
        } satisfies ChatApiResponse);
      }

      const groups = groupEventsByDate(events as DbEvent[]);
      const chunks: string[] = [];
      for (const [date, list] of groups) {
        chunks.push(`${date}`);
        chunks.push(...list.map((e) => "  " + formatEventLine(e)));
        chunks.push("");
      }

      let slotBlock = "";
      if (includeFreeSlots) {
        const slotLines =
          slots?.length
            ? slots.map((s: any) => `• ${s.start_time}–${s.end_time} (${s.reason})`).join("\n")
            : "• No open slots found in 09:00–21:00.";
        slotBlock = `\nFree slots (${durationMinutes} min) for ${startDate}:\n${slotLines}\n`;
      }

      return NextResponse.json({
        assistantText: `Agenda (${range}):\n\n${chunks.join("\n")}${slotBlock}`.trim(),
        toolCalls: [{ id: `${rid}:view`, name: "set_active_view", arguments: { view: "calendar" } }],
        requestId: rid,
      } satisfies ChatApiResponse);
    }

    const assistantText = (plan.assistantText && String(plan.assistantText).trim()) || "Done — I’ve handled that.";

    const toolCallsWithIds = clientToolCalls.map((tc, idx) => ({
      ...tc,
      id: tc.id || `${rid}:t_${idx}`,
    }));

    // Server-side execution for non-interactive clients (e.g., Voice, iMessage)
    // executeServerIntents already declared above at the pre-flight gate
    const serverActionsPerformed: string[] = [];

    if (executeServerIntents) {
      if (!uid) {
        console.error("[/api/chat] Server intents requested but no uid found");
        serverActionsPerformed.push("❌ Action failed: User not identified. Please sign in again.");
      } else {
        console.log("[/api/chat] Executing server intents for:", uid, "Tool count:", toolCallsWithIds.length);
        for (const tc of toolCallsWithIds) {
          console.log("[/api/chat] Server execution attempt for:", tc.name);
          try {
            if (tc.name === "create_task") {
              const res = await serverCreateTask(uid, tc.arguments as any);
              console.log("[/api/chat] Server task created:", res.id);
              serverActionsPerformed.push(`✓ Task created: ${res.title}`);
            } else if (tc.name === "create_event") {
              const res = await serverCreateEvent(uid, tc.arguments as any);
              console.log("[/api/chat] Server event created:", res.id);
              serverActionsPerformed.push(`✓ Event created: ${res.title}`);
            } else if (tc.name === "create_goal") {
              const res = await serverCreateGoal(uid, tc.arguments as any);
              console.log("[/api/chat] Server goal created:", res.id);
              serverActionsPerformed.push(`✓ Goal created: ${res.title}`);
            }
          } catch (err: any) {
            console.error(`[/api/chat] Server execution error for ${tc.name}:`, err);
            serverActionsPerformed.push(`❌ Failed to create ${tc.name.split('_')[1]}: ${err.message}`);
          }
        }
        console.log("[/api/chat] Server actions summary:", serverActionsPerformed);
      }
    }

    console.log("[/api/chat] Sending response:", { 
      rid, 
      assistantText, 
      toolCallsCount: toolCallsWithIds.length,
      toolCallsPreview: toolCallsWithIds.slice(0, 3).map(tc => ({ name: tc.name, args: JSON.stringify(tc.arguments).substring(0, 100) }))
    });

    console.log("[/api/chat] ok", { rid, userId: uid ? "yes" : "no", ms: Date.now() - startedAt });

    // Detect if this is a silent operation (routine task/event/goal creation)
    const isSilentOperation = toolCallsWithIds.length > 0 && 
      toolCallsWithIds.every(tc => ['create_task', 'create_event', 'create_goal', 'create_task_list'].includes(tc.name));
    
    let successMessage = '';
    if (isSilentOperation) {
      const taskCount = toolCallsWithIds.filter(tc => tc.name === 'create_task').length;
      const eventCount = toolCallsWithIds.filter(tc => tc.name === 'create_event').length;
      const goalCount = toolCallsWithIds.filter(tc => tc.name === 'create_goal').length;
      
      if (taskCount > 0) successMessage = `✓ ${taskCount === 1 ? 'Task' : taskCount + ' tasks'} added`;
      else if (eventCount > 0) successMessage = `✓ ${eventCount === 1 ? 'Event' : eventCount + ' events'} added`;
      else if (goalCount > 0) successMessage = `✓ ${goalCount === 1 ? 'Goal' : goalCount + ' goals'} added`;
    }

    // Combine assistant text with server action summary if executed
    let finalAssistantText = (isSilentOperation ? '' : assistantText).trim();
    if (executeServerIntents && serverActionsPerformed.length > 0) {
      const summary = serverActionsPerformed.join("\n");
      finalAssistantText = finalAssistantText ? `${summary}\n\n${finalAssistantText}` : summary;
    }

    return NextResponse.json({
      assistantText: finalAssistantText,
      toolCalls: toolCallsWithIds,
      requestId: rid,
      silentMode: isSilentOperation,
      successMessage: isSilentOperation ? successMessage : undefined,
      pendingEventDraft: null,
    } satisfies ChatApiResponse);
  } catch (e: any) {
    console.error("api/chat error:", e);
    return NextResponse.json(
      { assistantText: e?.message ?? "Failed", toolCalls: [], requestId } satisfies ChatApiResponse,
      { status: 500 }
    );
  }
}
