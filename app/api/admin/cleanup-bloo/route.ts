/**
 * Clear old Bloo numbers from individual user profiles
 * All profiles now fetch from webhook storage (app_config table)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const admin = getSupabaseAdminClient();

    console.log('[Cleanup] Clearing old bloo_bound_number from all user_profiles...');

    // Set all bloo_bound_number to NULL (no longer needed)
    const { data, error } = await admin
      .from('user_profiles')
      .update({ bloo_bound_number: null })
      .not('bloo_bound_number', 'is', null) // Only update rows that have a value
      .select('id, bloo_bound_number');

    if (error) {
      console.error('[Cleanup] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[Cleanup] ✅ Cleared ${data?.length || 0} user profiles`);

    return NextResponse.json({
      success: true,
      message: 'Old Bloo numbers cleared from user profiles',
      recordsUpdated: data?.length || 0,
      note: 'All profiles now fetch from webhook storage (app_config)',
    });

  } catch (error) {
    console.error('[Cleanup] Exception:', error);
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return NextResponse.json({
    endpoint: '/api/admin/cleanup-bloo',
    method: 'POST',
    description: 'Clear old bloo_bound_number from user_profiles',
    note: 'All profiles now fetch from webhook storage - this cleans up legacy data',
  });
}
