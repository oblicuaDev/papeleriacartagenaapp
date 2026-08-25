-- =============================================================
-- 013_gran_categorias.sql
--   - gran_categorias: agrupa categorias (ahora subcategorias) en
--     Papelería / Aseo / Cafetería según el plan único de cuentas.
--   - categories.gran_categoria_id: FK opcional a gran_categorias.
-- Idempotente.
--
-- NOTA: este archivo es historial/documentación. El cambio real ya
-- fue fusionado dentro de infra/migrate.sql (único script que se
-- ejecuta contra la BD, ver infra/setup-db.sh y README.dev.md).
-- =============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS gran_categorias (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(100) NOT NULL UNIQUE,
    active     BOOLEAN      NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE categories
    ADD COLUMN IF NOT EXISTS gran_categoria_id INTEGER REFERENCES gran_categorias(id) ON DELETE SET NULL;

INSERT INTO gran_categorias (name) VALUES
    ('Papelería'),
    ('Aseo'),
    ('Cafetería')
ON CONFLICT (name) DO NOTHING;

COMMIT;
