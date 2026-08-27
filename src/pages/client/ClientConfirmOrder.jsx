import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Trash2, CheckCircle, ArrowLeft, FileText } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import QuantityInput from '../../components/QuantityInput';
import { formatCOP } from '../../data/mockData';

export default function ClientConfirmOrder() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { cart, cartTotal, cartSubtotal, cartIva, updateCartItem, removeFromCart, submitOrder, refreshProducts } = useApp();
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  async function handleSubmit() {
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const orderId = await submitOrder(currentUser.id, null, notes);
      setSubmitted(orderId);
    } catch (err) {
      // Backend rechazo el pedido. Distinguimos mismatches de precio (409 con detail).
      if (err?.status === 409 && Array.isArray(err?.data?.mismatches)) {
        await refreshProducts?.();
        const lines = err.data.mismatches.map(m =>
          `• ${m.productName}: pediste $${m.clientPrice}, ahora cuesta $${m.backendPrice}`
        ).join('\n');
        setErrorMsg(`El precio cambio mientras armabas el pedido. Recargamos el catalogo:\n${lines}`);
      } else {
        setErrorMsg(err?.message || 'No se pudo enviar el pedido');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (cart.length === 0 && !submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <ShoppingCart className="w-14 h-14 text-gray-200 mb-4" />
        <h2 className="text-xl font-bold text-gray-700 mb-2">Tu pedido está vacío</h2>
        <p className="text-gray-400 text-sm mb-6">Agrega productos desde el catálogo antes de confirmar.</p>
        <button
          onClick={() => navigate('/cliente')}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Ir al catálogo
        </button>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-5">
          <CheckCircle className="w-10 h-10 text-green-500" />
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">¡Pedido enviado!</h2>
        <p className="text-gray-500 text-sm mb-1">Tu pedido fue registrado exitosamente.</p>
        <p className="text-gray-400 text-sm mb-3">
          {currentUser?.clientRole === 'creador_pedidos'
            ? 'Tu pedido está pendiente de aprobación por el supervisor de tu empresa.'
            : 'Un asesor atenderá tu pedido lo antes posible.'}
        </p>
        <p className="font-mono text-blue-700 font-bold text-xl mb-8">{submitted}</p>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/cliente/pedidos')}
            className="flex items-center gap-2 px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
          >
            <FileText className="w-4 h-4" />
            Ver mis pedidos
          </button>
          <button
            onClick={() => navigate('/cliente')}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition"
          >
            <ShoppingCart className="w-4 h-4" />
            Seguir comprando
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/cliente')}
          className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Confirmar Pedido</h2>
          <p className="text-sm text-gray-500 mt-0.5">Revisa tu pedido antes de enviarlo</p>
        </div>
      </div>

      {/* Items */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-blue-700" />
          <h3 className="font-semibold text-gray-800">Productos del pedido</h3>
        </div>
        <div className="divide-y divide-gray-100">
          {cart.map(item => (
            <div key={item.productId} className="flex items-center gap-4 px-5 py-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{item.productName}</p>
                <p className="text-xs text-gray-400 mt-0.5">{formatCOP(item.unitPrice)} por {item.unit}</p>
              </div>

              {/* Quantity controls */}
              <QuantityInput
                size="sm"
                value={item.quantity}
                onChange={(n) => updateCartItem(item.productId, n)}
              />

              <p className="text-sm font-bold text-blue-700 w-24 text-right">
                {formatCOP(item.unitPrice * item.quantity)}
              </p>

              <button
                onClick={() => removeFromCart(item.productId)}
                className="p-1.5 text-gray-300 hover:text-red-500 transition flex-shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Subtotal / IVA / Total */}
        <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Subtotal</span>
            <span className="text-sm font-medium text-gray-700">{formatCOP(cartSubtotal)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">IVA (19%)</span>
            <span className="text-sm font-medium text-gray-700">{formatCOP(cartIva)}</span>
          </div>
          <div className="flex items-center justify-between pt-1.5 border-t border-gray-200">
            <span className="text-sm font-semibold text-gray-700">TOTAL PEDIDO</span>
            <span className="text-2xl font-bold text-gray-900">{formatCOP(cartTotal)}</span>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Notas o instrucciones especiales
        </label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          placeholder="Ej: entregar en horario de mañana, facturar a nombre de..."
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>

      {/* Error */}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm whitespace-pre-line">
          {errorMsg}
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full py-4 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white rounded-xl text-base font-bold transition shadow-sm"
      >
        {submitting ? 'Enviando...' : 'Enviar mi pedido'}
      </button>
    </div>
  );
}
