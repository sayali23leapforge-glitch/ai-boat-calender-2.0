import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

// List of columns that should always exist
const CORE_FIELDS = [
  "title",
  "notes",
  "due_date",
  "is_completed",
  "is_starred",
  "position",
  "list_id",
];

// List of optional columns added by migrations
const OPTIONAL_FIELDS = [
  "due_time",
  "priority",
  "estimated_hours",
  "progress",
  "goal",
  "location",
  "metadata",
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const taskId: string | undefined = body?.taskId;
    const updates = body?.updates ?? null;

    if (!taskId || !updates || typeof updates !== "object") {
      return NextResponse.json({ error: "Missing taskId or updates" }, { status: 400 });
    }

    // Only include fields that are allowed and defined
    const allowed: Record<string, any> = {};
    const fields = [...CORE_FIELDS, ...OPTIONAL_FIELDS];

    for (const f of fields) {
      if (updates[f] !== undefined) allowed[f] = updates[f];
    }

    const admin = getSupabaseAdminClient();

    const { data, error } = await admin
      .from("tasks")
      .update(allowed)
      .eq("id", taskId)
      .select()
      .single();

    if (error) {
      // If error mentions a missing column, try again with only core fields
      if (error.message && error.message.includes('column')) {
        const coreUpdates: Record<string, any> = {};
        for (const f of CORE_FIELDS) {
          if (allowed[f] !== undefined) coreUpdates[f] = allowed[f];
        }
        
        const { data: retryData, error: retryError } = await admin
          .from("tasks")
          .update(coreUpdates)
          .eq("id", taskId)
          .select()
          .single();
        
        if (retryError) {
          return NextResponse.json({ error: retryError.message }, { status: 500 });
        }
        return NextResponse.json({ data: retryData });
      }
      
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 });
  }
}
