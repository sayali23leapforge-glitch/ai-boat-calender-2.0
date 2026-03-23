import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { requireAuthedUser } from "@/lib/api-auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const admin = getSupabaseAdminClient();

    const { data: goals, error: goalsError } = await admin
      .from("goals")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (goalsError) {
      return NextResponse.json({ error: `Failed to fetch goals: ${goalsError.message}` }, { status: 500 });
    }

    if (!goals || goals.length === 0) {
      return NextResponse.json({ goals: [] }, { status: 200 });
    }

    const goalIds = goals.map((g: any) => g.id);

    const { data: tasks, error: tasksError } = await admin
      .from("goal_tasks")
      .select("*")
      .in("goal_id", goalIds)
      .order("position", { ascending: true });

    if (tasksError) {
      return NextResponse.json({ error: `Failed to fetch goal tasks: ${tasksError.message}` }, { status: 500 });
    }

    const tasksByGoalId = (tasks || []).reduce<Record<string, any[]>>((acc, t: any) => {
      if (!acc[t.goal_id]) acc[t.goal_id] = [];
      acc[t.goal_id].push(t);
      return acc;
    }, {});

    const payload = goals.map((g: any) => ({
      ...g,
      tasks: tasksByGoalId[g.id] || [],
    }));

    return NextResponse.json({ goals: payload }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 401 });
  }
}
