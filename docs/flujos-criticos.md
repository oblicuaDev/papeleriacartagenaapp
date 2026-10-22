# Flujos Críticos del Sistema

---

## 1. Flujo de creación de pedido (cliente)

```mermaid
sequenceDiagram
    participant Cliente as Cliente (browser)
    participant React
    participant API as Express API
    participant DB as PostgreSQL

    Cliente->>React: Navega catálogo, agrega productos al carrito
    React->>React: AppContext.addToCart(product, qty, price)

    Cliente->>React: Clic "Revisar y confirmar pedido"
    React->>React: Navigate /cliente/confirmar-pedido

    Cliente->>React: Completa datos (notas, dirección, método pago)
    Cliente->>React: Clic "Confirmar pedido"

    React->>API: POST /api/v1/orders { items, notes, carrier }
    API->>DB: SELECT precio real por producto (validación server-side)
    DB-->>API: precios verificados
    API->>DB: INSERT INTO orders (id=fn_generate_order_id(), status='Pendiente'...)
    API->>DB: INSERT INTO order_items (snapshot de nombre, sku, precio)
    API->>DB: INSERT INTO order_status_log (from=NULL, to='Pendiente')
    DB-->>API: { id: 'ORD-00042' }
    API-->>React: 201 { id, status, total }

    React->>React: AppContext.clearCart()
    React-->>Cliente: Navigate /cliente/pedidos, toast de éxito
```

**Puntos críticos:**
- El backend valida y recalcula los precios (no confía en el total del frontend)
- Si el cliente tiene `clientRole = 'creador_pedidos'` y hay supervisor, el status inicial puede ser `Pendiente por aprobar`
- El ID del pedido se genera en PostgreSQL con `fn_generate_order_id()`

---

## 2. Flujo de aprobación (supervisor)

Aplica cuando `clientRole = 'creador_pedidos'` y existe un supervisor en la misma sucursal.

```mermaid
stateDiagram-v2
    [*] --> PendienteAprobar : Creador crea pedido
    PendienteAprobar --> Pendiente : Supervisor aprueba
    PendienteAprobar --> Rechazado : Supervisor rechaza
    Pendiente --> ValidarDisponibilidad : Admin procesa
    ValidarDisponibilidad --> Alistamiento : Stock confirmado
    Alistamiento --> EnRuta : Pedido despachado
    EnRuta --> Entregado : Repartidor confirma
```

**Actores:**
- `creador_pedidos` → crea el pedido
- `supervisor` → aprueba/rechaza pedidos de su sucursal
- `admin` → procesa pedidos aprobados
- `delivery` → marca En Ruta y Entregado

---

## 3. Flujo de autenticación y sesión

```mermaid
flowchart TD
    A[Usuario abre app] --> B{Token en localStorage?}
    B -->|No| C[Mostrar /login]
    B -->|Sí| D[GET /auth/me]
    D -->|200 OK| E[Rehidratar AuthContext]
    D -->|401 Expirado| C
    E --> F{role?}
    F -->|admin| G[Navigate /admin]
    F -->|advisor| H[Navigate /asesor]
    F -->|client| I[Navigate /cliente]
    F -->|delivery| J[Navigate /entregas]
    C --> K[Login form]
    K -->|POST /auth/login OK| L[Guardar token en localStorage]
    L --> F
```

---

## 4. Resolución de precios

```mermaid
flowchart TD
    A[Request GET /catalog] --> B{users.price_list_id?}
    B -->|Sí| C[Usar esa lista]
    B -->|No| D{sucursales.price_list_id?}
    D -->|Sí| C
    D -->|No| E[companies.price_list_id]
    E --> C
    C --> F{price_list_items existe para producto+lista?}
    F -->|Sí| G[Usar price_list_items.price]
    F -->|No| H[base_price × price_lists.multiplier]
    G --> I[Retornar precio al cliente]
    H --> I
```

---

## 5. Flujo de gestión de imágenes de productos

```mermaid
sequenceDiagram
    participant Admin
    participant React
    participant API
    participant GCS as Google Cloud Storage

    Admin->>React: Selecciona imagen para producto
    React->>API: POST /products/:id/image (multipart)
    API->>API: Multer procesa el archivo en memoria
    API->>GCS: storage.save(filename, buffer)
    GCS-->>API: URL pública
    API->>DB: UPDATE products SET image_url = URL
    DB-->>API: OK
    API-->>React: { imageUrl: "https://storage.googleapis.com/..." }
    React-->>Admin: Muestra imagen actualizada
```

---

## 6. Flujo de exportación de pedido (PDF / Excel)

El admin puede generar documentos para un pedido:

1. **Orden de compra (PDF):** `api/src/lib/purchaseOrderPdf.js` con PDFKit
2. **Exportación Excel:** `api/src/lib/orderExport.js` con ExcelJS

```
Admin → GET /orders/:id/pdf → PDFKit genera buffer → Response con Content-Type: application/pdf
Admin → GET /orders/:id/export → ExcelJS genera xlsx → Response con Content-Type: application/vnd.openxmlformats...
```

---

## 7. Flujo de sincronización de datos (AppContext)

```mermaid
flowchart LR
    A[AuthProvider monta] --> B[GET /auth/me]
    B --> C[currentUser disponible]
    C --> D[AppProvider monta]
    D --> E{role?}
    E -->|admin| F[Carga: companies, branches, users, products, categories, priceLists, orders]
    E -->|advisor| G[Carga: companies, orders de sus empresas, categories]
    E -->|client| H[Carga: categories, orders del cliente]
    E -->|delivery| I[Carga: orders asignados]
```

Los datos se recargan con `refreshXxx()` después de operaciones CRUD para mantener el estado consistente.

---

## 8. Flujo de cambio de estado de pedido

Solo roles autorizados pueden cambiar a ciertos estados:

| Transición                                              | Rol requerido                                                    |
|---------------------------------------------------------|------------------------------------------------------------------|
| `Pendiente por aprobar` → `Validar disponibilidad` (aprobar) | `admin` / `supervisor` (su sucursal) / `administrador_contrato` |
| `Pendiente por aprobar` → `Rechazado`                   | `admin` / `supervisor` (su sucursal) / `administrador_contrato`  |
| `Validar disponibilidad` → `Pendiente por aprobar` (revocar aprobación) | `admin` / `supervisor` (su sucursal) / `administrador_contrato` — vía `POST /orders/:id/revoke-approval` |
| `Pendiente` (legacy) → `Validar disponibilidad`         | `admin` / `advisor`                                              |
| `Validar disponibilidad` → `Alistamiento`               | `admin` / `advisor` (automático al asignar repartidor)           |
| `Alistamiento` → `En Ruta`                              | `admin` / `delivery`                                             |
| `En Ruta` → `Entregado`                                 | `admin` / `delivery` (requiere evidencia)                        |

Cada cambio genera un registro en `order_status_log` con `from_status`, `to_status`, `changed_by`, y `reason` opcional.

### Edición de items y revocación de aprobación

- Los items de un pedido (cantidades, eliminar, **agregar productos**) solo se modifican mientras está `Pendiente por aprobar`. Una vez aprobado queda cerrado.
- Si hay que corregir un pedido ya aprobado que todavía no entra a `Alistamiento`, quien puede aprobarlo **revoca la aprobación** (con motivo y confirmación): el pedido vuelve a `Pendiente por aprobar`, se elimina la orden de compra generada, se edita y se aprueba de nuevo (la orden de compra se regenera con los items corregidos).
- Presupuesto del contrato y estadísticas no requieren ajuste: ya excluyen los pedidos `Pendiente por aprobar`.
- Trazabilidad: `order_status_log` (quién, cuándo, motivo), `order_item_changes` (cada cambio de item) y comentarios de sistema en `order_comments`; todo aparece en `GET /orders/:id/timeline`.

---

## 9. Gestión de inventario

El campo `products.stock` se decrementa automáticamente al confirmar un pedido.

```sql
-- Ejemplo de decremento (en api/src/routes/orders.js al crear pedido)
UPDATE products SET stock = stock - $quantity WHERE id = $productId
```

**Alerta de stock bajo:** el frontend muestra "Pocas unidades" cuando `stock < 20 AND stock > 0`.

---

## 10. Notificaciones y comunicación

La plataforma **no tiene notificaciones push en tiempo real** (sin WebSockets). El flujo de notificación es:

1. Cliente crea pedido → el asesor asignado lo ve en su panel de pedidos al recargar/navegar
2. El asesor contacta al cliente por medios externos (teléfono, email) para coordinar entrega
3. El cliente hace polling manual recargando la sección "Pedidos"
