# Papelería Cartagena — Documentación Técnica

Sistema de proveeduría integral B2B para gestión de pedidos de papelería y suministros de oficina, con roles diferenciados (admin, asesor, cliente, repartidor), listas de precios personalizadas y flujo de aprobación multinivel.

---

## Stack tecnológico

| Capa           | Tecnología                                               |
|----------------|----------------------------------------------------------|
| Frontend       | React 18.2 · Vite 5 · React Router 6 · Tailwind CSS 3   |
| Iconos         | Lucide React                                             |
| Gráficas       | Recharts                                                 |
| Exportación    | XLSX (ExcelJS)                                           |
| Backend        | Node.js · Express 4                                      |
| Base de datos  | PostgreSQL 15/18                                         |
| Autenticación  | JWT (8 h) + bcrypt                                       |
| Almacenamiento | Google Cloud Storage (imágenes y adjuntos)               |
| PDF            | PDFKit                                                   |
| Infraestructura| Nginx · PM2 · GCP VM · GitHub Actions CI/CD              |

---

## Arquitectura general

```
                    Internet
                       │
               ┌───────▼────────┐
               │  Nginx :80     │
               │  - Sirve /dist │
               │  - Proxy /api/ │
               └───────┬────────┘
          ┌────────────┤
          │            │ /api/v1/*
    React SPA     ┌────▼──────────┐
    (dist/)       │  Node.js :3000│
                  │  Express API  │
                  └────┬──────────┘
                       │
               ┌───────▼────────┐
               │  PostgreSQL    │
               │  papeleria_db  │
               └───────┬────────┘
                       │
               ┌───────▼────────┐
               │  Google Cloud  │
               │  Storage       │
               │  (uploads)     │
               └────────────────┘
```

Ver detalles en [arquitectura.md](arquitectura.md).

---

## Estructura de carpetas

```
papeleriacartagenaapp/
├── src/                    # Frontend React
│   ├── components/         # Componentes reutilizables
│   ├── context/            # Estado global (AuthContext, AppContext)
│   ├── data/               # Datos mock / helpers
│   ├── pages/
│   │   ├── admin/          # Módulo administrador
│   │   ├── advisor/        # Módulo asesor
│   │   ├── client/         # Módulo cliente
│   │   ├── delivery/       # Módulo repartidor
│   │   ├── Login.jsx
│   │   └── UserManual.jsx  # Manual público /manual
│   ├── services/
│   │   └── api.js          # Cliente HTTP con camelCase automático
│   ├── App.jsx             # Router principal
│   └── main.jsx            # Entry point
├── api/                    # Backend Express
│   ├── server.js           # Entry point (:3000)
│   ├── src/
│   │   ├── app.js          # Express setup, CORS, rutas
│   │   ├── config/db.js    # Pool PostgreSQL
│   │   ├── lib/            # Utilidades (PDF, Excel, GCS, pricing)
│   │   ├── middleware/     # auth.js (JWT)
│   │   └── routes/         # Handlers por recurso
│   └── package.json
├── infra/                  # Infraestructura
│   ├── migrate.sql         # Schema completo
│   ├── setup-dev.sql       # Crear DB local
│   ├── nginx.conf          # Config Nginx producción
│   ├── deploy.sh           # Script despliegue
│   └── migrations/         # Historial de migraciones
├── docs/                   # Esta documentación
├── .github/workflows/      # GitHub Actions CI/CD
├── .env.production         # Variables producción frontend
├── .env.example            # Plantilla de variables
├── vite.config.js
├── tailwind.config.js
└── package.json
```

---

## Instalación y configuración

### Prerequisitos

- Node.js 20+
- PostgreSQL 15+
- (Producción) cuenta de Google Cloud Storage

### 1. Clonar e instalar

```bash
git clone <repo-url>
cd papeleriacartagenaapp
npm install          # dependencias frontend
cd api && npm install && cd ..   # dependencias backend
```

### 2. Configurar variables de entorno

```bash
cp .env.example api/.env.local
# Editar api/.env.local con tus valores
```

Ver [variables-entorno.md](variables-entorno.md) para descripción completa.

### 3. Crear base de datos local

```bash
# Como superuser de PostgreSQL:
PGPASSWORD=<postgres_password> psql -U postgres -h localhost -f infra/setup-dev.sql
psql -U papeleria_dev -d papeleria_db_dev -W -f infra/migrate.sql
node --env-file=api/.env.local infra/seed.js
```

### 4. Levantar entorno de desarrollo

```bash
npm run dev:all     # API (:3000) + Frontend (:5173) en paralelo
```

Abrir: **http://localhost:5173**

---

## Comandos principales

```bash
# Desarrollo
npm run dev:all       # Levanta API + frontend juntos
npm run dev           # Solo frontend (Vite)
npm run dev:api       # Solo backend (Express)

# Base de datos
npm run db:setup      # Crear DB local (primera vez)
npm run db:migrate    # Ejecutar migraciones SQL
npm run db:seed       # Insertar datos de prueba

# Producción
npm run build         # Build optimizado en dist/
npm run preview       # Preview del build
```

---

## Credenciales de prueba

Las contraseñas ya no se documentan en texto plano aquí (el repositorio es público).
Se definen en tu `api/.env.local` como variables `SEED_*` (ver `api/.env.example`)
y `npm run db:seed` las imprime en consola al terminar.

| Rol              | Email                               |
|------------------|--------------------------------------|
| Admin            | admin@papeleriacartagena.com        |
| Asesor Cartagena | asesor@papeleriacartagena.com       |
| Asesor Bogotá    | carlos@papeleriacartagena.com       |
| Repartidor       | pedro@papeleriacartagena.com        |
| Supervisor       | supervisor@elcentro.com             |
| Comprador        | pedidos@elcentro.com                |
| Admin empresa    | admin@elcentro.com                  |

---

## Build y deploy

```bash
npm run build       # Genera dist/ optimizado
```

El deploy a producción se dispara automáticamente con un push a `main` via GitHub Actions.

Ver [deploy-produccion.md](deploy-produccion.md) para el proceso completo.

---

## Documentación adicional

| Documento                                        | Contenido                              |
|--------------------------------------------------|----------------------------------------|
| [arquitectura.md](arquitectura.md)               | Arquitectura, flujos, contextos        |
| [base-de-datos.md](base-de-datos.md)             | Schema, tablas, relaciones             |
| [api-endpoints.md](api-endpoints.md)             | Endpoints, requests, responses         |
| [flujos-criticos.md](flujos-criticos.md)         | Flujos de negocio críticos             |
| [variables-entorno.md](variables-entorno.md)     | Variables de entorno requeridas        |
| [guia-desarrollo.md](guia-desarrollo.md)         | Convenciones, componentes, hooks       |
| [deploy-produccion.md](deploy-produccion.md)     | Build, deploy, infraestructura         |

---

## Troubleshooting básico

**Puerto 3000 ocupado:**
```bash
npm run dev:kill    # Libera el puerto 3000 (Windows)
```

**Error de CORS en desarrollo:**
El proxy de Vite reenvía `/api/v1/*` a `localhost:3000` automáticamente. No se necesita CORS en dev.

**JWT expirado:**
El token dura 8 horas. Al expirar, el sistema redirige automáticamente a `/login`.

**Imagen de producto no carga:**
Verifica que la variable `GCS_BUCKET` esté configurada y el bucket sea público o tenga las ACLs correctas.
