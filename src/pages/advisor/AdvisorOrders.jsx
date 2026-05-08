import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, ClipboardList, CheckCircle, Box, CalendarDays, X, Settings2, Building } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { STATUS_STYLES, formatCOP, statusLabel } from '../../data/mockData';

// Estados en los que el asesor puede gestionar (no solo ver).
// 'Pendiente' se mantiene por compatibilidad con pedidos legacy.
const MANAGE_STATUSES = ['Pendiente', 'Validar disponibilidad'];

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3">
      <p className="text-xs font-semibold text-gray-500 mb-1">{label}</p>
      <p className="text-base font-bold text-blue-700">{formatCOP(payload[0].value)}</p>
    </div>
  );
}

const inputCls = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';

const FILTER_TABS = [
  { label: 'Todos', value: 'all' },
  { label: 'Por validar', value: 'Validar disponibilidad' },
  { label: 'En proceso', value: 'process' },
  { label: 'Entregado', value: 'Entregado' },
];

// 'Validar disponibilidad' ahora es responsabilidad del asesor (lo manejamos
// con su propio tab). 'En proceso' representa logistica posterior.
const IN_PROCESS_STATUSES = ['Alistamiento', 'En Ruta'];

function HighlightCard({ label, value, sub, icon: Icon, bg, text }) {
  return (
    <div className={`${bg} rounded-xl p-6 flex items-center gap-4 shadow-sm`}>
      <div className="w-12 h-12 bg-white bg-opacity-25 rounded-xl flex items-center justify-center flex-shrink-0">
        <Icon className={`w-6 h-6 ${text}`} />
      </div>
      <div>
        <p className={`text-sm font-medium ${text} opacity-80`}>{label}</p>
        <p className={`text-3xl font-bold ${text}`}>{value}</p>
        {sub && <p className={`text-sm font-semibold ${text} opacity-70 mt-0.5`}>{sub}</p>}
      </div>
    </div>
  );
}

export default function AdvisorOrders() {
  const { orders, users, companies } = useApp();
  const { currentUser }   = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('all');
  const [dateFrom, setDateFrom]   = useState('');
  const [dateTo, setDateTo]       = useState('');
  const [companyFilter, setCompanyFilter] = useState('');

  // Inicializa el filtro empresa desde la URL (?empresa=N) cuando se navega
  // desde la vista de empresas asignadas.
  useEffect(() => {
    const fromUrl = searchParams.get('empresa');
    if (fromUrl) setCompanyFilter(fromUrl);
  }, [searchParams]);

  const userById = useMemo(() => {
    const m = {};
    for (const u of users) m[u.id] = u;
    return m;
  }, [users]);

  const isFiltered = dateFrom || dateTo || companyFilter;

  function inRange(dateStr) {
    const d = new Date(dateStr);
    if (dateFrom && d < new Date(dateFrom)) return false;
    if (dateTo   && d > new Date(dateTo))   return false;
    return true;
  }

  function matchesCompany(o) {
    if (!companyFilter) return true;
    const u = userById[o.clientId];
    return u && u.companyId === Number(companyFilter);
  }

  const myOrders = orders.filter(o => o.advisorId === currentUser?.id && o.status !== 'Pendiente por aprobar' && inRange(o.createdAt) && matchesCompany(o));
  const allMyOrders = orders.filter(o => o.advisorId === currentUser?.id && o.status !== 'Pendiente por aprobar'); // for tab counts

  const deliveredOrders = myOrders.filter(o => o.status === 'Entregado');
  const deliveredPct = myOrders.length > 0
    ? Math.round((deliveredOrders.length / myOrders.length) * 100)
    : 0;
  const deliveredUnits = deliveredOrders.reduce(
    (sum, o) => sum + (o.items || []).reduce((s, i) => s + i.quantity, 0), 0
  );

  // Top 10 productos
  const productQtyMap = {};
  myOrders.forEach(o => (o.items || []).forEach(item => {
    if (!productQtyMap[item.productId]) {
      productQtyMap[item.productId] = { productId: item.productId, name: item.productName, qty: 0 };
    }
    productQtyMap[item.productId].qty += item.quantity;
  }));
  const topProducts = Object.values(productQtyMap).sort((a, b) => b.qty - a.qty).slice(0, 10);

  // Histórico mensual
  const monthlyMap = {};
  MONTHS.forEach((_, i) => { monthlyMap[i] = 0; });
  myOrders.forEach(o => {
    const month = new Date(o.createdAt).getMonth();
    if (!isNaN(month)) monthlyMap[month] = (monthlyMap[month] || 0) + o.total;
  });
  const chartData = MONTHS.map((name, i) => ({ name, total: monthlyMap[i] }));

  const filtered = myOrders.filter(order => {
    if (activeTab === 'all') return true;
    if (activeTab === 'process') return IN_PROCESS_STATUSES.includes(order.status);
    return order.status === activeTab;
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  function getClientName(order) {
    return order.clientName || users.find(u => u.id === order.clientId)?.name || '—';
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Pedidos Asignados</h2>
          <p className="text-sm text-gray-500 mt-1">{myOrders.length} pedidos en el periodo</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm">
            <Building className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <select
              value={companyFilter}
              onChange={e => {
                setCompanyFilter(e.target.value);
                if (e.target.value) {
                  setSearchParams({ empresa: e.target.value });
                } else {
                  setSearchParams({});
                }
              }}
              className={inputCls}
              title="Empresa"
            >
              <option value="">Todas las empresas</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm">
            <CalendarDays className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="text-xs font-medium text-gray-500">Desde</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} />
            <span className="text-xs font-medium text-gray-500">Hasta</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} />
          </div>
          {isFiltered && (
            <button
              onClick={() => { setDateFrom(''); setDateTo(''); setCompanyFilter(''); setSearchParams({}); }}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 border border-gray-200 rounded-xl transition"
            >
              <X className="w-4 h-4" />
              Limpiar
            </button>
          )}
        </div>
      </div>

      {isFiltered && (
        <div className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-4 py-2 font-medium">
          Mostrando {myOrders.length} pedido(s) en el rango seleccionado
        </div>
      )}

      {/* Highlight cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <HighlightCard
          label="Pedidos entregados"
          value={deliveredOrders.length}
          sub={`${deliveredPct}% del total de pedidos`}
          icon={CheckCircle}
          bg="bg-green-500"
          text="text-white"
        />
        <HighlightCard
          label="Productos entregados"
          value={deliveredUnits}
          sub="unidades en pedidos entregados"
          icon={Box}
          bg="bg-sky-400"
          text="text-white"
        />
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {FILTER_TABS.map(tab => {
          const count = tab.value === 'all'
            ? myOrders.length
            : tab.value === 'process'
            ? myOrders.filter(o => IN_PROCESS_STATUSES.includes(o.status)).length
            : myOrders.filter(o => o.status === tab.value).length;

          return (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${
                activeTab === tab.value
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                activeTab === tab.value ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-500'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3"># Pedido</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Cliente</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Fecha</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Items</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Total</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Estado</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(order => {
                const style = STATUS_STYLES[order.status] || {};
                return (
                  <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4 text-sm font-mono font-medium text-blue-700">{order.id}</td>
                    <td className="px-5 py-4 text-sm text-gray-700">{getClientName(order)}</td>
                    <td className="px-5 py-4 text-sm text-gray-500">{order.createdAt}</td>
                    <td className="px-5 py-4 text-sm text-gray-600">{(order.items || []).length}</td>
                    <td className="px-5 py-4 text-sm font-medium text-gray-800">{formatCOP(order.total)}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${style.bg} ${style.text} ${style.border}`}>
                        {statusLabel(order.status)}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {MANAGE_STATUSES.includes(order.status) ? (
                        <button
                          onClick={() => navigate(`/asesor/pedido/${order.id}`)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-white bg-blue-700 hover:bg-blue-800 rounded-lg text-xs font-medium transition"
                        >
                          <Settings2 className="w-3.5 h-3.5" />
                          Gestionar pedido
                        </button>
                      ) : (
                        <button
                          onClick={() => navigate(`/asesor/pedido/${order.id}`)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg text-xs font-medium transition"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Ver detalle
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center">
                    <ClipboardList className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                    <p className="text-sm text-gray-400">No hay pedidos en esta categoría</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top 10 + Histórico */}
      <div className="flex gap-4 items-start">

        {/* Top 10 productos — 40% */}
        <div className="w-2/5 bg-white rounded-xl shadow-sm border border-gray-100 flex-shrink-0">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-base font-semibold text-gray-800">Top 10 Productos</h3>
            <p className="text-xs text-gray-400 mt-0.5">Por unidades consumidas en el periodo</p>
          </div>
          <div className="p-4 space-y-2">
            {topProducts.map((item, idx) => {
              return (
                <div key={item.productId}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-gray-400 w-5 flex-shrink-0">{idx + 1}</span>
                      <span className="text-xs font-medium text-gray-700 truncate">{item.name}</span>
                    </div>
                    <span className="text-xs font-bold text-blue-700 ml-2 flex-shrink-0">{item.qty}</span>
                  </div>
                </div>
              );
            })}
            {topProducts.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">Sin datos en el periodo seleccionado</p>
            )}
          </div>
        </div>

        {/* Histórico de consumos — 60% */}
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="mb-6">
            <h3 className="text-base font-semibold text-gray-800">Histórico de Consumos</h3>
            <p className="text-xs text-gray-400 mt-0.5">Monto total de pedidos por mes{isFiltered ? ' · filtrado por periodo' : ''}</p>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="colorAdvisor" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af', fontFamily: 'Montserrat' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => v === 0 ? '0' : `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#9ca3af', fontFamily: 'Montserrat' }} axisLine={false} tickLine={false} width={48} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2.5} fill="url(#colorAdvisor)"
                dot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }}
                activeDot={{ r: 6, fill: '#1d4ed8', strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

      </div>

    </div>
  );
}
