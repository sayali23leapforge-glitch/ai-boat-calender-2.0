import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

/**
 * Reads rows from `tasks` only. No text/ILIKE search on this table — list name
 * filtering belongs to GET /api/task-lists/get (`nameSearch` on `task_lists.name`).
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");
    const listId = url.searchParams.get("listId");
    const listIdsRaw = url.searchParams.get("listIds")?.trim() ?? "";
    const isStarred = url.searchParams.get("isStarred");
    const isCompleted = url.searchParams.get("isCompleted");

    if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

    const admin = getSupabaseAdminClient();

    let query = admin
      .from("tasks")
      .select("*")
      .eq("user_id", userId);

    const listIds = listIdsRaw
      ? listIdsRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    if (listIds.length > 0) {
      query = query.in("list_id", listIds);
    } else if (listId) {
      query = query.eq("list_id", listId);
    }
    if (isStarred === "true") query = query.eq("is_starred", true);
    if (isStarred === "false") query = query.eq("is_starred", false);
    if (isCompleted === "true") query = query.eq("is_completed", true);
    if (isCompleted === "false") query = query.eq("is_completed", false);

    const { data, error } = await query.order("position", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const tasks = data ?? [];
    if (!tasks.length) return NextResponse.json({ data: tasks });

    const taskIds = tasks.map((task) => task.id);
    const { data: reminders } = await admin
      .from("reminders")
      .select("task_id, scheduled_at, status, sent_at, importance_level, metadata")
      .eq("user_id", userId)
      .in("task_id", taskIds)
      .order("scheduled_at", { ascending: true });

    const remindersByTask = new Map<string, any[]>();
    for (const reminder of reminders ?? []) {
      const taskReminder = {
        scheduled_at: reminder.scheduled_at,
        status: reminder.status,
        sent_at: reminder.sent_at,
        importance_level: reminder.importance_level,
        offset_minutes:
          typeof reminder.metadata?.offset_minutes === "number"
            ? reminder.metadata.offset_minutes
            : null,
      };
      const current = remindersByTask.get(reminder.task_id) ?? [];
      current.push(taskReminder);
      remindersByTask.set(reminder.task_id, current);
    }

    const hydratedTasks = tasks.map((task) => ({
      ...task,
      reminder_schedule: remindersByTask.get(task.id) ?? [],
    }));

    return NextResponse.json({ data: hydratedTasks });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 });
  }
}
