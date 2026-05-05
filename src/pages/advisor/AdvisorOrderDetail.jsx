import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { ordersApi } from '../../services/api';
import OrderDetailCRM from '../../components/OrderDetailCRM';

export default function AdvisorOrderDetail() {
  const { orderId } = useParams();
  const navigate    = useNavigate();
  const { updateOrder, users } = useApp();
  const { currentUser }        = useAuth();

  const [fullOrder, setFullOrder] = useState(null);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    setLoading(true);
    ordersApi.get(orderId)
      .then(o => setFullOrder(o))
      .catch(() => setFullOrder(null))
      .finally(() => setLoading(false));
  }, [orderId]);

  if (loading) {
    return <div className="text-center py-20 text-sm text-gray-400">Cargando pedido…</div>;
  }

  if (!fullOrder) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Pedido no encontrado</p>
        <button
          onClick={() => navigate('/asesor')}
          className="mt-4 text-blue-700 hover:text-blue-800 text-sm font-medium"
        >
          Volver a la lista
        </button>
      </div>
    );
  }

  return (
    <OrderDetailCRM
      order={fullOrder}
      onBack={() => navigate('/asesor')}
      editable={true}
      canAssign={false}
      canAssignDelivery={true}
      currentUser={currentUser}
      users={users}
      updateOrder={updateOrder}
    />
  );
}
