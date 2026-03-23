import { createClient } from '@supabase/supabase-js'

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )

    console.log('=== STORAGE BUCKET INITIALIZATION ===')
    console.log('URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
    console.log('Has service role key:', !!process.env.SUPABASE_SERVICE_ROLE_KEY)

    // List existing buckets
    const { data: buckets, error: listError } = await supabase.storage.listBuckets()
    console.log('List buckets error:', listError)
    console.log('Existing buckets:', buckets?.map(b => b.name))

    if (listError) {
      return Response.json({
        success: false,
        error: listError.message,
        details: 'Failed to list buckets'
      }, { status: 400 })
    }

    const results = {
      timestamp: new Date().toISOString(),
      existing_buckets: buckets?.map(b => b.name) || [],
      operations: {} as Record<string, any>
    }

    // Create documents bucket if missing
    if (!buckets?.some(b => b.name === 'documents')) {
      console.log('Creating documents bucket...')
      const { data, error } = await supabase.storage.createBucket('documents', {
        public: true,
        fileSizeLimit: 52428800
      })
      results.operations.documents = {
        action: 'create',
        success: !error,
        error: error?.message || 'created',
        data
      }
      console.log('Documents bucket result:', error ? error.message : 'created')
    } else {
      results.operations.documents = { action: 'exists', success: true }
      console.log('Documents bucket already exists')
    }

    // Create images bucket if missing
    if (!buckets?.some(b => b.name === 'images')) {
      console.log('Creating images bucket...')
      const { data, error } = await supabase.storage.createBucket('images', {
        public: true,
        fileSizeLimit: 52428800
      })
      results.operations.images = {
        action: 'create',
        success: !error,
        error: error?.message || 'created',
        data
      }
      console.log('Images bucket result:', error ? error.message : 'created')
    } else {
      results.operations.images = { action: 'exists', success: true }
      console.log('Images bucket already exists')
    }

    console.log('=== INITIALIZATION COMPLETE ===')

    return Response.json({
      success: true,
      message: 'Storage buckets initialized',
      results
    })
  } catch (error) {
    console.error('Initialization error:', error)
    return Response.json({
      success: false,
      error: String(error)
    }, { status: 500 })
  }
}
