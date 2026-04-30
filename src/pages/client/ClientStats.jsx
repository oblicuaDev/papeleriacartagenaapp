import { useEffect, useState } from 'react';
import { BarChart3, TrendingUp, Package, Users, Calendar, AlertCircle } from 'lucide-react';
import { statsApi } from '../../services/api';
import { formatCOP, STATUS_STYLES } from '../../data/mockData';

function StatCard({ icon: Icon, label, value, accent = 'blue' }) {
  const accents = {
    blue:    'bg-blue-50 text-blue-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber:   'bg-amber-50 text-amber-700',
    rose:    'bg-rose-50 text-rose-700',
  };
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${accents[accent]}`}>
          <Icon className="w-4 h-4" />
        </div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

export default function ClientStats() {
  const [stats, setStats]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    let cancelled = false;
    statsApi.client()
      .then(s => { if (!cancelled) setStats(s); })
      .catch(err => { if (!cancelled) setError(err?.message || 'Error cargando estadisticas'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <p className="text-sm text-gray-400 py-12 text-center">Cargando estadisticas...</p>;
  }
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-start gap-3 text-red-700">
        <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-sm">No se pudieron cargar las estadisticas</p>
          <p className="text-xs mt-1">{error}</p>
        </div>
      </div>
    );
  }
  if (!stats) return null;

  const isCompanyScope = stats.scope === 'company';
  const statusEntries = Object.entries(stats.ordersByStatus || {});
  const maxStatusCount = Math.max(1, ...statusEntries.map(([, v]) => v));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-100 text-blue-700 rounded-xl flex items-center justify-center">
          <BarChart3 className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Estadisticas</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {isCompanyScope ? 'Resumen de pedidos de tu empresa' : 'Resumen de tus pedidos'}
          </p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Package}    label="Pedidos totales"  value={stats.totalOrders}      accent="blue" />
        <StatCard icon={Calendar}   label="Pedidos este mes" value={stats.ordersThisMonth}  accent="amber" />
        <StatCard icon={TrendingUp} label="Gasto total"      value={formatCOP(stats.totalSpent)}    accent="emerald" />
        <StatCard icon={TrendingUp} label="Gasto este mes"   value={formatCOP(stats.spentThisMonth)} accent="emerald" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Status breakdown */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Pedidos por estado</h3>
          {statusEntries.length === 0 ? (
            <p className="text-xs text-gray-400 py-4">Sin pedidos registrados</p>
          ) : (
            <ul className="space-y-3">
              {statusEntries.map(([status, count]) => {
                const style = STATUS_STYLES[status] || { bg: 'bg-gray-100', text: 'text-gray-700' };
                const pct   = (count / maxStatusCount) * 100;
                return (
                  <li key={status}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${style.bg} ${style.text}`}>
                        {status}
                      </span>
                      <span className="text-sm font-semibold text-gray-700">{count}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Monthly evolution */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Evolucion mensual</h3>
          {(stats.monthly || []).length === 0 ? (
            <p className="text-xs text-gray-400 py-4">Sin datos</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wider">
                    <th className="text-left py-2">Mes</th>
                    <th className="text-right py-2">Pedidos</th>
                    <th className="text-right py-2">Gasto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {stats.monthly.map(m => (
                    <tr key={m.month}>
                      <td className="py-2 font-mono text-xs text-gray-600">{m.month}</td>
                      <td className="py-2 text-right text-gray-700">{m.orders}</td>
                      <td className="py-2 text-right font-semibold text-gray-800">{formatCOP(m.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Top products + Top users */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Package className="w-4 h-4 text-gray-500" />
            Top productos {isCompanyScope ? '(empresa)' : '(propios)'}
          </h3>
          {(stats.topProducts || []).length === 0 ? (
            <p className="text-xs text-gray-400 py-4">Sin productos</p>
          ) : (
            <ul className="space-y-2">
              {stats.topProducts.map(p => (
                <li key={p.productId} className="flex items-center gap-3 py-1.5">
                  <span className="text-xs text-gray-400 font-mono w-12 truncate">{p.sku}</span>
                  <span className="flex-1 text-sm text-gray-700 truncate">{p.productName}</span>
                  <span className="text-xs text-gray-400">{p.quantity} u.</span>
                  <span className="text-sm font-semibold text-gray-800 w-24 text-right">{formatCOP(p.revenue)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {isCompanyScope && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Users className="w-4 h-4 text-gray-500" />
              Top compradores
            </h3>
            {(stats.topUsers || []).length === 0 ? (
              <p className="text-xs text-gray-400 py-4">Sin actividad</p>
            ) : (
              <ul className="space-y-2">
                {stats.topUsers.map(u => (
                  <li key={u.userId} className="flex items-center gap-3 py-1.5">
                    <span className="flex-1 text-sm text-gray-700 truncate">{u.userName}</span>
                    <span className="text-xs text-gray-400">{u.orders} ped.</span>
                    <span className="text-sm font-semibold text-gray-800 w-24 text-right">{formatCOP(u.revenue)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
