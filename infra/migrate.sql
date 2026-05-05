-- =============================================================
-- migrate.sql — Papelería Cartagena
-- Base de datos completa: 12 tablas + triggers
-- PostgreSQL 15
-- =============================================================

-- Crear base de datos y usuario (ejecutar como superuser)
-- Este bloque se ejecuta separado desde el script de setup
-- \c papeleria_db;

BEGIN;

-- ----------------------------------------------------------
-- 1. companies — Empresas cliente
-- (price_list_id se agrega abajo, despues de crear price_lists)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(200) NOT NULL,
    nit        VARCHAR(30)  UNIQUE,
    email      VARCHAR(150),
    phone      VARCHAR(30),
    address    VARCHAR(300),
    active     BOOLEAN      NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------
-- 2. sucursales — Sucursales de empresas cliente
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS sucursales (
    id         SERIAL PRIMARY KEY,
    company_id INTEGER      NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    name       VARCHAR(150) NOT NULL,
    city       VARCHAR(100),
    address    VARCHAR(300),
    active     BOOLEAN      NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------
-- 3. branches — Sedes internas de Papelería Cartagena
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS branches (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(150) NOT NULL,
    city       VARCHAR(100),
    address    VARCHAR(300),
    phone      VARCHAR(30),
    active     BOOLEAN      NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------
-- 4. price_lists — Listas de precios
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS price_lists (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100)   NOT NULL,
    description VARCHAR(200),
    multiplier  NUMERIC(5, 4)  NOT NULL DEFAULT 1.0,
    created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_multiplier CHECK (multiplier > 0 AND multiplier <= 2)
);

-- ----------------------------------------------------------
-- 5. users — Todos los usuarios del sistema
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(200) NOT NULL,
    email         VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(20)  NOT NULL,
    client_role   VARCHAR(30),
    company_id    INTEGER      REFERENCES companies(id)  ON DELETE RESTRICT,
    sucursal_id   INTEGER      REFERENCES sucursales(id) ON DELETE RESTRICT,
    branch_id     INTEGER      REFERENCES branches(id)   ON DELETE RESTRICT,
    price_list_id INTEGER      REFERENCES price_lists(id) ON DELETE RESTRICT,
    contact_name  VARCHAR(200),
    phone         VARCHAR(30),
    address       VARCHAR(300),
    initials      VARCHAR(5),
    active        BOOLEAN      NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_role
        CHECK (role IN ('admin', 'advisor', 'client', 'delivery')),
    CONSTRAINT chk_client_role
        CHECK (
            (role = 'client' AND client_role IN ('supervisor', 'creador_pedidos', 'admin_empresa'))
            OR (role <> 'client' AND client_role IS NULL)
        ),
    CONSTRAINT chk_client_fields
        CHECK (
            (role = 'client' AND company_id IS NOT NULL AND sucursal_id IS NOT NULL)
            OR role <> 'client'
        ),
    CONSTRAINT chk_branch_required
        CHECK (
            (role IN ('advisor', 'delivery') AND branch_id IS NOT NULL)
            OR role NOT IN ('advisor', 'delivery')
        ),
    CONSTRAINT chk_non_client_fields
        CHECK (
            role = 'client'
            OR (company_id IS NULL AND sucursal_id IS NULL AND price_list_id IS NULL AND client_role IS NULL)
        )
);

-- ----------------------------------------------------------
-- 6. categories — Categorías de productos
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(150) NOT NULL UNIQUE,
    description VARCHAR(300),
    active      BOOLEAN      NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------
-- 7. products — Catálogo de productos
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(300)   NOT NULL,
    sku         VARCHAR(50)    NOT NULL UNIQUE,
    category_id INTEGER        NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    description TEXT,
    base_price  NUMERIC(12, 2) NOT NULL,
    stock       INTEGER        NOT NULL DEFAULT 0,
    unit        VARCHAR(50)    NOT NULL,
    image_url   TEXT,
    active      BOOLEAN        NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_base_price CHECK (base_price > 0),
    CONSTRAINT chk_stock      CHECK (stock >= 0)
);

-- ----------------------------------------------------------
-- 8. product_complementaries — Cross-selling (M:N auto-referenciada)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_complementaries (
    product_id       INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    complementary_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, complementary_id),
    CONSTRAINT chk_no_self_ref CHECK (product_id <> complementary_id)
);

-- ----------------------------------------------------------
-- 9. orders — Pedidos
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
    id           VARCHAR(20)    PRIMARY KEY,
    client_id    INTEGER        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    advisor_id   INTEGER        REFERENCES users(id) ON DELETE SET NULL,
    delivery_id  INTEGER        REFERENCES users(id) ON DELETE SET NULL,
    delivered_by INTEGER        REFERENCES users(id) ON DELETE SET NULL,
    delivered_at TIMESTAMPTZ,
    status       VARCHAR(50)    NOT NULL,
    notes        TEXT,
    carrier      VARCHAR(100),
    total        NUMERIC(14, 2) NOT NULL,
    created_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_order_status CHECK (
        status IN (
            'Pendiente por aprobar',
            'Rechazado',
            'Pendiente',
            'Validar disponibilidad',
            'Alistamiento',
            'En Ruta',
            'Entregado'
        )
    ),
    CONSTRAINT chk_total CHECK (total >= 0)
);

-- Función y trigger para actualizar updated_at en orders
CREATE OR REPLACE FUNCTION fn_update_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;
CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_orders_updated_at();

-- ----------------------------------------------------------
-- 10. order_items — Ítems de pedido (snapshot histórico)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_items (
    id           SERIAL         PRIMARY KEY,
    order_id     VARCHAR(20)    NOT NULL REFERENCES orders(id)   ON DELETE CASCADE,
    product_id   INTEGER        NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    product_name VARCHAR(300)   NOT NULL,
    sku          VARCHAR(50)    NOT NULL,
    quantity     INTEGER        NOT NULL,
    unit_price   NUMERIC(12, 2) NOT NULL,
    unit         VARCHAR(50)    NOT NULL,
    CONSTRAINT chk_quantity   CHECK (quantity > 0),
    CONSTRAINT chk_unit_price CHECK (unit_price > 0)
);

-- ----------------------------------------------------------
-- 11. order_comments — Comentarios internos de pedido
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_comments (
    id         SERIAL      PRIMARY KEY,
    order_id   VARCHAR(20) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    author_id  INTEGER     NOT NULL REFERENCES users(id)  ON DELETE RESTRICT,
    text       TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------
-- 12. order_attachments — Adjuntos de pedido
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_attachments (
    id          SERIAL       PRIMARY KEY,
    order_id    VARCHAR(20)  NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    file_name   VARCHAR(300) NOT NULL,
    file_size   BIGINT,
    mime_type   VARCHAR(100),
    file_url    TEXT         NOT NULL,
    type        VARCHAR(30)  NOT NULL DEFAULT 'general',
    uploaded_by INTEGER      NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    uploaded_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_attachment_type CHECK (type IN ('general', 'evidence', 'invoice', 'receipt', 'purchase_order'))
);

-- Asegurar columna en instalaciones previas
ALTER TABLE order_attachments ADD COLUMN IF NOT EXISTS type VARCHAR(30) NOT NULL DEFAULT 'general';

-- ----------------------------------------------------------
-- 13. price_list_items — Precio explicito por (producto, lista)
--     Override: si existe fila para (product_id, price_list_id) usa
--     este precio; si no, usa products.base_price (resuelto en backend).
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS price_list_items (
    id            SERIAL         PRIMARY KEY,
    product_id    INTEGER        NOT NULL REFERENCES products(id)    ON DELETE CASCADE,
    price_list_id INTEGER        NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
    price         NUMERIC(12, 2) NOT NULL,
    currency      CHAR(3)        NOT NULL DEFAULT 'COP',
    created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_price_list_items_product_list UNIQUE (product_id, price_list_id),
    CONSTRAINT chk_pli_price    CHECK (price > 0),
    CONSTRAINT chk_pli_currency CHECK (currency ~ '^[A-Z]{3}$')
);

CREATE OR REPLACE FUNCTION fn_update_pli_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pli_updated_at ON price_list_items;
CREATE TRIGGER trg_pli_updated_at
    BEFORE UPDATE ON price_list_items
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_pli_updated_at();

-- ----------------------------------------------------------
-- companies.price_list_id — vinculo empresa -> lista de precios
-- companies.advisor_id    — asesor por defecto de la empresa (PHASE 9)
-- sucursales.advisor_id   — override de asesor por sucursal (PHASE 9)
-- sucursales.price_list_id — override de lista por sucursal (PHASE 9)
-- (se agregan aqui porque price_lists, users y sucursales ya existen)
-- ----------------------------------------------------------
ALTER TABLE companies
    ADD COLUMN IF NOT EXISTS price_list_id INTEGER
        REFERENCES price_lists(id) ON DELETE RESTRICT;
ALTER TABLE companies
    ADD COLUMN IF NOT EXISTS advisor_id INTEGER
        REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE sucursales
    ADD COLUMN IF NOT EXISTS advisor_id INTEGER
        REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sucursales
    ADD COLUMN IF NOT EXISTS price_list_id INTEGER
        REFERENCES price_lists(id) ON DELETE RESTRICT;

-- ----------------------------------------------------------
-- 14. order_status_log — Auditoria de cambios de estado (PHASE 4)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_status_log (
    id          SERIAL      PRIMARY KEY,
    order_id    VARCHAR(20) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    from_status VARCHAR(50),
    to_status   VARCHAR(50) NOT NULL,
    changed_by  INTEGER     REFERENCES users(id) ON DELETE SET NULL,
    reason      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_osl_to_status CHECK (
        to_status IN (
            'Pendiente por aprobar',
            'Rechazado',
            'Pendiente',
            'Validar disponibilidad',
            'Alistamiento',
            'En Ruta',
            'Entregado'
        )
    ),
    CONSTRAINT chk_osl_distinct CHECK (from_status IS DISTINCT FROM to_status)
);

-- ----------------------------------------------------------
-- Índices de rendimiento
-- ----------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_companies_price_list     ON companies(price_list_id);
CREATE INDEX IF NOT EXISTS idx_companies_advisor        ON companies(advisor_id);
CREATE INDEX IF NOT EXISTS idx_sucursales_advisor       ON sucursales(advisor_id);
CREATE INDEX IF NOT EXISTS idx_sucursales_price_list    ON sucursales(price_list_id);
CREATE INDEX IF NOT EXISTS idx_pli_product              ON price_list_items(product_id);
CREATE INDEX IF NOT EXISTS idx_pli_price_list           ON price_list_items(price_list_id);
CREATE INDEX IF NOT EXISTS idx_osl_order                ON order_status_log(order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_osl_changed_by           ON order_status_log(changed_by);
CREATE INDEX IF NOT EXISTS idx_attachments_type         ON order_attachments(type);
CREATE INDEX IF NOT EXISTS idx_sucursales_company       ON sucursales(company_id);
CREATE INDEX IF NOT EXISTS idx_users_company            ON users(company_id);
CREATE INDEX IF NOT EXISTS idx_users_sucursal           ON users(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_users_branch             ON users(branch_id);
CREATE INDEX IF NOT EXISTS idx_users_role               ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_email              ON users(email);
CREATE INDEX IF NOT EXISTS idx_products_category        ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_sku             ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_active          ON products(active);
CREATE INDEX IF NOT EXISTS idx_orders_client            ON orders(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_advisor           ON orders(advisor_id);
CREATE INDEX IF NOT EXISTS idx_orders_delivery          ON orders(delivery_id);
CREATE INDEX IF NOT EXISTS idx_orders_delivered_at      ON orders(delivered_at);
CREATE INDEX IF NOT EXISTS idx_orders_status            ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at        ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order        ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_comments_order     ON order_comments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_attachments_order  ON order_attachments(order_id);
CREATE INDEX IF NOT EXISTS idx_complementaries_product  ON product_complementaries(product_id);

-- ----------------------------------------------------------
-- Función auxiliar: generar ID de pedido (ORD-00001)
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_generate_order_id()
RETURNS VARCHAR(20) AS $$
DECLARE
    next_num  INTEGER;
    new_id    VARCHAR(20);
BEGIN
    SELECT COUNT(*) + 1 INTO next_num FROM orders;
    new_id := 'ORD-' || LPAD(next_num::TEXT, 5, '0');
    -- Garantizar unicidad en caso de concurrencia
    WHILE EXISTS (SELECT 1 FROM orders WHERE id = new_id) LOOP
        next_num := next_num + 1;
        new_id := 'ORD-' || LPAD(next_num::TEXT, 5, '0');
    END LOOP;
    RETURN new_id;
END;
$$ LANGUAGE plpgsql;

COMMIT;

-- ----------------------------------------------------------
-- Verificación rápida
-- ----------------------------------------------------------
SELECT
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
