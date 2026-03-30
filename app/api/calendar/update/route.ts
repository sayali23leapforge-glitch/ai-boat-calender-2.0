import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { queueEventGmailReminders, queueRelatedQuestionAlert } from "@/lib/reminders";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const eventId: string | undefined = body?.eventId;
    const updates = body?.updates ?? null;

    if (!eventId || !updates || typeof updates !== "object" || Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Missing eventId or updates" }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();

    const { data, error } = await admin
      .from("calendar_events")
      .update(updates)
      .eq("id", eventId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (data?.id && data?.user_id) {
      const tz = String(body?.timezone || "UTC");
      try {
        await admin
          .from("reminders")
          .delete()
          .eq("entity_type", "EVENT")
          .eq("entity_id", data.id)
          .in("status", ["PENDING", "PROCESSING", "FAILED"]);

        await queueEventGmailReminders({
          admin,
          userId: data.user_id,
          eventId: data.id,
          title: String(data.title || ""),
          description: String(data.description || ""),
          eventDate: data.event_date || null,
          startTime: data.start_time || null,
          clientTimezone: tz,
          priority: data.priority || null,
        });

        if (data.start_time && data.end_time) {
          const { data: overlaps } = await admin
            .from("calendar_events")
            .select("id,title,start_time,end_time")
            .eq("user_id", data.user_id)
            .eq("event_date", data.event_date)
            .neq("id", data.id)
            .not("start_time", "is", null)
            .not("end_time", "is", null)
            .lt("start_time", data.end_time)
            .gt("end_time", data.start_time)
            .limit(1);

          if ((overlaps || []).length > 0) {
            const conflict = overlaps![0];
            await queueRelatedQuestionAlert({
              admin,
              userId: data.user_id,
              entityType: "EVENT",
              entityId: data.id,
              title: String(data.title || "Event"),
              question: `This overlaps with "${conflict.title}". Want me to suggest better time windows?`,
              clientTimezone: tz,
            });
          }
        }
      } catch (reminderError) {
        console.error("Failed to refresh timeline alerts after event update:", reminderError);
      }
    }
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 });
  }
}
