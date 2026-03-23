import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");
    const listId = url.searchParams.get("listId");
    const isStarred = url.searchParams.get("isStarred");
    const isCompleted = url.searchParams.get("isCompleted");

    if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

    const admin = getSupabaseAdminClient();

    let query = admin
      .from("tasks")
      .select("*")
      .eq("user_id", userId);

    if (listId) query = query.eq("list_id", listId);
    if (isStarred === "true") query = query.eq("is_starred", true);
    if (isStarred === "false") query = query.eq("is_starred", false);
    if (isCompleted === "true") query = query.eq("is_completed", true);
    if (isCompleted === "false") query = query.eq("is_completed", false);

    const { data, error } = await query.order("position", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 });
  }
}
