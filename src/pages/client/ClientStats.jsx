import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3, TrendingUp, Package, Users, Calendar, AlertCircle, Download,
  Filter, Wallet, Receipt, DollarSign, CalendarDays, X, UserCircle, FileSpreadsheet,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { statsApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { formatCOP, STATUS_STYLES, statusLabel } from '../../data/mockData';

// Colores consistentes para las 3 curvas de Subtotal/IVA/Total en todos los dashboards.
const SERIES_COLORS = { subtotal: '#10b981', iva: '#f59e0b', total: '#2563eb' };

const inputCls = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';

function sixMonthsAgoISO() {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return d.toISOString().slice(0, 10);
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 space-y-1">
      <p className="text-xs font-semibold text-gray-500 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} className="text-sm font-semibold flex items-center gap-2" style={{ color: p.color }}>
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          {p.name}: {formatCOP(p.value)}
        </p>
      ))}
    </div>
  );
}

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
  const { currentUser } = useAuth();
  const { companies, users, categories, granCategorias } = useApp();
  const [stats, setStats]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [sucursalFilter, setSucursalFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [granCategoriaFilter, setGranCategoriaFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [dateFrom, setDateFrom] = useState(sixMonthsAgoISO());
  const [dateTo, setDateTo]     = useState('');
  const [exporting, setExporting] = useState(false);

  const isAdminEmpresa  = currentUser?.clientRole === 'admin_empresa';
  const isSupervisor    = currentUser?.clientRole === 'supervisor';
  const isAdminContrato = currentUser?.clientRole === 'administrador_contrato';
  // Filtros de usuario-gestor y linea de producto solo tienen sentido en
  // vistas agregadas (varios usuarios/pedidos), no para creador_pedidos.
  const canFilterAdvanced = isAdminEmpresa || isSupervisor || isAdminContrato;
  // administrador_contrato ve toda la empresa igual que admin_empresa (con filtro de sede opcional).
  const isCompanyWideView = isAdminEmpresa || isAdminContrato;
  const company = isCompanyWideView ? companies.find(c => c.id === currentUser?.companyId) : null;
  const sucursales = company?.sucursales || [];

  // Usuarios "gestores" que pueden filtrarse: clientes de la misma empresa,
  // acotados a la sucursal del supervisor (o a la sede elegida por admin_empresa/administrador_contrato).
  const managerUsers = useMemo(() => {
    return (users || []).filter(u => {
      if (u.role !== 'client') return false;
      if (isSupervisor) return u.sucursalId === currentUser?.sucursalId;
      if (isCompanyWideView && sucursalFilter) return u.sucursalId === Number(sucursalFilter);
      return true;
    });
  }, [users, isSupervisor, isCompanyWideView, sucursalFilter, currentUser?.sucursalId]);

  const isDateFiltered = dateFrom !== sixMonthsAgoISO() || dateTo;
  const isFiltered = isDateFiltered || sucursalFilter || userFilter || granCategoriaFilter || categoryFilter;

  function buildParams() {
    const params = {};
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo)   params.dateTo   = dateTo;
    if (sucursalFilter) params.sucursalId = sucursalFilter;
    if (userFilter)     params.userId = userFilter;
    if (categoryFilter) params.categoryId = categoryFilter;
    else if (granCategoriaFilter) params.granCategoriaId = granCategoriaFilter;
    return params;
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    statsApi.client(buildParams())
      .then(s => { if (!cancelled) setStats(s); })
      .catch(err => { if (!cancelled) setError(err?.message || 'Error cargando estadisticas'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, sucursalFilter, userFilter, categoryFilter, granCategoriaFilter]);

  function clearFilters() {
    setDateFrom(sixMonthsAgoISO());
    setDateTo('');
    setSucursalFilter('');
    setUserFilter('');
    setGranCategoriaFilter('');
    setCategoryFilter('');
  }

  function handleSelectGranCategoria(id) {
    setGranCategoriaFilter(id);
    if (categoryFilter && categories.find(c => c.id === Number(categoryFilter))?.granCategoriaId !== Number(id)) {
      setCategoryFilter('');
    }
  }

  async function handleExportExcel() {
    setExporting(true);
    try {
      const blob = await statsApi.exportOrders({ ...buildParams(), format: 'xlsx' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `estadisticas_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      alert(err?.message || 'No se pudo exportar');
    } finally {
      setExporting(false);
    }
  }

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
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 text-blue-700 rounded-xl flex items-center justify-center">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Estadisticas</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {isCompanyScope ? 'Resumen de pedidos de tu empresa' : 'Resumen de tus pedidos'}
              {sucursalFilter && sucursales.find(s => s.id === Number(sucursalFilter)) && (
                <span className="ml-2 text-blue-700 font-medium">
                  · {sucursales.find(s => s.id === Number(sucursalFilter))?.name}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Filtro de fecha — todos los roles */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm">
            <CalendarDays className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="text-xs font-medium text-gray-500">Desde</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} />
            <span className="text-xs font-medium text-gray-500">Hasta</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} />
          </div>
          {isFiltered && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 border border-gray-200 rounded-xl transition"
            >
              <X className="w-4 h-4" />
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Filtros avanzados (usuario gestor, linea de producto, sede) — solo vistas agregadas */}
      {canFilterAdvanced && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
            <select
              value={userFilter}
              onChange={e => setUserFilter(e.target.value)}
              className="pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[200px]"
              title="Usuario gestor"
            >
              <option value="">Todos los usuarios</option>
              {managerUsers.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>

          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
            <select
              value={granCategoriaFilter}
              onChange={e => handleSelectGranCategoria(e.target.value)}
              className="pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[190px]"
              title="Linea de producto (grande)"
            >
              <option value="">Todas las lineas</option>
              {granCategorias.filter(g => g.active).map(gc => (
                <option key={gc.id} value={gc.id}>{gc.name}</option>
              ))}
            </select>
          </div>

          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[200px]"
              title="Linea de producto (pequeña)"
            >
              <option value="">Todas las sublineas</option>
              {categories
                .filter(c => c.active && (!granCategoriaFilter || c.granCategoriaId === Number(granCategoriaFilter)))
                .map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
            </select>
          </div>

          {isCompanyWideView && sucursales.length > 0 && (
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
              <select
                value={sucursalFilter}
                onChange={e => setSucursalFilter(e.target.value)}
                className="pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[200px]"
                title="Sede"
              >
                <option value="">General (todas las sedes)</option>
                {sucursales.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.city ? ` — ${s.city}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {isCompanyWideView ? (
            <Link
              to="/cliente/reportes"
              className="flex items-center gap-1.5 px-4 py-2 border border-emerald-300 bg-emerald-50 rounded-lg text-sm text-emerald-700 hover:bg-emerald-100 transition font-medium ml-auto"
              title="Generar reportes de tu empresa"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Generar reporte
            </Link>
          ) : (
            <button
              onClick={handleExportExcel}
              disabled={exporting}
              className="flex items-center gap-1.5 px-4 py-2 border border-emerald-300 bg-emerald-50 rounded-lg text-sm text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 transition font-medium ml-auto"
              title="Exportar a Excel"
            >
              <Download className="w-4 h-4" />
              {exporting ? 'Generando...' : 'Exportar Excel'}
            </button>
          )}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard icon={Package}    label="Pedidos"     value={stats.totalOrders} accent="blue" />
        <StatCard icon={Wallet}     label="Subtotal"    value={formatCOP(stats.totalSubtotal)} accent="emerald" />
        <StatCard icon={Receipt}    label="IVA 19%"     value={formatCOP(stats.totalIva19 ?? stats.totalIva)} accent="amber" />
        <StatCard icon={Receipt}    label="IVA 5%"      value={formatCOP(stats.totalIva5 ?? 0)} accent="amber" />
        <StatCard icon={Receipt}    label="Base exenta" value={formatCOP(stats.totalExentoBase ?? 0)} accent="blue" />
        <StatCard icon={DollarSign} label="Total"       value={formatCOP(stats.totalSpent)} accent="rose" />
      </div>

      {/* Presupuesto anual — solo admin_empresa con presupuesto configurado */}
      {isCompanyScope && stats.annualBudget != null && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Presupuesto anual</h3>
              <p className="text-xs text-gray-400">Calculado sobre pedidos entregados del anio actual</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3">
            <div>
              <p className="text-xs text-gray-500">Asignado</p>
              <p className="text-xl font-bold text-gray-900">{formatCOP(stats.annualBudget)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Gastado</p>
              <p className="text-xl font-bold text-rose-600">{formatCOP(stats.budgetSpent || 0)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Disponible</p>
              <p className="text-xl font-bold text-emerald-600">{formatCOP(stats.budgetAvailable ?? 0)}</p>
            </div>
          </div>
          {(() => {
            const pct = stats.annualBudget > 0
              ? Math.min(100, Math.round(((stats.budgetSpent || 0) / stats.annualBudget) * 100))
              : 0;
            const barColor = pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500';
            return (
              <div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs text-gray-500 mt-1">{pct}% utilizado</p>
              </div>
            );
          })()}
        </div>
      )}

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
                        {statusLabel(status)}
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
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={stats.monthly} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorClientSubtotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={SERIES_COLORS.subtotal} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={SERIES_COLORS.subtotal} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorClientIva" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={SERIES_COLORS.iva} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={SERIES_COLORS.iva} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorClientTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={SERIES_COLORS.total} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={SERIES_COLORS.total} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af', fontFamily: 'Montserrat' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => v === 0 ? '0' : `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#9ca3af', fontFamily: 'Montserrat' }} axisLine={false} tickLine={false} width={48} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, fontFamily: 'Montserrat' }} />
                <Area type="monotone" name="Subtotal" dataKey="subtotal" stroke={SERIES_COLORS.subtotal} strokeWidth={2} fill="url(#colorClientSubtotal)" dot={false} activeDot={{ r: 5 }} />
                <Area type="monotone" name="IVA" dataKey="iva" stroke={SERIES_COLORS.iva} strokeWidth={2} fill="url(#colorClientIva)" dot={false} activeDot={{ r: 5 }} />
                <Area type="monotone" name="Total" dataKey="revenue" stroke={SERIES_COLORS.total} strokeWidth={2.5} fill="url(#colorClientTotal)" dot={false} activeDot={{ r: 6 }} />
              </AreaChart>
            </ResponsiveContainer>
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
