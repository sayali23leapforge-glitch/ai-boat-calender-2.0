import { getSupabaseAdminClient } from "./supabase-admin";

export type TaskPriority = "critical" | "high" | "medium" | "low";

const VALID_CATEGORIES = new Set([
  "assignment",
  "exam",
  "meeting",
  "deadline",
  "milestone",
  "other",
]);

function normalizeCategory(raw: string | null | undefined): string {
  if (!raw) return "other";
  const lower = raw.toLowerCase();
  if (VALID_CATEGORIES.has(lower)) return lower;
  if (lower.includes("meet") || lower.includes("call") || lower.includes("interview")) return "meeting";
  if (lower.includes("exam") || lower.includes("test") || lower.includes("quiz")) return "exam";
  if (lower.includes("dead") || lower.includes("due")) return "deadline";
  if (lower.includes("assign") || lower.includes("homework")) return "assignment";
  return "other";
}

function normalizePriority(raw: string | null | undefined): string {
  const valid = new Set(["critical", "high", "medium", "low"]);
  if (raw && valid.has(raw.toLowerCase())) return raw.toLowerCase() as TaskPriority;
  return "medium";
}

export async function serverCreateTask(userId: string, args: {
  title: string;
  notes?: string;
  dueDate?: string;
  dueTime?: string;
  priority?: TaskPriority;
  goal?: string;
  estimatedHours?: number;
  location?: string;
  listName?: string;
}) {
  const admin = getSupabaseAdminClient();
  const listName = args.listName || "Quick Tasks";

  // 1. Resolve or create list
  const { data: list } = await admin
    .from("task_lists")
    .select("id")
    .eq("user_id", userId)
    .eq("name", listName)
    .maybeSingle();

  let listId = list?.id;
  if (!listId) {
    const { data: newList, error: listErr } = await admin
      .from("task_lists")
      .insert({ user_id: userId, name: listName, color: "#3b82f6" })
      .select("id")
      .single();
    if (listErr) throw new Error(`List creation failed: ${listErr.message}`);
    listId = newList.id;
  }

  // 2. Compute position
  const { data: existing } = await admin
    .from("tasks")
    .select("position")
    .eq("list_id", listId)
    .order("position", { ascending: false })
    .limit(1);
  const nextPosition = existing?.length ? (existing[0].position ?? 0) + 1 : 0;

  // 3. Insert task
  const { data: task, error: taskErr } = await admin
    .from("tasks")
    .insert({
      user_id: userId,
      list_id: listId,
      title: args.title,
      notes: args.notes || "",
      due_date: args.dueDate || null,
      due_time: args.dueTime || null,
      priority: normalizePriority(args.priority),
      estimated_hours: args.estimatedHours ?? null,
      goal: args.goal || null,
      location: args.location || null,
      position: nextPosition,
      is_completed: false,
      is_starred: false,
      progress: 0,
      metadata: {},
    })
    .select()
    .single();

  if (taskErr) throw new Error(`Task creation failed: ${taskErr.message}`);
  return task;
}

export async function serverCreateEvent(userId: string, args: {
  title: string;
  description?: string;
  date: string;
  time?: string;
  endTime?: string;
  location?: string;
  category?: string;
  priority?: TaskPriority;
}) {
  const admin = getSupabaseAdminClient();

  const { data: event, error: eventErr } = await admin
    .from("calendar_events")
    .insert({
      user_id: userId,
      title: args.title,
      description: args.description || null,
      event_date: args.date,
      start_time: args.time ? `${args.time.slice(0, 5)}:00` : null,
      end_time: args.endTime ? `${args.endTime.slice(0, 5)}:00` : null,
      location: args.location || null,
      category: normalizeCategory(args.category),
      priority: normalizePriority(args.priority),
      source: "manual",
      is_completed: false,
    })
    .select()
    .single();

  if (eventErr) {
    console.error(`[serverCreateEvent] DB Error:`, eventErr);
    throw new Error(`Event creation failed: ${eventErr.message}`);
  }
  
  return event;
}

export async function serverCreateGoal(userId: string, args: {
  title: string;
  description?: string;
  targetDate?: string;
  metric?: string;
}) {
  const admin = getSupabaseAdminClient();

  const { data: goal, error: goalErr } = await admin
    .from("goals")
    .insert({
      user_id: userId,
      title: args.title,
      description: args.description || null,
      target_date: args.targetDate || null,
      metric: args.metric || null,
      progress: 0,
    })
    .select()
    .single();

  if (goalErr) throw new Error(`Goal creation failed: ${goalErr.message}`);
  return goal;
}