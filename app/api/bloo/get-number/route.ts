/**
 * Get latest Bloo number from webhook storage
 * All profiles call this to get the current number
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0; // No caching - always fresh

export async function GET(req: NextRequest) {
  try {
    console.log('[GetBlooNumber] Fetching latest number from webhook storage...');

    const admin = getSupabaseAdminClient();

    const { data, error } = await admin
      .from('app_config')
      .select('bloo_number, updated_at')
      .eq('key', 'global_bloo_number')
      .maybeSingle();

    if (error) {
      console.error('[GetBlooNumber] Database error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch', message: error.message },
        { status: 500 }
      );
    }

    if (!data?.bloo_number) {
      console.warn('[GetBlooNumber] No number found in storage');
      return NextResponse.json({
        blooNumber: null,
        message: 'No Bloo number set yet',
        source: 'webhook_storage',
      });
    }

    console.log('[GetBlooNumber] ✅ Retrieved:', data.bloo_number);

    return NextResponse.json(
      {
        blooNumber: data.bloo_number,
        updatedAt: data.updated_at,
        source: 'webhook_storage',
      },
      {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );

  } catch (error) {
    console.error('[GetBlooNumber] Exception:', error);
    return NextResponse.json(
      { error: 'Server error', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
