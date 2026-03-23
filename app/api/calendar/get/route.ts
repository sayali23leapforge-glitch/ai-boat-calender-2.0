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
    return NextResponse.json({ data: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 });
  }
}
