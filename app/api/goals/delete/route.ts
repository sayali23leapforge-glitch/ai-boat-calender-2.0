import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { requireAuthedUser } from "@/lib/api-auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const admin = getSupabaseAdminClient();

    const body = await req.json().catch(() => ({}));
    const goalId = String(body?.goalId || "").trim();

    if (!goalId) return NextResponse.json({ error: "goalId is required" }, { status: 400 });

    const { data: existing, error: fetchErr } = await admin
      .from("goals")
      .select("id,user_id")
      .eq("id", goalId)
      .single();

    if (fetchErr || !existing) return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    if (existing.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // delete tasks first (safe even if none)
    const { error: tasksDelErr } = await admin.from("goal_tasks").delete().eq("goal_id", goalId);
    if (tasksDelErr) {
      return NextResponse.json({ error: `Failed to delete goal tasks: ${tasksDelErr.message}` }, { status: 500 });
    }

    const { error: goalDelErr } = await admin.from("goals").delete().eq("id", goalId);
    if (goalDelErr) {
      return NextResponse.json({ error: `Failed to delete goal: ${goalDelErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 401 });
  }
}
