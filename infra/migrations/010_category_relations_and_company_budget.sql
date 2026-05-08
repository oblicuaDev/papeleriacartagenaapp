-- =============================================================
-- 010_category_relations_and_company_budget.sql
--   - category_relations: relaciona categorias para sugerir productos
--   - companies.annual_budget: presupuesto anual por empresa
-- Idempotente.
-- =============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS category_relations (
    category_id         INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    related_category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (category_id, related_category_id),
    CONSTRAINT chk_no_self_relation CHECK (category_id <> related_category_id)
);

CREATE INDEX IF NOT EXISTS idx_category_relations_category ON category_relations(category_id);

ALTER TABLE companies
    ADD COLUMN IF NOT EXISTS annual_budget NUMERIC(14, 2);

ALTER TABLE companies DROP CONSTRAINT IF EXISTS chk_companies_annual_budget;
ALTER TABLE companies ADD  CONSTRAINT chk_companies_annual_budget
    CHECK (annual_budget IS NULL OR annual_budget >= 0);

COMMIT;
