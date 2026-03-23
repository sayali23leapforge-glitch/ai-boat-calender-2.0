import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const listId: string | undefined = body?.listId;

    if (!listId) {
      return NextResponse.json({ error: "Missing listId" }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();

    const { error } = await admin.from("task_lists").delete().eq("id", listId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 });
  }
}
