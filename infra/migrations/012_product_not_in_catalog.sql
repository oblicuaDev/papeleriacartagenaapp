-- =============================================================
-- 012_product_not_in_catalog.sql
--   Agrega columna para identificar productos que no hacen parte
--   del catálogo oficial (eventuales, temporales, especiales).
-- Idempotente.
-- =============================================================

BEGIN;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS not_in_catalog BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
