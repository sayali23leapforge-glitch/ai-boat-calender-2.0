import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const eventId: string | undefined = body?.eventId;
    const updates = body?.updates ?? null;

    if (!eventId || !updates || typeof updates !== "object") {
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
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 });
  }
}
