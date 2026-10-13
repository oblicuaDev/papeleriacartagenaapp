// Catálogo de motivos y estilos de reclamos (comparte valores con api/src/routes/claims.js)

export const CLAIM_REASON_OPTIONS = [
  { value: "no_llego_producto", label: "No me llegó producto" },
  { value: "producto_averiado", label: "Producto averiado" },
  { value: "devolucion_producto", label: "Devolución de producto" },
  { value: "reclamo_servicio", label: "Reclamo sobre el servicio prestado" },
  { value: "felicitacion_servicio", label: "Valoración o felicitación sobre el servicio prestado" },
];

// Motivos sobre artículos: exigen elegir artículos y cantidades (igual que ITEM_REASONS en la API).
export const CLAIM_ITEM_REASONS = ["no_llego_producto", "producto_averiado", "devolucion_producto"];

export function claimReasonLabel(reason) {
  return CLAIM_REASON_OPTIONS.find((o) => o.value === reason)?.label || reason;
}

export const CLAIM_STATUS_STYLES = {
  Abierto: { bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-200", dot: "bg-amber-500" },
  Cerrado: { bg: "bg-gray-100", text: "text-gray-600", border: "border-gray-200", dot: "bg-gray-400" },
};

export function formatClaimDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-CO", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
