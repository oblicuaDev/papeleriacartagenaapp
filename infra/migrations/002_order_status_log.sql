-- =============================================================
-- 002_order_status_log.sql — PHASE 4
-- - Tabla order_status_log para auditoria de cambios de estado.
-- - Cada fila representa una transicion: from_status -> to_status,
--   con NULL en from_status para la creacion del pedido.
-- - PHASE 6 expondra esta data via GET /orders/:id/timeline.
-- Idempotente (IF NOT EXISTS).
-- =============================================================

BEGIN;

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

CREATE INDEX IF NOT EXISTS idx_osl_order      ON order_status_log(order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_osl_changed_by ON order_status_log(changed_by);

-- Backfill: una fila "creacion" por cada pedido existente sin log,
-- usando created_at del pedido y client_id como autor. Permite que
-- la futura timeline (PHASE 6) muestre algo coherente para pedidos viejos.
INSERT INTO order_status_log (order_id, from_status, to_status, changed_by, created_at)
SELECT o.id, NULL, o.status, o.client_id, o.created_at
FROM orders o
WHERE NOT EXISTS (
    SELECT 1 FROM order_status_log osl WHERE osl.order_id = o.id
);

COMMIT;

-- Verificacion
SELECT
    'order_status_log' AS objeto,
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_status_log') AS ok,
    (SELECT COUNT(*) FROM order_status_log) AS filas;
