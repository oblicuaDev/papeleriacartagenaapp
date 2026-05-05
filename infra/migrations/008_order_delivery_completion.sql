-- =============================================================
-- 008_order_delivery_completion.sql — PHASE 4
--   Persiste quién entregó el pedido y cuándo, para queries
--   directas sin tener que recorrer order_status_log.
-- Idempotente.
-- =============================================================

BEGIN;

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS delivered_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_delivered_at ON orders(delivered_at);

-- Backfill: pedidos ya entregados toman su timestamp del status_log.
UPDATE orders o
   SET delivered_at = sl.delivered_at,
       delivered_by = sl.changed_by
  FROM (
      SELECT DISTINCT ON (order_id)
             order_id, created_at AS delivered_at, changed_by
        FROM order_status_log
       WHERE to_status = 'Entregado'
       ORDER BY order_id, created_at DESC
  ) sl
 WHERE sl.order_id = o.id
   AND o.status = 'Entregado'
   AND o.delivered_at IS NULL;

COMMIT;
