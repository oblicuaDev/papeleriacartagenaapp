import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Trash2, CheckCircle, ArrowLeft, FileText, Save, Building2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import QuantityInput from '../../components/QuantityInput';
import { formatCOP } from '../../data/mockData';
import { catalogApi } from '../../services/api';

export default function ClientConfirmOrder() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const {
    cart, cartTotal, cartSubtotal, cartIva, cartIva5, cartIva19, cartExentoBase,
    updateCartItem, removeFromCart, submitOrder, refreshProducts, repriceCart, companies,
  } = useApp();
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // administrador_contrato puede hacer el pedido a nombre de cualquier sucursal
  // de su empresa: el pedido queda en esa sucursal (precios, asesor y
  // aprobacion) y el administrador figura como autor.
  const isAdminContrato = currentUser?.clientRole === 'administrador_contrato';
  const sucursales = isAdminContrato
    ? (companies.find(c => c.id === currentUser?.companyId)?.sucursales || []).filter(s => s.active !== false)
    : [];
  const [sucursalId, setSucursalId] = useState(String(currentUser?.sucursalId ?? ''));
  const [repricing, setRepricing] = useState(false);

  // Precios del carrito segun la sucursal elegida (el backend valida contra
  // esa misma lista al crear el pedido).
  const cartIdsKey = cart.map(i => i.productId).sort((a, b) => a - b).join(',');
  const loadSucursalPrices = useCallback(async () => {
    if (!isAdminContrato || !sucursalId || !cartIdsKey) return;
    setRepricing(true);
    try {
      const res = await catalogApi.list({ sucursalId, ids: cartIdsKey, limit: 1000 });
      const priceById = {};
      for (const p of res?.data || []) priceById[p.id] = Number(p.price);
      repriceCart(priceById);
    } catch (err) {
      setErrorMsg(err?.message || 'No se pudieron cargar los precios de la sucursal');
    } finally {
      setRepricing(false);
    }
  }, [isAdminContrato, sucursalId, cartIdsKey]);

  useEffect(() => { loadSucursalPrices(); }, [loadSucursalPrices]);

  // "Guardar borrador" = dejar el carrito como está y volver al catálogo.
  // El carrito se conserva solo (localStorage), no se crea ningún pedido.
  function handleSaveDraft() {
    navigate('/cliente');
  }

  async function handleSubmit() {
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const orderId = await submitOrder(
        currentUser.id, null, notes,
        isAdminContrato && sucursalId ? Number(sucursalId) : undefined,
      );
      setSubmitted(orderId);
    } catch (err) {
      // Backend rechazo el pedido. Distinguimos mismatches de precio (409 con detail).
      if (err?.status === 409 && Array.isArray(err?.data?.mismatches)) {
        await refreshProducts?.();
        await loadSucursalPrices();
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

      {/* Sucursal destino — solo administrador_contrato */}
      {isAdminContrato && sucursales.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
            <Building2 className="w-4 h-4 text-blue-700" />
            Sucursal del pedido
          </label>
          <select
            value={sucursalId}
            onChange={e => { setErrorMsg(null); setSucursalId(e.target.value); }}
            disabled={submitting || repricing}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {sucursales.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}{s.id === currentUser?.sucursalId ? ' (mi sucursal)' : ''}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-2">
            El pedido queda a nombre de esta sucursal (precios, asesor y aprobación) y tú como autor.
          </p>
        </div>
      )}

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
          {cartExentoBase > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Base exenta</span>
              <span className="text-sm font-medium text-gray-700">{formatCOP(cartExentoBase)}</span>
            </div>
          )}
          {cartIva5 > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">IVA (5%)</span>
              <span className="text-sm font-medium text-gray-700">{formatCOP(cartIva5)}</span>
            </div>
          )}
          {(cartIva19 > 0 || (cartIva5 === 0 && cartExentoBase === 0)) && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">IVA (19%)</span>
              <span className="text-sm font-medium text-gray-700">{formatCOP(cartIva19)}</span>
            </div>
          )}
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

      {/* Acciones */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={handleSaveDraft}
          disabled={submitting}
          className="sm:w-64 flex items-center justify-center gap-2 py-4 border border-gray-300 text-gray-700 rounded-xl text-base font-semibold hover:bg-gray-50 disabled:opacity-50 transition"
        >
          <Save className="w-4 h-4" />
          Guardar borrador
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting || repricing}
          className="flex-1 py-4 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white rounded-xl text-base font-bold transition shadow-sm"
        >
          {submitting ? 'Enviando...' : 'Enviar mi pedido'}
        </button>
      </div>
    </div>
  );
}
