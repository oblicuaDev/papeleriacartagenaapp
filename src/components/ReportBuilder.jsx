import { useEffect, useMemo, useState } from "react";
import {
  FileSpreadsheet,
  ClipboardList,
  Package,
  Users,
  ListChecks,
  Filter,
  CalendarDays,
  Download,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { reportsApi, sucursalesApi } from "../services/api";
import { useApp } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";

const inputCls =
  "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-full";

const DATASET_META = {
  orders: { label: "Pedidos", hint: "Una fila por pedido", icon: ClipboardList },
  order_items: { label: "Ítems de pedido", hint: "Una fila por producto pedido", icon: ListChecks },
  products: { label: "Productos", hint: "Catálogo completo", icon: Package },
  users: { label: "Usuarios", hint: "Clientes, asesores, repartidores", icon: Users },
};
const DATASET_ORDER = ["orders", "order_items", "products", "users"];
// Orden preferido; los datasets realmente disponibles vienen del backend (meta).
function orderedDatasets(meta) {
  const keys = Object.keys(meta || {});
  return DATASET_ORDER.filter((k) => keys.includes(k)).concat(
    keys.filter((k) => !DATASET_ORDER.includes(k)),
  );
}

const ORDER_STATUSES = [
  "Pendiente por aprobar",
  "Rechazado",
  "Pendiente",
  "Validar disponibilidad",
  "Alistamiento",
  "En Ruta",
  "Entregado",
];
const USER_ROLES = ["admin", "advisor", "client", "delivery"];

const FILTER_LABELS = {
  status: "Estado",
  advisorId: "Asesor",
  companyId: "Empresa",
  sucursalId: "Sucursal",
  categoryId: "Categoría",
  granCategoriaId: "Gran categoría",
  role: "Rol",
  active: "Estado",
};

// Constructor de reportes reutilizable. Lo usan la página de admin
// (todas las empresas) y la de administrador de empresa/contrato
// (el backend fuerza el scope a su empresa).
export default function ReportBuilder() {
  const { companies, users, categories, granCategorias } = useApp();
  const { currentUser } = useAuth();
  const isCompanyScoped = currentUser?.role !== "admin";

  const advisors = useMemo(
    () => (users || []).filter((u) => u.role === "advisor"),
    [users],
  );

  const [meta, setMeta] = useState(null);
  const [metaError, setMetaError] = useState(null);

  const [dataset, setDataset] = useState("orders");
  const [selectedCols, setSelectedCols] = useState([]);
  const [filters, setFilters] = useState({});
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [limit, setLimit] = useState(1000);
  const [format, setFormat] = useState("xlsx");

  const [sucursales, setSucursales] = useState([]);
  const [count, setCount] = useState(null);
  const [counting, setCounting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    reportsApi
      .meta()
      .then(setMeta)
      .catch(() => setMetaError("No se pudo cargar la configuración de reportes."));
  }, []);

  const datasetKeys = useMemo(() => orderedDatasets(meta), [meta]);
  const dsMeta = meta?.[dataset];
  const availableColumns = dsMeta?.columns || [];
  const availableFilters = dsMeta?.filters || [];

  // Si el dataset seleccionado no está disponible (p. ej. cliente que solo ve
  // Pedidos/Ítems), saltar al primero disponible.
  useEffect(() => {
    if (datasetKeys.length && !datasetKeys.includes(dataset)) {
      setDataset(datasetKeys[0]);
    }
  }, [datasetKeys, dataset]);

  useEffect(() => {
    if (!dsMeta) return;
    setSelectedCols(dsMeta.columns.map((c) => c.key));
    setFilters({});
    setCount(null);
    setError(null);
  }, [dataset, meta]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sucursales para el filtro sucursalId.
  useEffect(() => {
    if (isCompanyScoped) {
      const c = (companies || []).find((x) => x.id === currentUser?.companyId);
      setSucursales(c?.sucursales || []);
      return;
    }
    if (!filters.companyId) {
      setSucursales([]);
      return;
    }
    sucursalesApi
      .list(filters.companyId)
      .then((rows) => setSucursales(rows || []))
      .catch(() => setSucursales([]));
  }, [filters.companyId, isCompanyScoped, companies, currentUser?.companyId]);

  const params = useMemo(() => {
    const p = {};
    for (const [k, v] of Object.entries(filters)) {
      if (v !== "" && v != null) p[k] = v;
    }
    if (dateFrom) p.dateFrom = dateFrom;
    if (dateTo) p.dateTo = dateTo;
    return p;
  }, [filters, dateFrom, dateTo]);

  useEffect(() => {
    if (!dsMeta) return;
    setCounting(true);
    const t = setTimeout(() => {
      reportsApi
        .count(dataset, params)
        .then((n) => setCount(n))
        .catch(() => setCount(null))
        .finally(() => setCounting(false));
    }, 400);
    return () => clearTimeout(t);
  }, [dataset, params, dsMeta]);

  function toggleCol(key) {
    setSelectedCols((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  async function handleGenerate() {
    setError(null);
    setGenerating(true);
    try {
      const blob = await reportsApi.generate(dataset, {
        ...params,
        columns: selectedCols.join(","),
        limit: String(limit),
        format,
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `reporte_${dataset}_${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError(e.message || "No se pudo generar el reporte.");
    } finally {
      setGenerating(false);
    }
  }

  function renderFilter(name) {
    const val = filters[name] ?? "";
    const set = (v) => setFilters((f) => ({ ...f, [name]: v }));
    const common = { className: inputCls, value: val, onChange: (e) => set(e.target.value) };

    if (name === "status") {
      return (
        <select {...common}>
          <option value="">Todos</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      );
    }
    if (name === "role") {
      return (
        <select {...common}>
          <option value="">Todos</option>
          {USER_ROLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      );
    }
    if (name === "active") {
      return (
        <select {...common}>
          <option value="">Todos</option>
          <option value="true">Activos</option>
          <option value="false">Inactivos</option>
        </select>
      );
    }
    if (name === "advisorId") {
      return (
        <select {...common}>
          <option value="">Todos</option>
          {advisors.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      );
    }
    if (name === "companyId") {
      return (
        <select {...common}>
          <option value="">Todas</option>
          {(companies || []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      );
    }
    if (name === "sucursalId") {
      const canPick = isCompanyScoped || !!filters.companyId;
      return (
        <select {...common} disabled={!canPick}>
          <option value="">{canPick ? "Todas" : "Elige una empresa primero"}</option>
          {sucursales.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      );
    }
    if (name === "categoryId") {
      return (
        <select {...common}>
          <option value="">Todas</option>
          {(categories || []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      );
    }
    if (name === "granCategoriaId") {
      return (
        <select {...common}>
          <option value="">Todas</option>
          {(granCategorias || []).map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      );
    }
    return null;
  }

  if (metaError) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4" /> {metaError}
        </div>
      </div>
    );
  }

  const stepCard = "bg-white rounded-xl shadow-sm border border-gray-100 p-5";
  const stepTitle = "flex items-center gap-2 text-sm font-semibold text-gray-800 mb-4";

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FileSpreadsheet className="w-6 h-6 text-blue-700" /> Reportes
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Arma tu propio reporte: elige qué datos, qué columnas, el rango de fechas y cuántos registros.
          {isCompanyScoped && " Solo verás la información de tu empresa."}
        </p>
      </div>

      {/* Paso 1 — Dataset */}
      <div className={stepCard}>
        <p className={stepTitle}>
          <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-bold">1</span>
          ¿Qué quieres exportar?
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {datasetKeys.map((key) => {
            const m = DATASET_META[key] || { label: key, hint: "", icon: FileSpreadsheet };
            const Icon = m.icon;
            const activeDs = dataset === key;
            return (
              <button
                key={key}
                onClick={() => setDataset(key)}
                className={`text-left border rounded-xl p-3 transition ${
                  activeDs
                    ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <Icon className={`w-5 h-5 mb-2 ${activeDs ? "text-blue-700" : "text-gray-400"}`} />
                <p className="text-sm font-semibold text-gray-800">{m.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{m.hint}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Paso 2 — Columnas */}
      <div className={stepCard}>
        <div className="flex items-center justify-between mb-4">
          <p className={stepTitle + " mb-0"}>
            <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-bold">2</span>
            Columnas ({selectedCols.length}/{availableColumns.length})
          </p>
          <div className="flex gap-2 text-xs">
            <button
              onClick={() => setSelectedCols(availableColumns.map((c) => c.key))}
              className="text-blue-700 hover:underline"
            >
              Todas
            </button>
            <span className="text-gray-300">·</span>
            <button
              onClick={() => setSelectedCols([])}
              className="text-blue-700 hover:underline"
            >
              Ninguna
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {availableColumns.map((c) => (
            <label
              key={c.key}
              className="flex items-center gap-2 text-sm text-gray-700 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedCols.includes(c.key)}
                onChange={() => toggleCol(c.key)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              {c.header}
            </label>
          ))}
        </div>
      </div>

      {/* Paso 3 — Filtros y rango */}
      <div className={stepCard}>
        <p className={stepTitle}>
          <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-bold">3</span>
          <Filter className="w-4 h-4 text-gray-400" /> Filtros y rango de fechas
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
              <CalendarDays className="w-3.5 h-3.5" /> Desde
            </label>
            <input type="date" className={inputCls} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
              <CalendarDays className="w-3.5 h-3.5" /> Hasta
            </label>
            <input type="date" className={inputCls} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          {availableFilters.map((name) => (
            <div key={name}>
              <label className="block text-xs font-medium text-gray-500 mb-1">{FILTER_LABELS[name] || name}</label>
              {renderFilter(name)}
            </div>
          ))}
        </div>
      </div>

      {/* Paso 4 — Registros y formato */}
      <div className={stepCard}>
        <p className={stepTitle}>
          <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-bold">4</span>
          Registros y formato
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Máximo de registros</label>
            <input
              type="number"
              min={1}
              max={50000}
              className={inputCls}
              value={limit}
              onChange={(e) => setLimit(Math.min(50000, Math.max(1, Number(e.target.value) || 1)))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Formato</label>
            <div className="flex gap-2">
              {["xlsx", "csv"].map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                    format === f
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          {counting
            ? "Calculando registros…"
            : count == null
              ? "—"
              : `≈ ${count.toLocaleString("es-CO")} registros con estos filtros` +
                (count > limit ? ` (se exportarán los primeros ${limit.toLocaleString("es-CO")})` : "")}
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleGenerate}
          disabled={generating || selectedCols.length === 0}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Generar reporte
        </button>
      </div>
    </div>
  );
}
