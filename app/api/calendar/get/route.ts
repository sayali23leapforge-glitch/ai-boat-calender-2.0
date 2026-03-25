import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");

    if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

    const admin = getSupabaseAdminClient();

    let query = admin.from("calendar_events").select("*").eq("user_id", userId);
    if (startDate) query = query.gte("event_date", startDate);
    if (endDate) query = query.lte("event_date", endDate);

    const { data, error } = await query.order("event_date", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const events = data ?? [];
    if (!events.length) return NextResponse.json({ data: events });

    const eventIds = events.map((event) => event.id);
    const { data: reminders } = await admin
      .from("reminders")
      .select("entity_id, scheduled_at, status, sent_at, importance_level, alert_kind, metadata")
      .eq("user_id", userId)
      .eq("entity_type", "EVENT")
      .in("entity_id", eventIds)
      .order("scheduled_at", { ascending: true });

    const remindersByEvent = new Map<string, any[]>();
    for (const reminder of reminders ?? []) {
      const offsetRaw = reminder.metadata?.offset_minutes;
      const parsedOffset =
        typeof offsetRaw === "number"
          ? offsetRaw
          : typeof offsetRaw === "string"
          ? Number(offsetRaw)
          : null;

      const eventReminder = {
        scheduled_at: reminder.scheduled_at,
        status: reminder.status,
        sent_at: reminder.sent_at,
        importance_level: reminder.importance_level,
        offset_minutes: Number.isFinite(parsedOffset as number) ? parsedOffset : null,
        alert_kind: reminder.alert_kind ?? null,
      };

      const current = remindersByEvent.get(reminder.entity_id) ?? [];
      current.push(eventReminder);
      remindersByEvent.set(reminder.entity_id, current);
    }

    const hydratedEvents = events.map((event) => ({
      ...event,
      reminder_schedule: remindersByEvent.get(event.id) ?? [],
    }));

    return NextResponse.json({ data: hydratedEvents });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 });
  }
}
