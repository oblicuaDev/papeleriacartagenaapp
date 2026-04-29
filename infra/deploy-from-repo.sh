#!/bin/bash
# =============================================================
# deploy-from-repo.sh — Papeleria Cartagena
# Despliegue incremental desde un clone local del repositorio.
# Setup inicial: ya hecho via setup-vm.sh + setup-db.sh.
#
# Uso (desde la VM, como un usuario con sudo):
#   sudo bash /var/www/papeleria-cartagena/repo/infra/deploy-from-repo.sh           # solo API
#   sudo bash /var/www/papeleria-cartagena/repo/infra/deploy-from-repo.sh --client  # API + frontend
#   sudo bash .../deploy-from-repo.sh --client-only                                  # solo frontend
#   sudo bash .../deploy-from-repo.sh --skip-pull                                    # sin git pull
#
# Flags:
#   --client        construye y publica tambien el frontend
#   --client-only   solo frontend (no toca API ni PM2)
#   --skip-pull     no ejecuta `git pull` (para deploys manuales tras edicion local)
#   --no-backup     omite el backup de api/src (NO recomendado)
# =============================================================
set -euo pipefail

REPO="/var/www/papeleria-cartagena/repo"
APP_API="/var/www/papeleria-cartagena/api"
APP_CLIENT="/var/www/papeleria-cartagena/client"
PM2_PROCESS="papeleria-api"

# ── Parse flags ─────────────────────────────────────────────
DO_API=1
DO_CLIENT=0
DO_PULL=1
DO_BACKUP=1

for arg in "$@"; do
  case "$arg" in
    --client)       DO_CLIENT=1 ;;
    --client-only)  DO_CLIENT=1; DO_API=0 ;;
    --skip-pull)    DO_PULL=0 ;;
    --no-backup)    DO_BACKUP=0 ;;
    -h|--help)
      sed -n '3,18p' "$0"; exit 0 ;;
    *)
      echo "Flag desconocido: $arg"; exit 2 ;;
  esac
done

TS=$(date +%Y%m%d_%H%M%S)
echo "======================================"
echo " Deploy Papeleria Cartagena — $TS"
echo " API=$DO_API  CLIENT=$DO_CLIENT  PULL=$DO_PULL"
echo "======================================"

# ── 1. git pull ─────────────────────────────────────────────
if [ "$DO_PULL" = "1" ]; then
  echo "[1/6] git pull..."
  cd "$REPO"
  git pull --ff-only origin main
  echo "    HEAD: $(git rev-parse --short HEAD) — $(git log -1 --pretty=%s)"
else
  echo "[1/6] git pull omitido (--skip-pull)"
fi

# ── 2. Backup api/src ───────────────────────────────────────
if [ "$DO_API" = "1" ] && [ "$DO_BACKUP" = "1" ]; then
  echo "[2/6] Backup de api/src..."
  if [ -d "$APP_API/src" ]; then
    cp -r "$APP_API/src" "$APP_API/src.bak.$TS"
    echo "    Backup: $APP_API/src.bak.$TS"
  fi
else
  echo "[2/6] Backup omitido"
fi

# ── 3. Sync codigo de la API ────────────────────────────────
if [ "$DO_API" = "1" ]; then
  echo "[3/6] Sync api/src..."
  mkdir -p "$APP_API/src"
  rsync -a --delete "$REPO/api/src/" "$APP_API/src/"

  # Sync package.json y reinstalar deps si cambiaron
  if ! diff -q "$REPO/api/package.json" "$APP_API/package.json" >/dev/null 2>&1; then
    echo "    package.json cambio -> npm install --omit=dev"
    cp "$REPO/api/package.json" "$APP_API/package.json"
    [ -f "$REPO/api/package-lock.json" ] && cp "$REPO/api/package-lock.json" "$APP_API/package-lock.json"
    (cd "$APP_API" && npm install --omit=dev)
  else
    echo "    package.json sin cambios"
  fi

  chown -R www-data:www-data "$APP_API/src" "$APP_API/package.json"
  [ -f "$APP_API/package-lock.json" ] && chown www-data:www-data "$APP_API/package-lock.json"
else
  echo "[3/6] API skip"
fi

# ── 4. Sanity check sintaxis ────────────────────────────────
if [ "$DO_API" = "1" ]; then
  echo "[4/6] node -c app.js..."
  if sudo -u www-data node -c "$APP_API/src/app.js"; then
    echo "    Sintaxis OK"
  else
    echo "    ERROR de sintaxis. Revisa el codigo. Rollback:"
    echo "      sudo rm -rf $APP_API/src && sudo mv $APP_API/src.bak.$TS $APP_API/src"
    exit 1
  fi
else
  echo "[4/6] Sintaxis skip"
fi

# ── 5. Frontend (opcional) ──────────────────────────────────
if [ "$DO_CLIENT" = "1" ]; then
  echo "[5/6] Build frontend..."
  cd "$REPO"
  npm install --no-audit --no-fund
  npm run build
  mkdir -p "$APP_CLIENT"
  rsync -a --delete dist/ "$APP_CLIENT/"
  chown -R www-data:www-data "$APP_CLIENT"
  echo "    Frontend publicado en $APP_CLIENT"
else
  echo "[5/6] Frontend skip (usa --client si lo necesitas)"
fi

# ── 6. Reload PM2 ───────────────────────────────────────────
if [ "$DO_API" = "1" ]; then
  echo "[6/6] pm2 reload $PM2_PROCESS..."
  pm2 reload "$PM2_PROCESS" --update-env
  sleep 1
  pm2 logs "$PM2_PROCESS" --lines 20 --nostream || true
else
  echo "[6/6] PM2 skip"
fi

echo ""
echo "======================================"
echo " Deploy OK"
[ "$DO_API"    = "1" ] && [ "$DO_BACKUP" = "1" ] && echo " Rollback API: sudo rm -rf $APP_API/src && sudo mv $APP_API/src.bak.$TS $APP_API/src && pm2 reload $PM2_PROCESS"
[ "$DO_CLIENT" = "1" ] && echo " Rollback frontend: re-deploy una version anterior"
echo "======================================"
