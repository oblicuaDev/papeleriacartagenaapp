-- =============================================================
-- 005_purchase_order_attachment.sql — PHASE 7
-- - Agrega 'purchase_order' a los tipos validos de adjunto.
-- Idempotente.
-- =============================================================

BEGIN;

ALTER TABLE order_attachments DROP CONSTRAINT IF EXISTS chk_attachment_type;
ALTER TABLE order_attachments ADD  CONSTRAINT chk_attachment_type
    CHECK (type IN ('general', 'evidence', 'invoice', 'receipt', 'purchase_order'));

COMMIT;

SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'chk_attachment_type'
  AND conrelid = 'order_attachments'::regclass;
