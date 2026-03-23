import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'

// Force dynamic rendering - this route uses nextUrl.searchParams which requires dynamic behavior
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId')
    const conversationId = request.nextUrl.searchParams.get('conversationId')

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    const supabase = getSupabaseAdminClient()

    let query = supabase
      .from('image_uploads')
      .select('*')
      .eq('user_id', userId)
      .order('uploaded_at', { ascending: false })

    if (conversationId) {
      query = query.eq('conversation_id', conversationId)
    }

    const { data: images, error } = await query

    if (error) {
      console.error('Error fetching images:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Map database columns to ImageData interface
    const mappedImages = (images || []).map((img: any) => ({
      id: img.id,
      imageUrl: img.image_url,
      extractedText: img.extracted_text || '',
      extractedDates: img.extracted_dates || [],
      extractedEvents: [],
      uploadedAt: new Date(img.uploaded_at || img.created_at).getTime(),
      processed: img.processed || false,
      sender: img.source || 'upload'
    }))

    return NextResponse.json({
      status: 'success',
      images: mappedImages,
      count: mappedImages.length
    })
  } catch (error: any) {
    console.error('Error in GET /api/images/list:', error)
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
