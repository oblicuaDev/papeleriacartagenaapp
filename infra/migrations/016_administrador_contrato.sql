-- =============================================================
-- 016_administrador_contrato.sql
--   - users.client_role: nuevo valor 'administrador_contrato'.
--     Funciona como supervisor pero a nivel de toda la empresa
--     (todas las sucursales), a diferencia de admin_empresa que
--     es de solo lectura.
-- Idempotente.
--
-- NOTA: este archivo es historial/documentación. El cambio real ya
-- fue fusionado dentro de infra/migrate.sql (único script que se
-- ejecuta contra la BD, ver infra/setup-db.sh y README.dev.md).
-- =============================================================

BEGIN;

ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_client_role;
ALTER TABLE users ADD  CONSTRAINT chk_client_role
    CHECK (
        (role = 'client' AND client_role IN ('supervisor', 'creador_pedidos', 'admin_empresa', 'administrador_contrato'))
        OR (role <> 'client' AND client_role IS NULL)
    );

COMMIT;
