import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export async function updateGoalProgress(goalId: string) {
  const admin = getSupabaseAdminClient();

  const { data: tasks, error } = await admin
    .from("goal_tasks")
    .select("completed")
    .eq("goal_id", goalId);

  if (error) {
    throw new Error(`Failed to compute goal progress: ${error.message}`);
  }

  if (!tasks || tasks.length === 0) {
    const { error: updErr } = await admin.from("goals").update({ progress: 0 }).eq("id", goalId);
    if (updErr) throw new Error(`Failed to update goal progress: ${updErr.message}`);
    return;
  }

  const completedCount = tasks.filter((t: any) => t.completed).length;
  const progress = Math.round((completedCount / tasks.length) * 100);

  const { error: updErr } = await admin.from("goals").update({ progress }).eq("id", goalId);
  if (updErr) throw new Error(`Failed to update goal progress: ${updErr.message}`);
}
