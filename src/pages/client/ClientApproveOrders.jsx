import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardCheck, CheckCircle2, XCircle, Package, Calendar, User } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { STATUS_STYLES, formatCOP } from "../../data/mockData";
import { RejectModal, ConfirmApproveModal } from "../../components/OrderApprovalModals";

export default function ClientApproveOrders() {
  const { orders, updateOrder, users } = useApp();
  const navigate = useNavigate();
  const [confirmOrder, setConfirmOrder] = useState(null);
  const [rejectOrder, setRejectOrder] = useState(null);
  const [actionError, setActionError] = useState(null);

  // El backend ya filtra por empresa/sucursal, aquí solo por estado.
  const pendingOrders = orders
    .filter((o) => o.status === "Pendiente por aprobar")
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  function getClientName(clientId) {
    return users.find((u) => u.id === clientId)?.name || "—";
  }

  async function confirmApprove() {
    setActionError(null);
    try {
      await updateOrder(confirmOrder.id, { status: "Validar disponibilidad" });
      setConfirmOrder(null);
    } catch (err) {
      setActionError(err?.message || "No se pudo aprobar");
    }
  }

  async function confirmReject(reason) {
    setActionError(null);
    try {
      await updateOrder(rejectOrder.id, { status: "Rechazado", reason });
      setRejectOrder(null);
    } catch (err) {
      setActionError(err?.message || "No se pudo rechazar");
    }
  }

  const statusStyle = STATUS_STYLES["Pendiente por aprobar"];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-yellow-100 text-yellow-700 rounded-xl flex items-center justify-center">
          <ClipboardCheck className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Aprobar Pedidos</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {pendingOrders.length === 0
              ? "No hay pedidos pendientes de aprobación"
              : `${pendingOrders.length} pedido${pendingOrders.length !== 1 ? "s" : ""} pendiente${pendingOrders.length !== 1 ? "s" : ""} de aprobación`}
          </p>
        </div>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-5 py-4 text-sm text-yellow-800">
        Los pedidos aprobados quedan disponibles para que el asesor comercial los gestione y ya no
        pueden modificarse. Los rechazados no pasan a gestión.
      </div>

      {pendingOrders.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 flex flex-col items-center justify-center py-20 text-center">
          <ClipboardCheck className="w-12 h-12 text-gray-200 mb-3" />
          <p className="text-gray-500 font-medium">Todo al día</p>
          <p className="text-sm text-gray-400 mt-1">No hay pedidos pendientes de aprobación</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pendingOrders.map((order) => {
            const clientName = getClientName(order.clientId);
            const itemCount = (order.items || []).reduce((s, i) => s + i.quantity, 0);
            return (
              <div
                key={order.id}
                className="bg-white rounded-xl shadow-sm border border-gray-100 px-5 py-4 flex items-center gap-4"
              >
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
                      <User className="w-3 h-3" />
                      {clientName}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <Calendar className="w-3 h-3" />
                      {order.createdAt}
                    </span>
                    {itemCount > 0 && <span className="text-xs text-gray-400">{itemCount} items</span>}
                  </div>
                </div>

                <div className="text-right flex-shrink-0 hidden sm:block">
                  <p className="text-base font-bold text-gray-900">{formatCOP(order.total)}</p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => navigate(`/cliente/pedidos/${order.id}`)}
                    className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50 transition"
                  >
                    Ver detalle
                  </button>
                  <button
                    onClick={() => setRejectOrder(order)}
                    className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                    title="Rechazar"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setConfirmOrder(order)}
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

      {actionError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-600">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {confirmOrder && (
        <ConfirmApproveModal
          order={confirmOrder}
          onConfirm={confirmApprove}
          onCancel={() => setConfirmOrder(null)}
        />
      )}
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
