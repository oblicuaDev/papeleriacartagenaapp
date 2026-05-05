// seed.js — Datos iniciales para Papelería Cartagena
//
// Idempotente: se puede correr varias veces. Las inserciones usan
// ON CONFLICT DO NOTHING o equivalente; los pedidos de muestra solo se
// crean si la tabla está vacía.
//
// VM:    node --env-file=.env seed.js
// Local: node --env-file=api/.env.local infra/seed.js  (desde la raíz)

import bcrypt from 'bcrypt';
import pg from 'pg';

const pool = new pg.Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'papeleria_db',
  user:     process.env.DB_USER     || 'papeleria_user',
  password: process.env.DB_PASS     || '***REMOVED***',
});

// ── Helpers ────────────────────────────────────────────────────────
const hash = (pwd) => bcrypt.hash(pwd, 12);
const log  = (m)   => console.log(`  ${m}`);
const head = (m)   => console.log(`\n[seed] ${m}`);

async function getOne(client, sql, params, label) {
  const { rows } = await client.query(sql, params);
  if (!rows[0]) throw new Error(`No se pudo resolver: ${label}`);
  return rows[0];
}

async function ensureUser(client, { email, password, ...fields }) {
  const pwdHash = await hash(password);
  const cols = ['email', 'password_hash', ...Object.keys(fields)];
  const vals = [email.toLowerCase(), pwdHash, ...Object.values(fields)];
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');

  const { rows } = await client.query(
    `INSERT INTO users (${cols.join(', ')})
     VALUES (${placeholders})
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
     RETURNING id, name, role, client_role`,
    vals
  );
  return rows[0];
}

async function ensureCompany(client, { name, ...fields }) {
  const cols = ['name', ...Object.keys(fields)];
  const vals = [name, ...Object.values(fields)];
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');

  const { rows } = await client.query(
    `INSERT INTO companies (${cols.join(', ')})
     VALUES (${placeholders})
     ON CONFLICT (nit) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    vals
  );
  return rows[0].id;
}

async function ensureSucursal(client, companyId, { name, city, address, ...overrides }) {
  // (company_id, name) no es UNIQUE en el esquema, pero el seed no debe
  // duplicar: buscamos antes de insertar.
  const existing = await client.query(
    `SELECT id FROM sucursales WHERE company_id = $1 AND name = $2 LIMIT 1`,
    [companyId, name]
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const cols = ['company_id', 'name', 'city', 'address', ...Object.keys(overrides)];
  const vals = [companyId, name, city, address, ...Object.values(overrides)];
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');

  const { rows } = await client.query(
    `INSERT INTO sucursales (${cols.join(', ')})
     VALUES (${placeholders}) RETURNING id`,
    vals
  );
  return rows[0].id;
}

async function ensureCategory(client, name, description) {
  const { rows } = await client.query(
    `INSERT INTO categories (name, description) VALUES ($1, $2)
     ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
     RETURNING id`,
    [name, description]
  );
  return rows[0].id;
}

async function ensureBranch(client, name, city, address) {
  const existing = await client.query(`SELECT id FROM branches WHERE name = $1 LIMIT 1`, [name]);
  if (existing.rows[0]) return existing.rows[0].id;
  const { rows } = await client.query(
    `INSERT INTO branches (name, city, address) VALUES ($1, $2, $3) RETURNING id`,
    [name, city, address]
  );
  return rows[0].id;
}

async function ensureProduct(client, p) {
  await client.query(
    `INSERT INTO products (name, sku, category_id, description, base_price, stock, unit, image_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (sku) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       base_price  = EXCLUDED.base_price,
       stock       = EXCLUDED.stock,
       unit        = EXCLUDED.unit`,
    [p.name, p.sku, p.categoryId, p.description, p.basePrice, p.stock, p.unit, p.imageUrl ?? null]
  );
}

async function ensurePriceList(client, name, description, multiplier = 1.0) {
  // price_lists.name no tiene UNIQUE en el esquema base; chequeamos manual.
  const existing = await client.query(`SELECT id FROM price_lists WHERE name = $1 LIMIT 1`, [name]);
  if (existing.rows[0]) {
    await client.query(
      `UPDATE price_lists SET description = $1, multiplier = $2 WHERE id = $3`,
      [description, multiplier, existing.rows[0].id]
    );
    return existing.rows[0].id;
  }
  const { rows } = await client.query(
    `INSERT INTO price_lists (name, description, multiplier) VALUES ($1, $2, $3) RETURNING id`,
    [name, description, multiplier]
  );
  return rows[0].id;
}

async function setListItem(client, priceListId, sku, price) {
  const { rows } = await client.query(`SELECT id FROM products WHERE sku = $1`, [sku]);
  if (!rows[0]) return;
  await client.query(
    `INSERT INTO price_list_items (price_list_id, product_id, price)
     VALUES ($1, $2, $3)
     ON CONFLICT (product_id, price_list_id) DO UPDATE SET price = EXCLUDED.price`,
    [priceListId, rows[0].id, price]
  );
}

async function assignPriceListToCompany(client, companyId, priceListId) {
  await client.query(
    `UPDATE companies SET price_list_id = $1 WHERE id = $2`,
    [priceListId, companyId]
  );
}

// ──────────────────────────────────────────────────────────────────
async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ───────── Branches (sedes internas de Papelería Cartagena)
    head('Sedes internas (branches)');
    const branchCartagena = await ensureBranch(client, 'Sede Cartagena Centro', 'Cartagena', 'Calle Larga # 8-50');
    const branchBogota    = await ensureBranch(client, 'Sede Bogotá Norte',     'Bogotá',    'Cra 7 # 116-50');
    log(`Branches: ${branchCartagena}, ${branchBogota}`);

    // ───────── Categorías y productos
    head('Catálogo (categorías + productos)');
    const catPapel  = await ensureCategory(client, 'Papel',      'Resmas, pliegos y tipos de papel');
    const catUtil   = await ensureCategory(client, 'Útiles',     'Lapiceros, cuadernos y útiles de oficina');
    const catTec    = await ensureCategory(client, 'Tecnología', 'Tóner, cartuchos, USB y accesorios');
    const catAseo   = await ensureCategory(client, 'Aseo',       'Productos de aseo y dispensadores');

    const products = [
      // Papel
      { sku: 'PAP-001', name: 'Resma Papel Bond 75g A4',     categoryId: catPapel, description: 'Resma de 500 hojas Bond 75g A4',     basePrice: 12500, stock: 150, unit: 'Resma' },
      { sku: 'PAP-002', name: 'Resma Papel Bond 75g Carta',  categoryId: catPapel, description: 'Resma de 500 hojas Bond 75g Carta',  basePrice: 11800, stock: 200, unit: 'Resma' },
      { sku: 'PAP-003', name: 'Resma Papel Bond 90g A4',     categoryId: catPapel, description: 'Resma de 500 hojas Bond 90g A4',     basePrice: 15200, stock: 90,  unit: 'Resma' },
      { sku: 'PAP-004', name: 'Pliego Cartulina Blanca',     categoryId: catPapel, description: 'Pliego cartulina blanca 70x100 cm',  basePrice: 1800,  stock: 320, unit: 'Pliego' },
      // Útiles
      { sku: 'UTI-001', name: 'Caja Lapiceros Negros x12',   categoryId: catUtil,  description: 'Caja x12 lapiceros tinta negra',     basePrice: 9500,  stock: 110, unit: 'Caja' },
      { sku: 'UTI-002', name: 'Cuaderno Argollado 100h',     categoryId: catUtil,  description: 'Cuaderno argollado tamaño carta',     basePrice: 7200,  stock: 250, unit: 'Unidad' },
      { sku: 'UTI-003', name: 'Carpeta Plástica Azul',       categoryId: catUtil,  description: 'Carpeta plástica argolla 3 aros',     basePrice: 8500,  stock: 80,  unit: 'Unidad' },
      { sku: 'UTI-004', name: 'Set Resaltadores x6',         categoryId: catUtil,  description: 'Set 6 resaltadores colores neón',     basePrice: 11900, stock: 60,  unit: 'Set' },
      // Tecnología
      { sku: 'TEC-001', name: 'Tóner Genérico HP 85A',       categoryId: catTec,   description: 'Tóner compatible HP LaserJet P1102',  basePrice: 65000, stock: 25,  unit: 'Unidad' },
      { sku: 'TEC-002', name: 'Memoria USB 32GB',            categoryId: catTec,   description: 'Memoria USB 3.0 32GB',                basePrice: 28500, stock: 70,  unit: 'Unidad' },
      // Aseo
      { sku: 'ASE-001', name: 'Rollo Papel Higiénico x4',    categoryId: catAseo,  description: 'Pack 4 rollos hoja doble',           basePrice: 9800,  stock: 180, unit: 'Paquete' },
      { sku: 'ASE-002', name: 'Jabón Líquido Manos 500ml',   categoryId: catAseo,  description: 'Jabón líquido antibacterial 500ml',  basePrice: 6900,  stock: 130, unit: 'Unidad' },
    ];
    for (const p of products) await ensureProduct(client, p);
    log(`${products.length} productos en 4 categorías`);

    // ───────── Listas de precios (multiplier por defecto + overrides por producto)
    head('Listas de precios (con price_list_items)');
    const listaA = await ensurePriceList(client, 'Lista A — Pública',     'Precio publicado, sin descuento',  1.0000);
    const listaB = await ensurePriceList(client, 'Lista B — Empresarial', 'Cliente corporativo recurrente',   0.9000);
    const listaC = await ensurePriceList(client, 'Lista C — Mayorista',   'Volumen alto, precios especiales', 0.8000);

    // Lista B: overrides puntuales
    await setListItem(client, listaB, 'PAP-001', 11000);
    await setListItem(client, listaB, 'PAP-002', 10400);
    await setListItem(client, listaB, 'TEC-001', 58000);
    // Lista C: overrides agresivos
    await setListItem(client, listaC, 'PAP-001',  9800);
    await setListItem(client, listaC, 'PAP-002',  9200);
    await setListItem(client, listaC, 'PAP-003', 11900);
    await setListItem(client, listaC, 'UTI-001',  7200);
    await setListItem(client, listaC, 'TEC-001', 53000);
    await setListItem(client, listaC, 'TEC-002', 24000);
    log(`3 listas; B con 3 overrides; C con 6 overrides`);

    // ───────── Personal interno (admin / advisors / delivery)
    head('Personal interno');
    await ensureUser(client, {
      email: 'admin@papeleriacartagena.com', password: '***REMOVED***',
      name: 'Administrador General', role: 'admin', initials: 'AG',
    });
    log('Admin: admin@papeleriacartagena.com / ***REMOVED***');

    const advisorAna = await ensureUser(client, {
      email: 'asesor@papeleriacartagena.com', password: '***REMOVED***',
      name: 'Ana Martínez', role: 'advisor', branch_id: branchCartagena, initials: 'AM',
    });
    const advisorCarlos = await ensureUser(client, {
      email: 'carlos@papeleriacartagena.com', password: '***REMOVED***',
      name: 'Carlos Rodríguez', role: 'advisor', branch_id: branchBogota, initials: 'CR',
    });
    log(`Asesores: Ana (#${advisorAna.id}), Carlos (#${advisorCarlos.id})`);

    const deliveryPedro = await ensureUser(client, {
      email: 'pedro@papeleriacartagena.com', password: '***REMOVED***',
      name: 'Pedro García', role: 'delivery', branch_id: branchCartagena, initials: 'PG',
    });
    const deliveryLucia = await ensureUser(client, {
      email: 'lucia@papeleriacartagena.com', password: '***REMOVED***',
      name: 'Lucía Pérez', role: 'delivery', branch_id: branchBogota, initials: 'LP',
    });
    log(`Repartidores: Pedro (#${deliveryPedro.id}), Lucía (#${deliveryLucia.id})`);

    // ───────── Empresas y sucursales
    head('Empresas y sucursales');
    const elCentroId = await ensureCompany(client, {
      name: 'Papelería El Centro', nit: '900.123.456-7',
      email: 'contacto@elcentro.com', phone: '601-234-5678',
      address: 'Cra 10 # 5-23, Bogotá',
      advisor_id: advisorAna.id,
    });
    const elCentroSucBogota = await ensureSucursal(client, elCentroId, {
      name: 'Sede Bogotá', city: 'Bogotá',  address: 'Cra 10 # 5-23',
    });
    const elCentroSucMedellin = await ensureSucursal(client, elCentroId, {
      name: 'Sede Medellín', city: 'Medellín', address: 'Cl 50 # 40-12',
      // Override por sucursal: Medellín usa Lista A en vez de B
      price_list_id: listaA,
    });

    const distNorteId = await ensureCompany(client, {
      name: 'Distribuciones Norte SAS', nit: '901.456.789-2',
      email: 'compras@distnorte.com', phone: '604-567-8901',
      address: 'Cl 80 # 30-20, Barranquilla',
      advisor_id: advisorCarlos.id,
    });
    const distNorteSuc = await ensureSucursal(client, distNorteId, {
      name: 'Sede Principal', city: 'Barranquilla', address: 'Cl 80 # 30-20',
    });

    const colegioId = await ensureCompany(client, {
      name: 'Colegio San Andrés', nit: '900.987.654-3',
      email: 'admin@colegiosanandres.edu.co', phone: '601-789-1234',
      address: 'Av El Dorado # 68-30, Bogotá',
      advisor_id: advisorAna.id,
    });
    const colegioSucPrimaria = await ensureSucursal(client, colegioId, {
      name: 'Sede Primaria',     city: 'Bogotá', address: 'Av El Dorado # 68-30',
    });
    const colegioSucBachillerato = await ensureSucursal(client, colegioId, {
      name: 'Sede Bachillerato', city: 'Bogotá', address: 'Av El Dorado # 68-32',
    });
    log(`3 empresas, 5 sucursales (incluye override de Medellín a Lista A)`);

    // Asignar listas de precios a empresas (Phase 2)
    head('Asignación de listas a empresas');
    await assignPriceListToCompany(client, elCentroId,  listaB);
    await assignPriceListToCompany(client, distNorteId, listaC);
    await assignPriceListToCompany(client, colegioId,   listaA);
    log('El Centro→B, Distribuciones→C, Colegio→A');

    // ───────── Usuarios cliente por empresa
    // (Phase 6: ya no se requiere price_list_id en users; los precios cascadean)
    head('Usuarios cliente');

    // El Centro (Bogotá)
    const supCentroBogota = await ensureUser(client, {
      email: 'supervisor@elcentro.com', password: '***REMOVED***',
      name: 'Sofía Castro', role: 'client', client_role: 'supervisor',
      company_id: elCentroId, sucursal_id: elCentroSucBogota, initials: 'SC',
    });
    const creadorCentroBogota = await ensureUser(client, {
      email: 'pedidos@elcentro.com', password: '***REMOVED***',
      name: 'Carlos Pinto', role: 'client', client_role: 'creador_pedidos',
      company_id: elCentroId, sucursal_id: elCentroSucBogota, initials: 'CP',
    });
    const adminEmpCentro = await ensureUser(client, {
      email: 'admin@elcentro.com', password: '***REMOVED***',
      name: 'Mónica Ortiz', role: 'client', client_role: 'admin_empresa',
      company_id: elCentroId, sucursal_id: elCentroSucBogota, initials: 'MO',
    });
    // El Centro (Medellín) — supervisor de otra sucursal para validar scope
    const supCentroMedellin = await ensureUser(client, {
      email: 'supervisor.medellin@elcentro.com', password: '***REMOVED***',
      name: 'Andrés Mejía', role: 'client', client_role: 'supervisor',
      company_id: elCentroId, sucursal_id: elCentroSucMedellin, initials: 'AM',
    });
    const creadorCentroMedellin = await ensureUser(client, {
      email: 'pedidos.medellin@elcentro.com', password: '***REMOVED***',
      name: 'Diana Velez', role: 'client', client_role: 'creador_pedidos',
      company_id: elCentroId, sucursal_id: elCentroSucMedellin, initials: 'DV',
    });

    // Distribuciones Norte
    const supDistNorte = await ensureUser(client, {
      email: 'supervisor@distnorte.com', password: '***REMOVED***',
      name: 'Roberto Salas', role: 'client', client_role: 'supervisor',
      company_id: distNorteId, sucursal_id: distNorteSuc, initials: 'RS',
    });
    const creadorDistNorte = await ensureUser(client, {
      email: 'pedidos@distnorte.com', password: '***REMOVED***',
      name: 'Laura Hoyos', role: 'client', client_role: 'creador_pedidos',
      company_id: distNorteId, sucursal_id: distNorteSuc, initials: 'LH',
    });

    // Colegio
    const supColegioPrim = await ensureUser(client, {
      email: 'rectoria@colegiosanandres.edu.co', password: '***REMOVED***',
      name: 'María Pérez', role: 'client', client_role: 'supervisor',
      company_id: colegioId, sucursal_id: colegioSucPrimaria, initials: 'MP',
    });
    const creadorColegio = await ensureUser(client, {
      email: 'compras@colegiosanandres.edu.co', password: '***REMOVED***',
      name: 'Juan Torres', role: 'client', client_role: 'creador_pedidos',
      company_id: colegioId, sucursal_id: colegioSucBachillerato, initials: 'JT',
    });
    log('Supervisores, creadores y 1 admin_empresa creados');

    // ───────── Pedidos de muestra (solo si la tabla está vacía)
    head('Pedidos de muestra');
    const { rows: ordersExisting } = await client.query(`SELECT COUNT(*)::int AS c FROM orders`);
    if (ordersExisting[0].c > 0) {
      log(`Saltando: ya existen ${ordersExisting[0].c} pedidos`);
    } else {
      await seedSampleOrders(client, {
        creadorCentroBogota, supCentroBogota,
        creadorCentroMedellin,
        creadorDistNorte,
        creadorColegio,
        advisorAna, advisorCarlos,
        deliveryPedro, deliveryLucia,
      });
    }

    await client.query('COMMIT');

    // ───────── Resumen
    console.log('\n[seed] ✅ Listo\n');
    console.log('Credenciales de prueba:');
    console.log('  ─── Internos ──────────────────────────────────────');
    console.log('  Admin                  admin@papeleriacartagena.com    ***REMOVED***');
    console.log('  Asesor (Cartagena)     asesor@papeleriacartagena.com   ***REMOVED***');
    console.log('  Asesor (Bogotá)        carlos@papeleriacartagena.com   ***REMOVED***');
    console.log('  Repartidor (Cartagena) pedro@papeleriacartagena.com    ***REMOVED***');
    console.log('  Repartidor (Bogotá)    lucia@papeleriacartagena.com    ***REMOVED***');
    console.log('  ─── Papelería El Centro (Lista B) ─────────────────');
    console.log('  Supervisor Bogotá      supervisor@elcentro.com         ***REMOVED***');
    console.log('  Creador Bogotá         pedidos@elcentro.com            ***REMOVED***');
    console.log('  Admin de empresa       admin@elcentro.com              ***REMOVED***');
    console.log('  Supervisor Medellín    supervisor.medellin@elcentro.com ***REMOVED***');
    console.log('  Creador Medellín       pedidos.medellin@elcentro.com   ***REMOVED***');
    console.log('  ─── Distribuciones Norte (Lista C) ────────────────');
    console.log('  Supervisor             supervisor@distnorte.com        ***REMOVED***');
    console.log('  Creador                pedidos@distnorte.com           ***REMOVED***');
    console.log('  ─── Colegio San Andrés (Lista A) ──────────────────');
    console.log('  Rectoría (supervisor)  rectoria@colegiosanandres.edu.co ***REMOVED***');
    console.log('  Compras (creador)      compras@colegiosanandres.edu.co ***REMOVED***');
    console.log('');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[seed] ❌ ERROR:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// ──────────────────────────────────────────────────────────────────
// Pedidos de muestra que cubren todos los estados del lifecycle.
// Se insertan items y se hace transitar el status para poblar
// order_status_log y delivered_at/delivered_by.
async function seedSampleOrders(client, ctx) {
  const {
    creadorCentroBogota, supCentroBogota,
    creadorCentroMedellin,
    creadorDistNorte,
    creadorColegio,
    advisorAna, advisorCarlos,
    deliveryPedro, deliveryLucia,
  } = ctx;

  // Helper: crea un pedido con items, ya con el status indicado, y registra
  // en order_status_log la cadena de transiciones (NULL→initial→...→final).
  async function makeOrder({
    clientUser, advisorId = null, deliveryId = null, deliveredById = null,
    initialStatus, transitions = [], items, notes = null, daysAgo = 0,
  }) {
    const created = new Date(Date.now() - daysAgo * 86400 * 1000);
    const { rows: idRows } = await client.query(`SELECT fn_generate_order_id() AS id`);
    const orderId = idRows[0].id;

    let total = 0;
    const itemsResolved = [];
    for (const it of items) {
      const { rows: pr } = await client.query(
        `SELECT id, name, sku, unit, base_price FROM products WHERE sku = $1`,
        [it.sku]
      );
      if (!pr[0]) continue;
      // Para el seed usamos base_price como unit_price (más simple, refleja
      // el precio congelado en el momento del pedido).
      const unitPrice = Number(pr[0].base_price);
      total += unitPrice * it.qty;
      itemsResolved.push({ ...pr[0], qty: it.qty, unitPrice });
    }
    if (!itemsResolved.length) return null;

    const finalStatus = transitions.length
      ? transitions[transitions.length - 1].to
      : initialStatus;

    const deliveredAt = finalStatus === 'Entregado' && deliveredById
      ? new Date(created.getTime() + 4 * 86400 * 1000)
      : null;

    await client.query(
      `INSERT INTO orders
         (id, client_id, advisor_id, delivery_id, delivered_by, delivered_at,
          status, notes, total, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
      [orderId, clientUser.id, advisorId, deliveryId, deliveredById, deliveredAt,
       finalStatus, notes, total, created]
    );

    for (const it of itemsResolved) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, sku, quantity, unit_price, unit)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [orderId, it.id, it.name, it.sku, it.qty, it.unitPrice, it.unit]
      );
    }

    // Log: creación + transiciones
    await client.query(
      `INSERT INTO order_status_log (order_id, from_status, to_status, changed_by, created_at)
       VALUES ($1, NULL, $2, $3, $4)`,
      [orderId, initialStatus, clientUser.id, created]
    );
    for (const [i, t] of transitions.entries()) {
      const at = new Date(created.getTime() + (i + 1) * 86400 * 1000);
      await client.query(
        `INSERT INTO order_status_log (order_id, from_status, to_status, changed_by, reason, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [orderId, t.from, t.to, t.by, t.reason ?? null, at]
      );
    }

    log(`${orderId} → ${finalStatus} (${itemsResolved.length} items, $${total.toLocaleString('es-CO')})`);
    return orderId;
  }

  // 1. Pendiente por aprobar — recién creado por creador
  await makeOrder({
    clientUser:    creadorCentroBogota,
    advisorId:     advisorAna.id,
    initialStatus: 'Pendiente por aprobar',
    items: [
      { sku: 'PAP-001', qty: 5 },
      { sku: 'UTI-002', qty: 10 },
    ],
    notes: 'Pedido mensual de oficina principal',
    daysAgo: 1,
  });

  // 2. Rechazado — supervisor lo rechazó con razón
  await makeOrder({
    clientUser:    creadorCentroBogota,
    advisorId:     advisorAna.id,
    initialStatus: 'Pendiente por aprobar',
    transitions: [
      { from: 'Pendiente por aprobar', to: 'Rechazado',
        by: supCentroBogota.id, reason: 'Cantidad excede el presupuesto mensual' },
    ],
    items: [
      { sku: 'TEC-001', qty: 20 },
    ],
    notes: 'Stock de tóner para todo el año',
    daysAgo: 3,
  });

  // 3. Pendiente — aprobado por supervisor, esperando al asesor
  await makeOrder({
    clientUser:    creadorCentroBogota,
    advisorId:     advisorAna.id,
    initialStatus: 'Pendiente por aprobar',
    transitions: [
      { from: 'Pendiente por aprobar', to: 'Pendiente', by: supCentroBogota.id },
    ],
    items: [
      { sku: 'PAP-002', qty: 8 },
      { sku: 'UTI-001', qty: 3 },
    ],
    daysAgo: 2,
  });

  // 4. Alistamiento — asesor procesó disponibilidad
  await makeOrder({
    clientUser:    creadorDistNorte,
    advisorId:     advisorCarlos.id,
    initialStatus: 'Pendiente por aprobar',
    transitions: [
      { from: 'Pendiente por aprobar', to: 'Pendiente',                by: 1 /* admin */ },
      { from: 'Pendiente',             to: 'Validar disponibilidad',   by: advisorCarlos.id },
      { from: 'Validar disponibilidad',to: 'Alistamiento',             by: advisorCarlos.id },
    ],
    items: [
      { sku: 'PAP-003', qty: 12 },
      { sku: 'TEC-002', qty: 6 },
    ],
    notes: 'Despachar a la bodega de Barranquilla',
    daysAgo: 5,
  });

  // 5. En Ruta — repartidor asignado, en camino
  await makeOrder({
    clientUser:    creadorColegio,
    advisorId:     advisorAna.id,
    deliveryId:    deliveryPedro.id,
    initialStatus: 'Pendiente por aprobar',
    transitions: [
      { from: 'Pendiente por aprobar', to: 'Pendiente',                by: 1 },
      { from: 'Pendiente',             to: 'Validar disponibilidad',   by: advisorAna.id },
      { from: 'Validar disponibilidad',to: 'Alistamiento',             by: advisorAna.id },
      { from: 'Alistamiento',          to: 'En Ruta',                  by: deliveryPedro.id },
    ],
    items: [
      { sku: 'PAP-001', qty: 20 },
      { sku: 'PAP-004', qty: 100 },
      { sku: 'UTI-003', qty: 50 },
    ],
    notes: 'Inicio de año escolar',
    daysAgo: 4,
  });

  // 6. Entregado — flujo completo + delivered_by/at
  await makeOrder({
    clientUser:    creadorCentroMedellin,
    advisorId:     advisorAna.id,
    deliveryId:    deliveryLucia.id,
    deliveredById: deliveryLucia.id,
    initialStatus: 'Pendiente por aprobar',
    transitions: [
      { from: 'Pendiente por aprobar', to: 'Pendiente',                by: 1 },
      { from: 'Pendiente',             to: 'Validar disponibilidad',   by: advisorAna.id },
      { from: 'Validar disponibilidad',to: 'Alistamiento',             by: advisorAna.id },
      { from: 'Alistamiento',          to: 'En Ruta',                  by: deliveryLucia.id },
      { from: 'En Ruta',               to: 'Entregado',                by: deliveryLucia.id },
    ],
    items: [
      { sku: 'PAP-002', qty: 4 },
      { sku: 'ASE-001', qty: 12 },
      { sku: 'ASE-002', qty: 6 },
    ],
    notes: 'Entrega confirmada con firma del recepcionista',
    daysAgo: 9,
  });
}

seed();
