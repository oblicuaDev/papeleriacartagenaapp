import { useEffect, useMemo, useState } from "react";
import { Search, Eye, ShieldAlert } from "lucide-react";
import { claimsApi } from "../services/api";
import { CLAIM_STATUS_STYLES, claimReasonLabel, formatClaimDate } from "../data/claims";
import ClaimDetailModal from "./ClaimDetailModal";

const TABS = [
  { value: "all", label: "Todos" },
  { value: "Abierto", label: "Abiertos" },
  { value: "Cerrado", label: "Cerrados" },
];

export function ClaimStatusBadge({ status }) {
  const s = CLAIM_STATUS_STYLES[status] || CLAIM_STATUS_STYLES.Cerrado;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${s.bg} ${s.text} ${s.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}

// Listado de reclamos (Mis reclamos / módulo interno). El backend ya filtra por
// el alcance del rol; aquí solo se presenta y se abre el detalle en un modal.
export default function ClaimsList({ title, subtitle, showClient = false, canManage = false }) {
  const [claims, setClaims] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState(null);

  async function load() {
    try {
      const res = await claimsApi.list();
      setClaims(res.data || []);
    } catch (err) {
      setError(err?.message || "No se pudieron cargar los reclamos");
    }
  }
  useEffect(() => { load(); }, []);

  const counts = useMemo(() => ({
    all: claims?.length || 0,
    Abierto: claims?.filter((c) => c.status === "Abierto").length || 0,
    Cerrado: claims?.filter((c) => c.status === "Cerrado").length || 0,
  }), [claims]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (claims || []).filter((c) =>
      (tab === "all" || c.status === tab) &&
      (!q || c.id.toLowerCase().includes(q) || c.orderId.toLowerCase().includes(q) ||
        (c.clientName || "").toLowerCase().includes(q))
    );
  }, [claims, tab, search]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1.5 bg-white border border-gray-100 rounded-xl p-1 shadow-sm">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition ${
                tab === t.value ? "bg-blue-700 text-white" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {t.label}
              <span className={`ml-1.5 text-xs ${tab === t.value ? "text-blue-200" : "text-gray-400"}`}>
                {counts[t.value]}
              </span>
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por ID, pedido o cliente…"
            className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left text-xs font-semibold text-gray-500 uppercase px-5 py-3">ID</th>
              <th className="text-left text-xs font-semibold text-gray-500 uppercase px-5 py-3">Motivo</th>
              <th className="text-left text-xs font-semibold text-gray-500 uppercase px-5 py-3">Pedido</th>
              {showClient && <th className="text-left text-xs font-semibold text-gray-500 uppercase px-5 py-3">Cliente</th>}
              <th className="text-left text-xs font-semibold text-gray-500 uppercase px-5 py-3">Fecha</th>
              <th className="text-left text-xs font-semibold text-gray-500 uppercase px-5 py-3">Estado</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {claims === null && !error && (
              <tr><td colSpan={7} className="text-center text-sm text-gray-400 py-10">Cargando reclamos…</td></tr>
            )}
            {claims !== null && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-12">
                  <ShieldAlert className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No hay reclamos para mostrar</p>
                </td>
              </tr>
            )}
            {rows.map((c) => (
              <tr key={c.id} className={c.status === "Abierto" ? "bg-amber-50/30" : ""}>
                <td className="px-5 py-3 font-mono text-sm font-semibold text-gray-800">{c.id}</td>
                <td className="px-5 py-3 text-sm text-gray-700">{claimReasonLabel(c.reason)}</td>
                <td className="px-5 py-3 font-mono text-sm text-gray-600">{c.orderId}</td>
                {showClient && <td className="px-5 py-3 text-sm text-gray-700">{c.clientName}</td>}
                <td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap">{formatClaimDate(c.createdAt)}</td>
                <td className="px-5 py-3"><ClaimStatusBadge status={c.status} /></td>
                <td className="px-5 py-3 text-right">
                  <button
                    onClick={() => setOpenId(c.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    {canManage ? "GESTIONAR" : "VER"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openId && (
        <ClaimDetailModal
          claimId={openId}
          canManage={canManage}
          onClose={() => setOpenId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
