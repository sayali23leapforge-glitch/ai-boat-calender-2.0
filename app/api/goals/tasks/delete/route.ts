import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { requireAuthedUser } from "@/lib/api-auth";
import { updateGoalProgress } from "@/lib/goal-progress";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const admin = getSupabaseAdminClient();

    const body = await req.json().catch(() => ({}));
    const taskId = String(body?.taskId || "").trim();

    if (!taskId) return NextResponse.json({ error: "taskId is required" }, { status: 400 });

    // Fetch task to find goal_id
    const { data: task, error: taskFetchErr } = await admin
      .from("goal_tasks")
      .select("id, goal_id")
      .eq("id", taskId)
      .single();

    if (taskFetchErr || !task) return NextResponse.json({ error: "Goal task not found" }, { status: 404 });

    // Verify goal belongs to user
    const { data: goal, error: goalErr } = await admin
      .from("goals")
      .select("id,user_id")
      .eq("id", task.goal_id)
      .single();

    if (goalErr || !goal) return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    if (goal.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { error: delErr } = await admin.from("goal_tasks").delete().eq("id", taskId);
    if (delErr) {
      return NextResponse.json({ error: `Failed to delete goal task: ${delErr.message}` }, { status: 500 });
    }

    await updateGoalProgress(task.goal_id);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 401 });
  }
}
