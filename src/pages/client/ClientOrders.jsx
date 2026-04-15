import { useNavigate } from 'react-router-dom';
import { Package, ExternalLink } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { STATUS_STYLES, formatCOP } from '../../data/mockData';

export default function ClientOrders() {
  const { orders, users } = useApp();
  const { currentUser }   = useAuth();
  const navigate        = useNavigate();

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
                        {order.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={e => { e.stopPropagation(); navigate(`/cliente/pedidos/${order.id}`); }}
                        className="flex items-center gap-1 text-xs text-blue-700 font-medium hover:text-blue-800 transition"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Ver detalle
                      </button>
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
