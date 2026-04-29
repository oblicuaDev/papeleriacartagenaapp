-- =============================================================
-- 006_company_advisor_branch_overrides.sql — PHASE 9
-- - companies.advisor_id           -> asesor por defecto de la empresa
-- - sucursales.advisor_id          -> override por sucursal
-- - sucursales.price_list_id       -> override de lista de precios por sucursal
-- Idempotente.
-- =============================================================

BEGIN;

ALTER TABLE companies
    ADD COLUMN IF NOT EXISTS advisor_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE sucursales
    ADD COLUMN IF NOT EXISTS advisor_id    INTEGER REFERENCES users(id)       ON DELETE SET NULL;

ALTER TABLE sucursales
    ADD COLUMN IF NOT EXISTS price_list_id INTEGER REFERENCES price_lists(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_companies_advisor      ON companies(advisor_id);
CREATE INDEX IF NOT EXISTS idx_sucursales_advisor     ON sucursales(advisor_id);
CREATE INDEX IF NOT EXISTS idx_sucursales_price_list  ON sucursales(price_list_id);

COMMIT;

-- Verificacion
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name IN ('companies', 'sucursales')
  AND column_name IN ('advisor_id', 'price_list_id')
ORDER BY table_name, column_name;
