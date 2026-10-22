-- =============================================================
-- 021_order_item_added.sql — Agregar productos a un pedido
--   * order_item_changes.action gana 'added' (artículos nuevos
--     incorporados al editar un pedido "Pendiente por aprobar").
-- Idempotente. (Se fusiona tambien en infra/migrate.sql, seccion 23.)
-- =============================================================
BEGIN;

ALTER TABLE order_item_changes DROP CONSTRAINT IF EXISTS chk_oic_action;
ALTER TABLE order_item_changes ADD  CONSTRAINT chk_oic_action
    CHECK (action IN ('updated', 'removed', 'added'));

COMMIT;
