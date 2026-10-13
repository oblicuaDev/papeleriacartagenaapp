-- =============================================================
-- 020_claim_items.sql — Artículos y cantidades de cada reclamo
--   * claim_items: snapshot del artículo del pedido + cantidad reclamada
-- Idempotente. (Se fusiona tambien en infra/migrate.sql, seccion 22.)
-- =============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS claim_items (
    id            SERIAL       PRIMARY KEY,
    claim_id      VARCHAR(20)  NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    order_item_id INTEGER      REFERENCES order_items(id) ON DELETE SET NULL,
    product_id    INTEGER,
    product_name  VARCHAR(300) NOT NULL,
    sku           VARCHAR(50)  NOT NULL,
    unit          VARCHAR(50),
    quantity      INTEGER      NOT NULL,
    CONSTRAINT chk_claim_item_qty CHECK (quantity > 0),
    CONSTRAINT uq_claim_item UNIQUE (claim_id, order_item_id)
);
CREATE INDEX IF NOT EXISTS idx_claim_items_claim      ON claim_items(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_items_order_item ON claim_items(order_item_id);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'papeleria_user') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON claim_items TO papeleria_user;
        GRANT USAGE, SELECT ON SEQUENCE claim_items_id_seq TO papeleria_user;
    END IF;
END $$;

COMMIT;
