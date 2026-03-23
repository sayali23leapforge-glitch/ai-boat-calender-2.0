import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const { blooNumber } = await req.json();

    if (!blooNumber) {
      return NextResponse.json({ error: "Bloo number required" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
    );

    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user?.id) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    const admin = getSupabaseAdminClient();

    // Normalize Bloo number - remove all spaces
    let normalizedNumber = String(blooNumber).trim().replace(/\s+/g, "");
    
    console.log("[BlooSave] Saving Bloo number:", normalizedNumber, "for user:", user.id);

    // Update with select to get back the updated row
    const { data: updated, error } = await admin
      .from("user_profiles")
      .update({ bloo_bound_number: normalizedNumber })
      .eq("user_id", user.id)
      .select("bloo_bound_number");

    if (error) {
      console.error("[BlooSave] Error:", error.message);
      
      // Bloo number can be shared, so no unique constraint error expected
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!updated || updated.length === 0) {
      console.error("[BlooSave] No rows updated! User might not exist.");
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    const savedNumber = updated[0].bloo_bound_number;
    console.log("[BlooSave] Success! Saved Bloo number:", savedNumber);

    return NextResponse.json({ success: true, blooNumber: savedNumber });

  } catch (error) {
    console.error("[BlooSave] Exception:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const token = authHeader.substring(7);

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
    );

    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user?.id) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    const admin = getSupabaseAdminClient();

    const { data: profile, error } = await admin
      .from("user_profiles")
      .select("bloo_bound_number")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("[BlooGet] Error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { success: true, blooNumber: profile?.bloo_bound_number || null },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        }
      }
    );

  } catch (error) {
    console.error("[BlooGet] Exception:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error" },
      { status: 500 }
    );
  }
}
