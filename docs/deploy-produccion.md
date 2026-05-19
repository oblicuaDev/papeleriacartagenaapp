# Deploy y Producción

---

## Arquitectura de producción

```
GitHub (main branch)
       │
       │ push → GitHub Actions
       ▼
┌─────────────────────┐
│  GitHub Actions CI  │
│  .github/workflows/ │
│  deploy.yml         │
└──────────┬──────────┘
           │ SSH
           ▼
┌─────────────────────────────────────────────┐
│            VM Google Cloud Platform          │
│                                             │
│  ┌─────────────────┐  ┌──────────────────┐  │
│  │   Nginx :80     │  │  Node.js :3000   │  │
│  │                 │  │  (PM2 managed)   │  │
│  │  /              │  │  api/server.js   │  │
│  │  → dist/ static │  │                  │  │
│  │  /api/*         │  │                  │  │
│  │  → :3000 proxy  │  │                  │  │
│  └─────────────────┘  └────────┬─────────┘  │
│                                │             │
│                    ┌───────────▼──────────┐  │
│                    │  PostgreSQL :5432    │  │
│                    │  papeleria_db        │  │
│                    └──────────────────────┘  │
└─────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────┐
│  Google Cloud       │
│  Storage            │
│  (imágenes/adjuntos)│
└─────────────────────┘
```

---

## CI/CD con GitHub Actions

### Workflow (`.github/workflows/deploy.yml`)

El workflow se activa en cada push a `main`:

```yaml
on:
  push:
    branches: [main]
```

**Proceso:**
1. GitHub Actions conecta por SSH a la VM usando `VM_HOST`, `VM_USER`, `SSH_PRIVATE_KEY`
2. Ejecuta `infra/deploy-from-repo.sh --client` en la VM
3. El script hace `git pull`, `npm install`, `npm run build` y copia `dist/` a `/var/www/papeleria-cartagena/client/`

### Secrets requeridos en GitHub

| Secret            | Descripción                             |
|-------------------|-----------------------------------------|
| `VM_HOST`         | IP o hostname de la VM de producción    |
| `VM_USER`         | Usuario SSH (ej: `ubuntu`, `deploy`)    |
| `SSH_PRIVATE_KEY` | Clave privada SSH (sin passphrase)      |

Para configurarlos: **GitHub repo → Settings → Secrets and variables → Actions → New repository secret**

---

## Build del frontend

```bash
npm run build
```

Genera `dist/` con assets optimizados:
- Bundle JS dividido en chunks (react-vendor, charts, xlsx, icons)
- CSS minificado con purging de clases no usadas (Tailwind)
- Assets con hash en el nombre (cache-busting)

---

## Configuración Nginx (`infra/nginx.conf`)

```nginx
server {
    listen 80;
    server_name tudominio.com;
    root /var/www/papeleria-cartagena/client;
    index index.html;

    # SPA fallback — todas las rutas sirven index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy a la API
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Uploads (si se usa almacenamiento local)
    location /uploads/ {
        alias /var/www/papeleria-cartagena/uploads/;
        expires 7d;
    }

    # Cache largo para assets estáticos (Vite genera nombres con hash)
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

---

## Gestión del proceso Node.js (PM2)

El backend se ejecuta con PM2 para garantizar que se reinicie automáticamente:

```bash
# Instalar PM2 globalmente
npm install -g pm2

# Iniciar el servidor
pm2 start api/server.js --name papeleria-api

# Ver estado
pm2 status

# Ver logs
pm2 logs papeleria-api

# Reiniciar tras cambios de código
pm2 restart papeleria-api

# Configurar para inicio automático con el sistema
pm2 startup
pm2 save
```

---

## Setup inicial de la VM

Para configurar un servidor nuevo desde cero, ejecutar los scripts en orden:

```bash
# 1. Configurar el servidor (Ubuntu 22.04+)
bash infra/setup-vm.sh

# 2. Configurar la base de datos de producción
bash infra/setup-db.sh

# 3. Ejecutar migraciones
psql -U papeleria_db -d papeleria_db -f infra/migrate.sql

# 4. Configurar variables de entorno
# Crear /etc/environment o usar PM2 ecosystem file con las variables de producción

# 5. Iniciar el backend
pm2 start api/server.js --name papeleria-api
pm2 startup && pm2 save

# 6. Deploy inicial del frontend
bash infra/deploy.sh
```

---

## Variables de entorno en producción

Las variables se configuran directamente en el sistema (no en archivos `.env`):

**Opción A — PM2 ecosystem file (`ecosystem.config.js`):**
```js
module.exports = {
  apps: [{
    name: 'papeleria-api',
    script: 'api/server.js',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      DATABASE_URL: 'postgresql://...',
      JWT_SECRET: '...',
      CORS_ORIGIN: 'https://tudominio.com',
      GCS_BUCKET: 'nombre-bucket',
      GCS_KEY_FILE: '/etc/gcs-credentials.json',
    }
  }]
};
```

**Opción B — `/etc/environment`:**
```bash
DATABASE_URL="postgresql://..."
JWT_SECRET="..."
```

---

## Base de datos en producción

```bash
# Backup manual
pg_dump -U papeleria_db papeleria_db > backup_$(date +%Y%m%d).sql

# Restaurar backup
psql -U papeleria_db papeleria_db < backup_YYYYMMDD.sql

# Ejecutar nueva migración
psql -U papeleria_db -d papeleria_db -f infra/migrations/011_order_item_changes.sql
```

---

## SSL / HTTPS

Para habilitar HTTPS se recomienda usar **Let's Encrypt + Certbot**:

```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d tudominio.com
```

Certbot modifica `nginx.conf` automáticamente para redirigir HTTP → HTTPS y configurar los certificados.

---

## Monitoreo y logs

```bash
# Logs del backend (PM2)
pm2 logs papeleria-api --lines 100

# Logs de Nginx
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# Estado del servidor
pm2 monit
```

---

## Checklist de deploy a producción

- [ ] Push a `main` en GitHub
- [ ] Verificar que GitHub Actions pase correctamente (green check)
- [ ] Acceder al sitio y verificar que la versión es la esperada
- [ ] Probar login con credenciales reales
- [ ] Verificar que la API responde: `curl https://tudominio.com/api/v1/auth/me`
- [ ] Verificar carga de imágenes de productos (GCS)
- [ ] Revisar logs de PM2 para errores: `pm2 logs`
- [ ] Si hay migraciones nuevas, ejecutarlas en la BD de producción antes del deploy

---

## Rollback

Si el deploy genera problemas:

```bash
# En la VM, revertir al commit anterior
cd /var/www/papeleria-cartagena/repo
git log --oneline -5          # Ver commits recientes
git checkout <commit-anterior>

# Reconstruir y desplegar el frontend anterior
npm run build
cp -r dist/* /var/www/papeleria-cartagena/client/

# Reiniciar backend
pm2 restart papeleria-api
```
