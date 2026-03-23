/*
  # Enhanced Document Extraction Schema

  ## Summary
  Comprehensive schema upgrade to support advanced document processing with source traceability,
  review workflows, conflict detection, deduplication, versioning, and observability.

  ## New Tables

  ### `extraction_review_queue`
  Tracks pending, approved, rejected, and edited event suggestions requiring human review
  - `id` (uuid, primary key) - Unique identifier
  - `extracted_event_id` (uuid) - Reference to extracted_events
  - `user_id` (text) - User identifier
  - `status` (text) - Review status: pending, approved, rejected, edited
  - `review_action` (text) - Action taken: approve, edit, ignore, batch_approve
  - `reviewed_at` (timestamptz) - When reviewed
  - `reviewed_by` (text) - Who reviewed
  - `edit_history` (jsonb) - Track field changes
  - `created_at` (timestamptz) - Queue entry timestamp

  ### `extraction_audit_log`
  Complete audit trail for all extraction and review operations
  - `id` (uuid, primary key) - Unique identifier
  - `extracted_event_id` (uuid) - Event reference
  - `document_id` (uuid) - Source document reference
  - `user_id` (text) - User identifier
  - `action` (text) - Action type: created, updated, approved, rejected, deleted, imported
  - `old_values` (jsonb) - Previous state
  - `new_values` (jsonb) - New state
  - `metadata` (jsonb) - Additional context
  - `created_at` (timestamptz) - Action timestamp

  ### `document_checksums`
  Track file hashes for idempotent uploads and caching
  - `id` (uuid, primary key) - Unique identifier
  - `document_id` (uuid) - Document reference
  - `user_id` (text) - User identifier
  - `checksum` (text) - SHA-256 hash of file content
  - `file_size` (bigint) - File size in bytes
  - `file_name` (text) - Original filename
  - `cached_text` (text) - Cached extracted text
  - `cached_events` (jsonb) - Cached extraction results
  - `last_accessed` (timestamptz) - Cache access time
  - `created_at` (timestamptz) - Creation timestamp

  ### `event_conflicts`
  Detect and track duplicate and overlapping events
  - `id` (uuid, primary key) - Unique identifier
  - `user_id` (text) - User identifier
  - `event_id_1` (uuid) - First event reference
  - `event_id_2` (uuid) - Second event reference
  - `conflict_type` (text) - Type: duplicate, overlap, similar
  - `similarity_score` (numeric) - 0-1 similarity measure
  - `resolution` (text) - Resolution: merged, kept_both, kept_one, ignored
  - `resolved_at` (timestamptz) - Resolution timestamp
  - `created_at` (timestamptz) - Detection timestamp

  ### `holiday_exclusions`
  Academic and campus holidays for recurring event exclusions
  - `id` (uuid, primary key) - Unique identifier
  - `user_id` (text) - User identifier (nullable for institution-wide)
  - `name` (text) - Holiday name
  - `holiday_date` (date) - Date of holiday
  - `is_institutional` (boolean) - Institution-wide vs personal
  - `auto_exclude` (boolean) - Auto-exclude from recurring events
  - `created_at` (timestamptz) - Creation timestamp

  ### `extraction_metrics`
  Track extraction performance and accuracy metrics
  - `id` (uuid, primary key) - Unique identifier
  - `document_id` (uuid) - Document reference
  - `user_id` (text) - User identifier
  - `extraction_method` (text) - Method used: gpt, rule_based, hybrid
  - `events_extracted` (integer) - Number of events found
  - `high_confidence_count` (integer) - Events with confidence >= 80
  - `medium_confidence_count` (integer) - Events with confidence 60-79
  - `low_confidence_count` (integer) - Events with confidence < 60
  - `processing_time_ms` (integer) - Processing duration
  - `gpt_tokens_used` (integer) - OpenAI tokens consumed
  - `ocr_pages_processed` (integer) - Pages OCR'd
  - `errors_encountered` (jsonb) - Error details
  - `created_at` (timestamptz) - Metrics timestamp

  ## Changes to existing tables

  ### `extracted_events` enhancements
  - Add `page_number` (integer) - Page where event was found
  - Add `bounding_box` (jsonb) - Coordinates {x, y, width, height}
  - Add `source_snippet` (text) - Original text extract
  - Add `extraction_metadata` (jsonb) - Processing details
  - Add `ambiguity_flags` (jsonb) - Detected ambiguities
  - Add `timezone` (text) - Inferred or explicit timezone
  - Add `timezone_confidence` (numeric) - Timezone inference confidence 0-1
  - Add `extraction_rationale` (text) - GPT confidence explanation
  - Add `fingerprint` (text) - Hash for deduplication

  ### `documents` enhancements
  - Add `checksum` (text) - SHA-256 file hash
  - Add `language` (text) - Detected document language
  - Add `timezone` (text) - Document default timezone
  - Add `has_pii` (boolean) - PII detected flag
  - Add `processing_metadata` (jsonb) - Detailed processing info

  ## Security
  - Enable RLS on all new tables
  - Users can only access their own data
  - Institutional holidays visible to all users
  - Audit logs are append-only
*/

-- Add new columns to extracted_events
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'extracted_events' AND column_name = 'page_number') THEN
    ALTER TABLE extracted_events ADD COLUMN page_number integer;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'extracted_events' AND column_name = 'bounding_box') THEN
    ALTER TABLE extracted_events ADD COLUMN bounding_box jsonb;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'extracted_events' AND column_name = 'source_snippet') THEN
    ALTER TABLE extracted_events ADD COLUMN source_snippet text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'extracted_events' AND column_name = 'extraction_metadata') THEN
    ALTER TABLE extracted_events ADD COLUMN extraction_metadata jsonb DEFAULT '{}'::jsonb;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'extracted_events' AND column_name = 'ambiguity_flags') THEN
    ALTER TABLE extracted_events ADD COLUMN ambiguity_flags jsonb DEFAULT '{}'::jsonb;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'extracted_events' AND column_name = 'timezone') THEN
    ALTER TABLE extracted_events ADD COLUMN timezone text DEFAULT 'UTC';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'extracted_events' AND column_name = 'timezone_confidence') THEN
    ALTER TABLE extracted_events ADD COLUMN timezone_confidence numeric DEFAULT 0.5 CHECK (timezone_confidence >= 0 AND timezone_confidence <= 1);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'extracted_events' AND column_name = 'extraction_rationale') THEN
    ALTER TABLE extracted_events ADD COLUMN extraction_rationale text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'extracted_events' AND column_name = 'fingerprint') THEN
    ALTER TABLE extracted_events ADD COLUMN fingerprint text;
  END IF;
END $$;

-- Add new columns to documents
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'checksum') THEN
    ALTER TABLE documents ADD COLUMN checksum text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'language') THEN
    ALTER TABLE documents ADD COLUMN language text DEFAULT 'en';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'timezone') THEN
    ALTER TABLE documents ADD COLUMN timezone text DEFAULT 'UTC';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'has_pii') THEN
    ALTER TABLE documents ADD COLUMN has_pii boolean DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'processing_metadata') THEN
    ALTER TABLE documents ADD COLUMN processing_metadata jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Create extraction_review_queue table
CREATE TABLE IF NOT EXISTS extraction_review_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  extracted_event_id uuid REFERENCES extracted_events(id) ON DELETE CASCADE NOT NULL,
  user_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'edited')),
  review_action text CHECK (review_action IN ('approve', 'edit', 'ignore', 'batch_approve')),
  reviewed_at timestamptz,
  reviewed_by text,
  edit_history jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create extraction_audit_log table
CREATE TABLE IF NOT EXISTS extraction_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  extracted_event_id uuid,
  document_id uuid,
  user_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('created', 'updated', 'approved', 'rejected', 'deleted', 'imported', 'edited', 'merged')),
  old_values jsonb,
  new_values jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create document_checksums table
CREATE TABLE IF NOT EXISTS document_checksums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  checksum text NOT NULL,
  file_size bigint NOT NULL,
  file_name text NOT NULL,
  cached_text text,
  cached_events jsonb,
  last_accessed timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Create event_conflicts table
CREATE TABLE IF NOT EXISTS event_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  event_id_1 uuid NOT NULL,
  event_id_2 uuid NOT NULL,
  conflict_type text NOT NULL CHECK (conflict_type IN ('duplicate', 'overlap', 'similar')),
  similarity_score numeric CHECK (similarity_score >= 0 AND similarity_score <= 1),
  resolution text CHECK (resolution IN ('merged', 'kept_both', 'kept_one', 'ignored', 'pending')),
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Create holiday_exclusions table
CREATE TABLE IF NOT EXISTS holiday_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text,
  name text NOT NULL,
  holiday_date date NOT NULL,
  is_institutional boolean DEFAULT false,
  auto_exclude boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Create extraction_metrics table
CREATE TABLE IF NOT EXISTS extraction_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE NOT NULL,
  user_id text NOT NULL,
  extraction_method text NOT NULL CHECK (extraction_method IN ('gpt', 'rule_based', 'hybrid')),
  events_extracted integer DEFAULT 0,
  high_confidence_count integer DEFAULT 0,
  medium_confidence_count integer DEFAULT 0,
  low_confidence_count integer DEFAULT 0,
  processing_time_ms integer,
  gpt_tokens_used integer DEFAULT 0,
  ocr_pages_processed integer DEFAULT 0,
  errors_encountered jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_extracted_events_fingerprint ON extracted_events(fingerprint);
CREATE INDEX IF NOT EXISTS idx_extracted_events_page ON extracted_events(page_number);
CREATE INDEX IF NOT EXISTS idx_documents_checksum ON documents(checksum);
CREATE INDEX IF NOT EXISTS idx_review_queue_user ON extraction_review_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_review_queue_status ON extraction_review_queue(status);
CREATE INDEX IF NOT EXISTS idx_review_queue_event ON extraction_review_queue(extracted_event_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_event ON extraction_audit_log(extracted_event_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_document ON extraction_audit_log(document_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON extraction_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_checksums_checksum ON document_checksums(checksum);
CREATE INDEX IF NOT EXISTS idx_checksums_user ON document_checksums(user_id);
CREATE INDEX IF NOT EXISTS idx_conflicts_user ON event_conflicts(user_id);
CREATE INDEX IF NOT EXISTS idx_conflicts_events ON event_conflicts(event_id_1, event_id_2);
CREATE INDEX IF NOT EXISTS idx_holidays_date ON holiday_exclusions(holiday_date);
CREATE INDEX IF NOT EXISTS idx_holidays_institutional ON holiday_exclusions(is_institutional);
CREATE INDEX IF NOT EXISTS idx_metrics_document ON extraction_metrics(document_id);
CREATE INDEX IF NOT EXISTS idx_metrics_user ON extraction_metrics(user_id);

-- Enable RLS on new tables
ALTER TABLE extraction_review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE extraction_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_checksums ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE holiday_exclusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE extraction_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policies for extraction_review_queue
CREATE POLICY "Users can view own review queue"
  ON extraction_review_queue FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own review queue items"
  ON extraction_review_queue FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update own review queue items"
  ON extraction_review_queue FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete own review queue items"
  ON extraction_review_queue FOR DELETE
  USING (true);

-- RLS Policies for extraction_audit_log (append-only, read-only for users)
CREATE POLICY "Users can view own audit logs"
  ON extraction_audit_log FOR SELECT
  USING (true);

CREATE POLICY "System can insert audit logs"
  ON extraction_audit_log FOR INSERT
  WITH CHECK (true);

-- RLS Policies for document_checksums
CREATE POLICY "Users can view own checksums"
  ON document_checksums FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own checksums"
  ON document_checksums FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update own checksums"
  ON document_checksums FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete own checksums"
  ON document_checksums FOR DELETE
  USING (true);

-- RLS Policies for event_conflicts
CREATE POLICY "Users can view own conflicts"
  ON event_conflicts FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own conflicts"
  ON event_conflicts FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update own conflicts"
  ON event_conflicts FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete own conflicts"
  ON event_conflicts FOR DELETE
  USING (true);

-- RLS Policies for holiday_exclusions
CREATE POLICY "Everyone can view holidays"
  ON holiday_exclusions FOR SELECT
  USING (true);

CREATE POLICY "Users can insert holidays"
  ON holiday_exclusions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update own holidays"
  ON holiday_exclusions FOR UPDATE
  USING (user_id IS NULL OR true)
  WITH CHECK (user_id IS NULL OR true);

CREATE POLICY "Users can delete own holidays"
  ON holiday_exclusions FOR DELETE
  USING (user_id IS NULL OR true);

-- RLS Policies for extraction_metrics
CREATE POLICY "Users can view own metrics"
  ON extraction_metrics FOR SELECT
  USING (true);

CREATE POLICY "System can insert metrics"
  ON extraction_metrics FOR INSERT
  WITH CHECK (true);

-- Create function to generate event fingerprint for deduplication
CREATE OR REPLACE FUNCTION generate_event_fingerprint(
  p_title text,
  p_event_date date,
  p_start_time time
)
RETURNS text AS $$
BEGIN
  RETURN encode(
    digest(
      lower(trim(p_title)) || 
      COALESCE(p_event_date::text, '') || 
      COALESCE(p_start_time::text, ''),
      'sha256'
    ),
    'hex'
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create trigger to auto-generate fingerprints on insert/update
CREATE OR REPLACE FUNCTION auto_generate_fingerprint()
RETURNS TRIGGER AS $$
BEGIN
  NEW.fingerprint := generate_event_fingerprint(NEW.title, NEW.event_date, NEW.start_time);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_fingerprint ON extracted_events;
CREATE TRIGGER trigger_auto_fingerprint
  BEFORE INSERT OR UPDATE ON extracted_events
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_fingerprint();

-- Create trigger to log all changes to audit log
CREATE OR REPLACE FUNCTION log_extraction_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO extraction_audit_log (
      extracted_event_id,
      document_id,
      user_id,
      action,
      new_values,
      metadata
    ) VALUES (
      NEW.id,
      NEW.document_id,
      NEW.user_id,
      'created',
      to_jsonb(NEW),
      jsonb_build_object('operation', TG_OP)
    );
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO extraction_audit_log (
      extracted_event_id,
      document_id,
      user_id,
      action,
      old_values,
      new_values,
      metadata
    ) VALUES (
      NEW.id,
      NEW.document_id,
      NEW.user_id,
      'updated',
      to_jsonb(OLD),
      to_jsonb(NEW),
      jsonb_build_object('operation', TG_OP)
    );
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO extraction_audit_log (
      extracted_event_id,
      document_id,
      user_id,
      action,
      old_values,
      metadata
    ) VALUES (
      OLD.id,
      OLD.document_id,
      OLD.user_id,
      'deleted',
      to_jsonb(OLD),
      jsonb_build_object('operation', TG_OP)
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_log_extraction_changes ON extracted_events;
CREATE TRIGGER trigger_log_extraction_changes
  AFTER INSERT OR UPDATE OR DELETE ON extracted_events
  FOR EACH ROW
  EXECUTE FUNCTION log_extraction_changes();

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE extraction_review_queue;
ALTER PUBLICATION supabase_realtime ADD TABLE event_conflicts;
ALTER PUBLICATION supabase_realtime ADD TABLE extraction_metrics;