import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

/** Escape `%`, `_`, `\` for PostgreSQL ILIKE patterns on `task_lists.name`. */
function escapeLikePattern(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * List rows from `task_lists` only. Optional `nameSearch` filters `task_lists.name`
 * (ILIKE). Task body text is not queried here — use GET /api/tasks/get with listId/listIds.
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");
    const nameSearchRaw =
      url.searchParams.get("nameSearch")?.trim() ??
      url.searchParams.get("search")?.trim() ??
      "";

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();

    let query = admin.from("task_lists").select("*").eq("user_id", userId);

    const nameSearch = nameSearchRaw.replace(/,/g, " ").trim();
    if (nameSearch.length > 0) {
      if (nameSearch.length > 200) {
        return NextResponse.json({ error: "nameSearch too long (max 200)" }, { status: 400 });
      }
      const pattern = `%${escapeLikePattern(nameSearch)}%`;
      query = query.ilike("name", pattern);
    }

    query = query.order("position", { ascending: true });

    const limitRaw = url.searchParams.get("limit");
    const offsetRaw = url.searchParams.get("offset");

    if (limitRaw != null && limitRaw !== "") {
      const pageSize = Math.min(100, Math.max(1, parseInt(limitRaw, 10) || 25));
      const offset = Math.max(0, parseInt(offsetRaw || "0", 10));
      const take = pageSize + 1;
      const { data, error } = await query.range(offset, offset + take - 1);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const rows = data ?? [];
      const hasMore = rows.length > pageSize;
      const page = hasMore ? rows.slice(0, pageSize) : rows;

      return NextResponse.json({ data: page, hasMore, offset, limit: pageSize });
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [], hasMore: false });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 });
  }
}
