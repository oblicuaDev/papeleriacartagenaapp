import { useNavigate } from 'react-router-dom';
import { Package, ExternalLink, Repeat } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { STATUS_STYLES, formatCOP, statusLabel } from '../../data/mockData';
import { ordersApi } from '../../services/api';

export default function ClientOrders() {
  const { orders, users, products, addToCart, clearCart } = useApp();
  const { currentUser }   = useAuth();
  const navigate        = useNavigate();
  const isReadOnly = currentUser?.clientRole === 'admin_empresa';

  async function handleRepeatOrder(e, orderId) {
    e.stopPropagation();
    try {
      const full = await ordersApi.get(orderId);
      const items = full.items || [];
      if (!items.length) {
        alert('El pedido no tiene productos para repetir.');
        return;
      }
      // Carga al carrito usando el precio actual del catalogo (no el snapshot)
      clearCart();
      let missing = 0;
      for (const it of items) {
        const product = products.find((p) => p.id === it.productId);
        if (!product) { missing++; continue; }
        addToCart(product, it.quantity, product.price);
      }
      if (missing > 0) {
        alert(`${missing} producto(s) ya no están disponibles. Los demás se agregaron al carrito.`);
      }
      navigate('/cliente/confirmar-pedido');
    } catch (err) {
      alert(err?.message || 'No se pudo repetir el pedido');
    }
  }

  // Supervisors see all orders from their company's clients
  const isSupervisor = currentUser?.clientRole === 'supervisor';
  const companyClientIds = isSupervisor
    ? users.filter(u => u.role === 'client' && u.companyId === currentUser.companyId).map(u => u.id)
    : [currentUser?.id];

  const myOrders = [...orders]
    .filter(o => companyClientIds.includes(o.clientId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  function getClientName(id) {
    return users.find(u => u.id === id)?.name || '—';
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">
          {isSupervisor ? 'Pedidos de la empresa' : 'Mis Pedidos'}
        </h2>
        <p className="text-sm text-gray-500 mt-1">{myOrders.length} pedidos en total</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3"># Pedido</th>
                {isSupervisor && (
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Solicitante</th>
                )}
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Fecha</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Items</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Total</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Estado</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {myOrders.map(order => {
                const style = STATUS_STYLES[order.status] || {};
                return (
                  <tr
                    key={order.id}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/cliente/pedidos/${order.id}`)}
                  >
                    <td className="px-5 py-4 text-sm font-mono font-medium text-blue-700">{order.id}</td>
                    {isSupervisor && (
                      <td className="px-5 py-4 text-sm text-gray-600">{getClientName(order.clientId)}</td>
                    )}
                    <td className="px-5 py-4 text-sm text-gray-600">{order.createdAt}</td>
                    <td className="px-5 py-4 text-sm text-gray-600">{order.itemCount ?? (order.items || []).length} ítem(s)</td>
                    <td className="px-5 py-4 text-sm font-semibold text-gray-800">{formatCOP(order.total)}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${style.bg} ${style.text} ${style.border}`}>
                        {statusLabel(order.status)}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={e => { e.stopPropagation(); navigate(`/cliente/pedidos/${order.id}`); }}
                          className="flex items-center gap-1 text-xs text-blue-700 font-medium hover:text-blue-800 transition"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Ver detalle
                        </button>
                        {!isReadOnly && (
                          <button
                            onClick={e => handleRepeatOrder(e, order.id)}
                            title="Repetir este pedido"
                            className="flex items-center gap-1 text-xs text-emerald-700 font-medium hover:text-emerald-800 transition"
                          >
                            <Repeat className="w-3.5 h-3.5" />
                            Repetir
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {myOrders.length === 0 && (
                <tr>
                  <td colSpan={isSupervisor ? 7 : 6} className="px-5 py-16 text-center">
                    <Package className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                    <p className="text-sm text-gray-400">No hay pedidos aún</p>
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
