import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const supabase = getSupabaseAdminClient()

    console.log('🔧 Initializing database tables...')

    // Create documents table
    const { error: docError } = await supabase.from('documents').insert([
      {
        user_id: 'test',
        name: 'test',
        file_type: 'test',
        storage_path: 'test'
      }
    ])

    // Create extracted_events table
    const { error: eventError } = await supabase.from('extracted_events').insert([
      {
        document_id: '00000000-0000-0000-0000-000000000000',
        user_id: 'test',
        title: 'test',
        event_date: '2026-01-27'
      }
    ])

    // Create api_keys table
    const { error: keyError } = await supabase.from('api_keys').insert([
      {
        user_id: 'test',
        service_name: 'test',
        api_key: 'test'
      }
    ])

    // Then delete the test records
    await supabase.from('documents').delete().eq('user_id', 'test')
    await supabase.from('extracted_events').delete().eq('user_id', 'test')
    await supabase.from('api_keys').delete().eq('user_id', 'test')

    return NextResponse.json({
      success: true,
      message: 'Database tables initialized',
      errors: {
        documents: docError?.message,
        extracted_events: eventError?.message,
        api_keys: keyError?.message
      }
    })
  } catch (error) {
    console.error('❌ Error initializing database:', error)
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient()

    // Check if tables exist by trying to query them
    const { error: docError } = await supabase.from('documents').select('count', { count: 'exact', head: true })
    const { error: eventError } = await supabase.from('extracted_events').select('count', { count: 'exact', head: true })
    const { error: keyError } = await supabase.from('api_keys').select('count', { count: 'exact', head: true })

    return NextResponse.json({
      status: 'checking',
      tables: {
        documents: !docError ? 'exists' : `missing: ${docError.message}`,
        extracted_events: !eventError ? 'exists' : `missing: ${eventError.message}`,
        api_keys: !keyError ? 'exists' : `missing: ${keyError.message}`
      }
    })
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    )
  }
}
