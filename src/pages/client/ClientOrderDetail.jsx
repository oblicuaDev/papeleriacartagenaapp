import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  ArrowLeft, Package, FileText, Paperclip, MessageSquare,
  File, FileText as FilePdf, ImageIcon, Download, User, Calendar, Truck,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { ordersApi } from '../../services/api';
import { STATUS_STYLES, formatCOP, splitIva } from '../../data/mockData';

// Estados en los que el pedido todavia se puede editar (antes de Alistamiento).
const ITEM_EDITABLE_STATUSES = ['Pendiente por aprobar', 'Pendiente', 'Validar disponibilidad'];

function fileIcon(type = '') {
  if (type.startsWith('image/')) return <ImageIcon className="w-4 h-4 text-blue-500" />;
  if (type === 'application/pdf') return <FilePdf className="w-4 h-4 text-red-500" />;
  return <File className="w-4 h-4 text-gray-500" />;
}

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function roleBadge(role) {
  const map = {
    admin:   { label: 'Admin',   cls: 'bg-blue-100 text-blue-700' },
    advisor: { label: 'Asesor',  cls: 'bg-purple-100 text-purple-700' },
    client:  { label: 'Cliente', cls: 'bg-emerald-100 text-emerald-700' },
  };
  const r = map[role] || { label: role, cls: 'bg-gray-100 text-gray-600' };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.cls}`}>{r.label}</span>;
}

export default function ClientOrderDetail() {
  const { orderId } = useParams();
  const navigate    = useNavigate();
  const { users } = useApp();
  const { currentUser } = useAuth();

  // El listado /orders no trae items/comments/attachments. Hacemos fetch del
  // detalle completo aquí (incluye order_items con snapshot productName/sku).
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    ordersApi
      .get(orderId)
      .then((full) => { if (!cancelled) setOrder(full); })
      .catch((err) => { if (!cancelled) setError(err?.message || 'No se pudo cargar el pedido'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orderId]);

  const style    = order ? (STATUS_STYLES[order.status] || {}) : {};
  const advisor  = order ? users.find(u => u.id === order.advisorId) : null;
  const comments    = order?.comments    || [];
  const attachments = order?.attachments || [];

  // admin_empresa es de solo lectura; el resto de roles cliente pueden
  // editar mientras el pedido no haya entrado a Alistamiento.
  const canEdit = order &&
    currentUser?.clientRole !== 'admin_empresa' &&
    ITEM_EDITABLE_STATUSES.includes(order.status);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState([]);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  function startEdit() {
    setDraft(
      (order.items || []).map((it) => ({
        productId: it.productId,
        productName: it.productName,
        sku: it.sku,
        unit: it.unit,
        unitPrice: Number(it.unitPrice),
        quantity: Number(it.quantity),
        removed: false,
      }))
    );
    setReason('');
    setSaveError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setSaveError(null);
  }

  function setQty(productId, qty) {
    const n = Math.max(1, Math.trunc(Number(qty) || 0));
    setDraft((prev) => prev.map((it) => (it.productId === productId ? { ...it, quantity: n } : it)));
  }

  function toggleRemove(productId) {
    setDraft((prev) => prev.map((it) => (it.productId === productId ? { ...it, removed: !it.removed } : it)));
  }

  const hasChanges = (() => {
    const orig = new Map((order?.items || []).map((it) => [it.productId, it]));
    return draft.some((it) => {
      const o = orig.get(it.productId);
      if (!o) return false;
      if (it.removed) return true;
      return Number(o.quantity) !== Number(it.quantity);
    });
  })();

  const remaining = draft.filter((it) => !it.removed).length;
  const projectedTotal = draft.reduce((s, it) => (it.removed ? s : s + it.unitPrice * it.quantity), 0);
  const { subtotal: projectedSubtotal, iva: projectedIva } = splitIva(projectedTotal);

  async function saveEdit() {
    setSaveError(null);
    if (!reason.trim()) {
      setSaveError('Indica el motivo de la modificación.');
      return;
    }
    if (!hasChanges) {
      setSaveError('No hay cambios para guardar.');
      return;
    }
    if (remaining === 0) {
      setSaveError('No puedes eliminar todos los productos.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        items: draft.filter((it) => !it.removed).map((it) => ({ productId: it.productId, quantity: it.quantity })),
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
      const fallback = splitIva(newTotal);
      setOrder((prev) => ({
        ...prev,
        items: newItems,
        total: newTotal,
        subtotal: res?.subtotal ?? fallback.subtotal,
        iva: res?.iva ?? fallback.iva,
      }));
      setEditing(false);
    } catch (err) {
      setSaveError(err?.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-400 text-sm">Cargando pedido…</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">{error || 'Pedido no encontrado'}</p>
        <button onClick={() => navigate('/cliente/pedidos')} className="mt-4 text-blue-700 text-sm font-medium">
          Volver a mis pedidos
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Back */}
      <button
        onClick={() => navigate('/cliente/pedidos')}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-blue-700 transition font-medium"
      >
        <ArrowLeft className="w-4 h-4" />
        Volver a mis pedidos
      </button>

      <div className="flex gap-5 items-start">

        {/* ── Main content ─────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* Header */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <h2 className="text-2xl font-bold text-gray-900 font-mono">{order.id}</h2>
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${style.bg} ${style.text} ${style.border}`}>
                    {order.status}
                  </span>
                </div>
                <div className="space-y-1 text-sm text-gray-500">
                  <p className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    Creado: <span className="font-medium text-gray-700">{order.createdAt}</span>
                  </p>
                  {advisor && (
                    <p className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" />
                      Asesor: <span className="font-medium text-gray-700">{advisor.name}</span>
                    </p>
                  )}
                  {order.carrier && (
                    <p className="flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5" />
                      Transportador: <span className="font-medium text-gray-700">{order.carrier}</span>
                    </p>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">Subtotal {formatCOP(order.subtotal)}</p>
                <p className="text-xs text-gray-400 mb-1">IVA (19%) {formatCOP(order.iva)}</p>
                <p className="text-xs text-gray-400 mb-1">Total Pedido</p>
                <p className="text-3xl font-bold text-blue-700">{formatCOP(order.total)}</p>
              </div>
            </div>
          </div>

          {/* Products */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
              <Package className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-gray-800">Productos</h3>
              {canEdit && !editing && (
                <button
                  onClick={startEdit}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition"
                >
                  Modificar pedido
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
                    <th className="text-right text-xs font-semibold text-gray-500 uppercase px-5 py-3">Total línea</th>
                    {editing && <th className="px-5 py-3"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {!editing && (order.items || []).map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 text-xs font-mono text-blue-600 whitespace-nowrap">{item.sku || '—'}</td>
                      <td className="px-5 py-3 text-sm font-medium text-gray-800">{item.productName}</td>
                      <td className="px-5 py-3 text-sm text-gray-500">{item.unit}</td>
                      <td className="px-5 py-3 text-sm text-gray-700 text-center">{item.quantity}</td>
                      <td className="px-5 py-3 text-sm text-gray-700 text-right">{formatCOP(item.unitPrice)}</td>
                      <td className="px-5 py-3 text-sm font-semibold text-gray-800 text-right">{formatCOP(item.unitPrice * item.quantity)}</td>
                    </tr>
                  ))}
                  {editing && draft.map((item) => (
                    <tr key={item.productId} className={item.removed ? 'bg-red-50' : 'hover:bg-gray-50'}>
                      <td className="px-5 py-3 text-xs font-mono text-blue-600 whitespace-nowrap">{item.sku || '—'}</td>
                      <td className={`px-5 py-3 text-sm font-medium ${item.removed ? 'line-through text-gray-400' : 'text-gray-800'}`}>
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
                      <td className={`px-5 py-3 text-sm font-semibold text-right ${item.removed ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                        {formatCOP(item.unitPrice * item.quantity)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => toggleRemove(item.productId)}
                          className={`text-xs px-2 py-1 rounded-lg transition ${
                            item.removed ? 'text-blue-700 hover:bg-blue-50' : 'text-red-600 hover:bg-red-50'
                          }`}
                        >
                          {item.removed ? 'Restaurar' : 'Eliminar'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-100">
                    <td colSpan={5} className="px-5 py-1.5 text-sm text-gray-500 text-right">Subtotal</td>
                    <td className="px-5 py-1.5 text-sm text-gray-700 text-right">
                      {formatCOP(editing ? projectedSubtotal : order.subtotal)}
                    </td>
                    {editing && <td></td>}
                  </tr>
                  <tr>
                    <td colSpan={5} className="px-5 py-1.5 text-sm text-gray-500 text-right">IVA (19%)</td>
                    <td className="px-5 py-1.5 text-sm text-gray-700 text-right">
                      {formatCOP(editing ? projectedIva : order.iva)}
                    </td>
                    {editing && <td></td>}
                  </tr>
                  <tr className="bg-gray-50 border-t-2 border-gray-200">
                    <td colSpan={5} className="px-5 py-3 text-sm font-bold text-gray-700 text-right">TOTAL PEDIDO</td>
                    <td className="px-5 py-3 text-base font-bold text-blue-700 text-right">
                      {formatCOP(editing ? projectedTotal : order.total)}
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
                    Motivo de la modificación <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    maxLength={1000}
                    placeholder="Ej: ajuste de cantidad, producto ya no se necesita..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
                {saveError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs">{saveError}</div>
                )}
                <div className="flex items-center gap-3">
                  <button
                    onClick={saveEdit}
                    disabled={saving}
                    className="px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 disabled:opacity-50 transition"
                  >
                    {saving ? 'Guardando...' : 'Guardar cambios'}
                  </button>
                  <button
                    onClick={cancelEdit}
                    disabled={saving}
                    className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Client notes */}
          {order.notes && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-5">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                Mis notas
              </p>
              <p className="text-sm text-amber-900">{order.notes}</p>
            </div>
          )}

          {/* Comments (read-only) */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-gray-800">Comentarios del pedido</h3>
              {comments.length > 0 && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium ml-auto">
                  {comments.length}
                </span>
              )}
            </div>
            {comments.length === 0 ? (
              <div className="px-6 py-8 text-center">
                <MessageSquare className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Sin comentarios aún</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {comments.map(c => (
                  <div key={c.id} className="px-6 py-4 flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                      {c.authorName.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-semibold text-gray-800">{c.authorName}</span>
                        {roleBadge(c.authorRole)}
                        <span className="text-xs text-gray-400 ml-auto">{formatDateTime(c.createdAt)}</span>
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed">{c.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* ── Sidebar (adjuntos) ─────────────────────────────────── */}
        <div className="w-72 flex-shrink-0 space-y-4">

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <Paperclip className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-gray-800">Adjuntos</h3>
              <span className="text-xs text-gray-400 ml-auto">{attachments.length}</span>
            </div>
            <div className="p-4 space-y-2">
              {attachments.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">Sin archivos adjuntos</p>
              ) : (
                attachments.map(att => (
                  <div key={att.id} className="flex items-center gap-2.5 p-2.5 bg-gray-50 rounded-lg border border-gray-100 group">
                    <div className="flex-shrink-0">{fileIcon(att.type)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-700 truncate">{att.name}</p>
                      <p className="text-xs text-gray-400">{formatBytes(att.size)}</p>
                    </div>
                    <button title="Descargar" className="p-1 text-gray-300 hover:text-blue-600 transition opacity-0 group-hover:opacity-100">
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Meta */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Resumen</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Estado</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${style.bg} ${style.text}`}>{order.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Items</span>
                <span className="font-medium text-gray-700">{(order.items || []).length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Unidades</span>
                <span className="font-medium text-gray-700">{(order.items || []).reduce((s, i) => s + i.quantity, 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Subtotal</span>
                <span className="font-medium text-gray-700">{formatCOP(order.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">IVA (19%)</span>
                <span className="font-medium text-gray-700">{formatCOP(order.iva)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-gray-100">
                <span className="text-gray-600 font-medium">Total Pedido</span>
                <span className="font-semibold text-blue-700">{formatCOP(order.total)}</span>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
