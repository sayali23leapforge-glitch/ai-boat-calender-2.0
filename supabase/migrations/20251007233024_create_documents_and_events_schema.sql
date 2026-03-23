/*
  # Create Documents and Events Schema

  ## Summary
  Create database schema for storing uploaded documents and extracted calendar events with OCR processing support. This version allows public access without authentication.

  ## New Tables
  
  ### `documents`
  Stores uploaded document metadata and processing status
  - `id` (uuid, primary key) - Unique document identifier
  - `user_id` (text) - User identifier (can be anonymous)
  - `name` (text) - Original filename
  - `file_type` (text) - MIME type (PDF, DOCX, etc.)
  - `file_size` (integer) - File size in bytes
  - `storage_path` (text) - Path in Supabase Storage
  - `status` (text) - Processing status: 'pending', 'processing', 'completed', 'error'
  - `progress` (integer) - Processing progress 0-100
  - `extracted_text` (text) - Full OCR extracted text
  - `processing_time` (numeric) - Time taken to process in seconds
  - `error_message` (text) - Error details if processing failed
  - `created_at` (timestamptz) - Document upload timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### `extracted_events`
  Stores events extracted from documents via OCR
  - `id` (uuid, primary key) - Unique event identifier
  - `document_id` (uuid) - Reference to documents table
  - `user_id` (text) - User identifier
  - `title` (text) - Event title
  - `description` (text) - Event description
  - `event_date` (date) - Event date
  - `start_time` (time) - Event start time (optional)
  - `end_time` (time) - Event end time (optional)
  - `location` (text) - Event location (optional)
  - `category` (text) - Event category
  - `priority` (text) - Priority level
  - `confidence` (integer) - OCR extraction confidence 0-100
  - `is_imported` (boolean) - Whether event has been imported to calendar
  - `created_at` (timestamptz) - Extraction timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ## Security
  - Enable RLS on both tables
  - Public access allowed for all operations
*/

-- Create documents table
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  name text NOT NULL,
  file_type text NOT NULL,
  file_size integer NOT NULL,
  storage_path text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'error')),
  progress integer DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  extracted_text text,
  processing_time numeric,
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create extracted_events table
CREATE TABLE IF NOT EXISTS extracted_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE NOT NULL,
  user_id text NOT NULL,
  title text NOT NULL,
  description text,
  event_date date NOT NULL,
  start_time time,
  end_time time,
  location text,
  category text NOT NULL DEFAULT 'other' CHECK (category IN ('assignment', 'exam', 'meeting', 'deadline', 'milestone', 'other')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  confidence integer DEFAULT 85 CHECK (confidence >= 0 AND confidence <= 100),
  is_imported boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_extracted_events_user_id ON extracted_events(user_id);
CREATE INDEX IF NOT EXISTS idx_extracted_events_document_id ON extracted_events(document_id);
CREATE INDEX IF NOT EXISTS idx_extracted_events_date ON extracted_events(event_date);
CREATE INDEX IF NOT EXISTS idx_extracted_events_imported ON extracted_events(is_imported);

-- Enable Row Level Security
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracted_events ENABLE ROW LEVEL SECURITY;

-- Public policies for documents table
CREATE POLICY "Public can view all documents"
  ON documents FOR SELECT
  USING (true);

CREATE POLICY "Public can insert documents"
  ON documents FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Public can update documents"
  ON documents FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public can delete documents"
  ON documents FOR DELETE
  USING (true);

-- Public policies for extracted_events table
CREATE POLICY "Public can view all extracted events"
  ON extracted_events FOR SELECT
  USING (true);

CREATE POLICY "Public can insert extracted events"
  ON extracted_events FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Public can update extracted events"
  ON extracted_events FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public can delete extracted events"
  ON extracted_events FOR DELETE
  USING (true);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_documents_updated_at ON documents;
CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_extracted_events_updated_at ON extracted_events;
CREATE TRIGGER update_extracted_events_updated_at
  BEFORE UPDATE ON extracted_events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();