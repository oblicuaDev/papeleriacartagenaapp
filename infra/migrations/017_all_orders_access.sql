-- =============================================================
-- 017_all_orders_access.sql
--   - users.all_orders_access (BOOLEAN, default false): perfil
--     "Dirección Comercial". Cuando true, un asesor ve y trabaja
--     pedidos de CUALQUIER vendedor, para cubrir a un asesor
--     ausente. El rol admin ya tiene esta cobertura de fábrica.
-- Idempotente.
--
-- NOTA: este archivo es historial/documentación. El cambio real ya
-- fue fusionado dentro de infra/migrate.sql (único script que se
-- ejecuta contra la BD, ver infra/setup-db.sh y README.dev.md).
-- =============================================================

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS all_orders_access BOOLEAN NOT NULL DEFAULT false;

COMMIT;
