// contracts.js — Resolución del catálogo restringido por contrato.
//
// Una empresa con un contrato vigente (active=true y hoy dentro de
// [date_from, date_to]) ve su catálogo restringido a los SKUs incluidos
// en ese contrato. Si hay varios contratos vigentes a la vez, se usa la
// unión de sus SKUs. Sin contrato vigente -> null (sin restricción).

import pool from '../config/db.js';

export async function resolveActiveContractProductIds(companyId, db = pool) {
  if (!companyId) return null;

  const { rows } = await db.query(
    `SELECT DISTINCT cp.product_id
       FROM contracts c
       JOIN contract_products cp ON cp.contract_id = c.id
      WHERE c.company_id = $1
        AND c.active = true
        AND CURRENT_DATE BETWEEN c.date_from AND c.date_to`,
    [companyId]
  );

  if (rows.length === 0) {
    // Empresa sin contrato vigente en absoluto -> sin restricción.
    // Distinguimos "sin contrato vigente" de "contrato vigente sin SKUs"
    // consultando si existe al menos un contrato activo para la empresa.
    const { rows: activeContracts } = await db.query(
      `SELECT 1 FROM contracts
        WHERE company_id = $1 AND active = true
          AND CURRENT_DATE BETWEEN date_from AND date_to
        LIMIT 1`,
      [companyId]
    );
    if (activeContracts.length === 0) return null;
    return new Set(); // contrato vigente pero sin SKUs asignados -> catálogo vacío
  }

  return new Set(rows.map(r => r.product_id));
}
