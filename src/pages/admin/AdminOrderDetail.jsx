import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import OrderDetailCRM from '../../components/OrderDetailCRM';

export default function AdminOrderDetail() {
  const { orderId } = useParams();
  const navigate    = useNavigate();
  const { orders, updateOrder, users } = useApp();
  const { currentUser }                = useAuth();

  const order = orders.find(o => o.id === orderId);

  if (!order) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Pedido no encontrado</p>
        <button
          onClick={() => navigate('/admin/pedidos')}
          className="mt-4 text-blue-700 hover:text-blue-800 text-sm font-medium"
        >
          Volver a la lista
        </button>
      </div>
    );
  }

  return (
    <OrderDetailCRM
      order={order}
      onBack={() => navigate('/admin/pedidos')}
      editable={true}
      canAssign={true}
      currentUser={currentUser}
      users={users}
      updateOrder={updateOrder}
    />
  );
}
