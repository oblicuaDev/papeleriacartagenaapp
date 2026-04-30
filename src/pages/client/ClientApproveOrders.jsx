import { ClipboardCheck, CheckCircle2, XCircle, Package, Calendar, User, FileText, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { STATUS_STYLES, formatCOP } from '../../data/mockData';
import { useState } from 'react';

function RejectModal({ order, onConfirm, onCancel }) {
  const [reason, setReason] = useState('');
  const [error, setError]   = useState('');

  function handleConfirm() {
    if (!reason.trim()) {
      setError('Debes indicar el motivo del rechazo');
      return;
    }
    onConfirm(reason.trim());
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black bg-opacity-60">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-6 space-y-5">
          <div className="flex justify-center">
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center">
              <XCircle className="w-7 h-7 text-red-600" />
            </div>
          </div>

          <div className="text-center space-y-2">
            <h3 className="text-lg font-bold text-gray-900">Rechazar pedido</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              Indica el motivo del rechazo. Quedara registrado en el historial del pedido.
            </p>
            {order && (
              <p className="text-xs font-mono text-gray-400 bg-gray-50 rounded-lg px-3 py-1.5 inline-block">
                {order.id} · {formatCOP(order.total)}
              </p>
            )}
          </div>

          <div>
            <textarea
              value={reason}
              onChange={e => { setReason(e.target.value); setError(''); }}
              rows={3}
              placeholder="Ej: producto agotado, cantidad excede limite mensual..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              maxLength={500}
            />
            {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
          </div>

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2"
            >
              <XCircle className="w-4 h-4" />
              Rechazar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfirmApproveModal({ order, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black bg-opacity-60">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-6 space-y-5">
          {/* Icon */}
          <div className="flex justify-center">
            <div className="w-14 h-14 bg-yellow-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-yellow-600" />
            </div>
          </div>

          {/* Text */}
          <div className="text-center space-y-2">
            <h3 className="text-lg font-bold text-gray-900">¿Estás seguro de aprobar este pedido?</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              Al aprobarlo se generará una orden de compra a{' '}
              <span className="font-semibold text-gray-800">Papelería Cartagena</span>.
              Esta acción no se puede deshacer.
            </p>
            {order && (
              <p className="text-xs font-mono text-gray-400 bg-gray-50 rounded-lg px-3 py-1.5 inline-block">
                {order.id} · {formatCOP(order.total)}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition"
            >
              Cancelar
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              Sí, aprobar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrderDetailModal({ order, clientName, onApprove, onReject, onClose }) {
  const total = (order.items || []).reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Detalle del pedido</h3>
            <p className="text-xs text-gray-400 font-mono mt-0.5">{order.id}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-5">
          {/* Meta */}
          <div className="flex items-center gap-4 text-sm text-gray-500 flex-wrap">
            <span className="flex items-center gap-1"><User className="w-4 h-4" />{clientName}</span>
            <span className="flex items-center gap-1"><Calendar className="w-4 h-4" />{order.createdAt}</span>
          </div>

          {/* Items */}
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Producto</th>
                  <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Cant.</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(order.items || []).map((item, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{item.productName}</p>
                      <p className="text-xs text-gray-400">{formatCOP(item.unitPrice)} / {item.unit}</p>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">{item.quantity}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800">{formatCOP(item.unitPrice * item.quantity)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t border-gray-100">
                  <td colSpan={2} className="px-4 py-3 text-sm font-semibold text-gray-600 text-right">Total</td>
                  <td className="px-4 py-3 text-right text-base font-bold text-gray-900">{formatCOP(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Notes */}
          {order.notes && (
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" /> Notas
              </p>
              <p className="text-sm text-gray-700">{order.notes}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => { onReject(order.id); onClose(); }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 border-2 border-red-200 text-red-600 rounded-xl text-sm font-semibold hover:bg-red-50 transition"
            >
              <XCircle className="w-4 h-4" />
              Rechazar
            </button>
            <button
              onClick={() => onApprove(order)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold transition"
            >
              <CheckCircle2 className="w-4 h-4" />
              Aprobar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ClientApproveOrders() {
  const { currentUser } = useAuth();
  const { orders, updateOrder, users } = useApp();
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [confirmOrder, setConfirmOrder]   = useState(null); // approve confirmation
  const [rejectOrder, setRejectOrder]     = useState(null); // reject confirmation
  const [actionError, setActionError]     = useState(null);

  // Backend ya filtra por empresa, asi que solo filtramos por estado.
  const pendingOrders = orders
    .filter(o => o.status === 'Pendiente por aprobar')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  function getClientName(clientId) {
    return users.find(u => u.id === clientId)?.name || '—';
  }

  function requestApprove(order) {
    setSelectedOrder(null);
    setConfirmOrder(order);
  }

  function requestReject(order) {
    setSelectedOrder(null);
    setRejectOrder(order);
  }

  async function confirmApprove() {
    setActionError(null);
    try {
      await updateOrder(confirmOrder.id, { status: 'Pendiente' });
      setConfirmOrder(null);
    } catch (err) {
      setActionError(err?.message || 'No se pudo aprobar');
    }
  }

  async function confirmReject(reason) {
    setActionError(null);
    try {
      await updateOrder(rejectOrder.id, { status: 'Rechazado', reason });
      setRejectOrder(null);
    } catch (err) {
      setActionError(err?.message || 'No se pudo rechazar');
    }
  }

  const statusStyle = STATUS_STYLES['Pendiente por aprobar'];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-yellow-100 text-yellow-700 rounded-xl flex items-center justify-center">
          <ClipboardCheck className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Aprobar Pedidos</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {pendingOrders.length === 0
              ? 'No hay pedidos pendientes de aprobación'
              : `${pendingOrders.length} pedido${pendingOrders.length !== 1 ? 's' : ''} pendiente${pendingOrders.length !== 1 ? 's' : ''} de aprobación`}
          </p>
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-5 py-4 text-sm text-yellow-800">
        Los pedidos aprobados quedan disponibles para que el asesor comercial los gestione. Los rechazados no pasan a gestión.
      </div>

      {/* Orders list */}
      {pendingOrders.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 flex flex-col items-center justify-center py-20 text-center">
          <ClipboardCheck className="w-12 h-12 text-gray-200 mb-3" />
          <p className="text-gray-500 font-medium">Todo al día</p>
          <p className="text-sm text-gray-400 mt-1">No hay pedidos pendientes de aprobación</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pendingOrders.map(order => {
            const clientName = getClientName(order.clientId);
            const itemCount = (order.items || []).reduce((s, i) => s + i.quantity, 0);
            return (
              <div key={order.id} className="bg-white rounded-xl shadow-sm border border-gray-100 px-5 py-4 flex items-center gap-4">
                <div className="w-10 h-10 bg-rose-50 text-rose-500 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Package className="w-5 h-5" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-mono text-sm font-bold text-gray-800">{order.id}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                      Pendiente por aprobar
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-1 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <User className="w-3 h-3" />{clientName}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <Calendar className="w-3 h-3" />{order.createdAt}
                    </span>
                    <span className="text-xs text-gray-400">{itemCount} items</span>
                  </div>
                </div>

                <div className="text-right flex-shrink-0 hidden sm:block">
                  <p className="text-base font-bold text-gray-900">{formatCOP(order.total)}</p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setSelectedOrder(order)}
                    className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50 transition"
                  >
                    Ver detalle
                  </button>
                  <button
                    onClick={() => requestReject(order)}
                    className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                    title="Rechazar"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => requestApprove(order)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-semibold transition"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Aprobar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Action error toast */}
      {actionError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-600">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Detail modal */}
      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          clientName={getClientName(selectedOrder.clientId)}
          onApprove={requestApprove}
          onReject={(_id) => requestReject(selectedOrder)}
          onClose={() => setSelectedOrder(null)}
        />
      )}

      {/* Confirm approve modal */}
      {confirmOrder && (
        <ConfirmApproveModal
          order={confirmOrder}
          onConfirm={confirmApprove}
          onCancel={() => setConfirmOrder(null)}
        />
      )}

      {/* Reject modal */}
      {rejectOrder && (
        <RejectModal
          order={rejectOrder}
          onConfirm={confirmReject}
          onCancel={() => setRejectOrder(null)}
        />
      )}
    </div>
  );
}
