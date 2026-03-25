import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { requireAuthedUser } from "@/lib/api-auth";
import { queueGoalGmailReminders } from "@/lib/reminders";

export const runtime = "nodejs";

type GoalCategory = "work" | "personal" | "health" | "learning";
type GoalPriority = "critical" | "high" | "medium" | "low";

export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const admin = getSupabaseAdminClient();

    const body = await req.json().catch(() => ({}));
    const title = String(body?.title || "").trim();

    if (!title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const description = typeof body?.description === "string" ? body.description : "";
    const category: GoalCategory = (body?.category as GoalCategory) || "personal";
    const priority: GoalPriority = (body?.priority as GoalPriority) || "medium";
    const target_date: string | null =
      body?.target_date === null || body?.target_date === undefined
        ? null
        : String(body.target_date);

    const { data, error } = await admin
      .from("goals")
      .insert({
        user_id: user.id,
        title,
        description,
        category,
        priority,
        progress: 0,
        target_date,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: `Failed to create goal: ${error.message}` }, { status: 500 });
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
          title: String(data.title || title),
          description: String(data.description || description),
          targetDate: data.target_date || null,
          clientTimezone: String(body?.timezone || "UTC"),
          priority: data.priority || priority,
        });
      } catch (reminderError) {
        console.error("Failed to queue timeline alerts for goal create:", reminderError);
      }
    }

    return NextResponse.json({ goal: data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 401 });
  }
}
