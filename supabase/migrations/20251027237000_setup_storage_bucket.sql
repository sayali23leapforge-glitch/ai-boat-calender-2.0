/*
  # Setup Storage Bucket for Documents

  ## Summary
  Creates the documents storage bucket and sets up public access policies.
  This is required for the document upload feature to work.

  ## Steps (run these in Supabase Dashboard, not SQL Editor):
  
  1. Go to Storage → Create Bucket
  2. Bucket name: "documents"
  3. Public bucket: YES (check this)
  4. Click "Create bucket"
  
  ## Then run this SQL to set up storage policies:
*/

-- Create storage bucket if it doesn't exist (this might not work in SQL, so use Dashboard)
-- The bucket must be created via Dashboard first, then policies can be set here

-- Check if bucket exists
SELECT name, public 
FROM storage.buckets 
WHERE name = 'documents';

-- If bucket exists, set up policies
-- Drop existing policies first
DROP POLICY IF EXISTS "Public can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Public can view documents" ON storage.objects;
DROP POLICY IF EXISTS "Public can delete documents" ON storage.objects;
DROP POLICY IF EXISTS "Public can update documents" ON storage.objects;

-- Allow public to upload to documents bucket
CREATE POLICY "Public can upload documents"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'documents');

-- Allow public to view documents
CREATE POLICY "Public can view documents"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'documents');

-- Allow public to delete documents
CREATE POLICY "Public can delete documents"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'documents');

-- Allow public to update documents
CREATE POLICY "Public can update documents"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'documents')
WITH CHECK (bucket_id = 'documents');

-- Verify policies were created
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage' 
  AND tablename = 'objects'
  AND policyname LIKE '%documents%';

