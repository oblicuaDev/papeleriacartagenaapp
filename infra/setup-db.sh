#!/bin/bash
# =============================================================
# setup-db.sh — Papelería Cartagena
# Configura PostgreSQL: usuario, base de datos y migraciones
# Ejecutar como root en la VM
# =============================================================
set -e

DB_NAME="papeleria_db"
DB_USER="papeleria_user"
DB_PASS="***REMOVED***"   # Cambiar en producción vía variable de entorno

echo "========================================"
echo " Configurando PostgreSQL..."
echo "========================================"

# Crear usuario y base de datos
sudo -u postgres psql <<EOF
-- Crear usuario si no existe
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${DB_USER}') THEN
        CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}';
    END IF;
END
\$\$;

-- Crear base de datos si no existe
SELECT 'CREATE DATABASE ${DB_NAME} OWNER ${DB_USER} ENCODING ''UTF8'' LC_COLLATE ''en_US.UTF-8'' LC_CTYPE ''en_US.UTF-8'''
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}')\gexec

-- Dar privilegios
GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
EOF

echo "[OK] Usuario '${DB_USER}' y base de datos '${DB_NAME}' listos."

# Ejecutar migraciones
echo "Ejecutando migraciones SQL..."
sudo -u postgres psql -d "${DB_NAME}" -f /tmp/migrate.sql

echo ""
echo "========================================"
echo " Base de datos lista"
echo " DB:   ${DB_NAME}"
echo " User: ${DB_USER}"
echo "========================================"
