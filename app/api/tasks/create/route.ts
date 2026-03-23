import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const userId: string | undefined = body?.userId;
    const listId: string | undefined = body?.listId;
    const title: string | undefined = body?.title;
    const options = body?.options ?? {};

    if (!userId || !listId || !title) {
      return NextResponse.json({ error: "Missing userId, listId, or title" }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();

    // compute next position within list
    const { data: existing } = await admin
      .from("tasks")
      .select("position")
      .eq("list_id", listId)
      .order("position", { ascending: false })
      .limit(1);

    const nextPosition =
      existing && existing.length > 0 ? (existing[0].position ?? 0) + 1 : 0;

    // Build payload with only core columns that always exist
    const insertPayload: Record<string, any> = {
      user_id: userId,
      list_id: listId,
      title,
      notes: options?.notes || "",
      due_date: options?.dueDate || null,
      is_starred: options?.isStarred || false,
      position: nextPosition,
      is_completed: false,
      // Always include priority, due_time, progress, and metadata as defaults
      priority: options?.priority || "medium",
      due_time: options?.dueTime || null,
      progress: options?.progress ?? 0,
      metadata: options?.metadata ?? {},
    };

    // Add optional columns if they exist in the schema
    // These are from the migration that may not be applied yet
    if (options?.estimatedHours !== undefined) {
      insertPayload.estimated_hours = options.estimatedHours ?? null;
    }
    if (options?.goal !== undefined) {
      insertPayload.goal = options.goal || null;
    }
    if (options?.location !== undefined) {
      insertPayload.location = options.location || null;
    }

    const { data, error } = await admin
      .from("tasks")
      .insert(insertPayload)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 });
  }
}
