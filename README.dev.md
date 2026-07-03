# Papelería Cartagena — Entorno de Desarrollo Local

## Prerequisitos

- Node.js 20+ (instalado)
- PostgreSQL 18 (instalado y corriendo)

---

## Setup inicial (solo la primera vez)

### 1. Crear base de datos local

Abre una terminal como **Administrador** y ejecuta:

```bash
PGPASSWORD=tu_password_postgres psql -U tu_usuario_postgres -h localhost -f infra/setup-dev.sql
```

### 2. Crear tablas (migraciones)

```bash
psql -U papeleria_dev -d papeleria_db_dev -W -f infra/migrate.sql
# contraseña: papeleria_dev_2026
```

### 3. Insertar datos de prueba

```bash
node --env-file=api/.env.local infra/seed.js
```

### 4. Instalar dependencias del backend

```bash
cd api && npm install && cd ..
```

---

## Levantar el entorno de desarrollo

Un solo comando levanta la API (puerto 3000) y el frontend (puerto 5173) juntos:

```bash
npm run dev:all
```

O por separado en dos terminales:

```bash
# Terminal 1 — Backend
npm run dev:api

# Terminal 2 — Frontend
npm run dev
```

Abre el navegador en: **http://localhost:5173**

---

## Credenciales de prueba

Las contraseñas de las cuentas de prueba ya no se documentan en texto plano aquí
(evita que queden expuestas en el repositorio, que es público). Se definen como
variables `SEED_*` en tu `api/.env.local` (ver `api/.env.example`) y `npm run db:seed`
las imprime en consola al terminar.

─── Internos ──────────────────────────────────────
admin@papeleriacartagena.com
asesor@papeleriacartagena.com (Cartagena)
carlos@papeleriacartagena.com (Bogotá)
pedro@papeleriacartagena.com (Cartagena, repartidor)
lucia@papeleriacartagena.com (Bogotá, repartidor)

─── Papelería El Centro · Lista B (override Medellín → A) ───
supervisor@elcentro.com
pedidos@elcentro.com
admin@elcentro.com ← admin_empresa
supervisor.medellin@elcentro.com
pedidos.medellin@elcentro.com

─── Distribuciones Norte · Lista C ────────────────
supervisor@distnorte.com
pedidos@distnorte.com

─── Colegio San Andrés · Lista A ──────────────────
rectoria@colegiosanandres.edu.co
compras@colegiosanandres.edu.co

---

## Comandos útiles

```bash
npm run dev:all       # Levanta API + frontend juntos
npm run dev:api       # Solo backend (port 3000)
npm run dev           # Solo frontend (port 5173)

npm run db:setup      # Crear DB local (primera vez)
npm run db:migrate    # Correr migraciones SQL
npm run db:seed       # Insertar datos de prueba

npm run build         # Build de producción del frontend
```

---

## Arquitectura en desarrollo

```
http://localhost:5173  ←  Vite dev server (React)
        │
        │ /api/* proxy
        ↓
http://localhost:3000  ←  Node.js / Express
        │
        ↓
PostgreSQL 18 (local)
DB: papeleria_db_dev
```

El proxy de Vite reenvía automáticamente todas las llamadas a `/api/v1/*`
al backend en `localhost:3000`, sin CORS y sin cambiar ningún archivo fuente.

---

## Diferencias dev vs producción

|            | Desarrollo                       | Producción                              |
| ---------- | -------------------------------- | --------------------------------------- |
| Frontend   | Vite dev server (:5173)          | Nginx sirve dist/ estático              |
| API        | Node directo (:3000)             | PM2 + Nginx proxy                       |
| DB         | `papeleria_db_dev` local         | `papeleria_db` en VM GCP                |
| JWT secret | `dev_secret_...` (en .env.local) | secret aleatorio (en VM)                |
| Uploads    | `./api/uploads/`                 | `/var/www/papeleria-cartagena/uploads/` |
