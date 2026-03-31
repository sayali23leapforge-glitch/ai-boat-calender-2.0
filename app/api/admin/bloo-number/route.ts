/**
 * Admin Endpoint: Update Global Bloo Number
 * Updates the global Bloo number that all user profiles fetch
 * All profiles are auto-synced when this is updated
 */

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
      return NextResponse.json(
        { error: "Bloo number required" },
        { status: 400 }
      );
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

    console.log("[AdminBloo] 🔧 Admin updating global Bloo number to:", normalizedNumber);
    console.log("[AdminBloo] Updated by user:", user.id);

    // Check if global config exists
    const { data: existing } = await admin
      .from("app_config")
      .select("id")
      .eq("key", "global_bloo_number")
      .maybeSingle();

    let updated;
    let error;

    if (existing) {
      // Update existing global config
      const result = await admin
        .from("app_config")
        .update({ 
          bloo_number: normalizedNumber,
          updated_at: new Date().toISOString()
        })
        .eq("key", "global_bloo_number")
        .select("bloo_number");
      updated = result.data;
      error = result.error;
    } else {
      // Insert new global config
      const result = await admin
        .from("app_config")
        .insert({ 
          key: "global_bloo_number", 
          bloo_number: normalizedNumber,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select("bloo_number");
      updated = result.data;
      error = result.error;
    }

    if (error) {
      console.error("[AdminBloo] ❌ Error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!updated || updated.length === 0) {
      console.error("[AdminBloo] ❌ No rows updated!");
      return NextResponse.json(
        { error: "Failed to update global Bloo number" },
        { status: 500 }
      );
    }

    const savedNumber = updated[0].bloo_number;
    console.log("[AdminBloo] ✅ Global Bloo number updated:", savedNumber);
    console.log("[AdminBloo] 🔄 All user profiles will now see the new number on next refresh!");

    return NextResponse.json({
      success: true,
      blooNumber: savedNumber,
      message: "Global Bloo number updated. All user profiles will auto-sync on next load.",
    });

  } catch (error) {
    console.error("[AdminBloo] Exception:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error updating Bloo number" },
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

    const admin = getSupabaseAdminClient();

    console.log("[AdminBloo] 📋 Fetching current global Bloo number...");

    const { data: config, error } = await admin
      .from("app_config")
      .select("bloo_number, updated_at")
      .eq("key", "global_bloo_number")
      .maybeSingle();

    if (error) {
      console.error("[AdminBloo] Error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      blooNumber: config?.bloo_number || null,
      lastUpdated: config?.updated_at || null,
    });

  } catch (error) {
    console.error("[AdminBloo] Exception:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error fetching Bloo number" },
      { status: 500 }
    );
  }
}
