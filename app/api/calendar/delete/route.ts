import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const eventId: string | undefined = body?.eventId;

    if (!eventId) return NextResponse.json({ error: "Missing eventId" }, { status: 400 });

    const admin = getSupabaseAdminClient();

    const { error } = await admin.from("calendar_events").delete().eq("id", eventId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 });
  }
}
