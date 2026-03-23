/*
  # Enable Realtime Replication

  ## Summary
  Enable realtime replication for documents and extracted_events tables to allow real-time updates in the UI.

  ## Changes
  - Add documents table to realtime publication
  - Add extracted_events table to realtime publication
*/

ALTER PUBLICATION supabase_realtime ADD TABLE documents;
ALTER PUBLICATION supabase_realtime ADD TABLE extracted_events;