import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, fileName, fileType, fileSize, storagePath, name } = body

    if (!userId || !fileName || !storagePath) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Use admin client to bypass RLS
    const supabase = getSupabaseAdminClient()

    const { data: document, error } = await supabase
      .from('documents')
      .insert({
        user_id: userId,
        name: name || fileName,
        file_type: fileType || 'unknown',
        file_size: fileSize || 0,
        storage_path: storagePath,
        status: 'pending',
        progress: 0,
      })
      .select()
      .single()

    if (error) {
      console.error('❌ Error creating document record:', error)
      return NextResponse.json(
        { error: `Failed to create document: ${error.message}` },
        { status: 400 }
      )
    }

    console.log('✅ Document record created:', document)

    // If this is an image file, also create an image_uploads record so it shows in Images tab
    if (fileType && fileType.startsWith('image/')) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
      const imageUrl = `${supabaseUrl}/storage/v1/object/public/documents/${storagePath}`

      const { error: imageError } = await supabase.from('image_uploads').insert({
        user_id: userId,
        image_url: imageUrl,
        storage_path: storagePath,
        bucket_name: 'documents',
        extracted_text: null,
        extracted_dates: [],
        processed: false,
        source: 'manual_upload'
      })

      if (imageError) {
        console.warn('Could not create image_uploads record:', imageError.message)
      }
    }

    return NextResponse.json({
      success: true,
      document
    })
  } catch (error: any) {
    console.error('❌ API Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({ message: 'Use POST to create document records' })
}
