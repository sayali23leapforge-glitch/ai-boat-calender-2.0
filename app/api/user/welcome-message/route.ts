import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const BLOO_API_KEY = process.env.BLOO_API_KEY;
const BLOO_ORGANIZATION_ID = process.env.BLOO_ORGANIZATION_ID;

export async function POST(req: NextRequest) {
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

    const welcomeMessage = `Welcome to Calendar App! 🚀 Your calendar is now linked to this number.

To create a task, just text me something like:
• 'Remind me to call the team tomorrow at 10am' — creates a task
• 'Set a goal to run 5 miles' — creates a goal  
• 'Meeting tomorrow at 3pm' — creates an event

What's on your mind today?`;

    console.log("[WelcomeMsg] Sending welcome message to:", phone);

    // Try to send via Bloo API
    if (BLOO_API_KEY) {
      try {
        console.log("[WelcomeMsg] Attempting to send via Bloo API...");

        // Normalize phone for Bloo API
        const normalizedPhone = phone.replace(/\s+/g, "").replace(/[^\d+]/g, "");

        // Set up timeout using AbortController
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), 15000);

        // Use correct Blooio v2 endpoint
        const blooResponse = await fetch(`https://backend.blooio.com/v2/api/chats/${normalizedPhone}/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${BLOO_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: welcomeMessage,
          }),
          signal: abortController.signal,
        });

        clearTimeout(timeoutId);

        if (blooResponse.ok) {
          const blooData = await blooResponse.json();
          console.log("[WelcomeMsg] Successfully sent via Bloo:", blooData);
          
          return NextResponse.json({
            success: true,
            message: "Welcome message sent to your phone!",
            sent: true,
            welcomeMessage,
          });
        } else {
          const errorData = await blooResponse.text();
          console.log("[WelcomeMsg] Bloo API error:", errorData);
          
          // Try fallback SMS service if Bloo fails
          if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
            console.log("[WelcomeMsg] Trying Twilio SMS fallback...");
            return sendViaTwilio(phone, welcomeMessage);
          }
        }
      } catch (blooError) {
        console.error("[WelcomeMsg] Bloo API error:", blooError);
        
        // Try Twilio as fallback
        if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
          console.log("[WelcomeMsg] Trying Twilio SMS fallback...");
          return sendViaTwilio(phone, welcomeMessage);
        }
      }
    } else if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      // Use Twilio directly
      console.log("[WelcomeMsg] Using Twilio SMS...");
      return sendViaTwilio(phone, welcomeMessage);
    }

    // If no service is configured, just return the message content
    console.log("[WelcomeMsg] No messaging service configured. Message content:");
    console.log(welcomeMessage);

    return NextResponse.json({
      success: true,
      message: "Welcome message ready (no service configured for sending)",
      sent: false,
      welcomeMessage,
      note: "Configure BLOO_API_KEY or TWILIO credentials to enable SMS sending",
    });

  } catch (error) {
    console.error("[WelcomeMsg] Exception:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error" },
      { status: 500 }
    );
  }
}

async function sendViaTwilio(phone: string, message: string): Promise<NextResponse> {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      console.log("[WelcomeMsg] Twilio credentials incomplete");
      return NextResponse.json({
        success: false,
        message: "Twilio not configured",
        sent: false,
      });
    }

    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        From: fromNumber,
        To: phone,
        Body: message,
      }).toString(),
    });

    if (response.ok) {
      const data = await response.json();
      console.log("[WelcomeMsg] Successfully sent via Twilio:", data.sid);

      return NextResponse.json({
        success: true,
        message: "Welcome message sent!",
        sent: true,
      });
    } else {
      const error = await response.json();
      console.error("[WelcomeMsg] Twilio error:", error);

      return NextResponse.json({
        success: false,
        message: "Failed to send message",
        sent: false,
        error: error,
      });
    }
  } catch (error) {
    console.error("[WelcomeMsg] Twilio exception:", error);
    return NextResponse.json({
      success: false,
      message: "Error sending message",
      sent: false,
    });
  }
}
