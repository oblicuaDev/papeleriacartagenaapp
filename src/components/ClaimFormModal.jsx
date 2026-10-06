import { useRef, useState } from "react";
import { X, Paperclip, Trash2, Send, FileText, ImageIcon } from "lucide-react";
import RichTextEditor from "./RichTextEditor";
import { claimsApi } from "../services/api";
import { CLAIM_REASON_OPTIONS } from "../data/claims";

const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

// Formulario de creación de reclamo asociado a un pedido.
export default function ClaimFormModal({ order, confirmDuplicate = false, onClose, onCreated }) {
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  function addFiles(list) {
    const next = [...files];
    for (const f of Array.from(list)) {
      if (!ACCEPT.split(",").includes(f.type)) {
        setError(`"${f.name}": solo se permiten fotografías (JPG, PNG, WEBP) o archivos PDF`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        setError(`"${f.name}" supera los 10 MB`);
        continue;
      }
      if (next.length >= MAX_FILES) {
        setError(`Máximo ${MAX_FILES} archivos`);
        break;
      }
      next.push(f);
    }
    setFiles(next);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!reason) return setError("Selecciona el motivo del reclamo");
    const hasText = description.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length > 0;
    if (!hasText) return setError("Escribe la reclamación");

    setSending(true);
    try {
      const created = await claimsApi.create({
        orderId: order.id, reason, description, files, confirmDuplicate,
      });
      onCreated(created);
    } catch (err) {
      setError(err?.message || "No se pudo enviar el reclamo");
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black bg-opacity-60">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col"
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Crear reclamo</h3>
            <p className="text-xs text-gray-500 font-mono">Pedido {order.id}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Motivo <span className="text-red-500">*</span>
            </label>
            <div className="space-y-1.5">
              {CLAIM_REASON_OPTIONS.map((o) => (
                <label
                  key={o.value}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer text-sm transition ${
                    reason === o.value
                      ? "border-blue-500 bg-blue-50 text-blue-900"
                      : "border-gray-200 hover:border-gray-300 text-gray-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="claim-reason"
                    value={o.value}
                    checked={reason === o.value}
                    onChange={() => setReason(o.value)}
                    className="accent-blue-700"
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Escriba la reclamación <span className="text-red-500">*</span>
            </label>
            <RichTextEditor
              value={description}
              onChange={setDescription}
              placeholder="Describa detalladamente la situación…"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Evidencia (opcional)</label>
            <p className="text-xs text-gray-400 mb-2">
              Fotografías (JPG, PNG, WEBP) o PDF · hasta {MAX_FILES} archivos de 10 MB.
              Los archivos se conservan 60 días.
            </p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT}
              onChange={(e) => addFiles(e.target.files)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={files.length >= MAX_FILES}
              className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-blue-400 hover:text-blue-700 disabled:opacity-50 transition"
            >
              <Paperclip className="w-4 h-4" />
              Adjuntar archivos
            </button>
            {files.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-xs bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                    {f.type === "application/pdf"
                      ? <FileText className="w-4 h-4 text-red-500" />
                      : <ImageIcon className="w-4 h-4 text-blue-500" />}
                    <span className="flex-1 truncate text-gray-700">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => setFiles(files.filter((_, j) => j !== i))}
                      className="text-gray-400 hover:text-red-600"
                      title="Quitar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={sending}
            className="flex-1 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2"
          >
            <Send className="w-4 h-4" />
            {sending ? "Enviando…" : "ENVIAR EL RECLAMO"}
          </button>
        </div>
      </form>
    </div>
  );
}
