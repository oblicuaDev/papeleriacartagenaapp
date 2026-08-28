-- =============================================================
-- 018_iva_rate_and_draft.sql
--   - products.iva_rate / order_items.iva_rate: tasa de IVA por
--     producto (0 exento, 5% o 19%). Por defecto 19. order_items
--     congela la tasa al crear el pedido (snapshot histórico).
--   - orders.iva_19 / iva_5 / iva_exento_base: desglose del IVA por
--     tasa para los indicadores de los dashboards. iva = iva_5 + iva_19.
--   - Estado 'Borrador': pedido guardado sin enviar. Aparece en
--     "Mis Pedidos" de su creador; no llega al asesor hasta confirmarse.
--   - order_item_changes.action gana 'added' (añadir productos al editar).
-- Idempotente.
--
-- NOTA: historial/documentación. El cambio real ya está fusionado en
-- infra/migrate.sql (único script que se ejecuta contra la BD).
-- =============================================================

BEGIN;

ALTER TABLE products    ADD COLUMN IF NOT EXISTS iva_rate NUMERIC(4, 2) NOT NULL DEFAULT 19;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS iva_rate NUMERIC(4, 2) NOT NULL DEFAULT 19;

ALTER TABLE products    DROP CONSTRAINT IF EXISTS chk_product_iva_rate;
ALTER TABLE products    ADD  CONSTRAINT chk_product_iva_rate CHECK (iva_rate IN (0, 5, 19));
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS chk_oi_iva_rate;
ALTER TABLE order_items ADD  CONSTRAINT chk_oi_iva_rate CHECK (iva_rate IN (0, 5, 19));

ALTER TABLE orders ADD COLUMN IF NOT EXISTS iva_19          NUMERIC(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS iva_5           NUMERIC(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS iva_exento_base NUMERIC(14, 2) NOT NULL DEFAULT 0;

UPDATE orders SET iva_19 = iva WHERE iva_19 = 0 AND iva > 0;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_orders_iva_split;
ALTER TABLE orders ADD  CONSTRAINT chk_orders_iva_split CHECK (iva_5 + iva_19 = iva);

ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_order_status;
ALTER TABLE orders ADD  CONSTRAINT chk_order_status CHECK (
    status IN ('Borrador', 'Pendiente por aprobar', 'Rechazado', 'Pendiente',
               'Validar disponibilidad', 'Alistamiento', 'En Ruta', 'Entregado')
);
ALTER TABLE order_status_log DROP CONSTRAINT IF EXISTS chk_osl_to_status;
ALTER TABLE order_status_log ADD  CONSTRAINT chk_osl_to_status CHECK (
    to_status IN ('Borrador', 'Pendiente por aprobar', 'Rechazado', 'Pendiente',
                  'Validar disponibilidad', 'Alistamiento', 'En Ruta', 'Entregado')
);
ALTER TABLE order_item_changes DROP CONSTRAINT IF EXISTS chk_oic_action;
ALTER TABLE order_item_changes ADD  CONSTRAINT chk_oic_action CHECK (action IN ('updated', 'removed', 'added'));

COMMIT;
