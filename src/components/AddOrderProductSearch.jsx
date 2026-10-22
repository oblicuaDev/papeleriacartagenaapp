import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { ordersApi } from "../services/api";
import { formatCOP, ivaRateLabel } from "../data/mockData";

// Buscador para agregar productos a un pedido en edición. Consulta el
// catálogo del cliente DEL PEDIDO (precio de sus listas + contrato vigente),
// así que sirve igual para el cliente y para el admin.
//
// - `inOrderIds`: productIds ya presentes (no eliminados) en el borrador.
// - `onAdd(product)`: recibe { id, name, sku, unit, price, ivaRate }.
export default function AddOrderProductSearch({ orderId, inOrderIds, onAdd }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); setError(null); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      setLoading(true);
      ordersApi.addableProducts(orderId, q)
        .then((r) => { if (!cancelled) { setResults(r?.data ?? []); setError(null); } })
        .catch((err) => { if (!cancelled) { setResults([]); setError(err?.message || "No se pudo buscar"); } })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, orderId]);

  function handleAdd(p) {
    onAdd(p);
    setQuery("");
    setResults([]);
  }

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">Agregar productos</label>
      <div className="relative">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre o SKU…"
          className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      {query.trim() && (
        <div className="mt-1 border border-gray-200 rounded-lg bg-white max-h-56 overflow-y-auto">
          {loading && results.length === 0 && (
            <p className="px-3 py-2 text-xs text-gray-400">Buscando…</p>
          )}
          {!loading && error && (
            <p className="px-3 py-2 text-xs text-red-600">{error}</p>
          )}
          {!loading && !error && results.length === 0 && (
            <p className="px-3 py-2 text-xs text-gray-400">Sin resultados en el catálogo disponible para este pedido</p>
          )}
          {results.map((p) => {
            const already = inOrderIds.has(p.id);
            return (
              <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-gray-50">
                <span className="min-w-0 truncate">
                  <span className="font-mono text-xs text-blue-600 mr-2">{p.sku}</span>
                  <span className="text-gray-800">{p.name}</span>
                </span>
                <span className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {formatCOP(p.price)} · IVA {ivaRateLabel(p.ivaRate ?? 19)}
                  </span>
                  {already ? (
                    <span className="text-xs text-gray-400 px-2 py-1">En el pedido</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleAdd(p)}
                      className="flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Agregar
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-gray-400 mt-1">
        Los productos agregados entran con cantidad 1; ajústala en la tabla. El precio final lo confirma el sistema al guardar.
      </p>
    </div>
  );
}
