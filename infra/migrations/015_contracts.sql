-- =============================================================
-- 015_contracts.sql
--   - contracts: contrato por empresa (fecha desde/hasta, monto).
--   - contract_products: SKUs incluidos en el contrato (M:N).
--   Un contrato "vigente" (active=true y hoy dentro del rango de
--   fechas) restringe el catálogo del cliente de esa empresa a
--   esos SKUs. Varios contratos vigentes simultáneos -> unión de SKUs.
-- Idempotente.
--
-- NOTA: este archivo es historial/documentación. El cambio real ya
-- fue fusionado dentro de infra/migrate.sql (único script que se
-- ejecuta contra la BD, ver infra/setup-db.sh y README.dev.md).
-- =============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS contracts (
    id         SERIAL PRIMARY KEY,
    company_id INTEGER        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    date_from  DATE           NOT NULL,
    date_to    DATE           NOT NULL,
    amount     NUMERIC(14,2)  NOT NULL,
    active     BOOLEAN        NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_contract_dates  CHECK (date_to >= date_from),
    CONSTRAINT chk_contract_amount CHECK (amount >= 0)
);
CREATE INDEX IF NOT EXISTS idx_contracts_company ON contracts(company_id);

CREATE TABLE IF NOT EXISTS contract_products (
    contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    product_id  INTEGER NOT NULL REFERENCES products(id)  ON DELETE CASCADE,
    PRIMARY KEY (contract_id, product_id)
);

COMMIT;
