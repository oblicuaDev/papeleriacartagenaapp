-- =============================================================
-- 001_price_list_items.sql — PHASE 1
-- - Tabla price_list_items: precio explicito por producto x lista
-- - Vinculo companies -> price_list
-- - Se conserva products.base_price y users.price_list_id
-- Idempotente: usa IF NOT EXISTS
-- =============================================================

BEGIN;

-- ----------------------------------------------------------
-- 1. companies.price_list_id  (lista por empresa)
-- ----------------------------------------------------------
ALTER TABLE companies
    ADD COLUMN IF NOT EXISTS price_list_id INTEGER
        REFERENCES price_lists(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_companies_price_list
    ON companies(price_list_id);

-- ----------------------------------------------------------
-- 2. price_list_items — Precio explicito por (producto, lista)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS price_list_items (
    id            SERIAL         PRIMARY KEY,
    product_id    INTEGER        NOT NULL REFERENCES products(id)    ON DELETE CASCADE,
    price_list_id INTEGER        NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
    price         NUMERIC(12, 2) NOT NULL,
    currency      CHAR(3)        NOT NULL DEFAULT 'COP',
    created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_price_list_items_product_list UNIQUE (product_id, price_list_id),
    CONSTRAINT chk_pli_price    CHECK (price > 0),
    CONSTRAINT chk_pli_currency CHECK (currency ~ '^[A-Z]{3}$')
);

CREATE INDEX IF NOT EXISTS idx_pli_product
    ON price_list_items(product_id);
CREATE INDEX IF NOT EXISTS idx_pli_price_list
    ON price_list_items(price_list_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION fn_update_pli_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pli_updated_at ON price_list_items;
CREATE TRIGGER trg_pli_updated_at
    BEFORE UPDATE ON price_list_items
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_pli_updated_at();

COMMIT;

-- ----------------------------------------------------------
-- Verificacion
-- ----------------------------------------------------------
SELECT
    'companies.price_list_id' AS objeto,
    EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'companies' AND column_name = 'price_list_id'
    ) AS ok
UNION ALL
SELECT
    'price_list_items',
    EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'price_list_items'
    );
