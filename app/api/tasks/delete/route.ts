import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const taskId: string | undefined = body?.taskId;

    if (!taskId) return NextResponse.json({ error: "Missing taskId" }, { status: 400 });

    const admin = getSupabaseAdminClient();

    const { error } = await admin.from("tasks").delete().eq("id", taskId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 });
  }
}
