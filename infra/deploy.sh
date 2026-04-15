#!/bin/bash
# =============================================================
# deploy.sh — Papelería Cartagena
# Despliega API + frontend React en la VM
# Ejecutar desde el servidor: bash /tmp/deploy.sh
# =============================================================
set -e

APP_DIR="/var/www/papeleria-cartagena"
REPO_DIR="$APP_DIR/repo"
API_DIR="$APP_DIR/api"
CLIENT_DIR="$APP_DIR/client"
NGINX_CONF="/etc/nginx/sites-available/papeleria"

echo "======================================"
echo " Deploy — Papelería Cartagena"
echo " $(date)"
echo "======================================"

# ----------------------------------------------------------
# 1. Backend: instalar dependencias y recargar PM2
# ----------------------------------------------------------
echo "[1/4] Actualizando dependencias del backend..."
cd "$API_DIR"
npm install --omit=dev
pm2 reload papeleria-api --update-env
echo "[OK] API recargada"

# ----------------------------------------------------------
# 2. Frontend: build React
# ----------------------------------------------------------
echo "[2/4] Construyendo frontend React..."
mkdir -p "$CLIENT_DIR"
cd "$APP_DIR/frontend"
npm install
npm run build
cp -r dist/. "$CLIENT_DIR/"
echo "[OK] Build copiado a $CLIENT_DIR"

# ----------------------------------------------------------
# 3. Nginx: configurar y recargar
# ----------------------------------------------------------
echo "[3/4] Configurando Nginx..."
cp "$APP_DIR/infra/nginx.conf" "$NGINX_CONF"

# Habilitar sitio si no existe
if [ ! -f "/etc/nginx/sites-enabled/papeleria" ]; then
  ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/papeleria
fi

# Desactivar default si existe
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl reload nginx
echo "[OK] Nginx recargado"

# ----------------------------------------------------------
# 4. Resumen
# ----------------------------------------------------------
echo ""
echo "======================================"
echo " Deploy completado"
echo " API:      http://34.68.179.13/api/v1"
echo " Frontend: http://34.68.179.13"
echo " PM2:      $(pm2 list | grep papeleria)"
echo "======================================"
