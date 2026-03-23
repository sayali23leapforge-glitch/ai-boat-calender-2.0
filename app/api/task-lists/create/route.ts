import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userId: string | undefined = body?.userId;
    const name: string | undefined = body?.name;
    const color: string = body?.color || "#3b82f6";

    if (!userId || !name) {
      return NextResponse.json({ error: "Missing userId or name" }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();

    // compute next position
    const { data: existing } = await admin
      .from("task_lists")
      .select("position")
      .eq("user_id", userId)
      .order("position", { ascending: false })
      .limit(1);

    const nextPosition =
      existing && existing.length > 0 ? (existing[0].position ?? 0) + 1 : 0;

    const { data, error } = await admin
      .from("task_lists")
      .insert({
        user_id: userId,
        name,
        color,
        position: nextPosition,
        is_visible: true,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 });
  }
}
