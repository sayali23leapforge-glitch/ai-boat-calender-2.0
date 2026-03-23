import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )

    // Check if buckets exist
    const { data: buckets, error: listError } = await supabase.storage.listBuckets()

    if (listError) {
      return NextResponse.json({
        status: 'error',
        message: 'Failed to list buckets',
        error: listError.message
      }, { status: 400 })
    }

    const results: Record<string, any> = {}

    // Check and create documents bucket
    const documentsBucketExists = buckets?.some(b => b.name === 'documents')
    if (!documentsBucketExists) {
      try {
        const { data: bucket, error: createError } = await supabase.storage.createBucket(
          'documents',
          {
            public: true,
            fileSizeLimit: 52428800, // 50MB
            allowedMimeTypes: [
              'application/pdf',
              'application/msword',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/vnd.ms-excel',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'text/plain',
              'image/png',
              'image/jpeg',
              'image/jpg',
              'image/gif',
            ]
          }
        )

        if (createError) {
          results.documentsBucket = { status: 'error', message: createError.message }
        } else {
          results.documentsBucket = { status: 'created', bucket: bucket }
        }
      } catch (error) {
        results.documentsBucket = { status: 'error', message: String(error) }
      }
    } else {
      results.documentsBucket = { status: 'exists' }
    }

    // Check and create images bucket
    const imagesBucketExists = buckets?.some(b => b.name === 'images')
    if (!imagesBucketExists) {
      try {
        const { data: bucket, error: createError } = await supabase.storage.createBucket(
          'images',
          {
            public: true,
            fileSizeLimit: 52428800, // 50MB
            allowedMimeTypes: [
              'image/png',
              'image/jpeg',
              'image/jpg',
              'image/gif',
              'image/webp',
              'image/bmp',
            ]
          }
        )

        if (createError) {
          results.imagesBucket = { status: 'error', message: createError.message }
        } else {
          results.imagesBucket = { status: 'created', bucket: bucket }
        }
      } catch (error) {
        results.imagesBucket = { status: 'error', message: String(error) }
      }
    } else {
      results.imagesBucket = { status: 'exists' }
    }

    return NextResponse.json({
      status: 'success',
      message: 'Storage bucket initialization complete',
      results
    })
  } catch (error) {
    console.error('Error initializing storage buckets:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )

    // Check bucket status
    const { data: buckets } = await supabase.storage.listBuckets()
    const documentsBucket = buckets?.find(b => b.name === 'documents')
    const imagesBucket = buckets?.find(b => b.name === 'images')

    return NextResponse.json({
      status: 'success',
      buckets: {
        documents: { exists: !!documentsBucket, public: documentsBucket?.public },
        images: { exists: !!imagesBucket, public: imagesBucket?.public }
      }
    })
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      message: 'Failed to check bucket status',
      error: String(error)
    }, { status: 500 })
  }
}
