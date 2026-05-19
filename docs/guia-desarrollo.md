# Guía de Desarrollo

---

## Stack y herramientas

| Herramienta     | Versión   | Uso                                     |
|-----------------|-----------|-----------------------------------------|
| React           | 18.2      | UI framework                            |
| Vite            | 5         | Build tool y dev server                 |
| React Router    | 6         | Routing SPA                             |
| Tailwind CSS    | 3.4       | Utility-first CSS                       |
| Lucide React    | 0.344     | Iconografía                             |
| Recharts        | 3.8       | Gráficas del dashboard                  |
| Node.js         | 20+       | Runtime del backend                     |
| Express         | 4         | HTTP framework                          |
| PostgreSQL       | 15/18     | Base de datos relacional                |
| JWT + bcrypt    | —         | Autenticación                           |

---

## Estructura de componentes

### Layouts (páginas contenedoras)

Cada rol tiene su propio layout que provee la navegación, encabezado y estructura general:

```
AdminLayout.jsx      → /admin/*
ClientLayout.jsx     → /cliente/*
AdvisorLayout.jsx    → /asesor/*
DeliveryLayout.jsx   → /entregas/*
```

Los layouts usan `<Outlet>` de React Router para renderizar las rutas hijas. Los datos compartidos entre layout e hijos se pasan con `useOutletContext()`.

**Ejemplo ClientLayout → ClientCatalog:**
```jsx
// ClientLayout.jsx
<Outlet context={{ search }} />

// ClientCatalog.jsx
const { search } = useOutletContext();
```

### Páginas (routes)

Cada página es un componente que vive dentro de un layout. Se registran en `src/App.jsx`.

Convención de nombres:
- `AdminXxx.jsx` para páginas del admin
- `ClientXxx.jsx` para páginas del cliente
- etc.

### Componentes reutilizables (`src/components/`)

| Componente           | Descripción                                       |
|----------------------|---------------------------------------------------|
| `ProtectedRoute.jsx` | Guard de ruta — verifica rol o redirige a /login  |
| `CreditsFooter.jsx`  | Footer con créditos Oblicua (en todos los layouts)|
| `OrderDetailCRM.jsx` | Panel CRM de detalle de pedido (admin/advisor)    |

---

## Sistema de diseño (UI)

### Paleta de colores

El proyecto usa la paleta `blue` de Tailwind como color de marca:

| Token Tailwind  | Uso principal                           |
|-----------------|-----------------------------------------|
| `blue-900`      | Header, fondos oscuros                  |
| `blue-800`      | Hover de header, botones secundarios    |
| `blue-700`      | Botones primarios, textos de acento     |
| `blue-200`      | Textos en fondos oscuros                |
| `blue-100`      | Fondos de badges y chips                |
| `yellow-400`    | Badges de carrito, alertas de aprobación|

### Tipografía

Fuente: **Montserrat** (cargada desde Google Fonts en `index.html`)

Clases de texto frecuentes:
- `text-gray-800` / `font-semibold` — títulos de sección
- `text-gray-500 text-sm` — descripciones secundarias
- `text-blue-700 font-bold` — precios y valores destacados
- `text-xs font-mono text-blue-600` — códigos SKU

### Componentes UI frecuentes

**Card estándar:**
```jsx
<div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
  ...
</div>
```

**Botón primario:**
```jsx
<button className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold transition">
  Acción
</button>
```

**Botón secundario:**
```jsx
<button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
  Cancelar
</button>
```

**Badge de estado:**
```jsx
<span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700">
  Entregado
</span>
```

**Input estándar:**
```jsx
<input
  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
/>
```

---

## Gestión de estado

### AuthContext

No modifica directamente — usa el hook `useAuth()`:

```jsx
import { useAuth } from '../context/AuthContext';

const { currentUser, login, logout } = useAuth();
```

### AppContext

Para acceder a datos globales y acciones:

```jsx
import { useApp } from '../context/AppContext';

const { categories, orders, cart, addToCart, removeFromCart } = useApp();
```

Para refrescar datos tras CRUD:

```jsx
const { refreshOrders, refreshProducts } = useApp();
await productsApi.update(id, data);
await refreshProducts();
```

---

## Cliente HTTP (`src/services/api.js`)

Todas las llamadas a la API van a través del cliente centralizado. **No uses `fetch` directamente** en componentes.

```js
import { ordersApi, productsApi, catalogApi } from '../services/api';

// GET
const orders = await ordersApi.list({ status: 'Pendiente' });

// POST
const order = await ordersApi.create({ items, notes });

// PUT
await ordersApi.update(orderId, { status: 'Alistamiento' });

// DELETE
await ordersApi.removeComment(orderId, commentId);
```

El cliente convierte automáticamente `snake_case → camelCase` en todas las respuestas.

---

## Convenciones de código

### Naming

- **Componentes y páginas:** PascalCase (`ClientCatalog`, `AdminOrders`)
- **Hooks personalizados:** camelCase con prefijo `use` (`useAuth`, `useApp`)
- **Servicios API:** camelCase con sufijo `Api` (`ordersApi`, `catalogApi`)
- **Variables y funciones:** camelCase
- **Constantes globales:** SCREAMING_SNAKE_CASE (`PAGE_SIZE`, `CATEGORY_COLORS`)

### Estructura de un componente típico

```jsx
// 1. Imports externos
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SomeIcon } from 'lucide-react';

// 2. Imports internos
import { useAuth } from '../../context/AuthContext';
import { ordersApi } from '../../services/api';

// 3. Constantes del módulo
const PAGE_SIZE = 20;

// 4. Sub-componentes pequeños (si aplica)
function StatusBadge({ status }) { ... }

// 5. Componente principal
export default function MyPage() {
  // Estado local primero
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  // Contextos
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  // Efectos
  useEffect(() => { ... }, []);

  // Handlers
  function handleAction() { ... }

  // Render
  return ( ... );
}
```

### Manejo de errores en API

```jsx
const [error, setError] = useState('');

async function handleSubmit() {
  setError('');
  try {
    await someApi.create(data);
    // éxito
  } catch (err) {
    setError(err.data?.error || 'Error inesperado. Intenta de nuevo.');
  }
}
```

---

## Backend: estructura de rutas Express

Cada archivo en `api/src/routes/` exporta un `express.Router()`:

```js
// api/src/routes/products.js
const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const pool = require('../config/db');

router.get('/', requireAuth(['admin']), async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM products WHERE active = true');
  res.json(rows);
});

module.exports = router;
```

Las rutas se registran en `api/src/app.js`:

```js
app.use('/api/v1/products', require('./routes/products'));
```

### Middleware de autenticación

```js
const { requireAuth } = require('../middleware/auth');

// Solo admin:
router.delete('/:id', requireAuth(['admin']), handler);

// Admin o advisor:
router.get('/', requireAuth(['admin', 'advisor']), handler);

// Cualquier usuario autenticado:
router.get('/me', requireAuth(), handler);
```

---

## Formato de precios

El helper `formatCOP` de `src/data/mockData.js` formatea moneda colombiana:

```js
import { formatCOP } from '../../data/mockData';

formatCOP(8500)   // → "$8.500"
formatCOP(150000) // → "$150.000"
```

---

## Testing

El proyecto actualmente no tiene suite de tests automatizados. Para verificar cambios:

1. Levantar entorno completo (`npm run dev:all`)
2. Probar el flujo afectado con las credenciales de prueba del README
3. Verificar la red en DevTools para confirmar requests/responses correctos
4. Revisar la consola del backend para errores SQL o de validación

---

## Agregar una nueva ruta al frontend

1. Crear el componente en `src/pages/<rol>/NuevaPagina.jsx`
2. Importarlo en `src/App.jsx`
3. Agregar el `<Route>` dentro del layout correspondiente
4. Agregar el `<NavLink>` en el layout (`AdminLayout.jsx`, etc.)

```jsx
// src/App.jsx
import NuevaPagina from './pages/admin/NuevaPagina';

// Dentro de la ruta /admin:
<Route path="nueva-pagina" element={<NuevaPagina />} />
```

---

## Agregar un nuevo endpoint al backend

1. Crear o editar el archivo en `api/src/routes/`
2. Escribir el handler con validaciones
3. Si es un recurso nuevo, registrar la ruta en `api/src/app.js`
4. Actualizar `src/services/api.js` con la función cliente correspondiente
5. Documentar en `docs/api-endpoints.md`
