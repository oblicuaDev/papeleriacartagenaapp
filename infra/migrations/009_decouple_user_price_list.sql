-- =============================================================
-- 009_decouple_user_price_list.sql — PHASE 6
--   Desacopla la creación de usuarios cliente del modelo de precios.
--   El precio se resuelve en cascada (sucursal > empresa > usuario), así que
--   exigir price_list_id en el usuario era una restricción innecesaria que
--   acoplaba la administración de roles con la lógica de precios.
-- Idempotente.
-- =============================================================

BEGIN;

ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_client_fields;
ALTER TABLE users ADD  CONSTRAINT chk_client_fields
    CHECK (
        (role = 'client' AND company_id IS NOT NULL AND sucursal_id IS NOT NULL)
        OR role <> 'client'
    );

COMMIT;
