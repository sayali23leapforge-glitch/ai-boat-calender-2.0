import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey, x-api-key",
};

// calendar_events.category CHECK constraint values
const VALID_CATEGORIES = new Set([
  "assignment",
  "exam",
  "meeting",
  "deadline",
  "milestone",
  "other",
]);

function normalizeCategory(raw: string | null | undefined): string {
  if (!raw) return "other";
  const lower = raw.toLowerCase();
  if (VALID_CATEGORIES.has(lower)) return lower;
  // Map common AI-returned categories to valid ones
  if (lower.includes("meet") || lower.includes("call") || lower.includes("interview")) return "meeting";
  if (lower.includes("exam") || lower.includes("test") || lower.includes("quiz")) return "exam";
  if (lower.includes("dead") || lower.includes("due")) return "deadline";
  if (lower.includes("assign") || lower.includes("homework")) return "assignment";
  return "other";
}

function normalizePriority(raw: string | null | undefined): string {
  const valid = new Set(["critical", "high", "medium", "low"]);
  if (raw && valid.has(raw.toLowerCase())) return raw.toLowerCase();
  return "medium";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Supabase verifies the JWT automatically before the function runs.
  // We only reject requests that have no Authorization header at all.
  if (!req.headers.get("Authorization")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body with fallback keys
    const rawBody = await req.json().catch(() => ({}));
    const user_id = (rawBody.user_id || rawBody.userId || rawBody.uid || "").toString().trim();
    const transcribed_text = (rawBody.transcribed_text || rawBody.text || "").toString().trim();

    console.log(`[voice-to-calendar] Received request for user: ${user_id}`);

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "user_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!transcribed_text) {
      return new Response(
        JSON.stringify({ error: "transcribed_text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Resolve Gemini API key ---
    let geminiApiKey = Deno.env.get("GEMINI_API_KEY");

    if (!geminiApiKey) {
      const { data: keyRow } = await supabase
        .from("api_keys")
        .select("api_key")
        .eq("service_name", "gemini")
        .maybeSingle();
      if (keyRow?.api_key) geminiApiKey = keyRow.api_key;
    }

    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({ error: "Gemini API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Delegate to the unified AI Bot (/api/chat) ---
    // This provides consistent parsing, conflict detection, and server-side execution.
    
    // Attempt to get context like timezone if possible, or use a default
    const tz = "Asia/Kolkata"; // Default shared with the rest of the app
    
    // We need the main app's URL. Prefer from env, or try to infer from request origin.
    let appUrl = Deno.env.get("PUBLIC_APP_URL") || Deno.env.get("NEXT_PUBLIC_SITE_URL");

    // FALLBACK: If we don't know the app URL, we might have to use a hardcoded one or let the user configure it.
    // For this implementation, we will try to find it from the Request headers or assume a default if provided.
    if (!appUrl) {
      const host = req.headers.get("host");
      if (host && (host.includes("localhost") || host.includes("127.0.0.1"))) {
        appUrl = "http://localhost:3000";
      } else {
        // Defaulting to the verified Vercel production URL
        appUrl = Deno.env.get("NEXT_PUBLIC_SITE_URL"); 
      }
    }

    console.log(`Delegating voice command to AI bot at ${appUrl}/api/chat`);

    const chatRes = await fetch(`${appUrl}/api/chat`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        // Pass auth if necessary, or let the API verify the userId (as current code does)
      },
      body: JSON.stringify({
        userId: user_id,
        executeServerIntents: true,
        messages: [{ role: "user", content: transcribed_text }],
        context: {
          timezone: tz,
          source: "voice-shortcut"
        }
      })
    });

    if (!chatRes.ok) {
      const errText = await chatRes.text();
      console.error("AI Bot API error:", chatRes.status, errText);
      return new Response(
        JSON.stringify({ error: `AI bot sync failed: ${chatRes.status}`, details: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const chatData = await chatRes.json();
    
    // Pick the most meaningful message for the user
    const finalMessage = chatData.assistantText || chatData.successMessage || "Done.";

    console.log(`[voice-to-calendar] Returning message: ${finalMessage}`);

    // Return plain text
    return new Response(
      finalMessage,
      { status: 200, headers: { ...corsHeaders, "Content-Type": "text/plain" } }
    );

  } catch (err) {
    console.error("Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
