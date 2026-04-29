-- =============================================================
-- 004_attachment_type.sql — PHASE 6
-- - Agrega type a order_attachments para clasificar adjuntos.
--   'evidence' = prueba de entrega (foto, firma) que sube delivery.
-- Idempotente.
-- =============================================================

BEGIN;

ALTER TABLE order_attachments
    ADD COLUMN IF NOT EXISTS type VARCHAR(30) NOT NULL DEFAULT 'general';

ALTER TABLE order_attachments DROP CONSTRAINT IF EXISTS chk_attachment_type;
ALTER TABLE order_attachments ADD  CONSTRAINT chk_attachment_type
    CHECK (type IN ('general', 'evidence', 'invoice', 'receipt'));

CREATE INDEX IF NOT EXISTS idx_attachments_type ON order_attachments(type);

COMMIT;

-- Verificacion
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'order_attachments' AND column_name = 'type';
