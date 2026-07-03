/**
 * OrderDetailCRM — CRM-style full-page order detail
 *
 * Props:
 *   order        – order object (with comments[], attachments[])
 *   onBack       – fn() navigate back
 *   editable     – bool: can change status / add comments / upload attachments
 *   canAssign         – bool (admin only): can assign advisor
 *   canAssignDelivery – bool (admin/advisor): can assign delivery
 *   currentUser  – logged-in user object
 *   users        – full users array (from AuthContext)
 *   updateOrder  – fn(orderId, updates) from AppContext
 */

import { useState, useRef, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { ordersApi } from "../services/api";
import {
  ArrowLeft,
  Truck,
  CheckCircle2,
  Save,
  Send,
  Paperclip,
  FileText,
  File,
  ImageIcon,
  X,
  MessageSquare,
  User,
  Calendar,
  Package,
  UserCog,
  Download,
  FileDown,
  Sheet,
  Clock,
  ArrowRight,
  FileBadge,
} from "lucide-react";
import { STATUS_STYLES, ORDER_STATUSES, formatCOP, statusLabel } from "../data/mockData";

// ── Helpers ────────────────────────────────────────────────────────────────

// Categoria semantica del adjunto (PHASE 6+7)
function attachmentIcon(att) {
  if (att.type === "purchase_order")
    return <FileBadge className="w-4 h-4 text-emerald-600" />;
  if (att.type === "evidence")
    return <CheckCircle2 className="w-4 h-4 text-blue-500" />;
  if (att.mimeType?.startsWith("image/"))
    return <ImageIcon className="w-4 h-4 text-blue-500" />;
  if (att.mimeType === "application/pdf")
    return <FileText className="w-4 h-4 text-red-500" />;
  return <File className="w-4 h-4 text-gray-500" />;
}

const ATTACH_TYPE_LABEL = {
  general: "General",
  evidence: "Evidencia",
  invoice: "Factura",
  receipt: "Recibo",
  purchase_order: "Orden de compra",
};

function formatBytes(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function roleBadge(role) {
  const map = {
    admin: { label: "Admin", cls: "bg-blue-100 text-blue-700" },
    advisor: { label: "Asesor", cls: "bg-purple-100 text-purple-700" },
    client: { label: "Cliente", cls: "bg-emerald-100 text-emerald-700" },
    delivery: { label: "Repartidor", cls: "bg-orange-100 text-orange-700" },
  };
  const r = map[role] || { label: role, cls: "bg-gray-100 text-gray-600" };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.cls}`}>
      {r.label}
    </span>
  );
}

function handleDownloadAttachment(att) {
  const url = att.fileUrl || att.url;

  if (!url) {
    alert("El archivo no tiene una URL válida para descargar.");
    return;
  }

  // Crea un enlace temporal en el DOM para forzar la descarga
  const a = document.createElement("a");
  a.href = url;
  a.download = att.fileName || att.name || "archivo-adjunto";
  a.target = "_blank"; // Respaldo: abre en otra pestaña si el navegador bloquea descargas directas
  a.rel = "noopener noreferrer";

  document.body.appendChild(a);
  a.click();

  // Limpia el DOM
  document.body.removeChild(a);
}

// ── Items Card (read-only / editable advisor en Validar disponibilidad) ────

function ItemsCard({ order, getSku, currentUser, onSaved, refreshComments }) {
  const isAdvisor = currentUser?.role === "advisor";
  const isAdmin = currentUser?.role === "admin";
  const canEdit = (isAdvisor || isAdmin) && order.status === "Validar disponibilidad";

  const [editing, setEditing] = useState(false);
  const [localItems, setLocalItems] = useState(order.items || []);
  const [localTotal, setLocalTotal] = useState(order.total);
  useEffect(() => {
    setLocalItems(order.items || []);
    setLocalTotal(order.total);
  }, [order.id]);
  const [draft, setDraft] = useState(() =>
    (order.items || []).map((it) => ({
      productId: it.productId,
      productName: it.productName,
      unit: it.unit,
      unitPrice: Number(it.unitPrice),
      quantity: Number(it.quantity),
      removed: false,
    })),
  );
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState(null);

  function startEdit() {
    setDraft(
      (localItems || []).map((it) => ({
        productId: it.productId,
        productName: it.productName,
        unit: it.unit,
        unitPrice: Number(it.unitPrice),
        quantity: Number(it.quantity),
        removed: false,
      })),
    );
    setReason("");
    setErrMsg(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setErrMsg(null);
  }

  function setQty(productId, qty) {
    const n = Math.max(1, Math.trunc(Number(qty) || 0));
    setDraft((prev) =>
      prev.map((it) => (it.productId === productId ? { ...it, quantity: n } : it)),
    );
  }

  function toggleRemove(productId) {
    setDraft((prev) =>
      prev.map((it) =>
        it.productId === productId ? { ...it, removed: !it.removed } : it,
      ),
    );
  }

  const hasChanges = (() => {
    const orig = new Map((localItems || []).map((it) => [it.productId, it]));
    return draft.some((it) => {
      const o = orig.get(it.productId);
      if (!o) return false;
      if (it.removed) return true;
      return Number(o.quantity) !== Number(it.quantity);
    });
  })();

  const remaining = draft.filter((it) => !it.removed).length;
  const projectedTotal = draft.reduce(
    (s, it) => (it.removed ? s : s + it.unitPrice * it.quantity),
    0,
  );

  async function save() {
    setErrMsg(null);
    if (!reason.trim()) {
      setErrMsg("Comentario obligatorio para guardar cambios.");
      return;
    }
    if (!hasChanges) {
      setErrMsg("No hay cambios.");
      return;
    }
    if (remaining === 0) {
      setErrMsg("No puedes eliminar todos los productos. Si el pedido no es viable, rechazalo.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        items: draft
          .filter((it) => !it.removed)
          .map((it) => ({ productId: it.productId, quantity: it.quantity })),
        reason: reason.trim(),
      };
      const res = await ordersApi.updateItems(order.id, payload);
      const newItems = draft
        .filter((it) => !it.removed)
        .map((it) => ({
          productId: it.productId,
          productName: it.productName,
          sku: it.sku,
          unit: it.unit,
          unitPrice: it.unitPrice,
          quantity: it.quantity,
        }));
      const newTotal = res?.total ?? projectedTotal;
      setLocalItems(newItems);
      setLocalTotal(newTotal);
      onSaved && onSaved({ items: newItems, total: newTotal });
      await (refreshComments && refreshComments());
      setEditing(false);
    } catch (err) {
      setErrMsg(err?.message || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
        <Package className="w-4 h-4 text-blue-600" />
        <h3 className="text-sm font-semibold text-gray-800">Productos del pedido</h3>
        {canEdit && !editing && (
          <button
            onClick={startEdit}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition"
          >
            Validar disponibilidad
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left text-xs font-semibold text-gray-500 uppercase px-5 py-3">SKU</th>
              <th className="text-left text-xs font-semibold text-gray-500 uppercase px-5 py-3">Producto</th>
              <th className="text-left text-xs font-semibold text-gray-500 uppercase px-5 py-3">Unidad</th>
              <th className="text-center text-xs font-semibold text-gray-500 uppercase px-5 py-3">Cant.</th>
              <th className="text-right text-xs font-semibold text-gray-500 uppercase px-5 py-3">Precio unit.</th>
              <th className="text-right text-xs font-semibold text-gray-500 uppercase px-5 py-3">Subtotal</th>
              {editing && <th className="px-5 py-3"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {!editing && (localItems || []).map((item, idx) => (
              <tr key={idx} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3 text-xs font-mono text-blue-600 whitespace-nowrap">{getSku(item.productId)}</td>
                <td className="px-5 py-3 text-sm font-medium text-gray-800">{item.productName}</td>
                <td className="px-5 py-3 text-sm text-gray-500">{item.unit}</td>
                <td className="px-5 py-3 text-sm text-gray-700 text-center">{item.quantity}</td>
                <td className="px-5 py-3 text-sm text-gray-700 text-right">{formatCOP(item.unitPrice)}</td>
                <td className="px-5 py-3 text-sm font-semibold text-gray-800 text-right">
                  {formatCOP(item.unitPrice * item.quantity)}
                </td>
              </tr>
            ))}

            {editing && draft.map((item) => (
              <tr key={item.productId} className={item.removed ? "bg-red-50" : "hover:bg-gray-50"}>
                <td className="px-5 py-3 text-xs font-mono text-blue-600 whitespace-nowrap">{getSku(item.productId)}</td>
                <td className={`px-5 py-3 text-sm font-medium ${item.removed ? "line-through text-gray-400" : "text-gray-800"}`}>
                  {item.productName}
                </td>
                <td className="px-5 py-3 text-sm text-gray-500">{item.unit}</td>
                <td className="px-5 py-3 text-sm text-gray-700 text-center">
                  <input
                    type="number"
                    min={1}
                    disabled={item.removed}
                    value={item.quantity}
                    onChange={(e) => setQty(item.productId, e.target.value)}
                    className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                  />
                </td>
                <td className="px-5 py-3 text-sm text-gray-700 text-right">{formatCOP(item.unitPrice)}</td>
                <td className={`px-5 py-3 text-sm font-semibold text-right ${item.removed ? "line-through text-gray-400" : "text-gray-800"}`}>
                  {formatCOP(item.unitPrice * item.quantity)}
                </td>
                <td className="px-5 py-3 text-right">
                  <button
                    onClick={() => toggleRemove(item.productId)}
                    className={`text-xs px-2 py-1 rounded-lg transition ${
                      item.removed
                        ? "text-blue-700 hover:bg-blue-50"
                        : "text-red-600 hover:bg-red-50"
                    }`}
                  >
                    {item.removed ? "Restaurar" : "Eliminar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t-2 border-gray-200">
              <td colSpan={editing ? 5 : 5} className="px-5 py-3 text-sm font-bold text-gray-700 text-right">
                Total
              </td>
              <td className="px-5 py-3 text-base font-bold text-blue-700 text-right">
                {formatCOP(editing ? projectedTotal : localTotal)}
              </td>
              {editing && <td></td>}
            </tr>
          </tfoot>
        </table>
      </div>

      {editing && (
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Motivo de la modificacion <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="Ej: producto agotado, ajuste de cantidad por bodega..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          {errMsg && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs">
              {errMsg}
            </div>
          )}
          <div className="flex items-center gap-3">
            <button
              onClick={cancelEdit}
              disabled={saving}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-white transition disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={saving || !hasChanges || !reason.trim()}
              className="flex items-center gap-2 px-5 py-2 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white rounded-lg text-sm font-semibold transition"
            >
              <Save className="w-4 h-4" />
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
            <span className="text-xs text-gray-500 ml-auto">
              {remaining} producto{remaining !== 1 ? "s" : ""} · Total proyectado {formatCOP(projectedTotal)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function OrderDetailCRM({
  order,
  onBack,
  editable = false,
  canAssign = false,
  canAssignDelivery = false,
  currentUser,
  users = [],
  updateOrder,
}) {
  // Si canAssign es true, también puede asignar repartidor.
  const showDeliveryAssign = canAssign || canAssignDelivery;
  // El asesor NO cambia estados manualmente: flujo automatico (aprobado → asignado)
  // y repartidor maneja el resto.
  const isAdvisor = currentUser?.role === "advisor";
  const canEditStatus = editable && !isAdvisor;
  // Pedido entregado: bloquear asignaciones y cambios logisticos para todos los roles.
  const isDelivered = order.status === "Entregado";
  const [status, setStatus] = useState(order.status);
  const [carrier, setCarrier] = useState(order.carrier || "");
  const [saved, setSaved] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [localComments, setLocalComments] = useState(order.comments || []);
  const [localAttachments, setLocalAttachments] = useState(
    order.attachments || [],
  );
  const [commentSaving, setCommentSaving] = useState(false);
  const [attachUploading, setAttachUploading] = useState(false);
  const [attachType, setAttachType] = useState(
    currentUser?.role === "delivery" ? "evidence" : "general",
  );
  const [attachError, setAttachError] = useState(null);
  const fileInputRef = useRef(null);

  // Tipos seleccionables al subir (purchase_order es solo automatico).
  const isDelivery = currentUser?.role === "delivery";
  const SELECTABLE_TYPES = isDelivery
    ? [{ value: "evidence", label: "Evidencia de entrega" }]
    : [
        { value: "general", label: "General" },
        { value: "evidence", label: "Evidencia" },
        { value: "invoice", label: "Factura" },
        { value: "receipt", label: "Recibo" },
      ];

  const { products } = useApp();
  const advisors  = users.filter((u) => u.role === "advisor"  && u.active);
  const deliverers = users.filter((u) => u.role === "delivery" && u.active);

  // Timeline cronologica del pedido. Se recarga ante cambios visibles.
  const [timeline, setTimeline] = useState(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineRefreshKey, setTimelineRefreshKey] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setTimelineLoading(true);
    ordersApi
      .timeline(order.id)
      .then((res) => {
        if (!cancelled) setTimeline(res.events || []);
      })
      .catch(() => {
        if (!cancelled) setTimeline([]);
      })
      .finally(() => {
        if (!cancelled) setTimelineLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [order.id, localComments.length, localAttachments.length, timelineRefreshKey]);
  // Preferir nombres ya enriquecidos por el backend (GET /orders/:id) y caer
  // a la lista local de users si no vienen en el payload.
  const client = users.find((u) => u.id === order.clientId)
    || (order.clientName ? { id: order.clientId, name: order.clientName } : null);
  const advisor = users.find((u) => u.id === order.advisorId)
    || (order.advisorName ? { id: order.advisorId, name: order.advisorName } : null);

  function getSku(productId) {
    return products.find((p) => p.id === productId)?.sku || "—";
  }

  const style = STATUS_STYLES[status] || [];
  const comments = localComments;
  const attachments = localAttachments;

  // ── Actions ──────────────────────────────────────────────────────────────

  // Asignacion de asesor / repartidor: refresca timeline y comentarios
  // porque el backend registra un comment de sistema cuando cambia delivery.
  async function handleAssign(updates) {
    try {
      await updateOrder(order.id, updates);
      // Refrescar el pedido completo: la asignacion inserta un comment de
      // sistema y el prop `order` debe reflejar el nuevo advisorId/deliveryId
      // (el padre solo lo carga una vez al montar).
      try {
        const fresh = await ordersApi.get(order.id);
        if (fresh) {
          Object.assign(order, fresh);
          if (Array.isArray(fresh.comments)) setLocalComments(fresh.comments);
        }
      } catch {}
      setTimelineRefreshKey((k) => k + 1);
    } catch (err) {
      alert(err?.message || "No se pudo asignar");
    }
  }

  const evidenceCount = (localAttachments || []).filter(
    (a) => a.type === "evidence",
  ).length;

  // PHASE 4: el repartidor no puede marcar Entregado sin evidencia.
  const deliveryNeedsEvidence =
    isDelivery && status === "Entregado" && evidenceCount === 0;

  const [saveError, setSaveError] = useState(null);

  async function handleSave() {
    setSaveError(null);
    if (deliveryNeedsEvidence) {
      setSaveError(
        "Sube al menos una evidencia (foto, firma o documento) antes de marcar como entregado.",
      );
      return;
    }
    const updates = { status };
    if (status === "En Ruta") updates.carrier = carrier;
    try {
      await updateOrder(order.id, updates);
      setSaved(true);
      setTimelineRefreshKey((k) => k + 1);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setSaveError(err?.message || "No se pudo guardar el cambio");
    }
  }

  async function handleAddComment() {
    const text = commentText.trim();
    if (!text || commentSaving) return;
    setCommentSaving(true);
    try {
      const saved = await ordersApi.addComment(order.id, text);
      setLocalComments((prev) => [...prev, saved]);
      setCommentText("");
    } finally {
      setCommentSaving(false);
    }
  }

  async function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file || attachUploading) return;
    setAttachUploading(true);
    setAttachError(null);
    try {
      const saved = await ordersApi.uploadAttachment(
        order.id,
        file,
        attachType,
      );
      setLocalAttachments((prev) => [...prev, saved]);
      // Reset input para permitir re-subir el mismo archivo
      e.target.value = "";
    } catch (err) {
      setAttachError(err?.message || "No se pudo subir el archivo");
    } finally {
      setAttachUploading(false);
      e.target.value = "";
    }
  }

  async function handleRemoveAttachment(attId) {
    await ordersApi.removeAttachment(order.id, attId);
    setLocalAttachments((prev) => prev.filter((a) => a.id !== attId));
  }

  // La orden de compra se puede generar en vivo (via /orders/:id/purchase-order.pdf)
  // desde que el pedido sale de "Pendiente por aprobar" — no depende de que exista
  // el adjunto guardado en storage.
  const purchaseOrderAvailable =
    order.status !== "Pendiente por aprobar" && order.status !== "Rechazado";

  const [openingPurchaseOrder, setOpeningPurchaseOrder] = useState(false);
  async function handleOpenPurchaseOrder() {
    if (!purchaseOrderAvailable || openingPurchaseOrder) return;
    setOpeningPurchaseOrder(true);
    try {
      const baseUrl = (import.meta.env.VITE_API_URL || "/api/v1").replace(
        /\/$/,
        "",
      );
      const token = localStorage.getItem("pc_token");
      const res = await fetch(`${baseUrl}/orders/${order.id}/purchase-order.pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      alert(err?.message || "No se pudo abrir la orden de compra");
    } finally {
      setOpeningPurchaseOrder(false);
    }
  }

  // Excel detallado del pedido
  const [exporting, setExporting] = useState(false);
  async function handleExportXlsx() {
    setExporting(true);
    try {
      const baseUrl = (import.meta.env.VITE_API_URL || "/api/v1").replace(
        /\/$/,
        "",
      );
      const token = localStorage.getItem("pc_token");
      const res = await fetch(`${baseUrl}/orders/${order.id}/export.xlsx`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${order.id}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      alert(err?.message || "No se pudo exportar el pedido");
    } finally {
      setExporting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Top bar: back + export buttons */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-blue-700 transition font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenPurchaseOrder}
            disabled={!purchaseOrderAvailable || openingPurchaseOrder}
            title={
              purchaseOrderAvailable
                ? "Abrir orden de compra"
                : "Disponible cuando el pedido se apruebe"
            }
            className={`flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium transition ${
              purchaseOrderAvailable
                ? "border-red-200 text-red-700 bg-red-50 hover:bg-red-100 hover:border-red-300"
                : "border-red-100 text-red-300 bg-red-50 opacity-60 cursor-not-allowed select-none"
            }`}
          >
            <FileDown className="w-4 h-4" />
            Orden de compra PDF
          </button>
          <button
            onClick={handleExportXlsx}
            disabled={exporting}
            title="Descargar Excel del pedido"
            className="flex items-center gap-2 px-4 py-2 border border-emerald-200 text-emerald-700 bg-emerald-50 rounded-lg text-sm font-medium hover:bg-emerald-100 hover:border-emerald-300 disabled:opacity-50 disabled:cursor-wait transition"
          >
            <Sheet className="w-4 h-4" />
            {exporting ? "Generando..." : "Plantilla Excel"}
          </button>
        </div>
      </div>

      {/* ── Two-column layout ─────────────────────────────────────────── */}
      <div className="flex gap-5 items-start">
        {/* ── LEFT: main content ─────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-5">
          {/* Header card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <h2 className="text-2xl font-bold text-gray-900 font-mono">
                    {order.id}
                  </h2>
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${style.bg} ${style.text} ${style.border}`}
                  >
                    {statusLabel(order.status)}
                  </span>
                </div>
                <div className="space-y-1 text-sm text-gray-500">
                  <p className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    Cliente:{" "}
                    <span className="font-medium text-gray-700">
                      {client?.name || "—"}
                    </span>
                  </p>
                  <p className="flex items-center gap-1.5">
                    <UserCog className="w-3.5 h-3.5" />
                    Asesor:{" "}
                    <span className="font-medium text-gray-700">
                      {advisor?.name || "Sin asignar"}
                    </span>
                  </p>
                  <p className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    Creado:{" "}
                    <span className="font-medium text-gray-700">
                      {order.createdAt}
                    </span>
                    {order.updatedAt !== order.createdAt && (
                      <>
                        {" "}
                        · Actualizado:{" "}
                        <span className="font-medium text-gray-700">
                          {order.updatedAt}
                        </span>
                      </>
                    )}
                  </p>
                  {order.carrier && (
                    <p className="flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5" />
                      Transportador:{" "}
                      <span className="font-medium text-gray-700">
                        {order.carrier}
                      </span>
                    </p>
                  )}
                  {order.deliveryName && (
                    <p className="flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5" />
                      Repartidor:{" "}
                      <span className="font-medium text-gray-700">
                        {order.deliveryName}
                      </span>
                    </p>
                  )}
                  {order.deliveredAt && (
                    <p className="flex items-center gap-1.5 text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Entregado por{" "}
                      <span className="font-medium">
                        {order.deliveredByName || "—"}
                      </span>{" "}
                      el{" "}
                      <span className="font-medium">
                        {formatDateTime(order.deliveredAt)}
                      </span>
                    </p>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400 mb-1">Total del pedido</p>
                <p className="text-3xl font-bold text-blue-700">
                  {formatCOP(order.total)}
                </p>
              </div>
            </div>
          </div>

          {/* Status management (editable only) */}
          {editable && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Truck className="w-4 h-4 text-blue-600" />
                Gestión del pedido
              </h3>

              {/* Status selector — oculto para advisor */}
              {canEditStatus && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2">
                  Estado
                </label>
                <div className="flex flex-wrap gap-2">
                  {ORDER_STATUSES.map((s) => {
                    const st = STATUS_STYLES[s] || {};
                    const isActive = status === s;
                    return (
                      <button
                        key={s}
                        onClick={() => setStatus(s)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition ${
                          isActive
                            ? `${st.bg} ${st.text} ${st.border}`
                            : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        {isActive && (
                          <CheckCircle2 className="w-3 h-3 inline mr-1" />
                        )}
                        {statusLabel(s)}
                      </button>
                    );
                  })}
                </div>
              </div>
              )}

              {isAdvisor && (
                <div className="bg-blue-50 border border-blue-100 text-blue-800 text-xs rounded-lg px-3 py-2">
                  Como asesor solo puedes asignar repartidor. El flujo de estados lo gestiona el repartidor automáticamente.
                </div>
              )}

              {/* Carrier field */}
              {canEditStatus && status === "En Ruta" && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Transportador
                  </label>
                  <input
                    type="text"
                    value={carrier}
                    onChange={(e) => setCarrier(e.target.value)}
                    placeholder="Ej: TCC, Envia, Servientrega..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {isDelivered && (canAssign || showDeliveryAssign) && (
                <div className="bg-gray-50 border border-gray-200 text-gray-600 text-xs rounded-lg px-3 py-2">
                  Pedido entregado: no se permiten reasignaciones ni cambios logisticos.
                </div>
              )}

              {/* Assign advisor (admin only) */}
              {canAssign && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Asesor asignado
                  </label>
                  <select
                    value={order.advisorId || ""}
                    disabled={isDelivered}
                    onChange={(e) =>
                      handleAssign({ advisorId: Number(e.target.value) || null })
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="">Sin asignar</option>
                    {advisors.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Assign delivery — admin/advisor */}
              {showDeliveryAssign && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5" />
                    Repartidor asignado
                  </label>
                  <select
                    value={order.deliveryId || ""}
                    disabled={isDelivered}
                    onChange={(e) =>
                      handleAssign({
                        deliveryId: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="">Sin asignar</option>
                    {deliverers.length === 0 && (
                      <option disabled>No hay repartidores disponibles</option>
                    )}
                    {deliverers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">
                    Solo el repartidor asignado puede actualizar el estado de entrega.
                  </p>
                </div>
              )}

              {/* Aviso si delivery va a marcar Entregado sin evidencia */}
              {deliveryNeedsEvidence && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 text-xs">
                  Sube al menos una evidencia (foto, firma o documento) antes de marcar el pedido como
                  <span className="font-semibold"> Entregado</span>.
                </div>
              )}
              {saveError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs">
                  {saveError}
                </div>
              )}

              {/* Save button — solo si puede editar status */}
              {canEditStatus && (
                <div className="flex items-center gap-4 pt-1">
                  <button
                    onClick={handleSave}
                    disabled={deliveryNeedsEvidence}
                    className="flex items-center gap-2 px-5 py-2 bg-blue-700 disabled:bg-blue-300 text-white rounded-lg text-sm font-semibold hover:bg-blue-800 transition shadow-sm"
                  >
                    <Save className="w-4 h-4" />
                    Guardar cambios
                  </button>
                  {saved && (
                    <span className="flex items-center gap-1.5 text-emerald-600 text-sm font-medium">
                      <CheckCircle2 className="w-4 h-4" />
                      Guardado
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Products table — editable solo para advisor en Validar disponibilidad */}
          <ItemsCard
            order={order}
            getSku={getSku}
            currentUser={currentUser}
            onSaved={(updated) => {
              order.items = updated.items;
              order.total = updated.total;
              setTimelineRefreshKey((k) => k + 1);
            }}
            refreshComments={async () => {
              try {
                const fresh = await ordersApi.get(order.id);
                if (Array.isArray(fresh?.comments)) setLocalComments(fresh.comments);
              } catch {}
            }}
          />

          {/* Client notes (read-only always) */}
          {order.notes && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-5">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                Notas del cliente
              </p>
              <p className="text-sm text-amber-900">{order.notes}</p>
            </div>
          )}

          {/* ── Timeline section (PHASE 6) ────────────────────────────── */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-800">Historial</h3>
              {timeline && (
                <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full font-medium ml-auto">
                  {timeline.length}
                </span>
              )}
            </div>
            <div className="px-6 py-4">
              {timelineLoading ? (
                <p className="text-xs text-gray-400 py-2">Cargando...</p>
              ) : !timeline || timeline.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">
                  Sin eventos registrados
                </p>
              ) : (
                <ul className="space-y-3">
                  {timeline.map((ev, idx) => (
                    <li key={idx} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center flex-shrink-0">
                          {ev.eventType === "status" && (
                            <ArrowRight className="w-3.5 h-3.5" />
                          )}
                          {ev.eventType === "comment" && (
                            <MessageSquare className="w-3.5 h-3.5" />
                          )}
                          {ev.eventType === "attachment" && (
                            <Paperclip className="w-3.5 h-3.5" />
                          )}
                          {ev.eventType === "item_change" && (
                            <Package className="w-3.5 h-3.5" />
                          )}
                        </div>
                        {idx < timeline.length - 1 && (
                          <div className="w-px flex-1 bg-gray-200 mt-1" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 pb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-gray-700">
                            {ev.actorName || "Sistema"}
                          </span>
                          {ev.actorRole && roleBadge(ev.actorRole)}
                          <span className="text-xs text-gray-400 ml-auto">
                            {formatDateTime(ev.occurredAt)}
                          </span>
                        </div>
                        <div className="text-sm text-gray-700 mt-1">
                          {ev.eventType === "status" &&
                            (ev.payload?.fromStatus ? (
                              <>
                                Cambio de{" "}
                                <span className="font-medium">
                                  {statusLabel(ev.payload.fromStatus)}
                                </span>{" "}
                                a{" "}
                                <span className="font-medium">
                                  {statusLabel(ev.payload.toStatus)}
                                </span>
                                {ev.payload.reason && (
                                  <span className="text-gray-500">
                                    {" "}
                                    — {ev.payload.reason}
                                  </span>
                                )}
                              </>
                            ) : (
                              <>
                                Pedido creado en{" "}
                                <span className="font-medium">
                                  {statusLabel(ev.payload?.toStatus)}
                                </span>
                              </>
                            ))}
                          {ev.eventType === "comment" && (
                            <span className="italic text-gray-600">
                              «{ev.payload?.text}»
                            </span>
                          )}
                          {ev.eventType === "attachment" && (
                            <>
                              Subio{" "}
                              <span className="font-medium">
                                {ev.payload?.fileName}
                              </span>
                              {ev.payload?.type &&
                                ev.payload.type !== "general" && (
                                  <span className="text-xs ml-1 text-gray-500">
                                    ({ATTACH_TYPE_LABEL[ev.payload.type]})
                                  </span>
                                )}
                            </>
                          )}
                          {ev.eventType === "item_change" && (
                            <>
                              {ev.payload?.action === "removed" ? (
                                <>
                                  Elimino{" "}
                                  <span className="font-medium">
                                    {ev.payload?.productName}
                                  </span>
                                  {" "}(cant. {ev.payload?.prevQuantity})
                                </>
                              ) : (
                                <>
                                  Ajusto{" "}
                                  <span className="font-medium">
                                    {ev.payload?.productName}
                                  </span>
                                  : {ev.payload?.prevQuantity} → {ev.payload?.newQuantity}
                                </>
                              )}
                              {ev.payload?.reason && (
                                <span className="text-gray-500">
                                  {" "}— {ev.payload.reason}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* ── Comments section ─────────────────────────────────────── */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-gray-800">
                Comentarios internos
              </h3>
              {comments.length > 0 && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium ml-auto">
                  {comments.length}
                </span>
              )}
            </div>

            <div className="divide-y divide-gray-50">
              {comments.length === 0 ? (
                <div className="px-6 py-8 text-center">
                  <MessageSquare className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">Sin comentarios aún</p>
                </div>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="px-6 py-4 flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                      {c.authorName.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-semibold text-gray-800">
                          {c.authorName}
                        </span>
                        {roleBadge(c.authorRole)}
                        <span className="text-xs text-gray-400 ml-auto">
                          {formatDateTime(c.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed">
                        {c.text}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Add comment (editable only) */}
            {editable && (
              <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-700 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-1">
                    {currentUser?.initials || currentUser?.name?.charAt(0)}
                  </div>
                  <div className="flex-1 space-y-2">
                    <textarea
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      rows={3}
                      placeholder="Escribe un comentario interno sobre este pedido..."
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-white"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey))
                          handleAddComment();
                      }}
                    />
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-400">
                        Ctrl + Enter para enviar
                      </p>
                      <button
                        onClick={handleAddComment}
                        disabled={!commentText.trim()}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 text-white rounded-lg text-xs font-semibold hover:bg-blue-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Publicar comentario
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        {/* END left column */}

        {/* ── RIGHT: sidebar ─────────────────────────────────────────── */}
        <div className="w-72 flex-shrink-0 space-y-4">
          {/* Attachments card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <Paperclip className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-gray-800">Adjuntos</h3>
              <span className="text-xs text-gray-400 ml-auto">
                {attachments.length}
              </span>
            </div>

            <div className="p-4 space-y-2">
              {attachments.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">
                  Sin archivos adjuntos
                </p>
              )}
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center gap-2.5 p-2.5 bg-gray-50 rounded-lg border border-gray-100 group"
                >
                  <div className="flex-shrink-0">{attachmentIcon(att)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700 truncate">
                      {att.fileName || att.name}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs text-gray-400">
                        {formatBytes(att.fileSize || att.size)}
                      </p>
                      {att.type && att.type !== "general" && (
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded">
                          {ATTACH_TYPE_LABEL[att.type] || att.type}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleDownloadAttachment(att)}
                      type="button"
                      title="Descargar"
                      className="p-1 text-gray-300 hover:text-blue-600 transition opacity-0 group-hover:opacity-100"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    {editable && (
                      <button
                        onClick={() => handleRemoveAttachment(att.id)}
                        title="Eliminar"
                        className="p-1 text-gray-300 hover:text-red-500 transition opacity-0 group-hover:opacity-100"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Upload (editable only) */}
              {editable && (
                <div className="space-y-2 mt-2">
                  {/* Type selector — solo si hay mas de una opcion */}
                  {SELECTABLE_TYPES.length > 1 && (
                    <select
                      value={attachType}
                      onChange={(e) => setAttachType(e.target.value)}
                      disabled={attachUploading}
                      className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      {SELECTABLE_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  )}
                  {isDelivery && (
                    <p className="text-[11px] text-orange-700 bg-orange-50 border border-orange-100 rounded px-2 py-1">
                      Solo evidencia de entrega.
                    </p>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={attachUploading}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 border-2 border-dashed border-gray-200 rounded-lg text-xs font-medium text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-50 transition"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                    {attachUploading ? "Subiendo..." : "Adjuntar archivo"}
                  </button>
                  {attachError && (
                    <p className="text-[11px] text-red-600 bg-red-50 border border-red-100 rounded px-2 py-1">
                      {attachError}
                    </p>
                  )}
                </div>
              )}
            </div>

            {attachments.length > 0 && (
              <div className="px-4 pb-3">
                <p className="text-xs text-gray-400 text-center">
                  Último: {attachments[attachments.length - 1].uploadedBy} ·{" "}
                  {formatDateTime(
                    attachments[attachments.length - 1].uploadedAt,
                  )}
                </p>
              </div>
            )}
          </div>

          {/* Order meta card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Información del pedido
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Estado</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${style.bg} ${style.text}`}
                >
                  {statusLabel(order.status)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Items</span>
                <span className="font-medium text-gray-700">
                  {(order.items || []).length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Unidades</span>
                <span className="font-medium text-gray-700">
                  {(order.items || []).reduce((s, i) => s + i.quantity, 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Total</span>
                <span className="font-semibold text-blue-700">
                  {formatCOP(order.total)}
                </span>
              </div>
              {order.carrier && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Transportador</span>
                  <span className="font-medium text-gray-700">
                    {order.carrier}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
        {/* END sidebar */}
      </div>
      {/* END two-column */}
    </div>
  );
}
