-- =============================================================
-- 019_claims.sql — Reclamos sobre pedidos
--   * orders / order_status_log: estados 'En reclamación' y 'Devuelto'
--   * claims, claim_attachments, claim_events
-- Idempotente. (Se fusiona tambien en infra/migrate.sql, seccion 21.)
-- =============================================================
BEGIN;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_order_status;
ALTER TABLE orders ADD  CONSTRAINT chk_order_status CHECK (
    status IN (
        'Borrador', 'Pendiente por aprobar', 'Rechazado', 'Pendiente', 'Validar disponibilidad',
        'Alistamiento', 'En Ruta', 'Entregado', 'En reclamación', 'Devuelto'
    )
);

ALTER TABLE order_status_log DROP CONSTRAINT IF EXISTS chk_osl_to_status;
ALTER TABLE order_status_log ADD  CONSTRAINT chk_osl_to_status CHECK (
    to_status IN (
        'Borrador', 'Pendiente por aprobar', 'Rechazado', 'Pendiente', 'Validar disponibilidad',
        'Alistamiento', 'En Ruta', 'Entregado', 'En reclamación', 'Devuelto'
    )
);

CREATE SEQUENCE IF NOT EXISTS claims_seq;

CREATE TABLE IF NOT EXISTS claims (
    id                VARCHAR(20)  PRIMARY KEY,              -- REC-00001
    order_id          VARCHAR(20)  NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    client_id         INTEGER      NOT NULL REFERENCES users(id)  ON DELETE RESTRICT,
    reason            VARCHAR(60)  NOT NULL,
    description       TEXT         NOT NULL,                 -- HTML saneado
    status            VARCHAR(10)  NOT NULL DEFAULT 'Abierto',
    prev_order_status VARCHAR(50),                           -- estado del pedido antes de la reclamacion
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    closed_at         TIMESTAMPTZ,
    closed_by         INTEGER      REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_claim_reason CHECK (reason IN (
        'no_llego_producto', 'producto_averiado', 'devolucion_producto',
        'reclamo_servicio', 'felicitacion_servicio'
    )),
    CONSTRAINT chk_claim_status CHECK (status IN ('Abierto', 'Cerrado'))
);
CREATE INDEX IF NOT EXISTS idx_claims_order  ON claims(order_id);
CREATE INDEX IF NOT EXISTS idx_claims_client ON claims(client_id);
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);

-- kind 'initial' = adjuntos del cliente (se purgan a los 60 dias);
-- kind 'closure' = adjunto del cierre (permanente).
CREATE TABLE IF NOT EXISTS claim_attachments (
    id          SERIAL       PRIMARY KEY,
    claim_id    VARCHAR(20)  NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    file_name   VARCHAR(300) NOT NULL,
    file_size   BIGINT,
    mime_type   VARCHAR(100),
    file_url    TEXT         NOT NULL,
    kind        VARCHAR(10)  NOT NULL DEFAULT 'initial',
    uploaded_by INTEGER      NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    uploaded_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ,
    CONSTRAINT chk_claim_att_kind CHECK (kind IN ('initial', 'closure'))
);
CREATE INDEX IF NOT EXISTS idx_claim_att_claim ON claim_attachments(claim_id);

-- Trazabilidad cronologica del reclamo (todas las entradas son visibles al cliente).
CREATE TABLE IF NOT EXISTS claim_events (
    id         SERIAL       PRIMARY KEY,
    claim_id   VARCHAR(20)  NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    type       VARCHAR(20)  NOT NULL,
    text       TEXT,
    author_id  INTEGER      REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_claim_event_type CHECK (type IN ('created', 'note', 'return', 'closed'))
);
CREATE INDEX IF NOT EXISTS idx_claim_events_claim ON claim_events(claim_id, created_at);

COMMIT;
