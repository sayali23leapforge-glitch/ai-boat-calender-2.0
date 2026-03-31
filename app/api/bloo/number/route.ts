/**
 * Get Latest Bloo Number from Webhook Storage
 * All user profiles call this to get the current number
 * Updated automatically when Bloo sends webhook update
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    console.log('[BlooNumber] 🔄 Fetching latest Bloo number from webhook storage...');

    const admin = getSupabaseAdminClient();

    const { data, error } = await admin
      .from('app_config')
      .select('bloo_number, updated_at')
      .eq('key', 'global_bloo_number')
      .maybeSingle();

    if (error) {
      console.error('[BlooNumber] Database error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch', details: error.message },
        { status: 500 }
      );
    }

    if (!data?.bloo_number) {
      console.warn('[BlooNumber] No number found in webhook storage');
      return NextResponse.json({
        blooNumber: null,
        message: 'No Bloo number set',
        source: 'webhook_storage',
      });
    }

    let phoneNumber = data.bloo_number;

    console.log('[BlooNumber] ✅ Retrieved from webhook storage:', phoneNumber);

    return NextResponse.json(
      { 
        blooNumber: phoneNumber,
        updatedAt: data.updated_at,
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
