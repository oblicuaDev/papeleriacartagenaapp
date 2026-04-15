import 'dotenv/config';
import app from './src/app.js';
import pool from './src/config/db.js';

const PORT = parseInt(process.env.PORT || '3000');

async function start() {
  // Verificar conexión a la base de datos
  try {
    const { rows } = await pool.query('SELECT NOW() AS ts');
    console.log(`✔ PostgreSQL conectado — ${rows[0].ts}`);
  } catch (err) {
    console.error('✘ No se pudo conectar a PostgreSQL:', err.message);
    process.exit(1);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✔ API Papelería Cartagena corriendo en http://0.0.0.0:${PORT}/api/v1`);
    console.log(`  Ambiente: ${process.env.NODE_ENV || 'development'}`);
  });
}

start();
