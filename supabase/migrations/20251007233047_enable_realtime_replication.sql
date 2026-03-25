/*
  # Enable Realtime Replication

  ## Summary
  Enable realtime replication for documents and extracted_events tables to allow real-time updates in the UI.

  ## Changes
  - Add documents table to realtime publication
  - Add extracted_events table to realtime publication
*/

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE documents;
  EXCEPTION
    WHEN duplicate_object THEN
      RAISE NOTICE 'documents already in supabase_realtime publication';
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE extracted_events;
  EXCEPTION
    WHEN duplicate_object THEN
      RAISE NOTICE 'extracted_events already in supabase_realtime publication';
  END;
END $$;