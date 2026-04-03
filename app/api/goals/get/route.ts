import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { requireAuthedUser } from "@/lib/api-auth";

export const runtime = "nodejs";

/** Escape `%`, `_`, `\` for PostgreSQL ILIKE patterns. */
function escapeLikePattern(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

const VALID_CATEGORIES = new Set(["work", "personal", "health", "learning"]);
const VALID_PRIORITIES = new Set(["critical", "high", "medium", "low"]);

type GoalRow = Record<string, unknown>;
type SupabaseAdmin = ReturnType<typeof getSupabaseAdminClient>;

/**
 * Base query: user goals, optional category, priority, search (title + description ILIKE).
 */
function goalsQueryForUser(
  admin: SupabaseAdmin,
  userId: string,
  body: Record<string, unknown>
) {
  let q = admin.from("goals").select("*").eq("user_id", userId);

  const cat = typeof body.category === "string" ? body.category.trim() : "";
  if (cat && VALID_CATEGORIES.has(cat)) {
    q = q.eq("category", cat);
  }

  const pri = typeof body.priority === "string" ? body.priority.trim() : "";
  if (pri && VALID_PRIORITIES.has(pri)) {
    q = q.eq("priority", pri);
  }

  const rawSearch = typeof body.search === "string" ? body.search.trim() : "";
  if (rawSearch.length > 0) {
    if (rawSearch.length > 200) {
      throw new Error("search too long (max 200)");
    }
    // Commas break PostgREST `or()` parsing — normalize for the filter string.
    const normalized = rawSearch.replace(/,/g, " ");
    const pattern = `%${escapeLikePattern(normalized)}%`;
    q = q.or(`title.ilike.${pattern},description.ilike.${pattern}`);
  }

  return q.order("created_at", { ascending: false });
}

async function attachTasksToGoals(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  goals: GoalRow[]
): Promise<any[]> {
  if (!goals || goals.length === 0) {
    return [];
  }

  const goalIds = goals.map((g: any) => g.id);

  const { data: tasks, error: tasksError } = await admin
    .from("goal_tasks")
    .select("*")
    .in("goal_id", goalIds)
    .order("position", { ascending: true });

  if (tasksError) {
    throw new Error(`Failed to fetch goal tasks: ${tasksError.message}`);
  }

  const tasksByGoalId = (tasks || []).reduce<Record<string, any[]>>((acc, t: any) => {
    if (!acc[t.goal_id]) acc[t.goal_id] = [];
    acc[t.goal_id].push(t);
    return acc;
  }, {});

  return goals.map((g: any) => ({
    ...g,
    tasks: tasksByGoalId[g.id] || [],
  }));
}

export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const admin = getSupabaseAdminClient();

    const body = await req.json().catch(() => ({}));
    const goalId = typeof body.goalId === "string" ? body.goalId.trim() : "";

    /** Single goal + tasks (e.g. refresh after task mutation without full list). */
    if (goalId) {
      const { data: goal, error: gErr } = await admin
        .from("goals")
        .select("*")
        .eq("id", goalId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (gErr) {
        return NextResponse.json({ error: `Failed to fetch goal: ${gErr.message}` }, { status: 500 });
      }
      if (!goal) {
        return NextResponse.json({ error: "Goal not found" }, { status: 404 });
      }

      const [withTasks] = await attachTasksToGoals(admin, [goal as GoalRow]);
      return NextResponse.json({ goal: withTasks }, { status: 200 });
    }

    const limitRaw = body.limit;
    const offsetRaw = body.offset;
    const hasPagination = limitRaw != null && limitRaw !== "";

    if (!hasPagination) {
      let listQuery = goalsQueryForUser(admin, user.id, body);
      const { data: goals, error: goalsError } = await listQuery;

      if (goalsError) {
        return NextResponse.json({ error: `Failed to fetch goals: ${goalsError.message}` }, { status: 500 });
      }

      if (!goals || goals.length === 0) {
        return NextResponse.json({ goals: [] }, { status: 200 });
      }

      const payload = await attachTasksToGoals(admin, goals as GoalRow[]);
      return NextResponse.json({ goals: payload }, { status: 200 });
    }

    const pageSize = Math.min(100, Math.max(1, parseInt(String(limitRaw), 10) || 12));
    const offset = Math.max(0, parseInt(String(offsetRaw ?? "0"), 10) || 0);
    const take = pageSize + 1;

    const { data: goals, error: goalsError } = await goalsQueryForUser(admin, user.id, body).range(
      offset,
      offset + take - 1
    );

    if (goalsError) {
      return NextResponse.json({ error: `Failed to fetch goals: ${goalsError.message}` }, { status: 500 });
    }

    const rows = goals ?? [];
    const hasMore = rows.length > pageSize;
    const page = hasMore ? rows.slice(0, pageSize) : rows;

    const payload = page.length === 0 ? [] : await attachTasksToGoals(admin, page as GoalRow[]);

    return NextResponse.json(
      {
        goals: payload,
        hasMore,
        offset,
        limit: pageSize,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 401 });
  }
}
