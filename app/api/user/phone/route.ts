import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  console.log("[PhoneUpdate] Starting...");

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const { phone } = await req.json();

    if (!phone) {
      return NextResponse.json({ error: "Phone required" }, { status: 400 });
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

    // Normalize phone
    let normalizedPhone = String(phone).trim();
    if (/^\d+$/.test(normalizedPhone)) {
      if (normalizedPhone.length === 10) {
        normalizedPhone = "+91" + normalizedPhone;
      } else if (normalizedPhone.length === 12) {
        normalizedPhone = "+" + normalizedPhone;
      }
    }

    console.log("[PhoneUpdate] Saving phone:", normalizedPhone, "for user:", user.id);

    // Update with select to get back the updated row
    const { data: updated, error } = await admin
      .from("user_profiles")
      .update({ phone: normalizedPhone })
      .eq("user_id", user.id)
      .select("phone");

    if (error) {
      console.error("[PhoneUpdate] Error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Check if any rows were updated
    if (!updated || updated.length === 0) {
      console.error("[PhoneUpdate] No rows updated! User might not exist.");
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    const savedPhone = updated[0].phone;
    console.log("[PhoneUpdate] Success! Saved phone:", savedPhone);

    return NextResponse.json({ success: true, phone: savedPhone });

  } catch (error) {
    console.error("[PhoneUpdate] Exception:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error" },
      { status: 500 }
    );
  }
}
