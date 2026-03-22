import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const TEST_DEFAULTS = {
  SUPABASE_URL: "https://ofkthnxcfkdtnrxgrbnq.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ma3RobnhjZmtkdG5yeGdyYm5xIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzg1ODU3MSwiZXhwIjoyMDgzNDM0NTcxfQ.OoJ7bHSB0CQTOLaumHHIou7bVdQz-Iksh5xxJo4jZ4I",
  RESEND_API_KEY: "re_3uZZLh6w_719CvBe3sNs9vnYbNe3KUJwY",
  REMINDER_FROM_EMAIL: "onboarding@resend.dev",
  APP_BASE_URL: "http://localhost:3000",
  REMINDER_TEST_MODE: "true",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type ReminderRow = {
  id: string;
  user_id: string;
  task_id: string;
  status: "PENDING" | "PROCESSING" | "SENT" | "FAILED";
  scheduled_at: string;
  attempts: number;
  importance_level: number | null;
  importance_reason: string | null;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function makeRequestId(): string {
  return `sr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatTimeLabel(timeValue?: string | null): string {
  if (!timeValue) return "";
  const normalized = timeValue.trim().slice(0, 8);
  const match = normalized.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return timeValue;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return timeValue;
  const suffix = hour >= 12 ? "PM" : "AM";
  const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelveHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function formatDuePartForEmail(dueDate?: string | null, dueTime?: string | null): string {
  if (!dueDate) return "No due date";
  const dateMatch = dueDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) {
    return dueTime ? `${dueDate} at ${formatTimeLabel(dueTime)}` : dueDate;
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]) - 1;
  const day = Number(dateMatch[3]);
  const asDate = new Date(Date.UTC(year, month, day));
  const dateLabel = Number.isNaN(asDate.getTime())
    ? dueDate
    : new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(asDate);

  const timeLabel = formatTimeLabel(dueTime);
  return timeLabel ? `${dateLabel} at ${timeLabel}` : dateLabel;
}

function logInfo(requestId: string, message: string, meta?: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      level: "info",
      requestId,
      message,
      ...(meta || {}),
    })
  );
}

function logError(
  requestId: string,
  message: string,
  error?: unknown,
  meta?: Record<string, unknown>
) {
  const normalizedError =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { message: String(error) };

  console.error(
    JSON.stringify({
      level: "error",
      requestId,
      message,
      error: normalizedError,
      ...(meta || {}),
    })
  );
}

function extractBearerToken(req: Request): string {
  const auth = req.headers.get("Authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
}

async function sendViaResend(params: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    return { ok: false, error: text || `HTTP ${response.status}` };
  }

  try {
    const parsed = JSON.parse(text);
    return { ok: true, id: parsed?.id };
  } catch {
    return { ok: true };
  }
}

Deno.serve(async (req: Request) => {
  const requestId = makeRequestId();
  const startedAt = Date.now();

  logInfo(requestId, "send-reminder request started", {
    method: req.method,
    path: new URL(req.url).pathname,
  });

  if (req.method === "OPTIONS") {
    logInfo(requestId, "cors preflight request");
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    logInfo(requestId, "unsupported method", { method: req.method });
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
      TEST_DEFAULTS.SUPABASE_SERVICE_ROLE_KEY;
    const expectedToken =
      Deno.env.get("SEND_REMINDER_TOKEN") || serviceRoleKey;
    const reminderTestMode =
      (Deno.env.get("REMINDER_TEST_MODE") || TEST_DEFAULTS.REMINDER_TEST_MODE) === "true";
    const incomingToken = extractBearerToken(req);
    logInfo(requestId, "auth mode resolved", {
      reminderTestMode,
      hasIncomingToken: Boolean(incomingToken),
      hasServiceRoleKey: Boolean(serviceRoleKey),
      hasDedicatedToken: Boolean(Deno.env.get("SEND_REMINDER_TOKEN")),
    });
    if (!serviceRoleKey || (!reminderTestMode && incomingToken !== expectedToken)) {
      logInfo(requestId, "authorization failed", {
        reason: !serviceRoleKey ? "missing_service_role_key" : "token_mismatch",
      });
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl =
      Deno.env.get("SUPABASE_URL") || TEST_DEFAULTS.SUPABASE_URL;
    // User-requested behavior: always use this hardcoded key in testing.
    const resendApiKey = TEST_DEFAULTS.RESEND_API_KEY;
    const fromEmail =
      Deno.env.get("REMINDER_FROM_EMAIL") || TEST_DEFAULTS.REMINDER_FROM_EMAIL;
    const fromName = Deno.env.get("REMINDER_FROM_NAME") || "Calendar Reminders";
    const fromHeaderRaw = fromEmail.includes("<")
      ? fromEmail
      : `${fromName} <${fromEmail}>`;
    const fromHeader = fromHeaderRaw.replace(/Calender/gi, "Calendar");
    const appBaseUrl =
      Deno.env.get("APP_BASE_URL") || TEST_DEFAULTS.APP_BASE_URL;
    logInfo(requestId, "configuration resolved", {
      usingFallbacks: {
        supabaseUrl: !Deno.env.get("SUPABASE_URL"),
        resendApiKey: true,
        fromEmail: !Deno.env.get("REMINDER_FROM_EMAIL"),
        appBaseUrl: !Deno.env.get("APP_BASE_URL"),
      },
      appBaseUrl,
      fromEmail: fromHeader,
    });

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }
    if (!resendApiKey) {
      throw new Error("Missing RESEND_API_KEY");
    }

    const body = await req.json().catch(() => ({}));
    const batchSize = Math.max(1, Math.min(Number(body?.batchSize || 25), 100));
    logInfo(requestId, "request payload parsed", { batchSize });

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const nowIso = new Date().toISOString();

    const { data: dueReminders, error: dueError } = await supabase
      .from("reminders")
      .select("id,user_id,task_id,status,scheduled_at,attempts,importance_level,importance_reason")
      .eq("channel", "GMAIL")
      .eq("status", "PENDING")
      .lte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true })
      .limit(batchSize);

    if (dueError) {
      logError(requestId, "failed to query due reminders", dueError);
      throw new Error(dueError.message);
    }

    const reminders = (dueReminders || []) as ReminderRow[];
    logInfo(requestId, "due reminders fetched", {
      dueCount: reminders.length,
      nowIso,
    });
    const results: Array<{ id: string; status: string; error?: string }> = [];

    for (const reminder of reminders) {
      logInfo(requestId, "processing reminder", {
        reminderId: reminder.id,
        taskId: reminder.task_id,
        previousAttempts: reminder.attempts || 0,
        scheduledAt: reminder.scheduled_at,
      });
      const { data: claimRow, error: claimError } = await supabase
        .from("reminders")
        .update({ status: "PROCESSING", attempts: (reminder.attempts || 0) + 1 })
        .eq("id", reminder.id)
        .eq("status", "PENDING")
        .select("id")
        .maybeSingle();

      if (claimError || !claimRow) {
        logInfo(requestId, "reminder claim skipped", {
          reminderId: reminder.id,
          claimError: claimError?.message || null,
          reason: !claimRow ? "already_claimed_or_status_changed" : "claim_error",
        });
        continue;
      }

      const { data: task, error: taskError } = await supabase
        .from("tasks")
        .select("title,notes,due_date,due_time")
        .eq("id", reminder.task_id)
        .maybeSingle();

      if (taskError || !task) {
        logInfo(requestId, "task lookup failed for reminder", {
          reminderId: reminder.id,
          taskId: reminder.task_id,
          taskError: taskError?.message || "task_not_found",
        });
        await supabase
          .from("reminders")
          .update({
            status: "FAILED",
            last_error: taskError?.message || "Task not found",
          })
          .eq("id", reminder.id);
        results.push({ id: reminder.id, status: "FAILED", error: "Task not found" });
        continue;
      }

      const authUser = await supabase.auth.admin.getUserById(reminder.user_id);
      const toEmail = authUser?.data?.user?.email || null;
      if (!toEmail) {
        logInfo(requestId, "profile email missing", {
          reminderId: reminder.id,
          userId: reminder.user_id,
          authError: authUser?.error?.message || null,
        });
        await supabase
          .from("reminders")
          .update({
            status: "FAILED",
            last_error: "User email not found in profiles",
          })
          .eq("id", reminder.id);
        results.push({ id: reminder.id, status: "FAILED", error: "No user email" });
        continue;
      }

      const duePart = formatDuePartForEmail(task.due_date, task.due_time);
      const safeTitle = escapeHtml(task.title || "Task reminder");
      const safeDuePart = escapeHtml(duePart);
      const safeNotes = task.notes ? escapeHtml(task.notes) : "";
      const safeReason = reminder.importance_reason
        ? escapeHtml(reminder.importance_reason)
        : "";
      const scheduledFor = new Date(reminder.scheduled_at);
      const scheduledForLabel = Number.isNaN(scheduledFor.getTime())
        ? reminder.scheduled_at
        : new Intl.DateTimeFormat("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          }).format(scheduledFor);
      const safeScheduledFor = escapeHtml(scheduledForLabel);

      const subject = `Reminder: ${task.title}`;
      const html = `
        <div style="margin:0;padding:0;background:#f2f5fb;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f5fb;padding:28px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border:1px solid #d6deee;border-radius:16px;box-shadow:0 12px 30px rgba(11,33,74,0.10);overflow:hidden;">
                  <tr>
                    <td style="padding:22px 24px 16px;background:#0f2748;color:#f4f8ff;">
                      <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#b8cff9;">Calendar Reminder</div>
                      <h1 style="margin:8px 0 0;font-size:24px;line-height:1.25;color:#ffffff;">${safeTitle}</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:20px 24px 8px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8faff;border:1px solid #e0e6f3;border-radius:12px;">
                        <tr>
                          <td style="padding:14px 16px;">
                            <div style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;font-weight:700;color:#52698d;margin-bottom:6px;">Due</div>
                            <div style="font-size:16px;font-weight:600;color:#132745;">${safeDuePart}</div>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:0 16px 14px;">
                            <div style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;font-weight:700;color:#52698d;margin-bottom:6px;">Scheduled For</div>
                            <div style="font-size:14px;font-weight:500;color:#263d61;">${safeScheduledFor}</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  ${
                    safeNotes
                      ? `<tr>
                    <td style="padding:10px 24px 4px;">
                      <div style="font-size:13px;text-transform:uppercase;letter-spacing:.06em;font-weight:700;color:#52698d;margin-bottom:8px;">Notes</div>
                      <div style="font-size:15px;line-height:1.6;color:#314a6e;background:#ffffff;border:1px solid #e3e9f5;border-radius:12px;padding:14px 15px;">${safeNotes}</div>
                    </td>
                  </tr>`
                      : ""
                  }
                  ${
                    safeReason
                      ? `<tr>
                    <td style="padding:12px 24px 0;">
                      <div style="display:inline-block;background:#ecf2ff;color:#36598f;border:1px solid #d8e1f6;border-radius:999px;padding:6px 12px;font-size:12px;font-weight:600;">
                        Why emailed: ${safeReason}
                      </div>
                    </td>
                  </tr>`
                      : ""
                  }
                  <tr>
                    <td style="padding:24px 24px 28px;">
                      ${
                        appBaseUrl
                          ? `<a href="${appBaseUrl}" target="_blank" rel="noreferrer" style="display:inline-block;background:#1f5ed7;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-size:14px;font-weight:700;letter-spacing:.01em;">Open Calendar App</a>`
                          : ""
                      }
                      <div style="margin-top:16px;font-size:12px;line-height:1.5;color:#6f7f98;">
                        You are receiving this reminder from your Calendar app notification settings.
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </div>
      `;

      const emailResult = await sendViaResend({
        apiKey: resendApiKey,
        from: fromHeader,
        to: toEmail,
        subject,
        html,
      });

      if (emailResult.ok) {
        logInfo(requestId, "reminder sent", {
          reminderId: reminder.id,
          providerMessageId: emailResult.id || null,
          toEmail,
        });
        await supabase
          .from("reminders")
          .update({
            status: "SENT",
            sent_at: new Date().toISOString(),
            provider_message_id: emailResult.id || null,
            last_error: null,
          })
          .eq("id", reminder.id);
        results.push({ id: reminder.id, status: "SENT" });
      } else {
        const nextAttempts = (reminder.attempts || 0) + 1;
        const terminalFailure = nextAttempts >= 3;
        logInfo(requestId, "reminder send failed", {
          reminderId: reminder.id,
          toEmail,
          nextAttempts,
          terminalFailure,
          providerError: emailResult.error || null,
        });
        await supabase
          .from("reminders")
          .update({
            status: terminalFailure ? "FAILED" : "PENDING",
            last_error: emailResult.error || "Email send failed",
          })
          .eq("id", reminder.id);
        results.push({
          id: reminder.id,
          status: terminalFailure ? "FAILED" : "PENDING",
          error: emailResult.error,
        });
      }
    }

    const sentCount = results.filter((r) => r.status === "SENT").length;
    const failedCount = results.filter((r) => r.status === "FAILED").length;
    const pendingCount = results.filter((r) => r.status === "PENDING").length;
    logInfo(requestId, "send-reminder request completed", {
      durationMs: Date.now() - startedAt,
      processed: results.length,
      sentCount,
      failedCount,
      pendingCount,
    });

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    logError(requestId, "send-reminder request failed", error, {
      durationMs: Date.now() - startedAt,
    });
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
