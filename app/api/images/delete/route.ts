import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// Force dynamic rendering - this route uses nextUrl.searchParams which requires dynamic behavior
export const dynamic = 'force-dynamic'

export async function DELETE(request: NextRequest) {
  try {
    const imageId = request.nextUrl.searchParams.get('id')

    if (!imageId) {
      return NextResponse.json({ error: 'Image ID is required' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )

    const { error } = await supabase
      .from('image_uploads')
      .delete()
      .eq('id', imageId)

    if (error) {
      console.error('Error deleting image:', error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({
      status: 'success',
      message: 'Image deleted successfully'
    })
  } catch (error) {
    console.error('Error in DELETE /api/images/delete:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
