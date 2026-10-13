import { AlertTriangle } from "lucide-react";

// Diálogo de confirmación para acciones sensibles (p. ej. desactivar un usuario).
//  - tone: 'danger' (rojo) | 'primary' (azul)
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirmar",
  tone = "danger",
  busy = false,
  error = null,
  onConfirm,
  onCancel,
}) {
  const danger = tone === "danger";
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black bg-opacity-60">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5" role="alertdialog" aria-modal="true">
        <div className="flex justify-center">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center ${danger ? "bg-red-100" : "bg-blue-100"}`}>
            <AlertTriangle className={`w-7 h-7 ${danger ? "text-red-600" : "text-blue-600"}`} />
          </div>
        </div>
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <div className="text-sm text-gray-600 leading-relaxed">{message}</div>
        </div>
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>
        )}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`flex-1 py-2.5 text-white rounded-xl text-sm font-semibold transition disabled:opacity-60 ${
              danger ? "bg-red-600 hover:bg-red-700" : "bg-blue-700 hover:bg-blue-800"
            }`}
          >
            {busy ? "Procesando…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
