#!/bin/bash
# =============================================================
# setup-vm.sh — Papelería Cartagena
# Instala: Node.js 20, PostgreSQL 15, Nginx, PM2, Git
# Ubuntu 22.04 LTS — us-central1-a
# =============================================================
set -e

echo "========================================"
echo " Papelería Cartagena — Setup VM"
echo "========================================"

# ----------------------------------------------------------
# 1. Actualizar sistema
# ----------------------------------------------------------
echo "[1/7] Actualizando paquetes del sistema..."
apt-get update -y
apt-get upgrade -y
apt-get install -y curl git ufw build-essential

# ----------------------------------------------------------
# 2. Node.js 20 LTS via NodeSource
# ----------------------------------------------------------
echo "[2/7] Instalando Node.js 20 LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
node -v
npm -v

# ----------------------------------------------------------
# 3. PM2
# ----------------------------------------------------------
echo "[3/7] Instalando PM2..."
npm install -g pm2
pm2 startup systemd -u root --hp /root
systemctl enable pm2-root

# ----------------------------------------------------------
# 4. PostgreSQL 15
# ----------------------------------------------------------
echo "[4/7] Instalando PostgreSQL 15..."
apt-get install -y postgresql-common
/usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
apt-get install -y postgresql-15
systemctl enable postgresql
systemctl start postgresql

# ----------------------------------------------------------
# 5. Nginx
# ----------------------------------------------------------
echo "[5/7] Instalando Nginx..."
apt-get install -y nginx
systemctl enable nginx
systemctl start nginx

# ----------------------------------------------------------
# 6. Configurar UFW Firewall
# ----------------------------------------------------------
echo "[6/7] Configurando UFW..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw allow 3000/tcp
ufw --force enable

# ----------------------------------------------------------
# 7. Crear directorio de la aplicación
# ----------------------------------------------------------
echo "[7/7] Creando estructura de directorios..."
mkdir -p /var/www/papeleria-cartagena/{api,client,uploads}
chown -R www-data:www-data /var/www/papeleria-cartagena

echo ""
echo "========================================"
echo " Setup completado exitosamente"
echo " Node.js: $(node -v)"
echo " npm:     $(npm -v)"
echo " PM2:     $(pm2 -v)"
echo " Nginx:   $(nginx -v 2>&1)"
echo " PG:      $(psql --version)"
echo "========================================"
