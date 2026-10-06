import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  X, AlertTriangle, Paperclip, FileText, ImageIcon, Download, MessageSquare,
  CheckCircle2, Undo2, PlusCircle, ExternalLink, Send,
} from "lucide-react";
import { claimsApi } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { CLAIM_STATUS_STYLES, claimReasonLabel, formatClaimDate } from "../data/claims";

const EVENT_META = {
  created: { icon: PlusCircle, color: "text-blue-600 bg-blue-100", label: "Reclamo creado" },
  note: { icon: MessageSquare, color: "text-purple-600 bg-purple-100", label: "Nota pública" },
  return: { icon: Undo2, color: "text-rose-600 bg-rose-100", label: "Pedido devuelto" },
  closed: { icon: CheckCircle2, color: "text-green-600 bg-green-100", label: "Reclamo cerrado" },
};

function orderPath(role, orderId) {
  if (role === "admin") return `/admin/pedidos/${orderId}`;
  if (role === "advisor") return `/asesor/pedido/${orderId}`;
  return `/cliente/pedidos/${orderId}`;
}

function AttachmentList({ items }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-1.5">
      {items.map((a) => (
        <li key={a.id} className="flex items-center gap-2 text-xs bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
          {a.mimeType === "application/pdf"
            ? <FileText className="w-4 h-4 text-red-500 flex-shrink-0" />
            : <ImageIcon className="w-4 h-4 text-blue-500 flex-shrink-0" />}
          <span className={`flex-1 truncate ${a.deletedAt ? "text-gray-400 line-through" : "text-gray-700"}`}>
            {a.fileName}
          </span>
          {a.deletedAt ? (
            <span className="text-gray-400">Eliminado (vencido)</span>
          ) : (
            <a
              href={a.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              download={a.fileName}
              className="flex items-center gap-1 text-blue-700 hover:text-blue-900 font-medium"
            >
              <Download className="w-3.5 h-3.5" /> Descargar
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

// Detalle y trazabilidad de un reclamo. Con canManage (admin / asesor) muestra
// además las acciones de gestión: nota pública, devolución y cierre.
export default function ClaimDetailModal({ claimId, canManage = false, showOrderLink = true, onClose, onChanged }) {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [claim, setClaim] = useState(null);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState(null); // null | 'note' | 'close' | 'return'
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  async function load() {
    try {
      setClaim(await claimsApi.get(claimId));
    } catch (err) {
      setError(err?.message || "No se pudo cargar el reclamo");
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [claimId]);

  function openMode(m) {
    setMode(m); setText(""); setFile(null); setActionError(null);
  }

  async function submit() {
    setActionError(null);
    if (!text.trim()) {
      setActionError(mode === "note" ? "Escribe la nota." : mode === "close" ? "La nota de cierre es obligatoria." : "Indica el motivo de la devolución.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "note") await claimsApi.addNote(claim.id, text.trim());
      else if (mode === "close") await claimsApi.close(claim.id, text.trim(), file);
      else await claimsApi.returnOrder(claim.id, text.trim());
      setMode(null);
      await load();
      onChanged?.();
    } catch (err) {
      setActionError(err?.message || "No se pudo completar la acción");
    } finally {
      setBusy(false);
    }
  }

  const style = claim ? CLAIM_STATUS_STYLES[claim.status] : null;
  const isOpen = claim?.status === "Abierto";
  const initialAtts = (claim?.attachments || []).filter((a) => a.kind === "initial");
  const closureAtts = (claim?.attachments || []).filter((a) => a.kind === "closure");
  const hasLiveInitial = initialAtts.some((a) => !a.deletedAt);

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4 bg-black bg-opacity-60">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="text-lg font-bold text-gray-900 font-mono">{claim?.id || claimId}</h3>
              {style && (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${style.bg} ${style.text} ${style.border}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                  {claim.status}
                </span>
              )}
            </div>
            {claim && (
              <p className="text-sm text-gray-500 mt-0.5">{claimReasonLabel(claim.reason)}</p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>}
          {!claim && !error && <p className="text-sm text-gray-400 text-center py-8">Cargando reclamo…</p>}

          {claim && (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-400">Pedido relacionado</p>
                  <p className="font-mono font-medium text-gray-800 flex items-center gap-1.5">
                    {claim.orderId}
                    {showOrderLink && (
                      <button
                        onClick={() => { onClose(); navigate(orderPath(currentUser?.role, claim.orderId)); }}
                        className="text-blue-600 hover:text-blue-800"
                        title="Ver pedido"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Estado del pedido</p>
                  <p className="font-medium text-gray-800">{claim.orderStatus}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Cliente</p>
                  <p className="font-medium text-gray-800">{claim.clientName}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Fecha</p>
                  <p className="font-medium text-gray-800">{formatClaimDate(claim.createdAt)}</p>
                </div>
              </div>

              {canManage && isOpen && hasLiveInitial && (
                <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2.5 text-sm">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>
                    Los adjuntos de este reclamo se borrarán en <strong>{claim.attachmentsDaysLeft} días</strong>,
                    descargarlos antes de atender este reclamo.
                  </span>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Reclamación</p>
                <div
                  className="rich-text text-sm text-gray-800 bg-gray-50 border border-gray-100 rounded-lg px-4 py-3"
                  dangerouslySetInnerHTML={{ __html: claim.description }}
                />
              </div>

              {initialAtts.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5" /> Adjuntos del cliente
                  </p>
                  <AttachmentList items={initialAtts} />
                </div>
              )}

              {closureAtts.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5" /> Adjunto de cierre
                  </p>
                  <AttachmentList items={closureAtts} />
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Trazabilidad</p>
                <ol className="space-y-3">
                  {claim.events.map((ev) => {
                    const meta = EVENT_META[ev.type] || EVENT_META.note;
                    const Icon = meta.icon;
                    return (
                      <li key={ev.id} className="flex gap-3">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${meta.color}`}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-800">
                            {meta.label}
                            <span className="text-xs font-normal text-gray-400">
                              {" "}· {ev.authorName || "—"} · {formatClaimDate(ev.createdAt)}
                            </span>
                          </p>
                          {ev.text && <p className="text-sm text-gray-600 whitespace-pre-wrap break-words">{ev.text}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>

              {/* ── Gestión (admin / asesor) ─────────────────────── */}
              {canManage && isOpen && (
                <div className="border-t border-gray-100 pt-4 space-y-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Gestión del reclamo</p>
                  {!mode && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => openMode("return")}
                        className="flex items-center gap-1.5 px-3 py-2 border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg text-sm font-medium transition"
                      >
                        <Undo2 className="w-4 h-4" /> Realizar devolución del pedido y crear uno nuevo
                      </button>
                      <button
                        onClick={() => openMode("note")}
                        className="flex items-center gap-1.5 px-3 py-2 border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg text-sm font-medium transition"
                      >
                        <MessageSquare className="w-4 h-4" /> Escribir nota pública
                      </button>
                      <button
                        onClick={() => openMode("close")}
                        className="flex items-center gap-1.5 px-3 py-2 border border-green-200 text-green-700 bg-green-50 hover:bg-green-100 rounded-lg text-sm font-medium transition"
                      >
                        <CheckCircle2 className="w-4 h-4" /> Cerrar reclamo con nota y adjunto
                      </button>
                    </div>
                  )}

                  {mode && (
                    <div className="space-y-3 bg-gray-50 border border-gray-200 rounded-xl p-4">
                      <p className="text-sm font-semibold text-gray-800">
                        {mode === "note" && "Nota pública al cliente (no cierra el reclamo)"}
                        {mode === "close" && "Cerrar reclamo"}
                        {mode === "return" && "Devolución del pedido"}
                      </p>

                      {mode === "return" && (
                        <div className="flex items-start gap-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg px-3 py-2.5 text-xs leading-relaxed">
                          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                          <span>
                            El pedido <strong>{claim.orderId}</strong> pasará al estado <strong>Devuelto</strong>:
                            no afectará los consolidados financieros ni volverá a consumir saldo del contrato.
                            <strong> No se genera un pedido nuevo</strong>; si el cliente requiere nuevamente los
                            productos, el vendedor deberá crearlo por el flujo normal. La operación queda
                            registrada en la trazabilidad del reclamo y del pedido.
                          </span>
                        </div>
                      )}

                      <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        rows={3}
                        maxLength={2000}
                        placeholder={
                          mode === "note" ? "Mensaje visible para el cliente…"
                            : mode === "close" ? "Nota de cierre (obligatoria): gestión realizada…"
                              : "Motivo de la devolución (obligatorio)…"
                        }
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-white"
                      />

                      {mode === "close" && (
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">
                            Adjunto de soporte (opcional · se conserva permanentemente)
                          </label>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,application/pdf"
                            onChange={(e) => setFile(e.target.files?.[0] || null)}
                            className="block w-full text-xs text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:font-medium"
                          />
                        </div>
                      )}

                      {actionError && <p className="text-xs text-red-600">{actionError}</p>}

                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => setMode(null)}
                          disabled={busy}
                          className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={submit}
                          disabled={busy}
                          className={`flex items-center gap-1.5 px-4 py-2 text-white rounded-lg text-sm font-semibold transition disabled:opacity-60 ${
                            mode === "return" ? "bg-rose-600 hover:bg-rose-700"
                              : mode === "close" ? "bg-green-600 hover:bg-green-700"
                                : "bg-purple-600 hover:bg-purple-700"
                          }`}
                        >
                          <Send className="w-4 h-4" />
                          {busy ? "Guardando…"
                            : mode === "return" ? "Confirmar devolución"
                              : mode === "close" ? "Cerrar reclamo"
                                : "Enviar nota"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
