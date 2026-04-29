// pricing.js — Resolucion centralizada de precios
//
// Modelo:
//   1. price_list_items (override explicito por producto + lista)  ← PHASE 1
//   2. base_price * price_lists.multiplier  (legacy)
//   3. base_price                            (sin lista)
//
// Resolucion de la LISTA aplicable (en orden):
//   1. override explicito (admin/advisor pasa ?priceListId=...)
//   2. sucursales.price_list_id       (PHASE 9: override por sucursal)
//   3. companies.price_list_id        (PHASE 1: lista por empresa)
//   4. users.price_list_id            (legacy: lista por usuario)
//   5. null  -> se usa solo base_price
//
// Esta lib es la UNICA fuente de verdad de precio.
// No duplicar la formula en otros archivos.

import pool from '../config/db.js';

/**
 * Determina que lista de precios aplica al contexto dado.
 * Si userId esta presente, una sola query trae sucursal + company + user
 * y aplica la prioridad sucursal > company > user.
 *
 * @returns {Promise<number|null>} priceListId o null si no aplica ninguna.
 */
export async function resolvePriceListId({ companyId, userId, override } = {}, db = pool) {
  if (override) {
    const id = parseInt(override);
    return Number.isFinite(id) ? id : null;
  }

  if (userId) {
    const { rows } = await db.query(
      `SELECT s.price_list_id AS sucursal_pl,
              c.price_list_id AS company_pl,
              u.price_list_id AS user_pl
         FROM users u
         LEFT JOIN sucursales s ON s.id = u.sucursal_id
         LEFT JOIN companies  c ON c.id = u.company_id
        WHERE u.id = $1`,
      [userId]
    );
    if (rows[0]) {
      return rows[0].sucursal_pl
          || rows[0].company_pl
          || rows[0].user_pl
          || null;
    }
  }

  // Fallback cuando solo hay companyId (callers sin userId)
  if (companyId) {
    const { rows } = await db.query(
      `SELECT price_list_id FROM companies WHERE id = $1`,
      [companyId]
    );
    if (rows[0]?.price_list_id) return rows[0].price_list_id;
  }

  return null;
}

/**
 * Routing de un pedido nuevo: resuelve en una sola query la lista de precios
 * y el asesor que debe atender al usuario dado.
 *
 * Prioridades (PHASE 9):
 *   priceListId: sucursal > company > user > null
 *   advisorId:   sucursal > company > null
 *
 * @returns {Promise<{ priceListId: number|null, advisorId: number|null }>}
 */
export async function resolveOrderRouting(userId, db = pool) {
  if (!userId) return { priceListId: null, advisorId: null };

  const { rows } = await db.query(
    `SELECT s.price_list_id AS sucursal_pl,
            c.price_list_id AS company_pl,
            u.price_list_id AS user_pl,
            s.advisor_id    AS sucursal_advisor,
            c.advisor_id    AS company_advisor
       FROM users u
       LEFT JOIN sucursales s ON s.id = u.sucursal_id
       LEFT JOIN companies  c ON c.id = u.company_id
      WHERE u.id = $1`,
    [userId]
  );
  if (!rows[0]) return { priceListId: null, advisorId: null };

  return {
    priceListId: rows[0].sucursal_pl || rows[0].company_pl || rows[0].user_pl || null,
    advisorId:   rows[0].sucursal_advisor || rows[0].company_advisor || null,
  };
}

/**
 * Aplica la formula de precio a una fila ya enriquecida.
 * Se exporta para que llamadores que ya hicieron el JOIN puedan reusarla.
 */
export function computePrice({ base_price, list_price, multiplier }) {
  const base = Number(base_price);
  if (list_price != null) return Math.round(Number(list_price));
  if (multiplier != null) return Math.round(base * Number(multiplier));
  return Math.round(base);
}

/**
 * Resuelve el precio final de un producto en el contexto dado.
 * @param {number} productId
 * @param {number|null} companyId
 * @param {{ userId?: number, priceListId?: number|string }} opts
 * @returns {Promise<{ productId: number, priceListId: number|null, price: number, currency: string } | null>}
 */
export async function resolveProductPrice(productId, companyId, opts = {}, db = pool) {
  const priceListId = await resolvePriceListId(
    { companyId, userId: opts.userId, override: opts.priceListId },
    db
  );

  const { rows } = await db.query(
    `SELECT p.id, p.base_price,
            pli.price      AS list_price,
            pli.currency   AS list_currency,
            pl.multiplier
       FROM products p
       LEFT JOIN price_lists      pl  ON pl.id            = $2
       LEFT JOIN price_list_items pli ON pli.product_id   = p.id
                                     AND pli.price_list_id = $2
       WHERE p.id = $1`,
    [productId, priceListId]
  );
  if (!rows[0]) return null;

  return {
    productId,
    priceListId,
    price:    computePrice(rows[0]),
    currency: rows[0].list_currency || 'COP',
  };
}

/**
 * Fragmento SQL reusable para queries que listan productos.
 * Devuelve { select, join } parametrizados con el placeholder de priceListId.
 *
 * @param {object} cfg
 * @param {string} cfg.alias              — alias de la tabla products en el FROM (ej: 'p')
 * @param {string} cfg.listIdParam        — placeholder ya formateado, ej: '$3'
 * @returns {{ select: string, join: string }}
 *
 * Uso:
 *   const { select, join } = priceSqlFragment({ alias: 'p', listIdParam: '$1' });
 *   const sql = `SELECT p.id, ${select} AS price FROM products p ${join} WHERE ...`;
 */
export function priceSqlFragment({ alias = 'p', listIdParam }) {
  if (!listIdParam) throw new Error('priceSqlFragment requiere listIdParam');
  return {
    select: `ROUND(
      COALESCE(
        pli.price,
        ${alias}.base_price * COALESCE(pl.multiplier, 1)
      )
    )::int`,
    join: `
      LEFT JOIN price_lists      pl  ON pl.id            = ${listIdParam}
      LEFT JOIN price_list_items pli ON pli.product_id   = ${alias}.id
                                    AND pli.price_list_id = ${listIdParam}`,
  };
}
