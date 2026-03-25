import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { requireAuthedUser } from "@/lib/api-auth";
import { queueGoalGmailReminders } from "@/lib/reminders";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const admin = getSupabaseAdminClient();

    const body = await req.json().catch(() => ({}));
    const goalId = String(body?.goalId || "").trim();
    const updates = body?.updates;

    if (!goalId) return NextResponse.json({ error: "goalId is required" }, { status: 400 });
    if (!updates || typeof updates !== "object") {
      return NextResponse.json({ error: "updates object is required" }, { status: 400 });
    }

    // Ensure goal belongs to user
    const { data: existing, error: fetchErr } = await admin
      .from("goals")
      .select("id,user_id")
      .eq("id", goalId)
      .single();

    if (fetchErr || !existing) return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    if (existing.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Only allow safe fields
    const allowed: Record<string, any> = {};
    const allowKeys = ["title", "description", "category", "priority", "progress", "target_date"];
    for (const k of allowKeys) {
      if (updates[k] !== undefined) allowed[k] = updates[k];
    }

    const { data, error } = await admin
      .from("goals")
      .update(allowed)
      .eq("id", goalId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: `Failed to update goal: ${error.message}` }, { status: 500 });
    }

    if (data?.id && data?.user_id) {
      try {
        await admin
          .from("reminders")
          .delete()
          .eq("entity_type", "GOAL")
          .eq("entity_id", data.id)
          .in("status", ["PENDING", "PROCESSING", "FAILED"]);

        await queueGoalGmailReminders({
          admin,
          userId: data.user_id,
          goalId: data.id,
          title: String(data.title || ""),
          description: String(data.description || ""),
          targetDate: data.target_date || null,
          clientTimezone: String(body?.timezone || "UTC"),
          priority: data.priority || null,
        });
      } catch (reminderError) {
        console.error("Failed to refresh timeline alerts for goal update:", reminderError);
      }
    }

    return NextResponse.json({ goal: data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 401 });
  }
}
