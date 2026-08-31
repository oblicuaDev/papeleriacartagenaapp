import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, ExternalLink, Repeat, Filter, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { STATUS_STYLES, formatCOP, statusLabel, splitIva } from '../../data/mockData';
import { ordersApi } from '../../services/api';

// Estados que componen el grupo "En entrega" (logistica posterior al asesor).
const IN_DELIVERY_STATUSES = ['Alistamiento', 'En Ruta'];

// Tabs visibles para creador_pedidos / supervisor / admin_empresa.
// 'Aprobados' incluye 'Validar disponibilidad' (flujo nuevo) y 'Pendiente' (legacy).
const ORDER_TABS = [
  { value: 'all',         label: 'Todos' },
  { value: 'pending',     label: 'Pendientes', statuses: ['Pendiente por aprobar'] },
  { value: 'approved',    label: 'Aprobados',  statuses: ['Validar disponibilidad', 'Pendiente'] },
  { value: 'in_delivery', label: 'En entrega', statuses: IN_DELIVERY_STATUSES },
  { value: 'delivered',   label: 'Entregados', statuses: ['Entregado'] },
];

const ALL_STATUSES = [
  'Pendiente por aprobar',
  'Rechazado',
  'Pendiente',
  'Validar disponibilidad',
  'Alistamiento',
  'En Ruta',
  'Entregado',
];

export default function ClientOrders() {
  const { orders, users, companies, addToCart, clearCart } = useApp();
  const { currentUser }   = useAuth();
  const navigate          = useNavigate();
  const isReadOnly        = currentUser?.clientRole === 'admin_empresa';
  const isSupervisor      = currentUser?.clientRole === 'supervisor';
  const isAdminEmpresa    = currentUser?.clientRole === 'admin_empresa';
  const isAdminContrato   = currentUser?.clientRole === 'administrador_contrato';
  const isCreador         = currentUser?.clientRole === 'creador_pedidos';
  // admin_empresa (solo lectura) y administrador_contrato ven toda la empresa.
  const isCompanyWide     = isAdminEmpresa || isAdminContrato;

  const [tab, setTab]                 = useState('all');
  const [creatorId, setCreatorId]     = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sucursalId, setSucursalId]   = useState('');
  const [orderIdQuery, setOrderIdQuery] = useState('');
  const [dateFrom, setDateFrom]       = useState('');
  const [dateTo, setDateTo]           = useState('');

  const company = companies.find(c => c.id === currentUser?.companyId);
  const sucursales = company?.sucursales || [];

  // Sucursal del supervisor: SIEMPRE su propia sucursal (defensa en profundidad
  // ante datos servidos del backend; el backend ya filtra por sucursal).
  const visibleClientIds = useMemo(() => {
    if (isCreador) return [currentUser?.id];
    if (isSupervisor) {
      return users
        .filter(u =>
          u.role === 'client' &&
          u.companyId === currentUser?.companyId &&
          u.sucursalId === currentUser?.sucursalId
        )
        .map(u => u.id);
    }
    if (isCompanyWide) {
      return users
        .filter(u => u.role === 'client' && u.companyId === currentUser?.companyId)
        .map(u => u.id);
    }
    return [];
  }, [users, currentUser, isCreador, isSupervisor, isCompanyWide]);

  // Conjuntos auxiliares para filtros
  const creatorOptions = useMemo(() => {
    if (isCreador) return [];
    return users
      .filter(u =>
        u.role === 'client' &&
        u.companyId === currentUser?.companyId &&
        (isSupervisor ? u.sucursalId === currentUser?.sucursalId : true)
      )
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [users, currentUser, isCreador, isSupervisor]);

  const userById = useMemo(() => {
    const m = {};
    for (const u of users) m[u.id] = u;
    return m;
  }, [users]);

  function inDateRange(dateStr) {
    if (!dateStr) return true;
    if (dateFrom && dateStr < dateFrom) return false;
    if (dateTo && dateStr > dateTo + ' 23:59:59') return false;
    return true;
  }

  const myOrders = useMemo(() => {
    return [...orders]
      .filter(o => visibleClientIds.includes(o.clientId))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [orders, visibleClientIds]);

  function tabMatches(order) {
    if (tab === 'all') return true;
    const def = ORDER_TABS.find(t => t.value === tab);
    return def?.statuses?.includes(order.status) ?? true;
  }

  const filtered = useMemo(() => {
    const q = orderIdQuery.trim().toLowerCase();
    return myOrders.filter(o => {
      if (!tabMatches(o)) return false;
      if (q && !String(o.id).toLowerCase().includes(q)) return false;
      if (creatorId && o.clientId !== Number(creatorId)) return false;
      if (statusFilter && o.status !== statusFilter) return false;
      if (sucursalId && isCompanyWide) {
        const u = userById[o.clientId];
        if (!u || u.sucursalId !== Number(sucursalId)) return false;
      }
      if (!inDateRange(o.createdAt)) return false;
      return true;
    });
  }, [myOrders, tab, creatorId, statusFilter, sucursalId, orderIdQuery, dateFrom, dateTo, userById, isCompanyWide]);

  function tabCount(tabValue) {
    return myOrders.filter(o => {
      const def = ORDER_TABS.find(t => t.value === tabValue);
      if (tabValue === 'all') return true;
      return def?.statuses?.includes(o.status);
    }).length;
  }

  function clearFilters() {
    setCreatorId('');
    setStatusFilter('');
    setSucursalId('');
    setOrderIdQuery('');
    setDateFrom('');
    setDateTo('');
  }

  const hasActiveFilters = creatorId || statusFilter || sucursalId || orderIdQuery || dateFrom || dateTo;

  async function handleRepeatOrder(e, orderId) {
    e.stopPropagation();
    try {
      const full = await ordersApi.get(orderId);
      const items = full.items || [];
      if (!items.length) {
        alert('El pedido no tiene productos para repetir.');
        return;
      }

      // PostgreSQL NUMERIC viaja como string ("15000.00"); el backend
      // valida `typeof unitPrice === 'number'`, asi que normalizamos aqui
      // antes de meter al carrito. Tambien defendemos quantity y descartamos
      // items invalidos (sin productId, qty <= 0 o precio no finito).
      const normalized = [];
      const skipped = [];
      for (const raw of items) {
        const productId = Number(raw.productId);
        const quantity = Math.trunc(Number(raw.quantity));
        const unitPriceNum = Number(raw.unitPrice);
        const unitPrice = Number.isFinite(unitPriceNum)
          ? Math.round(unitPriceNum * 100) / 100
          : NaN;

        if (
          !Number.isInteger(productId) || productId <= 0 ||
          !Number.isInteger(quantity)  || quantity  <= 0 ||
          !Number.isFinite(unitPrice)  || unitPrice <= 0
        ) {
          skipped.push({
            productName: raw.productName,
            productId: raw.productId,
            unitPrice: raw.unitPrice,
            quantity: raw.quantity,
          });
          continue;
        }

        normalized.push({
          productId,
          productName: raw.productName,
          sku: raw.sku,
          unit: raw.unit || '',
          quantity,
          unitPrice,
        });
      }

      console.log('[repeat-order] items recibidos:', items.length,
        '· normalizados:', normalized.length,
        '· descartados:', skipped.length,
        skipped.length ? skipped : '');

      if (!normalized.length) {
        alert('No se pudieron recuperar productos validos del pedido anterior. Es posible que los precios o productos hayan cambiado.');
        return;
      }

      clearCart();
      for (const it of normalized) {
        addToCart(
          { id: it.productId, name: it.productName, unit: it.unit },
          it.quantity,
          it.unitPrice,
        );
      }

      if (skipped.length) {
        alert(`Se omitieron ${skipped.length} producto(s) con datos invalidos del pedido original. Revisa el carrito antes de enviar.`);
      }

      navigate('/cliente/confirmar-pedido');
    } catch (err) {
      console.error('[repeat-order] fallo:', err);
      alert(err?.message || 'No se pudo repetir el pedido');
    }
  }

  function getClientName(id) {
    return userById[id]?.name || '—';
  }

  const showCreatorColumn = !isCreador;
  const inputCls = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Pedidos</h2>
          <p className="text-sm text-gray-500 mt-1">{filtered.length} de {myOrders.length} pedidos</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit overflow-x-auto">
        {ORDER_TABS.map(t => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 whitespace-nowrap ${
              tab === t.value ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
              tab === t.value ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-500'
            }`}>
              {tabCount(t.value)}
            </span>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
            <Filter className="w-4 h-4" /> Filtros
          </div>

          <input
            type="text"
            value={orderIdQuery}
            onChange={e => setOrderIdQuery(e.target.value)}
            className={inputCls}
            placeholder="# de pedido (ORD-…)"
            title="Buscar por número de pedido"
          />

          {!isCreador && (
            <select
              value={creatorId}
              onChange={e => setCreatorId(e.target.value)}
              className={inputCls}
              title="Creador del pedido"
            >
              <option value="">Todos los creadores</option>
              {creatorOptions.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          )}

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className={inputCls}
            title="Estado"
          >
            <option value="">Todos los estados</option>
            {ALL_STATUSES.map(s => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </select>

          {/* Filtro de sucursal — admin_empresa / administrador_contrato */}
          {isCompanyWide && sucursales.length > 0 && (
            <select
              value={sucursalId}
              onChange={e => setSucursalId(e.target.value)}
              className={inputCls}
              title="Sucursal"
            >
              <option value="">Todas las sucursales</option>
              {sucursales.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}

          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className={inputCls}
            title="Desde"
          />
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className={inputCls}
            title="Hasta"
          />

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-600 px-2 py-1.5 rounded-lg hover:bg-red-50 transition"
            >
              <X className="w-3.5 h-3.5" /> Limpiar
            </button>
          )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3"># Pedido</th>
                {showCreatorColumn && (
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Solicitante</th>
                )}
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Fecha</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Items</th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Subtotal</th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">IVA</th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Total</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Estado</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(order => {
                const style = STATUS_STYLES[order.status] || {};
                return (
                  <tr
                    key={order.id}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/cliente/pedidos/${order.id}`)}
                  >
                    <td className="px-5 py-4 text-sm font-mono font-medium text-blue-700">{order.id}</td>
                    {showCreatorColumn && (
                      <td className="px-5 py-4 text-sm text-gray-600">{getClientName(order.clientId)}</td>
                    )}
                    <td className="px-5 py-4 text-sm text-gray-600">{order.createdAt}</td>
                    <td className="px-5 py-4 text-sm text-gray-600">{order.itemCount ?? (order.items || []).length} ítem(s)</td>
                    {(() => {
                      const fb = splitIva(order.total);
                      const sub = order.subtotal != null ? order.subtotal : fb.subtotal;
                      const iva = order.iva != null ? order.iva : fb.iva;
                      return (
                        <>
                          <td className="px-5 py-4 text-sm text-gray-600 text-right">{formatCOP(sub)}</td>
                          <td className="px-5 py-4 text-sm text-gray-600 text-right">{formatCOP(iva)}</td>
                        </>
                      );
                    })()}
                    <td className="px-5 py-4 text-sm font-semibold text-gray-800 text-right">{formatCOP(order.total)}</td>
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
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={showCreatorColumn ? 9 : 8} className="px-5 py-16 text-center">
                    <Package className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                    <p className="text-sm text-gray-400">No hay pedidos en esta categoría</p>
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
