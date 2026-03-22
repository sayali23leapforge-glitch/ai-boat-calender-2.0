import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type TaskRow = {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  due_date: string | null;
  due_time: string | null;
  priority: string | null;
  metadata: Record<string, unknown> | null;
};

type ClassificationResult = {
  importanceLevel: 1 | 2 | 3;
  reason: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function fallbackImportance(task: TaskRow): ClassificationResult {
  const text = `${task.title || ""} ${task.notes || ""}`.toLowerCase();
  if (/\b(exam|flight|interview|visa|surgery|deadline|court)\b/.test(text)) {
    return { importanceLevel: 3, reason: "Critical keywords detected in task text" };
  }
  if (/\b(meeting|appointment|doctor|client|review|presentation)\b/.test(text)) {
    return { importanceLevel: 2, reason: "High-importance appointment/meeting style task" };
  }
  return { importanceLevel: 1, reason: "General personal task without urgency indicators" };
}

function isValidTimeZone(timeZone?: string | null): timeZone is string {
  if (!timeZone || !timeZone.trim()) return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function getOffsetMs(instant: Date, timeZone: string): number {
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
  return Date.UTC(y, m - 1, d, hh, mm, ss) - instant.getTime();
}

function parseDueAtInTimeZone(dueDate: string, dueTime: string, timeZone: string): Date | null {
  const dateMatch = dueDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const timeMatch = dueTime.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!dateMatch || !timeMatch) return null;

  const y = Number(dateMatch[1]);
  const m = Number(dateMatch[2]);
  const d = Number(dateMatch[3]);
  const hh = Number(timeMatch[1]);
  const mm = Number(timeMatch[2]);
  const ss = Number(timeMatch[3] || "0");

  const guess = Date.UTC(y, m - 1, d, hh, mm, ss);
  const offset1 = getOffsetMs(new Date(guess), timeZone);
  let resolvedMs = guess - offset1;
  const offset2 = getOffsetMs(new Date(resolvedMs), timeZone);
  if (offset1 !== offset2) resolvedMs = guess - offset2;
  const resolved = new Date(resolvedMs);
  return Number.isNaN(resolved.getTime()) ? null : resolved;
}

function normalizeDueAtIso(task: TaskRow): string | null {
  if (!task.due_date) return null;
  const rawDueDate = String(task.due_date).trim();
  const datePart = rawDueDate.includes("T") ? rawDueDate.split("T")[0] : rawDueDate.split(" ")[0];

  const rawDueTime = String(task.due_time || "").trim();
  const timePart = /^\d{2}:\d{2}(:\d{2})?$/.test(rawDueTime)
    ? rawDueTime.length === 5
      ? `${rawDueTime}:00`
      : rawDueTime
    : "09:00:00";

  const clientTimezone = String(task.metadata?.["client_timezone"] || "").trim();
  if (isValidTimeZone(clientTimezone)) {
    const dueAt = parseDueAtInTimeZone(datePart, timePart, clientTimezone);
    return dueAt ? dueAt.toISOString() : null;
  }

  const composed = `${datePart}T${timePart}Z`;
  const parsed = new Date(composed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function buildSchedule(dueAtIso: string, level: 1 | 2 | 3): string[] {
  if (level === 1) return [];
  const due = new Date(dueAtIso);
  if (Number.isNaN(due.getTime())) return [];

  const hours = level === 3 ? [24, 4, 1] : [2];

  return hours
    .map((h) => new Date(due.getTime() - h * 60 * 60 * 1000).toISOString())
    .filter((iso) => new Date(iso).getTime() > Date.now());
}

async function getGeminiApiKey(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const envKey = Deno.env.get("GEMINI_API_KEY");
  if (envKey) return envKey;

  const { data } = await supabase
    .from("api_keys")
    .select("api_key")
    .eq("service_name", "gemini")
    .maybeSingle();

  return data?.api_key || null;
}

async function classifyWithGemini(params: {
  apiKey: string;
  task: TaskRow;
  reminderPrefs: string;
}): Promise<ClassificationResult | null> {
  const { apiKey, task, reminderPrefs } = params;

  const prompt = `You are an importance classifier for reminders.
Return ONLY valid JSON:
{
  "importanceLevel": 1|2|3,
  "reason": "short explanation"
}

Definitions:
- Level 3 (Critical): exams, flights, interviews, hard deadlines.
- Level 2 (High): meetings, appointments, important work sessions.
- Level 1 (Normal): groceries, gym, routine/personal tasks.

Rules:
- Ignore task.priority field and use semantic meaning.
- Respect user preference hints.
- Be conservative: use level 1 unless clear urgency.

User reminder preferences:
${reminderPrefs || "(none)"}

Task:
title: ${task.title}
notes: ${task.notes || ""}
due_date: ${task.due_date || "null"}
due_time: ${task.due_time || "null"}`;

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 300 },
      }),
    }
  );

  if (!resp.ok) return null;
  const payload = await resp.json();
  const content = payload?.candidates?.[0]?.content?.parts?.[0]?.text || "";

  const direct = safeJsonParse<ClassificationResult>(content.trim());
  if (direct?.importanceLevel && direct.reason) return direct;

  const match = String(content).match(/\{[\s\S]*\}/);
  if (!match) return null;
  const parsed = safeJsonParse<ClassificationResult>(match[0]);
  if (!parsed?.importanceLevel || !parsed?.reason) return null;
  if (![1, 2, 3].includes(parsed.importanceLevel)) return null;
  return parsed;
}

async function processJob(supabase: ReturnType<typeof createClient>, taskId: string): Promise<void> {
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("id,user_id,title,notes,due_date,due_time,priority,metadata")
    .eq("id", taskId)
    .maybeSingle<TaskRow>();

  if (taskError || !task) {
    throw new Error(taskError?.message || "Task not found");
  }

  const { data: profilePrefs } = await supabase
    .from("user_profiles")
    .select("reminder_prefs")
    .eq("user_id", task.user_id)
    .maybeSingle<{ reminder_prefs?: string | null }>();

  const { data: legacyPrefs } = await supabase
    .from("user_preferences")
    .select("reminder_prefs")
    .eq("user_id", task.user_id)
    .maybeSingle<{ reminder_prefs?: string | null }>();

  const reminderPrefs = [profilePrefs?.reminder_prefs, legacyPrefs?.reminder_prefs]
    .filter((v) => typeof v === "string" && v.trim().length > 0)
    .join("\n");

  const apiKey = await getGeminiApiKey(supabase);
  const classification =
    (apiKey ? await classifyWithGemini({ apiKey, task, reminderPrefs }) : null) || fallbackImportance(task);

  await supabase
    .from("tasks")
    .update({
      importance_level: classification.importanceLevel,
      importance_reason: classification.reason,
      importance_status: "DONE",
      importance_analyzed_at: new Date().toISOString(),
    })
    .eq("id", task.id);

  // Respect reminder schedule already created at task creation.
  const { data: existingAutoRows } = await supabase
    .from("reminders")
    .select("id")
    .eq("task_id", task.id)
    .eq("channel", "GMAIL")
    .contains("metadata", { source: "auto_task_create" })
    .limit(1);
  if ((existingAutoRows || []).length > 0) {
    return;
  }

  await supabase
    .from("reminders")
    .delete()
    .eq("task_id", task.id)
    .in("status", ["PENDING", "FAILED"]);

  if (!task.due_date) return;
  const dueAt = normalizeDueAtIso(task);
  if (!dueAt) throw new Error(`Invalid due date/time format for task ${task.id}`);
  const scheduled = buildSchedule(dueAt, classification.importanceLevel);
  if (scheduled.length === 0) return;

  const rows = scheduled.map((iso) => ({
    user_id: task.user_id,
    task_id: task.id,
    scheduled_at: iso,
    channel: "GMAIL",
    status: "PENDING",
    metadata: {
      source: "classify-importance",
      importance_level: classification.importanceLevel,
      client_timezone: task.metadata?.["client_timezone"] || null,
    },
  }));

  const { error: reminderError } = await supabase.from("reminders").upsert(rows, {
    onConflict: "task_id,channel,scheduled_at",
    ignoreDuplicates: false,
  });
  if (reminderError) throw new Error(reminderError.message);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    const taskId = String(body?.taskId || "");
    const limit = Math.max(1, Math.min(Number(body?.limit || 10), 50));

    let jobTaskIds: string[] = [];
    if (taskId) {
      jobTaskIds = [taskId];
    } else {
      const { data: jobs, error } = await supabase
        .from("reminder_classification_jobs")
        .select("task_id")
        .in("status", ["PENDING", "FAILED"])
        .or("next_retry_at.is.null,next_retry_at.lte.now()")
        .order("created_at", { ascending: true })
        .limit(limit);
      if (error) throw new Error(error.message);
      jobTaskIds = (jobs || []).map((j: { task_id: string }) => j.task_id);
    }

    const results: Array<{ taskId: string; ok: boolean; error?: string }> = [];
    for (const id of jobTaskIds) {
      await supabase
        .from("reminder_classification_jobs")
        .update({ status: "PROCESSING", updated_at: new Date().toISOString() })
        .eq("task_id", id);

      await supabase.from("tasks").update({ importance_status: "PROCESSING" }).eq("id", id);

      try {
        await processJob(supabase, id);
        await supabase
          .from("reminder_classification_jobs")
          .update({ status: "DONE", last_error: null, updated_at: new Date().toISOString() })
          .eq("task_id", id);
        results.push({ taskId: id, ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await supabase.rpc("increment_reminder_job_failure", { p_task_id: id, p_error: message }).catch(async () => {
          await supabase
            .from("reminder_classification_jobs")
            .update({
              status: "FAILED",
              attempts: 1,
              last_error: message,
              next_retry_at: new Date(Date.now() + 60_000).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("task_id", id);
        });
        await supabase
          .from("tasks")
          .update({ importance_status: "FAILED", importance_reason: message })
          .eq("id", id);
        results.push({ taskId: id, ok: false, error: message });
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
