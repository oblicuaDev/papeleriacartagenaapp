import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Truck, Package, Calendar, ArrowRight, CheckCircle2, MapPin } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { STATUS_STYLES, formatCOP, statusLabel } from '../../data/mockData';

// El repartidor opera desde Alistamiento (asesor ya valido disponibilidad).
const DELIVERY_TABS = [
  { value: 'Alistamiento',           label: 'Para despachar' },
  { value: 'En Ruta',                label: 'En ruta' },
  { value: 'Entregado',              label: 'Entregados' },
];

export default function DeliveryOrders() {
  const navigate = useNavigate();
  const { orders, updateOrder } = useApp();
  const [tab, setTab]                     = useState('Alistamiento');
  const [updating, setUpdating]           = useState(null);
  const [error, setError]                 = useState(null);
  const [carrierByOrder, setCarrierByOrder] = useState({});

  const filtered = orders
    .filter(o => o.status === tab)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  async function handleAdvance(order, nextStatus) {
    setError(null);
    setUpdating(order.id);
    try {
      const payload = { status: nextStatus };
      if (nextStatus === 'En Ruta' && carrierByOrder[order.id]) {
        payload.carrier = carrierByOrder[order.id];
      }
      await updateOrder(order.id, payload);
    } catch (err) {
      setError(`${order.id}: ${err?.message || 'Error al actualizar'}`);
    } finally {
      setUpdating(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-orange-100 text-orange-700 rounded-xl flex items-center justify-center">
          <Truck className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Pedidos para repartir</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {filtered.length} {filtered.length === 1 ? 'pedido' : 'pedidos'} en {DELIVERY_TABS.find(t => t.value === tab).label.toLowerCase()}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {DELIVERY_TABS.map(t => {
            const count = orders.filter(o => o.status === t.value).length;
            return (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                className={`pb-3 px-1 text-sm font-medium border-b-2 transition flex items-center gap-2 ${
                  tab === t.value ? 'border-orange-700 text-orange-700' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
                {count > 0 && (
                  <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full font-semibold">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
          {error}
        </div>
      )}

      {/* Orders list */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 flex flex-col items-center justify-center py-20 text-center">
          <Package className="w-12 h-12 text-gray-200 mb-3" />
          <p className="text-gray-500 font-medium">Nada por ahora</p>
          <p className="text-sm text-gray-400 mt-1">No hay pedidos en este estado</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(order => {
            const style = STATUS_STYLES[order.status] || {};
            const itemCount = (order.items || []).reduce((s, i) => s + i.quantity, 0)
              || order.itemCount
              || 0;
            return (
              <div key={order.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 flex items-center gap-4">
                  <div className="w-10 h-10 bg-orange-50 text-orange-600 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Package className="w-5 h-5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-mono text-sm font-bold text-gray-800">{order.id}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${style.bg} ${style.text}`}>
                        {statusLabel(order.status)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-gray-500">
                      <span className="font-medium text-gray-700">{order.clientName}</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {order.createdAt}
                      </span>
                      <span>{itemCount} items</span>
                      {order.carrier && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />{order.carrier}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right hidden sm:block flex-shrink-0">
                    <p className="text-base font-bold text-gray-900">{formatCOP(order.total)}</p>
                  </div>

                  <button
                    onClick={() => navigate(`/entregas/pedido/${order.id}`)}
                    className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50 transition"
                  >
                    Ver detalle
                  </button>
                </div>

                {tab === 'Alistamiento' && (
                  <div className="border-t border-gray-100 bg-gray-50 px-5 py-3 flex items-center gap-3">
                    <input
                      placeholder="Transportadora (opcional)"
                      value={carrierByOrder[order.id] || ''}
                      onChange={e => setCarrierByOrder(c => ({ ...c, [order.id]: e.target.value }))}
                      className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                    />
                    <button
                      onClick={() => handleAdvance(order, 'En Ruta')}
                      disabled={updating === order.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-semibold transition disabled:opacity-50"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                      Marcar en ruta
                    </button>
                  </div>
                )}

                {tab === 'En Ruta' && (
                  <div className="border-t border-gray-100 bg-gray-50 px-5 py-3 flex items-center justify-between gap-3">
                    <span className="text-xs text-gray-500">
                      Sube la evidencia desde el detalle del pedido antes de marcar como entregado.
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigate(`/entregas/pedido/${order.id}`)}
                        className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-100 transition"
                      >
                        Subir evidencia
                      </button>
                      <button
                        onClick={() => handleAdvance(order, 'Entregado')}
                        disabled={updating === order.id}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-semibold transition disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Marcar entregado
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
