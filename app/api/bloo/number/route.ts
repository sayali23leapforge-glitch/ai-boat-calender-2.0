/**
 * Fetch Bloo Number from Bloo API
 * Gets the current Bloo phone number directly from Bloo's servers
 * No database storage - always fresh!
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const blooApiKey = process.env.BLOO_API_KEY;
    if (!blooApiKey) {
      console.error('[BlooNumber] BLOO_API_KEY not configured');
      return NextResponse.json(
        { error: 'Bloo API key not configured' },
        { status: 500 }
      );
    }

    console.log('[BlooNumber] 🔄 Fetching Bloo number from Bloo API...');

    // Fetch account info from Bloo to get the phone number
    const response = await fetch('https://backend.blooio.com/v2/api/account', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${blooApiKey}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[BlooNumber] ❌ Bloo API error:', data);
      return NextResponse.json(
        { error: 'Failed to fetch Bloo number from API', details: data },
        { status: 500 }
      );
    }

    // Try multiple field names where Bloo might return the phone number
    let phoneNumber = null;
    
    if (data.phone) phoneNumber = data.phone;
    else if (data.number) phoneNumber = data.number;
    else if (data.phone_number) phoneNumber = data.phone_number;
    else if (data.mobile) phoneNumber = data.mobile;
    else if (data.from) phoneNumber = data.from;
    else if (data.sender) phoneNumber = data.sender;
    else if (data.numbers?.[0]) phoneNumber = data.numbers[0];

    console.log('[BlooNumber] ✅ Fetched from Bloo API:', phoneNumber);
    console.log('[BlooNumber] Full response keys:', Object.keys(data).join(', '));

    return NextResponse.json(
      { 
        success: true, 
        blooNumber: phoneNumber,
        source: 'bloo_api',
        timestamp: new Date().toISOString()
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
