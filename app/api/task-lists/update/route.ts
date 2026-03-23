import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const listId: string | undefined = body?.listId;
    const updates = body?.updates ?? null;

    if (!listId || !updates || typeof updates !== "object") {
      return NextResponse.json({ error: "Missing listId or updates" }, { status: 400 });
    }

    const allowed: Record<string, any> = {};
    if (updates.name !== undefined) allowed.name = updates.name;
    if (updates.color !== undefined) allowed.color = updates.color;
    if (updates.is_visible !== undefined) allowed.is_visible = updates.is_visible;
    if (updates.position !== undefined) allowed.position = updates.position;

    const admin = getSupabaseAdminClient();

    const { data, error } = await admin
      .from("task_lists")
      .update(allowed)
      .eq("id", listId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 });
  }
}
