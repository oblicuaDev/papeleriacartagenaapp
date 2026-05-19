# API — Referencia de Endpoints

Base URL: `/api/v1`

Todas las rutas (excepto `/auth/login`) requieren el header:
```
Authorization: Bearer <jwt_token>
```

Las respuestas retornan JSON con propiedades en `camelCase` (el frontend convierte automáticamente desde `snake_case`).

Códigos de error comunes:
| Código | Significado                              |
|--------|------------------------------------------|
| `400`  | Datos inválidos o faltantes              |
| `401`  | Token ausente, inválido o expirado       |
| `403`  | Sin permisos para el recurso             |
| `404`  | Recurso no encontrado                    |
| `409`  | Conflicto (ej: email duplicado)          |
| `500`  | Error interno del servidor               |

---

## Auth

### `POST /auth/login`
Login de usuario. No requiere token.

**Request:**
```json
{ "email": "usuario@empresa.com", "password": "Contraseña123!" }
```

**Response 200:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "user": {
    "id": 1,
    "name": "Juan Pérez",
    "email": "usuario@empresa.com",
    "role": "client",
    "clientRole": "creador_pedidos",
    "companyId": 3,
    "sucursalId": 5,
    "initials": "JP"
  }
}
```

---

### `POST /auth/logout`
Invalida el token actual (lo agrega a blacklist en memoria).

**Response 204:** sin cuerpo

---

### `GET /auth/me`
Retorna el usuario autenticado (para rehidratar sesión al recargar).

**Response 200:** mismo objeto `user` del login.

---

## Companies (Empresas)

Requiere rol `admin`.

### `GET /companies`
Lista todas las empresas.

**Query params:** `active` (boolean, opcional)

**Response 200:** `Company[]`

---

### `GET /companies/:id`
Obtiene una empresa con sus sucursales.

**Response 200:** `Company` con campo `sucursales: Sucursal[]`

---

### `POST /companies`
Crea una empresa.

**Request:**
```json
{
  "name": "Empresa S.A.S.",
  "nit": "900123456-1",
  "email": "contacto@empresa.com",
  "phone": "3001234567",
  "address": "Calle 10 #20-30, Bogotá",
  "priceListId": 2,
  "advisorId": 5
}
```

---

### `PUT /companies/:id`
Actualiza una empresa (mismos campos que POST, todos opcionales).

### `DELETE /companies/:id`
Desactiva la empresa (no elimina físicamente).

---

## Sucursales

### `GET /companies/:companyId/sucursales`
Lista sucursales de una empresa.

### `POST /companies/:companyId/sucursales`
Crea una sucursal.

**Request:**
```json
{
  "name": "Sucursal Norte",
  "city": "Barranquilla",
  "address": "Av. Murillo 45-20",
  "advisorId": 6,
  "priceListId": 3
}
```

### `PUT /companies/:companyId/sucursales/:id`
Actualiza una sucursal.

### `DELETE /companies/:companyId/sucursales/:id`
Desactiva la sucursal.

---

## Branches (Sedes internas)

Requiere rol `admin`.

### `GET /branches`
Lista todas las sedes internas.

### `POST /branches`
```json
{ "name": "Sede Bogotá", "city": "Bogotá", "address": "...", "phone": "..." }
```

### `PUT /branches/:id` / `DELETE /branches/:id`
Actualiza / desactiva una sede.

---

## Users (Usuarios)

Requiere rol `admin`.

### `GET /users`
Lista usuarios. Soporta filtros:

| Param       | Descripción                              |
|-------------|------------------------------------------|
| `role`      | Filtrar por rol                          |
| `companyId` | Filtrar clientes por empresa             |
| `branchId`  | Filtrar por sede interna                 |
| `active`    | Solo activos/inactivos                   |

### `GET /users/:id`
Obtiene un usuario por ID.

### `POST /users`
Crea un usuario.

**Request:**
```json
{
  "name": "María García",
  "email": "maria@empresa.com",
  "password": "Segura2026!",
  "role": "client",
  "clientRole": "creador_pedidos",
  "companyId": 3,
  "sucursalId": 7,
  "phone": "3109876543",
  "address": "Cra 15 #80-25, Bogotá",
  "initials": "MG"
}
```

### `PUT /users/:id`
Actualiza un usuario (el campo `password` es opcional; si se envía, se re-hashea).

### `DELETE /users/:id`
Desactiva el usuario.

---

## Categories (Centros de costo)

### `GET /categories`
Lista categorías. Requiere rol `admin` o `client`.

| Param    | Descripción        |
|----------|--------------------|
| `active` | Filtrar activas    |

### `POST /categories` (admin)
```json
{ "name": "Papelería General", "description": "Cuadernos, lápices, etc." }
```

### `PUT /categories/:id` / `DELETE /categories/:id`
Actualiza / desactiva.

### `GET /categories/:id/related`
Retorna categorías relacionadas (para cross-selling).

### `PUT /categories/:id/related`
```json
{ "relatedCategoryIds": [2, 5, 8] }
```

---

## Price Lists (Listas de precios)

Requiere rol `admin`.

### `GET /price-lists`
Lista todas las listas de precios.

### `POST /price-lists`
```json
{ "name": "Lista A", "description": "Precio estándar", "multiplier": 1.0 }
```

### `PUT /price-lists/:id` / `DELETE /price-lists/:id`

### `GET /price-lists/:id/items`
Retorna todos los precios explícitos de la lista.

**Response:**
```json
[{ "productId": 1, "price": 4500, "currency": "COP" }]
```

### `PUT /price-lists/:id/items`
Guarda (reemplaza) todos los items de la lista.

```json
{
  "items": [
    { "productId": 1, "price": 4500 },
    { "productId": 7, "price": 12000 }
  ]
}
```

### `GET /price-lists/:id/companies`
Retorna IDs de empresas que usan esta lista.

### `PUT /price-lists/:id/companies`
```json
{ "companyIds": [1, 3, 5] }
```

---

## Products (Productos)

### `GET /products`
Lista productos (admin). Soporta: `search`, `categoryId`, `active`, `page`, `limit`.

### `GET /products/:id`
Detalle de producto.

### `POST /products` (admin)
```json
{
  "name": "Cuaderno Universitario 100 hojas",
  "sku": "CUA-100H",
  "categoryId": 2,
  "description": "Pasta dura, rayas",
  "basePrice": 8500,
  "stock": 500,
  "unit": "und"
}
```

### `PUT /products/:id` / `DELETE /products/:id`

### `POST /products/:id/image` (multipart/form-data)
Sube imagen del producto. Campo: `image` (file).

**Response:**
```json
{ "imageUrl": "https://storage.googleapis.com/bucket/products/1.jpg" }
```

### `DELETE /products/:id/image`
Elimina la imagen del producto.

---

## Catalog (Catálogo cliente)

Requiere rol `client`. Retorna solo productos activos con precio resuelto según la lista del cliente.

### `GET /catalog`

| Param        | Descripción                              |
|--------------|------------------------------------------|
| `search`     | Búsqueda por nombre o SKU                |
| `categoryId` | Filtrar por categoría                    |
| `page`       | Número de página (default: 1)            |
| `limit`      | Resultados por página (default: 24)      |

**Response 200:**
```json
{
  "data": [
    {
      "id": 1,
      "name": "Cuaderno 100 hojas",
      "sku": "CUA-100H",
      "categoryId": 2,
      "price": 9200,
      "stock": 450,
      "unit": "und",
      "imageUrl": "https://..."
    }
  ],
  "total": 142
}
```

### `GET /catalog/related`
Productos relacionados para cross-selling.

| Param       | Descripción                              |
|-------------|------------------------------------------|
| `productId` | Producto de referencia                   |
| `limit`     | Número de sugeridos (default: 6)         |

---

## Orders (Pedidos)

### `GET /orders`
Lista pedidos según rol:
- Admin: todos los pedidos
- Advisor: pedidos de sus empresas asignadas
- Client: sus propios pedidos
- Delivery: pedidos en ruta asignados

| Param      | Descripción                              |
|------------|------------------------------------------|
| `status`   | Filtrar por estado                       |
| `clientId` | Filtrar por cliente (admin/advisor)      |
| `page`     | Paginación                               |
| `limit`    | Resultados por página                    |

### `GET /orders/:id`
Detalle completo: pedido + items + comentarios + adjuntos.

### `POST /orders`
Crea un pedido. Solo clientes con `clientRole = 'creador_pedidos'`.

**Request:**
```json
{
  "notes": "Entregar en recepción, piso 3",
  "carrier": "Efectivo",
  "items": [
    { "productId": 1, "quantity": 5 },
    { "productId": 7, "quantity": 2 }
  ]
}
```

**Response 201:**
```json
{ "id": "ORD-00042", "status": "Pendiente", "total": 65000 }
```

El backend verifica precios en el momento de crear el pedido (no confía en el total del frontend).

### `PUT /orders/:id`
Actualiza estado, asesor, repartidor, notas o transportista.

**Request (ejemplo cambio de estado):**
```json
{ "status": "Alistamiento", "reason": "Disponibilidad verificada" }
```

### `PUT /orders/:id/items`
Modifica items de un pedido (solo admin, en estados tempranos).

### `GET /orders/:id/timeline`
Historial de cambios de estado del pedido.

**Response:**
```json
[
  { "fromStatus": null, "toStatus": "Pendiente", "changedBy": 5, "createdAt": "2026-05-01T10:00:00Z" },
  { "fromStatus": "Pendiente", "toStatus": "Alistamiento", "changedBy": 1, "reason": "Stock disponible", "createdAt": "2026-05-02T08:30:00Z" }
]
```

### `POST /orders/:id/comments`
Agrega un comentario interno.

```json
{ "text": "Cliente confirmó dirección de entrega" }
```

### `DELETE /orders/:id/comments/:commentId`

### `POST /orders/:id/attachments` (multipart/form-data)
Sube un adjunto al pedido. Campos: `file` (file), `type` (string, opcional).

### `GET /orders/:id/attachments/:attachmentId/download`
Retorna URL firmada para descarga.

### `DELETE /orders/:id/attachments/:attachmentId`

---

## Stats (Estadísticas)

### `GET /stats/admin`
Resumen ejecutivo: pedidos por estado, ventas por mes, top productos, top clientes.

### `GET /stats/advisor`
Estadísticas del asesor autenticado: pedidos de sus empresas, conversión.

### `GET /stats/client`
Estadísticas del cliente autenticado: gasto por categoría, histórico de pedidos.

| Param   | Descripción                     |
|---------|---------------------------------|
| `year`  | Año a consultar (default: actual)|
| `month` | Mes a consultar (opcional)       |
