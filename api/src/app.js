import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import authRouter        from './routes/auth.js';
import companiesRouter   from './routes/companies.js';
import sucursalesRouter  from './routes/sucursales.js';
import branchesRouter    from './routes/branches.js';
import usersRouter       from './routes/users.js';
import categoriesRouter  from './routes/categories.js';
import priceListsRouter  from './routes/priceLists.js';
import productsRouter    from './routes/products.js';
import ordersRouter, { purchaseOrderPdfHandler } from './routes/orders.js';
import commentsRouter    from './routes/comments.js';
import attachmentsRouter from './routes/attachments.js';
import catalogRouter     from './routes/catalog.js';
import statsRouter       from './routes/stats.js';
import { requireAuth }   from './middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// ── CORS ────────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) cb(null, true);
    else cb(new Error('CORS bloqueado: ' + origin));
  },
  credentials: true,
}));

// ── Body parsing ─────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Health check ──────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── Rutas API v1 ──────────────────────────────────────────────
const api = express.Router();

api.use('/auth',                       authRouter);
api.use('/companies',                  companiesRouter);
api.use('/companies/:companyId/sucursales', sucursalesRouter);
api.use('/branches',                   branchesRouter);
api.use('/users',                      usersRouter);
api.use('/categories',                 categoriesRouter);
api.use('/price-lists',                priceListsRouter);
api.use('/products',                   productsRouter);
api.use('/orders',                     ordersRouter);
api.get('/purchase-orders/:id/pdf',    requireAuth, purchaseOrderPdfHandler);
api.use('/orders/:orderId/comments',   commentsRouter);
api.use('/orders/:orderId/attachments',attachmentsRouter);
api.use('/catalog',                    catalogRouter);
api.use('/stats',                      statsRouter);

app.use('/api/v1', api);

// ── 404 ───────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// ── Error handler global ──────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

export default app;
