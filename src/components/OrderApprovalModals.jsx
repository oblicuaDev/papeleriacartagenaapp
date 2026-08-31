import { useState } from "react";
import { XCircle, CheckCircle2, AlertTriangle } from "lucide-react";
import { formatCOP } from "../data/mockData";

// Modales de aprobación / rechazo de pedidos, compartidos entre
// "Aprobar pedidos" y el detalle del pedido.

export function RejectModal({ order, onConfirm, onCancel }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  function handleConfirm() {
    if (!reason.trim()) {
      setError("Debes indicar el motivo del rechazo");
      return;
    }
    onConfirm(reason.trim());
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black bg-opacity-60">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-6 space-y-5">
          <div className="flex justify-center">
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center">
              <XCircle className="w-7 h-7 text-red-600" />
            </div>
          </div>
          <div className="text-center space-y-2">
            <h3 className="text-lg font-bold text-gray-900">Rechazar pedido</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              Indica el motivo del rechazo. Quedará registrado en el historial del pedido.
            </p>
            {order && (
              <p className="text-xs font-mono text-gray-400 bg-gray-50 rounded-lg px-3 py-1.5 inline-block">
                {order.id} · {formatCOP(order.total)}
              </p>
            )}
          </div>
          <div>
            <textarea
              value={reason}
              onChange={(e) => { setReason(e.target.value); setError(""); }}
              rows={3}
              placeholder="Ej: producto agotado, cantidad excede límite mensual..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              maxLength={500}
            />
            {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2"
            >
              <XCircle className="w-4 h-4" />
              Rechazar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ConfirmApproveModal({ order, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black bg-opacity-60">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-6 space-y-5">
          <div className="flex justify-center">
            <div className="w-14 h-14 bg-yellow-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-yellow-600" />
            </div>
          </div>
          <div className="text-center space-y-2">
            <h3 className="text-lg font-bold text-gray-900">
              ¿Estás seguro de aprobar este pedido?
            </h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              Al aprobarlo se generará una orden de compra a{" "}
              <span className="font-semibold text-gray-800">Papelería Cartagena</span>.
              Una vez aprobado ya no se podrá modificar. Esta acción no se puede deshacer.
            </p>
            {order && (
              <p className="text-xs font-mono text-gray-400 bg-gray-50 rounded-lg px-3 py-1.5 inline-block">
                {order.id} · {formatCOP(order.total)}
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition"
            >
              Cancelar
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              Sí, aprobar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
