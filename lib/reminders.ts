import type { SupabaseClient } from "@supabase/supabase-js";
type ImportanceLevel = 1 | 2 | 3;

type ImportanceDecision = {
  level: ImportanceLevel;
  reason: string;
  profile: string;
};

export type AutoTaskPriority = "critical" | "high" | "medium";
export type TimelineEntityType = "TASK" | "EVENT" | "GOAL" | "QUESTION";
export type TimelineAlertKind = "REMINDER" | "RELATED_QUESTION";

function isValidTimeZone(timeZone?: string | null): timeZone is string {
  if (!timeZone || !timeZone.trim()) return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function getTimeZoneOffsetMs(instant: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(instant);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const y = Number(map.year);
  const m = Number(map.month);
  const d = Number(map.day);
  const hh = Number(map.hour);
  const mm = Number(map.minute);
  const ss = Number(map.second);
  const asUtc = Date.UTC(y, m - 1, d, hh, mm, ss);
  return asUtc - instant.getTime();
}

function parseDueAtInTimeZone(
  dueDate: string,
  dueTime: string,
  timeZone: string
): Date | null {
  const dateMatch = dueDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const timeMatch = dueTime.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!dateMatch || !timeMatch) return null;

  const y = Number(dateMatch[1]);
  const m = Number(dateMatch[2]);
  const d = Number(dateMatch[3]);
  const hh = Number(timeMatch[1]);
  const mm = Number(timeMatch[2]);
  const ss = Number(timeMatch[3] || "0");

  // Start with "same wall-clock in UTC", then adjust using zone offset.
  const utcGuess = Date.UTC(y, m - 1, d, hh, mm, ss);
  const offset1 = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  let utcMs = utcGuess - offset1;
  const offset2 = getTimeZoneOffsetMs(new Date(utcMs), timeZone);
  if (offset1 !== offset2) {
    utcMs = utcGuess - offset2;
  }
  const resolved = new Date(utcMs);
  return Number.isNaN(resolved.getTime()) ? null : resolved;
}

function parseDueAt(
  dueDate?: string | null,
  dueTime?: string | null,
  clientTimezone?: string | null
): Date | null {
  if (!dueDate) return null;
  const normalizedDate = /^\d{4}-\d{2}-\d{2}/.test(dueDate)
    ? dueDate.slice(0, 10)
    : dueDate;
  const timePart = dueTime && /^\d{2}:\d{2}(:\d{2})?$/.test(dueTime) ? dueTime : "09:00:00";
  const normalizedTime = timePart.length === 5 ? `${timePart}:00` : timePart;

  if (isValidTimeZone(clientTimezone)) {
    return parseDueAtInTimeZone(normalizedDate, normalizedTime, clientTimezone);
  }

  const date = new Date(`${normalizedDate}T${normalizedTime}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function fallbackImportance(params: {
  title: string;
  notes?: string;
}): ImportanceDecision {
  const text = `${params.title} ${params.notes || ""}`.toLowerCase();
  const hasCriticalKeyword = /\b(exam|flight|interview|visa|deadline|court|surgery|emergency|critical|urgent|asap)\b/.test(
    text
  );
  const hasHighKeyword = /\b(meeting|appointment|doctor|client|presentation|demo|review|payment)\b/.test(text);

  if (hasCriticalKeyword) {
    return {
      level: 3,
      reason: "Critical task inferred from title/notes keywords",
      profile: "24h, 4h, 1h",
    };
  }
  if (hasHighKeyword) {
    return {
      level: 2,
      reason: "High-importance task inferred from title/notes keywords",
      profile: "2h",
    };
  }
  return {
    level: 1,
    reason: "Normal task inferred from title/notes",
    profile: "no-email",
  };
}

function extractFirstJsonObject(text: string): any | null {
  const input = String(text || "").trim();
  if (!input) return null;
  const cleaned = input.replace(/^```(json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // fall through
  }

  const start = cleaned.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (depth === 0) {
      const candidate = cleaned.slice(start, i + 1);
      try {
        return JSON.parse(candidate);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function normalizeDecision(candidate: any): ImportanceDecision | null {
  const level = Number(candidate?.level);
  if (level !== 1 && level !== 2 && level !== 3) return null;
  const profile =
    typeof candidate?.profile === "string" && candidate.profile.trim()
      ? candidate.profile.trim()
      : level === 3
      ? "24h, 4h, 1h"
      : level === 2
      ? "2h"
      : "no-email";
  return {
    level,
    reason: String(candidate?.reason || "LLM classification"),
    profile,
  };
}

export function mapImportanceLevelToPriority(level: ImportanceLevel): AutoTaskPriority {
  if (level === 3) return "critical";
  if (level === 2) return "high";
  return "medium";
}

async function inferImportanceWithLLM(params: {
  title: string;
  notes?: string;
  dueDate?: string | null;
  dueTime?: string | null;
  reminderPrefs?: string | null;
}): Promise<ImportanceDecision | null> {
  const provider = (process.env.AI_PROVIDER || "").toLowerCase();
  const payloadPrompt = [
    "You are an importance classifier for adaptive reminder emails.",
    "Analyze this task and assign:",
    '- level: 1 | 2 | 3',
    '- profile: "24h, 4h, 1h" | "2h" | "no-email"',
    "- reason: very short explanation",
    "Rules:",
    "- Level 3 (critical): exams, flights, interviews, major deadlines => profile 24h, 4h, 1h",
    "- Level 2 (high): work meetings, appointments, important follow-ups => profile 2h",
    "- Level 1 (normal): groceries, gym, low urgency => profile no-email",
    "Use user reminder preferences to reduce email aggressiveness for disliked categories.",
    "Do NOT rely on any manually-selected priority field as the primary signal.",
    "Return ONLY valid JSON with keys: level, profile, reason.",
    `Task title: ${params.title}`,
    `Task notes: ${params.notes || ""}`,
    `Task dueDate: ${params.dueDate || ""}`,
    `Task dueTime: ${params.dueTime || ""}`,
    `User reminder_prefs: ${params.reminderPrefs || ""}`,
  ].join("\n");

  if (provider === "gemini" && process.env.GEMINI_API_KEY) {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: payloadPrompt }] }],
        }),
      }
    );

    if (!resp.ok) return null;
    const data = await resp.json();
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) return null;
    const parsed = extractFirstJsonObject(content);
    return normalizeDecision(parsed);
  }

  if (provider !== "gemini" && process.env.OPENAI_API_KEY) {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: payloadPrompt }],
      }),
    });

    if (!resp.ok) return null;
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = extractFirstJsonObject(content);
    return normalizeDecision(parsed);
  }

  return null;
}

function getOffsetsForLevel(level: ImportanceLevel): number[] {
  if (level === 3) return [24 * 60, 4 * 60, 60];
  if (level === 2) return [2 * 60];
  return [];
}

export async function queueTaskGmailReminders(params: {
  admin: SupabaseClient;
  userId: string;
  taskId: string;
  title: string;
  notes?: string;
  dueDate?: string | null;
  dueTime?: string | null;
  clientTimezone?: string | null;
  precomputedDecision?: ImportanceDecision;
}): Promise<number> {
  const dueAt = parseDueAt(params.dueDate, params.dueTime, params.clientTimezone);
  if (!dueAt) return 0;

  const { data: profilePrefs } = await params.admin
    .from("user_profiles")
    .select("reminder_prefs")
    .eq("user_id", params.userId)
    .maybeSingle();

  const { data: legacyPrefs } = await params.admin
    .from("user_preferences")
    .select("reminder_prefs")
    .eq("user_id", params.userId)
    .maybeSingle();

  const mergedPrefs = [profilePrefs?.reminder_prefs, legacyPrefs?.reminder_prefs]
    .filter((v) => typeof v === "string" && v.trim().length > 0)
    .join("\n");

  const decision =
    params.precomputedDecision ||
    (await inferImportanceWithLLM({
      title: params.title,
      notes: params.notes,
      dueDate: params.dueDate,
      dueTime: params.dueTime,
      reminderPrefs: mergedPrefs || null,
    }).catch(() => null)) ||
    fallbackImportance(params);
  const offsets = getOffsetsForLevel(decision.level);
  if (!offsets.length) return 0;

  const now = Date.now();
  const minScheduledAtMs = now + 30 * 1000;
  const usedScheduledAtMs = new Set<number>();
  const rows = offsets.map((offsetMinutes) => {
    const scheduledAtMs = dueAt.getTime() - offsetMinutes * 60 * 1000;
    let candidateMs = Math.max(scheduledAtMs, minScheduledAtMs);

    // Keep reminder timestamps unique per task to avoid DB unique index conflicts
    // when multiple overdue reminders are all clamped to "now + 30s".
    while (usedScheduledAtMs.has(candidateMs)) {
      candidateMs += 1000;
    }
    usedScheduledAtMs.add(candidateMs);

    return {
      user_id: params.userId,
      task_id: params.taskId,
      channel: "GMAIL",
      status: "PENDING",
      scheduled_at: new Date(candidateMs).toISOString(),
      importance_level: decision.level,
      importance_reason: decision.reason,
      metadata: {
        reminder_profile: decision.profile,
        offset_minutes: offsetMinutes,
        client_timezone: params.clientTimezone || null,
        source: "auto_task_create",
      },
    };
  });

  const { error } = await params.admin.from("reminders").insert(rows);
  if (error) throw new Error(`Failed to queue reminders: ${error.message}`);
  return rows.length;
}

export async function classifyTaskImportance(params: {
  admin: SupabaseClient;
  userId: string;
  title: string;
  notes?: string;
  dueDate?: string | null;
  dueTime?: string | null;
}): Promise<ImportanceDecision> {
  const { data: profilePrefs } = await params.admin
    .from("user_profiles")
    .select("reminder_prefs")
    .eq("user_id", params.userId)
    .maybeSingle();

  const { data: legacyPrefs } = await params.admin
    .from("user_preferences")
    .select("reminder_prefs")
    .eq("user_id", params.userId)
    .maybeSingle();

  const mergedPrefs = [profilePrefs?.reminder_prefs, legacyPrefs?.reminder_prefs]
    .filter((v) => typeof v === "string" && v.trim().length > 0)
    .join("\n");

  const llmDecision = await inferImportanceWithLLM({
    title: params.title,
    notes: params.notes,
    dueDate: params.dueDate,
    dueTime: params.dueTime,
    reminderPrefs: mergedPrefs || null,
  }).catch(() => null);

  return llmDecision || fallbackImportance(params);
}

function mapPriorityToImportanceLevel(
  priority?: string | null,
  fallbackLevel: ImportanceLevel = 2
): ImportanceLevel {
  const normalized = String(priority || "").toLowerCase();
  if (normalized === "critical") return 3;
  if (normalized === "high") return 2;
  if (normalized === "medium") return 2;
  if (normalized === "low") return 1;
  return fallbackLevel;
}

function getTimelineOffsetsForLevel(entityType: TimelineEntityType, level: ImportanceLevel): number[] {
  if (entityType === "EVENT") {
    if (level === 3) return [7 * 24 * 60, 24 * 60, 4 * 60, 60];
    if (level === 2) return [24 * 60, 2 * 60];
    return [60];
  }

  if (entityType === "GOAL") {
    if (level === 3) return [7 * 24 * 60, 24 * 60];
    if (level === 2) return [24 * 60];
    return [];
  }

  if (entityType === "QUESTION") {
    return [0];
  }

  return getOffsetsForLevel(level);
}

async function insertTimelineRowsWithFallback(
  admin: SupabaseClient,
  rows: Array<Record<string, unknown>>
): Promise<void> {
  const { error } = await admin.from("reminders").insert(rows as any);
  if (!error) return;

  const message = String(error.message || "");
  const missingEntityColumns =
    /column .*entity_type.* does not exist/i.test(message) ||
    /column .*entity_id.* does not exist/i.test(message) ||
    /column .*alert_kind.* does not exist/i.test(message);

  if (!missingEntityColumns) {
    throw new Error(`Failed to queue timeline reminders: ${message}`);
  }

  // Backward-compatible fallback for older schemas (task reminders only).
  const legacyRows = rows.map((row) => {
    const legacyTaskId = row.task_id;
    if (!legacyTaskId) {
      throw new Error(
        "Timeline alert schema is missing. Run the new reminders migration to enable event/goal alerts."
      );
    }

    return {
      user_id: row.user_id,
      task_id: legacyTaskId,
      channel: row.channel,
      status: row.status,
      scheduled_at: row.scheduled_at,
      importance_level: row.importance_level,
      importance_reason: row.importance_reason,
      metadata: row.metadata,
    };
  });

  const { error: fallbackError } = await admin.from("reminders").insert(legacyRows as any);
  if (fallbackError) {
    throw new Error(`Failed to queue reminders: ${fallbackError.message}`);
  }
}

export async function queueTimelineGmailReminders(params: {
  admin: SupabaseClient;
  userId: string;
  entityType: TimelineEntityType;
  entityId: string;
  title: string;
  notes?: string;
  dueDate?: string | null;
  dueTime?: string | null;
  clientTimezone?: string | null;
  source?: string;
  alertKind?: TimelineAlertKind;
  precomputedDecision?: ImportanceDecision;
  extraMetadata?: Record<string, unknown>;
}): Promise<number> {
  const dueAt = parseDueAt(params.dueDate, params.dueTime, params.clientTimezone);
  if (!dueAt) return 0;

  const decision =
    params.precomputedDecision ||
    fallbackImportance({
      title: params.title,
      notes: params.notes,
    });
  const offsets =
    params.alertKind === "RELATED_QUESTION"
      ? [0]
      : getTimelineOffsetsForLevel(params.entityType, decision.level);
  if (!offsets.length) return 0;

  const now = Date.now();
  const minScheduledAtMs = now + 30 * 1000;
  const usedScheduledAtMs = new Set<number>();
  const rows = offsets.map((offsetMinutes) => {
    const scheduledAtMs = dueAt.getTime() - offsetMinutes * 60 * 1000;
    let candidateMs = Math.max(scheduledAtMs, minScheduledAtMs);
    while (usedScheduledAtMs.has(candidateMs)) {
      candidateMs += 1000;
    }
    usedScheduledAtMs.add(candidateMs);

    return {
      user_id: params.userId,
      task_id: params.entityType === "TASK" ? params.entityId : null,
      entity_type: params.entityType,
      entity_id: params.entityId,
      alert_kind: params.alertKind || "REMINDER",
      channel: "GMAIL",
      status: "PENDING",
      scheduled_at: new Date(candidateMs).toISOString(),
      importance_level: decision.level,
      importance_reason: decision.reason,
      metadata: {
        timeline_entity: params.entityType,
        reminder_profile: decision.profile,
        offset_minutes: offsetMinutes,
        client_timezone: params.clientTimezone || null,
        source: params.source || "timeline_auto_create",
        ...(params.extraMetadata || {}),
      },
    };
  });

  await insertTimelineRowsWithFallback(params.admin, rows);
  return rows.length;
}

export async function queueEventGmailReminders(params: {
  admin: SupabaseClient;
  userId: string;
  eventId: string;
  title: string;
  description?: string;
  eventDate?: string | null;
  startTime?: string | null;
  clientTimezone?: string | null;
  priority?: string | null;
}): Promise<number> {
  if (!params.eventDate) return 0;
  const level = mapPriorityToImportanceLevel(params.priority, 2);

  return queueTimelineGmailReminders({
    admin: params.admin,
    userId: params.userId,
    entityType: "EVENT",
    entityId: params.eventId,
    title: params.title,
    notes: params.description || "",
    dueDate: params.eventDate,
    dueTime: params.startTime || "09:00:00",
    clientTimezone: params.clientTimezone || "UTC",
    source: "event_create_or_update",
    precomputedDecision: {
      level,
      reason: "Event priority + context based timeline reminder",
      profile: level === 3 ? "7d, 24h, 4h, 1h" : level === 2 ? "24h, 2h" : "1h",
    },
  });
}

export async function queueGoalGmailReminders(params: {
  admin: SupabaseClient;
  userId: string;
  goalId: string;
  title: string;
  description?: string;
  targetDate?: string | null;
  clientTimezone?: string | null;
  priority?: string | null;
}): Promise<number> {
  if (!params.targetDate) return 0;
  const level = mapPriorityToImportanceLevel(params.priority, 2);

  return queueTimelineGmailReminders({
    admin: params.admin,
    userId: params.userId,
    entityType: "GOAL",
    entityId: params.goalId,
    title: params.title,
    notes: params.description || "",
    dueDate: params.targetDate,
    dueTime: "09:00:00",
    clientTimezone: params.clientTimezone || "UTC",
    source: "goal_create_or_update",
    precomputedDecision: {
      level,
      reason: "Goal target-date reminder",
      profile: level === 3 ? "7d, 24h" : level === 2 ? "24h" : "no-email",
    },
  });
}

export async function queueRelatedQuestionAlert(params: {
  admin: SupabaseClient;
  userId: string;
  entityType: Exclude<TimelineEntityType, "QUESTION">;
  entityId: string;
  title: string;
  question: string;
  clientTimezone?: string | null;
}): Promise<number> {
  const pseudoDate = new Date(Date.now() + 45 * 1000).toISOString().slice(0, 10);
  const pseudoTime = new Date(Date.now() + 45 * 1000).toISOString().slice(11, 19);

  return queueTimelineGmailReminders({
    admin: params.admin,
    userId: params.userId,
    entityType: params.entityType,
    entityId: params.entityId,
    title: params.title,
    notes: params.question,
    dueDate: pseudoDate,
    dueTime: pseudoTime,
    clientTimezone: params.clientTimezone || "UTC",
    source: "timeline_related_question",
    alertKind: "RELATED_QUESTION",
    extraMetadata: {
      related_title: params.title,
      related_question: params.question,
    },
    precomputedDecision: {
      level: 2,
      reason: "Timeline relationship/question prompt",
      profile: "immediate",
    },
  });
}
