// pricing.js — Resolucion centralizada de precios
//
// Modelo:
//   1. price_list_items (override explicito por producto + lista)
//   2. fallback CHAIN: si el producto no esta en la lista primaria,
//      se busca en otras listas (sucursal -> company -> user)
//   3. base_price * price_lists.multiplier  (legacy)
//   4. base_price                            (sin lista)
//
// Resolucion de la LISTA primaria (en orden):
//   1. override explicito (admin/advisor pasa ?priceListId=...)
//   2. sucursales.price_list_id
//   3. companies.price_list_id
//   4. users.price_list_id
//   5. null  -> se usa solo base_price
//
// Fallback CHAIN para precios:
//   sucursal_pl > company_pl > user_pl > base_price
//   Si el producto NO existe en la lista primaria, se busca el override
//   en las demas listas vinculadas al usuario antes de caer al base_price.
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
 * primaria, la cadena de fallback y el asesor del usuario dado.
 *
 * Prioridades:
 *   priceListId:    sucursal > company > user > null   (lista primaria)
 *   priceListChain: [sucursal, company, user] sin nulls ni duplicados
 *   advisorId:      sucursal > company > null
 *
 * TODO: Asignacion automatica de repartidor.
 *   Reglas a implementar en una iteracion futura:
 *     - branches.delivery_id como repartidor por defecto de la sede
 *     - round-robin entre repartidores activos de la sede del asesor
 *     - regla por carga actual (menos pedidos en ruta)
 *   Cuando se implemente, devolver tambien `deliveryId` y aplicarlo en
 *   POST /orders junto con advisorId.
 *
 * sucursalId: sucursal del pedido (orders.sucursal_id). Si es distinta a la
 * del usuario (pedidos que un administrador_contrato creo a nombre de otra
 * sucursal antes de pedir a nombre de un usuario), manda esa sucursal y se
 * omite la lista personal del usuario.
 *
 * @returns {Promise<{ priceListId: number|null, priceListChain: number[], advisorId: number|null, sucursalId: number|null }>}
 */
export async function resolveOrderRouting(userId, db = pool, sucursalId = null) {
  if (!userId) return { priceListId: null, priceListChain: [], advisorId: null, sucursalId: null };

  const { rows } = await db.query(
    `SELECT COALESCE($2::int, u.sucursal_id) AS sucursal_id,
            s.price_list_id AS sucursal_pl,
            c.price_list_id AS company_pl,
            ${USER_PL_UNLESS_OTHER_SUCURSAL} AS user_pl,
            s.advisor_id    AS sucursal_advisor,
            c.advisor_id    AS company_advisor
       FROM users u
       LEFT JOIN sucursales s ON s.id = COALESCE($2::int, u.sucursal_id)
       LEFT JOIN companies  c ON c.id = u.company_id
      WHERE u.id = $1`,
    [userId, sucursalId]
  );
  if (!rows[0]) return { priceListId: null, priceListChain: [], advisorId: null, sucursalId: null };

  const chain = dedupeIds([rows[0].sucursal_pl, rows[0].company_pl, rows[0].user_pl]);
  return {
    priceListId:    chain[0] || null,
    priceListChain: chain,
    advisorId:      rows[0].sucursal_advisor || rows[0].company_advisor || null,
    sucursalId:     rows[0].sucursal_id,
  };
}

/**
 * Resuelve la cadena de listas aplicables a un usuario / empresa.
 * Devuelve un array ordenado [sucursal, company, user] sin nulls ni duplicados.
 * Si se pasa override, retorna [override] (gana prioridad absoluta).
 * sucursalId: sucursal del pedido (ver resolveOrderRouting).
 */
export async function resolvePriceListChain({ companyId, userId, override, sucursalId = null } = {}, db = pool) {
  if (override) {
    const id = parseInt(override);
    return Number.isFinite(id) ? [id] : [];
  }

  if (userId) {
    const { rows } = await db.query(
      `SELECT s.price_list_id AS sucursal_pl,
              c.price_list_id AS company_pl,
              ${USER_PL_UNLESS_OTHER_SUCURSAL} AS user_pl
         FROM users u
         LEFT JOIN sucursales s ON s.id = COALESCE($2::int, u.sucursal_id)
         LEFT JOIN companies  c ON c.id = u.company_id
        WHERE u.id = $1`,
      [userId, sucursalId]
    );
    if (rows[0]) {
      return dedupeIds([rows[0].sucursal_pl, rows[0].company_pl, rows[0].user_pl]);
    }
  }

  if (companyId) {
    const { rows } = await db.query(
      `SELECT price_list_id FROM companies WHERE id = $1`,
      [companyId]
    );
    if (rows[0]?.price_list_id) return [rows[0].price_list_id];
  }
  return [];
}

// La lista personal del usuario solo aplica cuando el pedido es de su propia
// sucursal ($2 = sucursal del pedido, NULL = la del usuario).
const USER_PL_UNLESS_OTHER_SUCURSAL =
  `CASE WHEN $2::int IS NULL OR $2::int = u.sucursal_id THEN u.price_list_id END`;

// Sub-roles cliente que crean pedidos (admin_empresa es solo lectura).
export const ORDERING_CLIENT_ROLES = ['creador_pedidos', 'supervisor', 'administrador_contrato'];

/**
 * Usuario a nombre del cual se crea un pedido (o se cotiza el catalogo).
 * Solo administrador_contrato puede suplantar a otro usuario cliente activo de
 * su empresa: el pedido queda como si ese usuario lo hubiera hecho (autor,
 * sucursal, precios, asesor y aprobacion). Para el resto de roles (o sin
 * eleccion) es el propio usuario.
 *
 * Devuelve clientId = null cuando aplica el propio usuario.
 *
 * @returns {Promise<{ clientId: number|null } | { status: number, error: string }>}
 */
export async function resolveTargetClient(user, requested, db = pool) {
  if (requested === undefined || requested === null || requested === '') {
    return { clientId: null };
  }
  const id = Number(requested);
  if (!Number.isInteger(id) || id <= 0) {
    return { status: 422, error: 'clientId invalido' };
  }
  if (id === user.id) return { clientId: null };
  if (user.role !== 'client' || user.clientRole !== 'administrador_contrato') {
    return { status: 403, error: 'Solo el administrador de contrato puede hacer pedidos a nombre de otro usuario' };
  }
  const { rows } = await db.query(
    `SELECT id FROM users
      WHERE id = $1 AND company_id = $2 AND role = 'client' AND active = true
        AND client_role = ANY($3::text[])`,
    [id, user.companyId, ORDERING_CLIENT_ROLES]
  );
  if (!rows[0]) {
    return { status: 422, error: 'El usuario no existe, esta inactivo, no hace pedidos o no pertenece a tu empresa' };
  }
  return { clientId: id };
}

function dedupeIds(arr) {
  const seen = new Set();
  const out = [];
  for (const v of arr) {
    if (v == null) continue;
    const id = parseInt(v);
    if (!Number.isFinite(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
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

/**
 * Fragmento SQL con cadena de fallback: si el producto no esta en la lista
 * primaria, busca en las siguientes; si en ninguna existe override, usa
 * base_price * multiplier de la primaria.
 *
 * @param {object} cfg
 * @param {string} cfg.alias               — alias de products (ej 'p')
 * @param {string[]} cfg.listIdParams      — placeholders en orden de prioridad ['$1', '$2', '$3']
 * @returns {{ select: string, join: string }}
 *
 * Si listIdParams esta vacio, el SELECT cae directo al base_price.
 */
export function priceSqlFragmentChain({ alias = 'p', listIdParams = [] }) {
  if (!listIdParams.length) {
    return {
      select: `ROUND(${alias}.base_price)::int`,
      join: '',
    };
  }
  const joins = [
    `LEFT JOIN price_lists pl ON pl.id = ${listIdParams[0]}`,
  ];
  const priceCoalesce = [];
  listIdParams.forEach((param, idx) => {
    const a = `pli_${idx}`;
    joins.push(
      `LEFT JOIN price_list_items ${a} ON ${a}.product_id = ${alias}.id AND ${a}.price_list_id = ${param}`
    );
    priceCoalesce.push(`${a}.price`);
  });
  return {
    select: `ROUND(
      COALESCE(
        ${priceCoalesce.join(',\n        ')},
        ${alias}.base_price * COALESCE(pl.multiplier, 1)
      )
    )::int`,
    join: joins.join('\n      '),
  };
}
