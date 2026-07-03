import { useState, useEffect } from 'react';
import { Package, Users, ShoppingCart, ClipboardList, CheckCircle, Box, CalendarDays, X } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { useApp } from '../../context/AppContext';
import { statsApi } from '../../services/api';
import { STATUS_STYLES, formatCOP } from '../../data/mockData';

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

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div>
        <p className="text-sm text-gray-500 font-medium">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

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

const inputCls = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';

export default function AdminDashboard() {
  const { products, orders } = useApp();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [stats, setStats]       = useState(null);

  // Cargar stats del servidor (clientes activos, revenue, top productos, etc.)
  useEffect(() => {
    statsApi.admin({ dateFrom, dateTo }).then(setStats).catch(() => {});
  }, [dateFrom, dateTo]);

  const isFiltered = dateFrom || dateTo;

  function inRange(dateStr) {
    const d = new Date(dateStr);
    if (dateFrom && d < new Date(dateFrom)) return false;
    if (dateTo   && d > new Date(dateTo))   return false;
    return true;
  }

  const filtered = (orders || []).filter(o => inRange(o.createdAt || o.created_at || ''));

  const activeClients   = stats?.activeClients ?? '…';
  const pendingOrders   = filtered.filter(o => o.status === 'Pendiente').length;
  const deliveredOrders = filtered.filter(o => o.status === 'Entregado');
  const deliveredPct    = filtered.length > 0
    ? Math.round((deliveredOrders.length / filtered.length) * 100)
    : 0;
  // Agregados calculados en el servidor (join con order_items, respeta el rango de fechas)
  const deliveredUnits = stats?.deliveredUnits ?? 0;
  const topProducts = (stats?.topProducts ?? []).map(p => ({
    productId: p.productId,
    name: p.productName,
    qty: p.quantity,
  }));

  const recentOrders = [...filtered]
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    .slice(0, 5);

  const monthlyMap = {};
  MONTHS.forEach((_, i) => { monthlyMap[i] = 0; });
  filtered.forEach(o => {
    const month = new Date(o.createdAt || o.created_at).getMonth();
    if (!isNaN(month)) monthlyMap[month] = (monthlyMap[month] || 0) + (o.total || 0);
  });
  const chartData = MONTHS.map((name, i) => ({ name, total: monthlyMap[i] }));

  function getClientName(order) {
    return order.clientName || 'Desconocido';
  }

  return (
    <div className="space-y-6">

      {/* Header + date filter */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
          <p className="text-sm text-gray-500 mt-1">Resumen general del sistema</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm">
            <CalendarDays className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="text-xs font-medium text-gray-500">Desde</span>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className={inputCls}
            />
            <span className="text-xs font-medium text-gray-500">Hasta</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className={inputCls}
            />
          </div>
          {isFiltered && (
            <button
              onClick={() => { setDateFrom(''); setDateTo(''); }}
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
          Mostrando {filtered.length} pedido(s) en el rango seleccionado
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

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Total Productos"    value={products.length}  icon={Package}       color="bg-blue-500"   />
        <StatCard label="Total Clientes"     value={activeClients}    icon={Users}         color="bg-emerald-500"/>
        <StatCard label="Pedidos Pendientes" value={pendingOrders}    icon={ShoppingCart}  color="bg-yellow-500" />
        <StatCard label="Total Pedidos"      value={filtered.length}  icon={ClipboardList} color="bg-purple-500" />
      </div>

      {/* Top products + Recent orders */}
      <div className="flex gap-4 items-start">

        {/* Top 10 — 40% */}
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

        {/* Pedidos recientes — 60% */}
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-base font-semibold text-gray-800">Pedidos Recientes</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Pedido</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Cliente</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Fecha</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Total</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentOrders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-400">
                      No hay pedidos en el periodo seleccionado
                    </td>
                  </tr>
                ) : recentOrders.map(order => {
                  const style = STATUS_STYLES[order.status] || {};
                  return (
                    <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm font-mono font-medium text-blue-700">{order.id}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{getClientName(order)}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{(order.createdAt || '').slice(0, 10)}</td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-800">{formatCOP(order.total)}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${style.bg} ${style.text} ${style.border}`}>
                          {order.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Histórico de consumos */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="mb-6">
          <h3 className="text-base font-semibold text-gray-800">Histórico de Consumos</h3>
          <p className="text-xs text-gray-400 mt-0.5">Monto total de pedidos por mes{isFiltered ? ' · filtrado por periodo' : ''}</p>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}    />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#9ca3af', fontFamily: 'Montserrat' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={v => v === 0 ? '0' : `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#9ca3af', fontFamily: 'Montserrat' }} axisLine={false} tickLine={false} width={52} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2.5} fill="url(#colorTotal)"
              dot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }}
              activeDot={{ r: 6, fill: '#1d4ed8', strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
}
