-- =============================================================
-- 003_role_delivery.sql — PHASE 5
-- - Agrega 'delivery' como rol de nivel alto.
-- - delivery requiere branch_id (igual que advisor).
-- - chk_client_role se mantiene flexible: solo se enforza cuando role='client'.
-- Idempotente.
-- =============================================================

BEGIN;

-- Relajar chk_role para incluir 'delivery'
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_role;
ALTER TABLE users ADD  CONSTRAINT chk_role
    CHECK (role IN ('admin', 'advisor', 'client', 'delivery'));

-- Reemplazar chk_advisor_fields por uno que cubra advisor y delivery
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_advisor_fields;
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_branch_required;
ALTER TABLE users ADD  CONSTRAINT chk_branch_required
    CHECK (
        (role IN ('advisor', 'delivery') AND branch_id IS NOT NULL)
        OR role NOT IN ('advisor', 'delivery')
    );

-- Garantizar que delivery NO tenga campos de cliente
-- (no rompe nada porque chk_client_fields ya forzaba NULL fuera de 'client',
--  pero lo dejamos explicito para mayor claridad)
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_non_client_fields;
ALTER TABLE users ADD  CONSTRAINT chk_non_client_fields
    CHECK (
        role = 'client'
        OR (company_id IS NULL AND sucursal_id IS NULL AND price_list_id IS NULL AND client_role IS NULL)
    );

COMMIT;

-- Verificacion
SELECT
    conname,
    pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'users'::regclass
  AND conname IN ('chk_role', 'chk_branch_required', 'chk_client_role',
                  'chk_client_fields', 'chk_non_client_fields')
ORDER BY conname;
