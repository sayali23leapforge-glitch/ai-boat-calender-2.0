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
    const updates = body?.updates;

    if (!taskId) return NextResponse.json({ error: "taskId is required" }, { status: 400 });
    if (!updates || typeof updates !== "object") {
      return NextResponse.json({ error: "updates object is required" }, { status: 400 });
    }

    // Fetch task to find goal_id
    const { data: existingTask, error: taskFetchErr } = await admin
      .from("goal_tasks")
      .select("id, goal_id")
      .eq("id", taskId)
      .single();

    if (taskFetchErr || !existingTask) return NextResponse.json({ error: "Goal task not found" }, { status: 404 });

    // Verify goal belongs to user
    const { data: goal, error: goalErr } = await admin
      .from("goals")
      .select("id,user_id")
      .eq("id", existingTask.goal_id)
      .single();

    if (goalErr || !goal) return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    if (goal.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Only allow safe task fields - try with all first
    const allowed: Record<string, any> = {};
    const allowKeys = ["title", "completed", "priority", "due_date", "estimated_hours"];
    for (const k of allowKeys) {
      if (updates[k] !== undefined) allowed[k] = updates[k];
    }

    let { data, error } = await admin
      .from("goal_tasks")
      .update(allowed)
      .eq("id", taskId)
      .select()
      .single();

    // If error is about missing column, retry with minimal fields
    if (error && error.message.includes("could not find")) {
      console.log("Full update failed, trying minimal update:", error.message);
      
      // Just update title if provided
      const minimalAllowed: Record<string, any> = {};
      if (updates.title !== undefined) minimalAllowed.title = updates.title;
      
      if (Object.keys(minimalAllowed).length === 0) {
        // Nothing to update
        return NextResponse.json({ task: existingTask }, { status: 200 });
      }

      const { data: minData, error: minError } = await admin
        .from("goal_tasks")
        .update(minimalAllowed)
        .eq("id", taskId)
        .select()
        .single();

      if (minError) {
        return NextResponse.json({ error: `Failed to update goal task: ${minError.message}` }, { status: 500 });
      }

      data = minData;
      error = null;
    }

    if (error) {
      return NextResponse.json({ error: `Failed to update goal task: ${error.message}` }, { status: 500 });
    }

    // Recompute progress if completion changed (or generally after update; safe)
    await updateGoalProgress(existingTask.goal_id);

    return NextResponse.json({ task: data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 401 });
  }
}
