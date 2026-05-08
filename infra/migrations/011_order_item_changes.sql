-- =============================================================
-- 011_order_item_changes.sql
--   Trazabilidad de modificaciones de items por el asesor durante
--   "Validar disponibilidad". Cada cambio guarda usuario, fecha,
--   estado anterior/nuevo y comentario obligatorio.
-- Idempotente.
-- =============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS order_item_changes (
    id              SERIAL         PRIMARY KEY,
    order_id        VARCHAR(20)    NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id      INTEGER        NOT NULL,
    product_name    VARCHAR(300)   NOT NULL,
    sku             VARCHAR(50),
    action          VARCHAR(20)    NOT NULL,
    prev_quantity   INTEGER,
    new_quantity    INTEGER,
    prev_unit_price NUMERIC(12, 2),
    new_unit_price  NUMERIC(12, 2),
    reason          TEXT           NOT NULL,
    changed_by      INTEGER        REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_oic_action CHECK (action IN ('updated', 'removed'))
);

CREATE INDEX IF NOT EXISTS idx_oic_order ON order_item_changes(order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_oic_changed_by ON order_item_changes(changed_by);

COMMIT;
