import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';

export async function POST() {
  try {
    const supabaseAdmin = getSupabaseAdminClient();

    // Drop existing policies
    const dropPolicies = `
      DROP POLICY IF EXISTS "Public can upload documents" ON storage.objects;
      DROP POLICY IF EXISTS "Public can view documents" ON storage.objects;
      DROP POLICY IF EXISTS "Public can delete documents" ON storage.objects;
      DROP POLICY IF EXISTS "Public can update documents" ON storage.objects;
      DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
      DROP POLICY IF EXISTS "Authenticated users can view documents" ON storage.objects;
      DROP POLICY IF EXISTS "Authenticated users can delete documents" ON storage.objects;
      DROP POLICY IF EXISTS "Authenticated users can update documents" ON storage.objects;
      DROP POLICY IF EXISTS "Authenticated users can upload images" ON storage.objects;
      DROP POLICY IF EXISTS "Authenticated users can view images" ON storage.objects;
      DROP POLICY IF EXISTS "Authenticated users can delete images" ON storage.objects;
      DROP POLICY IF EXISTS "Authenticated users can update images" ON storage.objects;
    `;

    try {
      await supabaseAdmin.rpc('exec_sql', { sql: dropPolicies });
    } catch {
      // Policies might not exist, that's OK
    }

    // Create new policies for documents bucket
    const createDocumentPolicies = `
      CREATE POLICY "Authenticated users can upload documents"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'documents' AND
        (storage.foldername(name))[1] = auth.uid()::text
      );

      CREATE POLICY "Authenticated users can view documents"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = 'documents');

      CREATE POLICY "Authenticated users can delete documents"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'documents' AND
        (storage.foldername(name))[1] = auth.uid()::text
      );

      CREATE POLICY "Authenticated users can update documents"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'documents' AND
        (storage.foldername(name))[1] = auth.uid()::text
      )
      WITH CHECK (
        bucket_id = 'documents' AND
        (storage.foldername(name))[1] = auth.uid()::text
      );
    `;

    // Create new policies for images bucket
    const createImagePolicies = `
      CREATE POLICY "Authenticated users can upload images"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'images' AND
        (storage.foldername(name))[1] = auth.uid()::text
      );

      CREATE POLICY "Authenticated users can view images"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = 'images');

      CREATE POLICY "Authenticated users can delete images"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'images' AND
        (storage.foldername(name))[1] = auth.uid()::text
      );

      CREATE POLICY "Authenticated users can update images"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'images' AND
        (storage.foldername(name))[1] = auth.uid()::text
      )
      WITH CHECK (
        bucket_id = 'images' AND
        (storage.foldername(name))[1] = auth.uid()::text
      );
    `;

    try {
      await supabaseAdmin.rpc('exec_sql', { sql: createDocumentPolicies });
      await supabaseAdmin.rpc('exec_sql', { sql: createImagePolicies });
    } catch (error: any) {
      // If exec_sql doesn't exist, we need to run this SQL manually in Supabase
      console.error('Could not create policies via RPC:', error.message);
      return NextResponse.json({
        success: false,
        error: 'Please run the SQL migration file manually in Supabase Dashboard',
        sqlFile: 'supabase/migrations/20260128_fix_storage_policies.sql'
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Storage policies fixed successfully'
    });
  } catch (error: any) {
    console.error('Error fixing storage policies:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
