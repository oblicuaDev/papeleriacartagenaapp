-- =============================================================
-- 014_orders_subtotal_iva.sql
--   - orders.subtotal / orders.iva: discriminación de IVA (19%)
--     persistida a nivel de pedido. total ya venía IVA-incluido
--     (las listas de precio se cargan con IVA incluido), por lo
--     que subtotal = ROUND(total / 1.19, 2) e iva = total - subtotal.
--   - Backfill de pedidos históricos + CHECK subtotal + iva = total.
-- Idempotente.
--
-- NOTA: este archivo es historial/documentación. El cambio real ya
-- fue fusionado dentro de infra/migrate.sql (único script que se
-- ejecuta contra la BD, ver infra/setup-db.sh y README.dev.md).
-- =============================================================

BEGIN;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal NUMERIC(14, 2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS iva      NUMERIC(14, 2);

UPDATE orders
   SET subtotal = ROUND(total / 1.19, 2),
       iva      = total - ROUND(total / 1.19, 2)
 WHERE subtotal IS NULL;

ALTER TABLE orders ALTER COLUMN subtotal SET NOT NULL;
ALTER TABLE orders ALTER COLUMN iva      SET NOT NULL;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_subtotal;
ALTER TABLE orders ADD  CONSTRAINT chk_subtotal CHECK (subtotal >= 0);
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_iva;
ALTER TABLE orders ADD  CONSTRAINT chk_iva CHECK (iva >= 0);
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_subtotal_iva_sum;
ALTER TABLE orders ADD  CONSTRAINT chk_subtotal_iva_sum CHECK (subtotal + iva = total);

COMMIT;
