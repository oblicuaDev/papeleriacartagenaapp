-- =============================================================
-- 007_admin_empresa_and_delivery_assignment.sql — PHASE 3
--   - Agrega 'admin_empresa' como client_role válido
--     (ve toda la empresa, NO aprueba pedidos).
--   - orders.delivery_id: asignación de repartidor a un pedido.
-- Idempotente.
-- =============================================================

BEGIN;

-- 1. Permitir 'admin_empresa' como client_role
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_client_role;
ALTER TABLE users ADD  CONSTRAINT chk_client_role
    CHECK (
        (role = 'client' AND client_role IN ('supervisor', 'creador_pedidos', 'admin_empresa'))
        OR (role <> 'client' AND client_role IS NULL)
    );

-- 2. orders.delivery_id — repartidor asignado al pedido
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS delivery_id INTEGER
        REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_delivery_id ON orders(delivery_id);

COMMIT;
