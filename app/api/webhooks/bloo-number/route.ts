/**
 * Bloo Number Webhook Endpoint
 * Bloo sends new number here whenever it changes
 * Stores globally so all profiles fetch the latest
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    console.log('[BlooWebhook] 🔔 Webhook received');

    let payload: any;
    try {
      payload = await req.json();
    } catch {
      console.error('[BlooWebhook] Invalid JSON');
      return NextResponse.json(
        { error: 'Invalid JSON' },
        { status: 400 }
      );
    }

    console.log('[BlooWebhook] Payload:', JSON.stringify(payload));

    // Try to extract number from various possible field names
    let newNumber = 
      payload.number ||
      payload.phone ||
      payload.phone_number ||
      payload.bloo_number ||
      payload.blooNumber ||
      payload.mobile ||
      payload.from ||
      payload.phoneNumber;

    if (!newNumber) {
      console.error('[BlooWebhook] No phone number found in payload');
      console.error('[BlooWebhook] Payload keys:', Object.keys(payload).join(', '));
      return NextResponse.json(
        { error: 'No phone number in webhook payload', payloadKeys: Object.keys(payload) },
        { status: 400 }
      );
    }

    // Normalize number - remove spaces
    newNumber = String(newNumber).trim().replace(/\s+/g, '');

    console.log('[BlooWebhook] ✅ New Bloo number received:', newNumber);

    // Store globally in app_config
    const admin = getSupabaseAdminClient();

    // Check if record exists
    const { data: existing } = await admin
      .from('app_config')
      .select('id')
      .eq('key', 'global_bloo_number')
      .maybeSingle();

    let result;

    if (existing) {
      // Update existing
      result = await admin
        .from('app_config')
        .update({
          bloo_number: newNumber,
          updated_at: new Date().toISOString(),
        })
        .eq('key', 'global_bloo_number')
        .select('bloo_number');
    } else {
      // Insert new
      result = await admin
        .from('app_config')
        .insert({
          key: 'global_bloo_number',
          bloo_number: newNumber,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('bloo_number');
    }

    if (result.error) {
      console.error('[BlooWebhook] Database error:', result.error);
      return NextResponse.json(
        { error: 'Failed to store number', details: result.error.message },
        { status: 500 }
      );
    }

    console.log('[BlooWebhook] ✅ Stored global Bloo number:', newNumber);
    console.log('[BlooWebhook] 🔄 All user profiles will now fetch this number!');

    return NextResponse.json({
      success: true,
      message: 'Bloo number updated successfully',
      blooNumber: newNumber,
      stored_at: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[BlooWebhook] Exception:', error);
    return NextResponse.json(
      {
        error: 'Webhook processing failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    console.log('[BlooWebhook] 📋 GET endpoint called - webhook status check');

    return NextResponse.json({
      status: 'active',
      endpoint: '/api/webhooks/bloo-number',
      method: 'POST',
      description: 'Receives Bloo phone number updates and stores globally',
      expectedPayload: {
        number: '+1XXXXX',
        // or any of: phone, phone_number, bloo_number, blooNumber, mobile, from
      },
      response: {
        success: true,
        blooNumber: '+1XXXXX',
        stored_at: 'ISO timestamp',
      },
    });

  } catch (error) {
    console.error('[BlooWebhook] GET error:', error);
    return NextResponse.json({ error: 'Webhook check failed' }, { status: 500 });
  }
}
