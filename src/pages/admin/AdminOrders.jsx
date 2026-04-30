import { useState } from 'react';
import { ChevronDown, ExternalLink, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { STATUS_STYLES, ORDER_STATUSES, formatCOP } from '../../data/mockData';

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

async function downloadExport(format, filterStatus) {
  const token = localStorage.getItem('pc_token');
  const url = new URL(`${API_BASE}/stats/orders/export`, window.location.origin);
  url.searchParams.set('format', format);
  if (filterStatus) url.searchParams.set('status', filterStatus);

  const res = await fetch(url.toString().replace(window.location.origin, ''), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Export fallo: HTTP ${res.status}`);

  const blob = await res.blob();
  const filename = `pedidos_${new Date().toISOString().slice(0, 10)}.${format}`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

export default function AdminOrders() {
  const { orders, users } = useApp();
  const navigate          = useNavigate();
  const [filterStatus, setFilterStatus] = useState('');
  const [exporting, setExporting]       = useState(false);

  async function handleExport(format) {
    setExporting(true);
    try {
      await downloadExport(format, filterStatus);
    } catch (err) {
      alert(err.message || 'No se pudo exportar');
    } finally {
      setExporting(false);
    }
  }

  function getName(id) {
    return users.find(u => u.id === id)?.name || '—';
  }

  const allStatuses = ['Pendiente por aprobar', ...ORDER_STATUSES];

  const filtered = orders
    .filter(o => filterStatus ? o.status === filterStatus : true)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Trabajar Pedidos</h2>
          <p className="text-sm text-gray-500 mt-1">{orders.length} pedidos en total</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="appearance-none border border-gray-300 rounded-lg pl-3 pr-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Todos los estados</option>
              {allStatuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <button
            onClick={() => handleExport('csv')}
            disabled={exporting}
            className="flex items-center gap-1.5 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition"
            title="Descargar CSV"
          >
            <Download className="w-4 h-4" />
            CSV
          </button>
          <button
            onClick={() => handleExport('xlsx')}
            disabled={exporting}
            className="flex items-center gap-1.5 border border-emerald-300 bg-emerald-50 rounded-lg px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 transition"
            title="Descargar Excel"
          >
            <Download className="w-4 h-4" />
            Excel
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3"># Pedido</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Cliente</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Asesor asignado</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Fecha</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Monto</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Estado</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(order => {
                const style = STATUS_STYLES[order.status] || {};
                const commentCount = order.comments?.length || 0;
                const attachCount  = order.attachments?.length || 0;
                return (
                  <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="text-sm font-mono font-medium text-blue-700">{order.id}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {commentCount > 0 && (
                          <span className="text-xs text-gray-400">{commentCount} coment.</span>
                        )}
                        {attachCount > 0 && (
                          <span className="text-xs text-gray-400">{attachCount} adj.</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-700">{order.clientName || getName(order.clientId)}</td>
                    <td className="px-5 py-4 text-sm text-gray-600">
                      {order.advisorId ? (
                        <span className="flex items-center gap-1.5">
                          <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                            {(order.advisorName || getName(order.advisorId)).charAt(0)}
                          </span>
                          {order.advisorName || getName(order.advisorId)}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic text-xs">Sin asignar</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-500">{order.createdAt}</td>
                    <td className="px-5 py-4 text-sm font-semibold text-gray-800">{formatCOP(order.total)}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${style.bg} ${style.text} ${style.border}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => navigate(`/admin/pedidos/${order.id}`)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Gestionar
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center text-sm text-gray-400">
                    No hay pedidos con ese estado
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
