import { supabase } from "./supabase";

export type GoalCategory = "work" | "personal" | "health" | "learning";
export type GoalPriority = "critical" | "high" | "medium" | "low";

export type Goal = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  category: GoalCategory;
  priority: GoalPriority;
  progress: number;
  target_date: string | null;
  created_at: string;
  updated_at: string;
};

export type GoalTask = {
  id: string;
  goal_id: string;
  title: string;
  completed: boolean;
  priority: GoalPriority;
  due_date: string | null;
  estimated_hours: number | null;
  position: number;
  created_at: string;
  updated_at: string;
};

export type GoalWithTasks = Goal & {
  tasks: GoalTask[];
};

async function getAccessTokenOrThrow(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const token = data?.session?.access_token;
  if (!token) throw new Error("Not signed in");
  return token;
}

async function apiFetch<T>(
  url: string,
  options: { method?: string; body?: any } = {}
): Promise<T> {
  const token = await getAccessTokenOrThrow();

  const res = await fetch(url, {
    method: options.method || "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(json?.error || `Request failed: ${res.status}`);
  }

  return json as T;
}

/**
 * NOTE:
 * We move Goals + GoalTasks reads/writes to server routes that use Service Role,
 * because client anon is blocked by Supabase RLS.
 *
 * Required routes:
 * - POST /api/goals/get
 * - POST /api/goals/create
 * - POST /api/goals/update
 * - POST /api/goals/delete
 * - POST /api/goals/tasks/create
 * - POST /api/goals/tasks/update
 * - POST /api/goals/tasks/delete
 */

export async function getGoals(userId: string): Promise<GoalWithTasks[]> {
  // userId kept for backward compatibility, but server will derive user from token
  const out = await apiFetch<{ goals: GoalWithTasks[] }>("/api/goals/get", {
    body: { userId },
  });
  return out.goals || [];
}

export async function createGoal(
  userId: string,
  goal: {
    title: string;
    description?: string;
    category?: GoalCategory;
    priority?: GoalPriority;
    target_date?: string | null;
  }
): Promise<Goal> {
  const out = await apiFetch<{ goal: Goal }>("/api/goals/create", {
    body: { userId, ...goal },
  });
  return out.goal;
}

export async function updateGoal(
  goalId: string,
  updates: Partial<
    Pick<Goal, "title" | "description" | "category" | "priority" | "progress" | "target_date">
  >
): Promise<Goal> {
  const out = await apiFetch<{ goal: Goal }>("/api/goals/update", {
    body: { goalId, updates },
  });
  return out.goal;
}

export async function deleteGoal(goalId: string): Promise<void> {
  await apiFetch<{ ok: true }>("/api/goals/delete", {
    body: { goalId },
  });
}

export async function createGoalTask(
  goalId: string,
  task: {
    title: string;
    priority?: GoalPriority;
    due_date?: string | null;
    estimated_hours?: number | null;
  }
): Promise<GoalTask> {
  const out = await apiFetch<{ task: GoalTask }>("/api/goals/tasks/create", {
    body: { goalId, task },
  });
  return out.task;
}

export async function updateGoalTask(
  taskId: string,
  updates: Partial<Pick<GoalTask, "title" | "completed" | "priority" | "due_date" | "estimated_hours">>
): Promise<GoalTask> {
  const out = await apiFetch<{ task: GoalTask }>("/api/goals/tasks/update", {
    body: { taskId, updates },
  });
  return out.task;
}

export async function deleteGoalTask(taskId: string): Promise<void> {
  await apiFetch<{ ok: true }>("/api/goals/tasks/delete", {
    body: { taskId },
  });
}
