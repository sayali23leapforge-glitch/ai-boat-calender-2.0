/**
 * Get Latest Bloo Number from Webhook Storage
 * All user profiles call this to get the current number
 * Updated automatically when Bloo sends webhook update
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    console.log('[BlooNumber] 🔄 Fetching latest Bloo number from webhook storage...');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
      console.error('[BlooNumber] Missing Supabase config');
      return NextResponse.json(
        { error: 'Supabase not configured' },
        { status: 500 }
      );
    }

    // Query app_config table via REST API
    const response = await fetch(
      `${supabaseUrl}/rest/v1/app_config?key=eq.global_bloo_number`,
      {
        method: 'GET',
        headers: {
          'apikey': anonKey,
          'Content-Type': 'application/json',
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('[BlooNumber] ❌ Query failed:', data);
      return NextResponse.json(
        { error: 'Failed to fetch from Supabase', details: data },
        { status: 500 }
      );
    }

    if (!Array.isArray(data) || data.length === 0) {
      console.warn('[BlooNumber] No webhook storage found');
      return NextResponse.json({
        blooNumber: null,
        message: 'No Bloo number set',
        source: 'webhook_storage',
      });
    }

    const record = data[0];
    const phoneNumber = record.bloo_number;

    console.log('[BlooNumber] ✅ Retrieved from webhook storage:', phoneNumber);

    return NextResponse.json(
      { 
        blooNumber: phoneNumber,
        updatedAt: record.updated_at,
        source: 'webhook_storage'
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } catch (error) {
    console.error('[BlooNumber] ❌ Exception:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch Bloo number',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
