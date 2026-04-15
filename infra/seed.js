// seed.js — Datos iniciales para Papelería Cartagena
// VM:    node seed.js
// Local: node --env-file=api/.env.local infra/seed.js  (desde raíz del proyecto)
import bcrypt from 'bcrypt';
import pg from 'pg';

const pool = new pg.Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'papeleria_db',
  user:     process.env.DB_USER     || 'papeleria_user',
  password: process.env.DB_PASS     || '***REMOVED***',
});

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Listas de precios
    await client.query(`
      INSERT INTO price_lists (name, description, multiplier) VALUES
        ('Lista A', 'Precio publico',   1.0000),
        ('Lista B', 'Precio especial',  0.9000),
        ('Lista C', 'Precio mayorista', 0.8000)
      ON CONFLICT DO NOTHING
    `);
    console.log('[OK] Listas de precios insertadas');

    // Hash admin
    const adminHash = await bcrypt.hash('***REMOVED***', 12);
    await client.query(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES ('Administrador', 'admin@papeleriacartagena.com', $1, 'admin')
      ON CONFLICT (email) DO UPDATE SET password_hash = $1
    `, [adminHash]);
    console.log('[OK] Admin: admin@papeleriacartagena.com / ***REMOVED***');

    // Asesor demo
    const advisorHash = await bcrypt.hash('***REMOVED***', 12);
    const branchRes = await client.query('SELECT id FROM branches LIMIT 1');
    const branchId  = branchRes.rows[0]?.id;

    if (branchId) {
      await client.query(`
        INSERT INTO users (name, email, password_hash, role, branch_id, initials)
        VALUES ('Ana Martinez', 'asesor@papeleriacartagena.com', $1, 'advisor', $2, 'AM')
        ON CONFLICT (email) DO NOTHING
      `, [advisorHash, branchId]);
      console.log('[OK] Asesor: asesor@papeleriacartagena.com / ***REMOVED***');
    }

    // Empresa y usuarios cliente demo
    const companyRes = await client.query(`
      INSERT INTO companies (name, nit, email, phone, address)
      VALUES ('Papeleria El Centro', '900.123.456-7', 'contacto@elcentro.com', '601-234-5678', 'Cra 10 # 5-23, Bogota')
      ON CONFLICT DO NOTHING RETURNING id
    `);

    if (companyRes.rows[0]) {
      const companyId = companyRes.rows[0].id;
      const sucRes = await client.query(`
        INSERT INTO sucursales (company_id, name, city, address)
        VALUES ($1, 'Sede Principal', 'Bogota', 'Cra 10 # 5-23')
        RETURNING id
      `, [companyId]);
      const sucursalId = sucRes.rows[0].id;

      const plRes = await client.query(`SELECT id FROM price_lists WHERE name = 'Lista B' LIMIT 1`);
      const priceListId = plRes.rows[0].id;

      const supHash = await bcrypt.hash('***REMOVED***', 12);
      await client.query(`
        INSERT INTO users (name, email, password_hash, role, client_role, company_id, sucursal_id, price_list_id, initials)
        VALUES ('Supervisor Centro', 'supervisor@elcentro.com', $1, 'client', 'supervisor', $2, $3, $4, 'SC')
        ON CONFLICT (email) DO NOTHING
      `, [supHash, companyId, sucursalId, priceListId]);
      console.log('[OK] Supervisor: supervisor@elcentro.com / ***REMOVED***');

      const cpHash = await bcrypt.hash('***REMOVED***', 12);
      await client.query(`
        INSERT INTO users (name, email, password_hash, role, client_role, company_id, sucursal_id, price_list_id, initials)
        VALUES ('Creador Pedidos', 'pedidos@elcentro.com', $1, 'client', 'creador_pedidos', $2, $3, $4, 'CP')
        ON CONFLICT (email) DO NOTHING
      `, [cpHash, companyId, sucursalId, priceListId]);
      console.log('[OK] Creador pedidos: pedidos@elcentro.com / ***REMOVED***');
    }

    // Categoria y producto demo
    const catRes = await client.query(`
      INSERT INTO categories (name, description)
      VALUES ('Papel', 'Resmas, pliegos y tipos de papel')
      ON CONFLICT DO NOTHING RETURNING id
    `);
    if (catRes.rows[0]) {
      const catId = catRes.rows[0].id;
      await client.query(`
        INSERT INTO products (name, sku, category_id, description, base_price, stock, unit)
        VALUES
          ('Resma Papel Bond 75g A4',    'PAP-001', $1, 'Resma de 500 hojas Bond 75g A4',    12500, 150, 'Resma'),
          ('Resma Papel Bond 75g Carta', 'PAP-002', $1, 'Resma de 500 hojas Bond 75g Carta', 11800, 200, 'Resma'),
          ('Carpeta Plastica Azul',      'CAR-001', $1, 'Carpeta plastica argolla 3 aros',    8500,  80, 'Unidad')
        ON CONFLICT DO NOTHING
      `, [catId]);
      console.log('[OK] Productos de prueba insertados');
    }

    await client.query('COMMIT');
    console.log('\n[LISTO] Seed completado exitosamente');
    console.log('\nCredenciales de prueba:');
    console.log('  Admin:     admin@papeleriacartagena.com  / ***REMOVED***');
    console.log('  Asesor:    asesor@papeleriacartagena.com / ***REMOVED***');
    console.log('  Supervisor: supervisor@elcentro.com       / ***REMOVED***');
    console.log('  Creador:   pedidos@elcentro.com          / ***REMOVED***');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[ERROR]', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
