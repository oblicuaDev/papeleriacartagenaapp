import { useEffect, useState } from "react";
import { ShieldAlert, Plus, Eye, CheckCircle2, AlertTriangle } from "lucide-react";
import { claimsApi } from "../services/api";
import { claimReasonLabel, formatClaimDate } from "../data/claims";
import { ClaimStatusBadge } from "./ClaimsList";
import ClaimFormModal from "./ClaimFormModal";
import ClaimDetailModal from "./ClaimDetailModal";

// Reclamos de un pedido, dentro de la interna del pedido.
//  - canCreate: muestra "Crear reclamo" (cliente).
//  - canManage: el detalle ofrece las acciones de gestión (admin / asesor).
//  - onOrderChanged: el pedido pudo cambiar de estado → el padre lo refresca.
export default function OrderClaimsPanel({ order, canCreate = false, canManage = false, onOrderChanged }) {
  const [claims, setClaims] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [step, setStep] = useState(null); // null | 'confirm' | 'form'
  const [existing, setExisting] = useState([]); // reclamos abiertos del pedido
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    try {
      const res = await claimsApi.list({ orderId: order.id });
      setClaims(res.data || []);
    } catch { /* el panel es complementario: no bloquea el pedido */ }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [order.id]);

  // Valida ANTES de crear: si hay un reclamo abierto, pide confirmación.
  async function startCreate() {
    setError(null); setNotice(null); setChecking(true);
    try {
      const res = await claimsApi.list({ orderId: order.id, status: "Abierto" });
      const open = res.data || [];
      setExisting(open);
      setStep(open.length ? "confirm" : "form");
    } catch (err) {
      setError(err?.message || "No se pudo validar los reclamos del pedido");
    } finally {
      setChecking(false);
    }
  }

  async function handleCreated(created) {
    setStep(null);
    setNotice(
      created.status === "Cerrado"
        ? `Gracias por tu valoración. Quedó registrada con el ID ${created.id}.`
        : `Reclamo ${created.id} registrado. El pedido pasó a "En reclamación".`
    );
    await load();
    onOrderChanged?.();
  }

  if (!canCreate && claims.length === 0) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2 flex-wrap">
        <ShieldAlert className="w-4 h-4 text-rose-600" />
        <h3 className="text-sm font-semibold text-gray-800">Reclamos</h3>
        {claims.length > 0 && (
          <span className="text-xs bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-medium">{claims.length}</span>
        )}
        {canCreate && (
          <button
            onClick={startCreate}
            disabled={checking}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-60 rounded-lg transition"
          >
            <Plus className="w-3.5 h-3.5" />
            {checking ? "Validando…" : "Crear reclamo"}
          </button>
        )}
      </div>

      {notice && (
        <div className="mx-6 mt-4 flex items-center gap-2 bg-green-50 border border-green-200 text-green-800 rounded-lg px-3 py-2 text-sm">
          <CheckCircle2 className="w-4 h-4" /> {notice}
        </div>
      )}
      {error && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>
      )}

      {claims.length === 0 ? (
        <p className="px-6 py-6 text-sm text-gray-400 text-center">Este pedido no tiene reclamos.</p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {claims.map((c) => (
            <li key={c.id} className="px-6 py-3 flex items-center gap-3 flex-wrap">
              <span className="font-mono text-sm font-semibold text-gray-800">{c.id}</span>
              <span className="text-sm text-gray-600 flex-1 min-w-[10rem]">{claimReasonLabel(c.reason)}</span>
              <span className="text-xs text-gray-400">{formatClaimDate(c.createdAt)}</span>
              <ClaimStatusBadge status={c.status} />
              <button
                onClick={() => setOpenId(c.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition"
              >
                <Eye className="w-3.5 h-3.5" />
                {canManage ? "GESTIONAR" : "VER"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Aviso: ya existe un reclamo abierto */}
      {step === "confirm" && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black bg-opacity-60">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
            <div className="flex justify-center">
              <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-7 h-7 text-amber-600" />
              </div>
            </div>
            <p className="text-center text-sm text-gray-700 leading-relaxed">
              Este pedido ya tiene el Reclamo con ID{" "}
              <strong className="font-mono">{existing.map((c) => c.id).join(", ")}</strong>.
              ¿Está seguro de generar un reclamo nuevo sobre el mismo pedido?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setStep(null)}
                className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => setStep("form")}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-semibold transition"
              >
                Sí, generar reclamo nuevo
              </button>
            </div>
          </div>
        </div>
      )}

      {step === "form" && (
        <ClaimFormModal
          order={order}
          confirmDuplicate={existing.length > 0}
          onClose={() => setStep(null)}
          onCreated={handleCreated}
        />
      )}

      {openId && (
        <ClaimDetailModal
          claimId={openId}
          canManage={canManage}
          showOrderLink={false}
          onClose={() => setOpenId(null)}
          onChanged={() => { load(); onOrderChanged?.(); }}
        />
      )}
    </div>
  );
}
