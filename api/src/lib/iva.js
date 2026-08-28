// iva.js — Discriminación de IVA sobre montos ya IVA-incluidos.
//
// Los precios (catálogo y listas) se cargan CON IVA incluido, así que el
// `total` de una línea o de un pedido ya es el monto final. El subtotal se
// deriva según la tasa de la línea y el IVA es el resto exacto, de modo que
// subtotal + iva === total siempre (sin drift de redondeo).

export const IVA_RATES = [0, 5, 19];
export const IVA_RATE = 0.19; // compat: tasa por defecto (fracción)

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// `total` incluye IVA a la tasa `rate` (en %). Devuelve { subtotal, iva }
// con subtotal + iva === total.
export function splitIvaRate(total, rate = 19) {
  const t = Number(total);
  const r = (Number(rate) || 0) / 100;
  const subtotal = round2(t / (1 + r));
  const iva = round2(t - subtotal);
  return { subtotal, iva };
}

// Compat con el código previo (todo al 19%).
export function splitIva(total) {
  return splitIvaRate(total, 19);
}

// Agrega una lista de líneas de pedido (cada una con su tasa congelada) y
// devuelve los totales del pedido más el desglose por tasa para los dashboards.
//   lines: [{ lineTotal, ivaRate }]
//   -> { total, subtotal, iva, iva5, iva19, exentoBase }
// Garantiza: iva5 + iva19 === iva  y  subtotal + iva === total.
export function aggregateOrderIva(lines) {
  let total = 0;
  let iva5 = 0;
  let iva19 = 0;
  let exentoBase = 0;

  for (const l of lines) {
    const lt = round2(l.lineTotal);
    const rate = Number(l.ivaRate) || 0;
    total = round2(total + lt);
    if (rate === 5) {
      iva5 = round2(iva5 + splitIvaRate(lt, 5).iva);
    } else if (rate === 19) {
      iva19 = round2(iva19 + splitIvaRate(lt, 19).iva);
    } else {
      exentoBase = round2(exentoBase + lt);
    }
  }

  const iva = round2(iva5 + iva19);
  const subtotal = round2(total - iva);
  return { total, subtotal, iva, iva5, iva19, exentoBase };
}

// Etiqueta corta de una tasa para tablas / documentos.
export function ivaRateLabel(rate) {
  const r = Number(rate);
  if (r === 0) return 'Exento';
  return `${r % 1 === 0 ? r : r.toFixed(1)}%`;
}
