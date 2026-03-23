import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )

    const checks: Record<string, boolean | string> = {}

    // Check 1: Documents table
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('id')
        .limit(1)
      checks.documentsTable = !error
    } catch (e) {
      checks.documentsTable = false
    }

    // Check 2: Extracted events table
    try {
      const { data, error } = await supabase
        .from('extracted_events')
        .select('id')
        .limit(1)
      checks.extractedEventsTable = !error
    } catch (e) {
      checks.extractedEventsTable = false
    }

    // Check 3: Image uploads table
    try {
      const { data, error } = await supabase
        .from('image_uploads')
        .select('id')
        .limit(1)
      checks.imageUploadsTable = !error
    } catch (e) {
      checks.imageUploadsTable = false
    }

    // Check 4: Documents bucket
    try {
      const { data: buckets } = await supabase.storage.listBuckets()
      const documentsBucket = buckets?.find(b => b.name === 'documents')
      checks.documentsBucket = !!documentsBucket
    } catch (e) {
      checks.documentsBucket = false
    }

    // Check 5: Image uploads bucket
    try {
      const { data: buckets } = await supabase.storage.listBuckets()
      const imagesBucket = buckets?.find(b => b.name === 'images')
      checks.imagesBucket = !!imagesBucket
    } catch (e) {
      checks.imagesBucket = false
    }

    // Check 6: Calendar events table
    try {
      const { data, error } = await supabase
        .from('calendar_events')
        .select('id')
        .limit(1)
      checks.calendarEventsTable = !error
    } catch (e) {
      checks.calendarEventsTable = false
    }

    const allChecked = Object.values(checks).every(v => v === true)

    return NextResponse.json({
      status: allChecked ? 'healthy' : 'degraded',
      checks,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      error: String(error),
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}
