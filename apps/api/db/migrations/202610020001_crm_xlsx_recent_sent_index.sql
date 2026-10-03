-- Accelerate tenant-scoped lookups of recent manual confirmations.
CREATE INDEX IF NOT EXISTS crm_xlsx_messages_sent_recent
  ON miclub.crm_xlsx_messages (club_id, sent_at DESC, contact_id)
  WHERE status = 'sent_manual' AND sent_at IS NOT NULL;
