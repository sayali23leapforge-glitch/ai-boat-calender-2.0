import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

/**
 * Reads rows from `tasks` only. No text/ILIKE search on this table — list name
 * filtering belongs to GET /api/task-lists/get (`nameSearch` on `task_lists.name`).
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");
    const listId = url.searchParams.get("listId");
    const listIdsRaw = url.searchParams.get("listIds")?.trim() ?? "";
    const isStarred = url.searchParams.get("isStarred");
    const isCompleted = url.searchParams.get("isCompleted");

    if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

    const admin = getSupabaseAdminClient();

    let query = admin
      .from("tasks")
      .select("*")
      .eq("user_id", userId);

    const listIds = listIdsRaw
      ? listIdsRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    if (listIds.length > 0) {
      query = query.in("list_id", listIds);
    } else if (listId) {
      query = query.eq("list_id", listId);
    }
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
