// iva.js — Discriminación de IVA (19%) sobre montos ya IVA-incluidos.
//
// Las listas de precio se cargan con IVA incluido, así que `total` ya es
// el monto final. subtotal se deriva y iva es el resto exacto, así
// subtotal + iva === total siempre (evita drift de redondeo).

export const IVA_RATE = 0.19;

export function splitIva(total) {
  const subtotal = Math.round((Number(total) / (1 + IVA_RATE)) * 100) / 100;
  const iva = Math.round((Number(total) - subtotal) * 100) / 100;
  return { subtotal, iva };
}
