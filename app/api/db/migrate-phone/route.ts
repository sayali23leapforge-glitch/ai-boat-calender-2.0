import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdminClient } from "@/lib/supabase-admin"

export async function POST(req: NextRequest) {
  try {
    const admin = getSupabaseAdminClient()
    
    console.log('🔧 Adding phone column to user_profiles...')
    
    // Test if phone column exists by trying to select it
    const { error: testError } = await admin
      .from('user_profiles')
      .select('phone')
      .limit(1)
    
    if (testError && testError.message.includes('column')) {
      // Column doesn't exist - this means we need to add it manually via Supabase dashboard
      // or the migration file needs to be run
      return NextResponse.json({ 
        success: false,
        message: 'Phone column does not exist. Please run the migration manually via Supabase dashboard or CLI.',
        sql: `ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS phone text; CREATE INDEX IF NOT EXISTS idx_user_profiles_phone ON user_profiles(phone);`
      }, { status: 400 })
    }
    
    return NextResponse.json({ 
      success: true, 
      message: 'Phone column already exists in user_profiles table' 
    })
  } catch (e: any) {
    console.error('Migration check error:', e)
    return NextResponse.json({ error: e?.message ?? 'Failed to check migration' }, { status: 500 })
  }
}
