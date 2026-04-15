-- =============================================================
-- setup-dev.sql — Entorno local de desarrollo
-- Ejecutar UNA VEZ como superusuario PostgreSQL:
--   psql -U postgres -f infra/setup-dev.sql
-- =============================================================

-- 1. Crear usuario de desarrollo
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'papeleria_dev') THEN
    CREATE ROLE papeleria_dev LOGIN PASSWORD 'papeleria_dev_2026';
    RAISE NOTICE 'Usuario papeleria_dev creado';
  ELSE
    RAISE NOTICE 'Usuario papeleria_dev ya existe';
  END IF;
END $$;

-- 2. Crear base de datos de desarrollo
SELECT 'CREATE DATABASE papeleria_db_dev OWNER papeleria_dev ENCODING ''UTF8'' TEMPLATE template0'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'papeleria_db_dev')\gexec

-- 3. Dar todos los privilegios
GRANT ALL PRIVILEGES ON DATABASE papeleria_db_dev TO papeleria_dev;

\echo ''
\echo '======================================'
\echo ' Base de datos de desarrollo lista'
\echo ' DB:   papeleria_db_dev'
\echo ' User: papeleria_dev'
\echo ' Pass: papeleria_dev_2026'
\echo '======================================'
\echo ''
\echo 'Ahora ejecuta las migraciones:'
\echo '  psql -U papeleria_dev -d papeleria_db_dev -f infra/migrate.sql'
