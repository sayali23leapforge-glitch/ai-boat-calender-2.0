import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs"; // safer for reading request bodies + logging

function safeEqual(a?: string | null, b?: string | null) {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export async function POST(req: NextRequest) {
  try {
    const secretHeader =
      req.headers.get("x-sendblue-secret") ||
      req.headers.get("x-webhook-secret") ||
      req.headers.get("x-hook-secret") ||
      req.headers.get("x-signature");

    const expected = process.env.SENDBLUE_WEBHOOK_SECRET;

    // If Sendblue sends a secret header, verify it; otherwise just accept for MVP logging.
    if (expected && secretHeader && !safeEqual(secretHeader, expected)) {
      console.warn("❌ Sendblue webhook secret mismatch");
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const payload = await req.json();

    console.log("✅ SENDBLUE WEBHOOK HIT @", new Date().toISOString());
    console.log(JSON.stringify(payload, null, 2));

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("❌ Sendblue webhook error:", err?.message || err);
    // still ACK 200 so provider doesn't retry aggressively during dev
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
