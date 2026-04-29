-- ============================================================
-- validate-db.sql  —  Queries de validación de integridad
-- Ejecutar: psql -U papeleria_dev -d papeleria_db_dev -f validate-db.sql
-- ============================================================

\echo '=== 1. RECUENTO POR ENTIDAD ==='
SELECT 'companies'   AS tabla, COUNT(*) FROM companies   WHERE active = true
UNION ALL
SELECT 'sucursales',            COUNT(*) FROM sucursales  WHERE active = true
UNION ALL
SELECT 'branches',              COUNT(*) FROM branches    WHERE active = true
UNION ALL
SELECT 'users',                 COUNT(*) FROM users       WHERE active = true
UNION ALL
SELECT 'categories',            COUNT(*) FROM categories  WHERE active = true
UNION ALL
SELECT 'price_lists',           COUNT(*) FROM price_lists
UNION ALL
SELECT 'products',              COUNT(*) FROM products    WHERE active = true
UNION ALL
SELECT 'orders',                COUNT(*) FROM orders
UNION ALL
SELECT 'order_items',           COUNT(*) FROM order_items
UNION ALL
SELECT 'order_comments',        COUNT(*) FROM order_comments
UNION ALL
SELECT 'order_attachments',     COUNT(*) FROM order_attachments;

\echo ''
\echo '=== 2. ORPHANS: order_items sin producto activo ==='
SELECT oi.order_id, oi.product_id, oi.product_name
FROM order_items oi
LEFT JOIN products p ON p.id = oi.product_id
WHERE p.id IS NULL OR p.active = false;

\echo ''
\echo '=== 3. ORPHANS: orders sin client_id válido ==='
SELECT o.id, o.client_id
FROM orders o
LEFT JOIN users u ON u.id = o.client_id
WHERE u.id IS NULL;

\echo ''
\echo '=== 4. ORPHANS: users sin company (clientes) ==='
SELECT id, name, email FROM users
WHERE role = 'client' AND company_id IS NULL AND active = true;

\echo ''
\echo '=== 5. ORPHANS: users sin price_list (clientes) ==='
SELECT id, name, email FROM users
WHERE role = 'client' AND price_list_id IS NULL AND active = true;

\echo ''
\echo '=== 6. ORPHANS: products sin categoría válida ==='
SELECT p.id, p.name, p.category_id
FROM products p
LEFT JOIN categories c ON c.id = p.category_id
WHERE c.id IS NULL;

\echo ''
\echo '=== 7. COMENTARIOS huérfanos (order_id inexistente) ==='
SELECT oc.id, oc.order_id FROM order_comments oc
LEFT JOIN orders o ON o.id = oc.order_id
WHERE o.id IS NULL;

\echo ''
\echo '=== 8. ADJUNTOS huérfanos (order_id inexistente) ==='
SELECT att.id, att.order_id, att.file_name FROM order_attachments att
LEFT JOIN orders o ON o.id = att.order_id
WHERE o.id IS NULL;

\echo ''
\echo '=== 9. PEDIDOS recientes (últimos 20) ==='
SELECT o.id, o.status, o.total, o.created_at,
       uc.name AS client, ua.name AS advisor
FROM orders o
JOIN users uc ON uc.id = o.client_id
LEFT JOIN users ua ON ua.id = o.advisor_id
ORDER BY o.created_at DESC
LIMIT 20;

\echo ''
\echo '=== 10. COMENTARIOS recientes (últimos 10) ==='
SELECT oc.id, oc.order_id, u.name AS author, oc.text, oc.created_at
FROM order_comments oc
JOIN users u ON u.id = oc.author_id
ORDER BY oc.created_at DESC
LIMIT 10;

\echo ''
\echo '=== 11. ADJUNTOS recientes (últimos 10) ==='
SELECT att.id, att.order_id, att.file_name, att.mime_type, att.uploaded_at
FROM order_attachments att
ORDER BY att.uploaded_at DESC
LIMIT 10;

\echo ''
\echo '=== 12. LISTAS DE PRECIOS — multiplicadores ==='
SELECT id, name, multiplier FROM price_lists ORDER BY multiplier DESC;

\echo ''
\echo '=== VALIDACIÓN COMPLETA ==='
