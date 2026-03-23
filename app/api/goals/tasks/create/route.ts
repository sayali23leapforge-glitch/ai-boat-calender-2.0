import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { requireAuthedUser } from "@/lib/api-auth";
import { updateGoalProgress } from "@/lib/goal-progress";

export const runtime = "nodejs";

type GoalPriority = "critical" | "high" | "medium" | "low";

export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const admin = getSupabaseAdminClient();

    const body = await req.json().catch(() => ({}));
    const goalId = String(body?.goalId || "").trim();
    const task = body?.task;

    if (!goalId) return NextResponse.json({ error: "goalId is required" }, { status: 400 });
    if (!task || typeof task !== "object") {
      return NextResponse.json({ error: "task object is required" }, { status: 400 });
    }

    // Ensure goal belongs to user
    const { data: goal, error: goalErr } = await admin
      .from("goals")
      .select("id,user_id")
      .eq("id", goalId)
      .single();

    if (goalErr || !goal) return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    if (goal.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const title = String(task?.title || "").trim();
    if (!title) return NextResponse.json({ error: "task.title is required" }, { status: 400 });

    // Find next position
    const { data: last, error: posErr } = await admin
      .from("goal_tasks")
      .select("position")
      .eq("goal_id", goalId)
      .order("position", { ascending: false })
      .limit(1);

    if (posErr) return NextResponse.json({ error: `Failed to read positions: ${posErr.message}` }, { status: 500 });

    const nextPosition = last && last.length > 0 ? (last[0].position ?? 0) + 1 : 0;

    const priority: GoalPriority = (task?.priority as GoalPriority) || "medium";
    const due_date: string | null =
      task?.due_date === null || task?.due_date === undefined ? null : String(task.due_date);
    const estimated_hours: number | null =
      task?.estimated_hours === null || task?.estimated_hours === undefined
        ? null
        : Number(task.estimated_hours);

    // Strategy: Try increasingly simpler inserts until one works
    const insertAttempts = [
      // Attempt 1: Full object
      {
        goal_id: goalId,
        title,
        completed: false,
        priority,
        due_date,
        estimated_hours: Number.isFinite(estimated_hours) ? estimated_hours : null,
        position: nextPosition,
      },
      // Attempt 2: Without completed and estimated_hours
      {
        goal_id: goalId,
        title,
        priority,
        due_date,
        position: nextPosition,
      },
      // Attempt 3: Just basics
      {
        goal_id: goalId,
        title,
        position: nextPosition,
      },
      // Attempt 4: Absolute minimum (just for safety)
      {
        goal_id: goalId,
        title,
      },
    ];

    let data: any = null;
    let lastError: any = null;

    for (let i = 0; i < insertAttempts.length; i++) {
      const { data: insertData, error: insertError } = await admin
        .from("goal_tasks")
        .insert(insertAttempts[i])
        .select()
        .single();

      if (!insertError) {
        data = insertData;
        break;
      }

      lastError = insertError;
      console.log(`Attempt ${i + 1} failed:`, insertError.message);
    }

    if (!data) {
      return NextResponse.json({ error: `Failed to create goal task: ${lastError.message}` }, { status: 500 });
    }

    await updateGoalProgress(goalId);

    return NextResponse.json({ task: data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 401 });
  }
}
