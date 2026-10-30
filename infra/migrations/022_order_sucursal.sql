-- =============================================================
-- 022_order_sucursal.sql — Sucursal propia del pedido
--   * orders.sucursal_id: sucursal a nombre de la cual queda el pedido.
--     Hasta ahora se derivaba del usuario creador (users.sucursal_id);
--     el administrador_contrato puede crear pedidos a nombre de otra
--     sucursal de su empresa, conservando client_id = autor.
--   * Backfill: pedidos existentes toman la sucursal de su creador.
-- Idempotente. (Se fusiona tambien en infra/migrate.sql, seccion 24.)
-- =============================================================
BEGIN;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS sucursal_id INTEGER
    REFERENCES sucursales(id) ON DELETE RESTRICT;

UPDATE orders o
   SET sucursal_id = u.sucursal_id
  FROM users u
 WHERE u.id = o.client_id
   AND o.sucursal_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_sucursal ON orders(sucursal_id);

COMMIT;
