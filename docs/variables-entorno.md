# Variables de Entorno

La aplicación usa dos contextos de configuración: el **frontend** (Vite, variables `VITE_*`) y el **backend** (Node.js/Express, cargadas desde `.env.local` o variables del sistema en producción).

Ver también: [`.env.example`](../.env.example) en la raíz del proyecto.

---

## Frontend (Vite)

Las variables del frontend deben empezar con `VITE_` para ser expuestas al bundle.

Archivo en desarrollo: `.env.local` (en la raíz del proyecto, ignorado por git)
Archivo en producción: `.env.production` (incluido en git — no contiene secretos)

| Variable       | Requerida | Descripción                                    | Ejemplo          |
|----------------|-----------|------------------------------------------------|------------------|
| `VITE_API_URL` | Sí        | Base URL de la API. En producción es `/api/v1` | `/api/v1`        |

En desarrollo, esta variable no es necesaria porque el proxy de Vite reenvía `/api/*` a `localhost:3000` automáticamente.

---

## Backend (Node.js / Express)

Archivo en desarrollo: `api/.env.local` (ignorado por git — **nunca commitear**)
En producción: variables de entorno del sistema (VM o PM2 ecosystem file)

### Requeridas

| Variable           | Descripción                                               | Ejemplo                              |
|--------------------|-----------------------------------------------------------|--------------------------------------|
| `PORT`             | Puerto donde escucha Express                              | `3000`                               |
| `DATABASE_URL`     | Connection string de PostgreSQL                           | `postgresql://user:pass@host:5432/db`|
| `JWT_SECRET`       | Secreto para firmar/verificar tokens JWT (mín. 32 chars)  | `un_secreto_muy_largo_y_aleatorio`   |
| `CORS_ORIGIN`      | Origen permitido para CORS                                | `https://tudominio.com`              |

### Almacenamiento de archivos

| Variable          | Descripción                                   | Ejemplo                      |
|-------------------|-----------------------------------------------|------------------------------|
| `GCS_BUCKET`      | Nombre del bucket de Google Cloud Storage     | `papeleria-cartagena-uploads`|
| `GCS_KEY_FILE`    | Ruta al archivo de credenciales de GCS (JSON) | `/etc/gcs-key.json`          |

Si `GCS_BUCKET` no está configurado, los archivos se guardan localmente en `api/uploads/` (solo para desarrollo).

### Opcionales

| Variable              | Descripción                                    | Default |
|-----------------------|------------------------------------------------|---------|
| `JWT_EXPIRY`          | Duración del token JWT                         | `8h`    |
| `UPLOAD_MAX_SIZE_MB`  | Tamaño máximo de archivos subidos (en MB)      | `10`    |
| `NODE_ENV`            | Entorno de ejecución                           | `development` |

---

## Diferencias dev vs. producción

| Variable        | Desarrollo (`api/.env.local`)             | Producción (sistema)                 |
|-----------------|-------------------------------------------|--------------------------------------|
| `DATABASE_URL`  | `postgresql://papeleria_dev:...@localhost` | Connection a DB en VM de GCP         |
| `JWT_SECRET`    | Cualquier string largo (no importa)       | String aleatorio seguro (>= 64 chars)|
| `CORS_ORIGIN`   | `http://localhost:5173`                   | `https://tudominio.com`              |
| `GCS_BUCKET`    | Puede estar vacío (usa uploads local)     | Nombre del bucket de producción      |
| `NODE_ENV`      | `development`                             | `production`                         |

---

## Seguridad

- **Nunca commitear** `api/.env.local` al repositorio (ya está en `.gitignore`)
- El `JWT_SECRET` de producción debe ser un string aleatorio de al menos 64 caracteres
- Las credenciales de GCS deben tener permisos mínimos (solo `Storage Object Admin` en el bucket específico)
- Rotar el `JWT_SECRET` invalida todos los tokens activos (requiere re-login de todos los usuarios)
