import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Package, FileText, Paperclip, MessageSquare,
  File, FileText as FilePdf, ImageIcon, Download, User, Calendar, Truck,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { STATUS_STYLES, formatCOP } from '../../data/mockData';

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
  const { orders, users } = useApp();

  const order    = orders.find(o => o.id === orderId);
  const style    = order ? (STATUS_STYLES[order.status] || {}) : {};
  const advisor  = order ? users.find(u => u.id === order.advisorId) : null;
  const comments    = order?.comments    || [];
  const attachments = order?.attachments || [];

  if (!order) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Pedido no encontrado</p>
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
                <p className="text-xs text-gray-400 mb-1">Total</p>
                <p className="text-3xl font-bold text-blue-700">{formatCOP(order.total)}</p>
              </div>
            </div>
          </div>

          {/* Products */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
              <Package className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-gray-800">Productos</h3>
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(order.items || []).map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 text-xs font-mono text-blue-600 whitespace-nowrap">{item.sku || '—'}</td>
                      <td className="px-5 py-3 text-sm font-medium text-gray-800">{item.productName}</td>
                      <td className="px-5 py-3 text-sm text-gray-500">{item.unit}</td>
                      <td className="px-5 py-3 text-sm text-gray-700 text-center">{item.quantity}</td>
                      <td className="px-5 py-3 text-sm text-gray-700 text-right">{formatCOP(item.unitPrice)}</td>
                      <td className="px-5 py-3 text-sm font-semibold text-gray-800 text-right">{formatCOP(item.unitPrice * item.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200">
                    <td colSpan={5} className="px-5 py-3 text-sm font-bold text-gray-700 text-right">Total</td>
                    <td className="px-5 py-3 text-base font-bold text-blue-700 text-right">{formatCOP(order.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
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
                <span className="text-gray-500">Total</span>
                <span className="font-semibold text-blue-700">{formatCOP(order.total)}</span>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
