/*
  # Enable Realtime Replication

  Enable realtime replication for documents and extracted_events tables
  to allow subscriptions to INSERT, UPDATE, and DELETE events.
*/

-- Enable realtime for documents table
ALTER PUBLICATION supabase_realtime ADD TABLE documents;

-- Enable realtime for extracted_events table
ALTER PUBLICATION supabase_realtime ADD TABLE extracted_events;
