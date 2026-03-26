import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  classifyTaskImportance,
  mapImportanceLevelToPriority,
  queueTaskGmailReminders,
} from "@/lib/reminders";

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

    const importanceDecision = await classifyTaskImportance({
      admin,
      userId,
      title,
      notes: options?.notes || "",
      dueDate: options?.dueDate || null,
      dueTime: options?.dueTime || null,
    });

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
      priority: mapImportanceLevelToPriority(importanceDecision.level),
      due_time: options?.dueTime || null,
      progress: options?.progress ?? 0,
      metadata: {
        ...(options?.metadata ?? {}),
        client_timezone: options?.clientTimezone || "UTC",
        auto_importance_level: importanceDecision.level,
        auto_importance_reason: importanceDecision.reason,
        auto_importance_profile: importanceDecision.profile,
      },
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

    if (data?.id) {
      try {
        await queueTaskGmailReminders({
          admin,
          userId,
          taskId: data.id,
          title: String(data.title || title),
          notes: String(data.notes || options?.notes || ""),
          dueDate: data.due_date || options?.dueDate || null,
          dueTime: data.due_time || options?.dueTime || null,
          clientTimezone: options?.clientTimezone || "UTC",
          precomputedDecision: importanceDecision,
        });
      } catch (reminderError) {
        console.error("Failed to queue task reminders:", reminderError);
      }
    }

    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 });
  }
}
