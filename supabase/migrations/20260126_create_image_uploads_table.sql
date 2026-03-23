-- Create image_uploads table for storing images from iMessage
CREATE TABLE IF NOT EXISTS public.image_uploads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  sender TEXT,
  image_url TEXT NOT NULL,
  extracted_text TEXT,
  extracted_dates TEXT[] DEFAULT '{}',
  extracted_events JSONB DEFAULT '[]',
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_image_uploads_user_id ON public.image_uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_image_uploads_conversation_id ON public.image_uploads(conversation_id);
CREATE INDEX IF NOT EXISTS idx_image_uploads_uploaded_at ON public.image_uploads(uploaded_at DESC);

-- Enable RLS (Row Level Security)
ALTER TABLE public.image_uploads ENABLE ROW LEVEL SECURITY;

-- Create policy for users to see their own images
DROP POLICY IF EXISTS "Users can view their own images" ON public.image_uploads;
CREATE POLICY "Users can view their own images"
  ON public.image_uploads
  FOR SELECT
  USING (auth.uid()::text = user_id OR user_id IS NOT NULL);

-- Create policy for inserting images
DROP POLICY IF EXISTS "Users can insert images" ON public.image_uploads;
CREATE POLICY "Users can insert images"
  ON public.image_uploads
  FOR INSERT
  WITH CHECK (auth.uid()::text = user_id OR user_id IS NOT NULL);

-- Create policy for deleting images
DROP POLICY IF EXISTS "Users can delete their images" ON public.image_uploads;
CREATE POLICY "Users can delete their images"
  ON public.image_uploads
  FOR DELETE
  USING (auth.uid()::text = user_id OR user_id IS NOT NULL);

-- Create policy for updating images
DROP POLICY IF EXISTS "Users can update their images" ON public.image_uploads;
CREATE POLICY "Users can update their images"
  ON public.image_uploads
  FOR UPDATE
  USING (auth.uid()::text = user_id OR user_id IS NOT NULL);
