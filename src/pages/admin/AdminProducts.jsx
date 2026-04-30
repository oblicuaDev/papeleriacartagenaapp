import { useState, useRef } from "react";
import {
  Plus,
  Search,
  Pencil,
  Eye,
  EyeOff,
  Upload,
  X,
  Filter,
  Camera,
  Link2,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Loader2,
} from "lucide-react";
import * as XLSX from "xlsx";
import productFallback from "../../product.webp";
import { useApp } from "../../context/AppContext";
import { productsApi } from "../../services/api";
import { formatCOP } from "../../data/mockData";

const UNITS = ["Unidad", "Resma", "Caja", "Paquete", "Pliego", "Set", "Rollo"];

function parseExcelRows(workbook, categories) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  const catMap = {};
  categories.forEach((c) => {
    catMap[c.name.toLowerCase().trim()] = c.id;
  });

  return raw.map((row, i) => {
    // Normalize keys: trim + lowercase for matching
    const get = (...keys) => {
      for (const k of keys) {
        const found = Object.keys(row).find(
          (rk) => rk.trim().toLowerCase() === k.toLowerCase(),
        );
        if (found !== undefined) return String(row[found]).trim();
      }
      return "";
    };

    const sku = get("sku", "código", "codigo", "ref", "referencia");
    const name = get("nombre", "name", "producto");
    const categoryRaw = get("categoría", "categoria", "category");
    const description = get(
      "descripción",
      "descripcion",
      "description",
      "desc",
    );
    const basePriceRaw = get(
      "precio base",
      "precio",
      "price",
      "basePrice",
      "valor",
    );
    const stockRaw = get("stock", "inventario", "cantidad");
    const unitRaw = get("unidad", "unit", "unidad de medida");

    const basePrice =
      parseFloat(String(basePriceRaw).replace(/[^0-9.]/g, "")) || 0;
    const stock = parseInt(String(stockRaw).replace(/[^0-9]/g, ""), 10) || 0;
    const unit =
      UNITS.find((u) => u.toLowerCase() === unitRaw.toLowerCase()) || "Unidad";
    const categoryId = catMap[categoryRaw.toLowerCase().trim()] || null;

    const errors = [];
    if (!sku) errors.push("SKU requerido");
    if (!name) errors.push("Nombre requerido");
    if (!categoryId) errors.push(`Categoría "${categoryRaw}" no encontrada`);
    if (basePriceRaw === "" || basePrice < 0)
      errors.push("Precio base inválido");

    return {
      _row: i + 2,
      sku,
      name,
      categoryRaw,
      categoryId,
      description,
      basePrice,
      stock,
      unit,
      errors,
    };
  });
}

const EMPTY_FORM = {
  name: "",
  sku: "",
  categoryId: "",
  description: "",
  basePrice: "",
  stock: "",
  unit: "Unidad",
  active: true,
  image: null,
  complementaryIds: [],
};

const IMPORT_STEPS = { UPLOAD: "upload", PREVIEW: "preview", DONE: "done" };

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export default function AdminProducts() {
  const { products, setProducts, categories, refreshProducts } = useApp();
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [crossSearch, setCrossSearch] = useState("");
  const [importStep, setImportStep] = useState(IMPORT_STEPS.UPLOAD);
  const [importRows, setImportRows] = useState([]);
  const [importFileName, setImportFileName] = useState("");
  const [importDoneCount, setImportDoneCount] = useState(0);
  const [importing, setImporting] = useState(false);
  const importFileRef = useRef(null);

  const filtered = products.filter((p) => {
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCategory
      ? p.categoryId === Number(filterCategory)
      : true;
    return matchSearch && matchCat;
  });

  function getCategoryName(id) {
    return categories.find((c) => c.id === id)?.name || "—";
  }

  function openCreate() {
    setEditProduct(null);
    setForm(EMPTY_FORM);
    setCrossSearch("");
    setSaveError("");
    setShowModal(true);
  }

  function openEdit(product) {
    setEditProduct(product);
    setForm({
      name: product.name,
      sku: product.sku,
      categoryId: String(product.categoryId),
      description: product.description,
      basePrice: String(product.basePrice),
      stock: String(product.stock),
      unit: product.unit,
      active: product.active,
      image: product.image || null,
      complementaryIds: product.complementaryIds || [],
    });
    setCrossSearch("");
    setSaveError("");
    setShowModal(true);
  }

  function handleImageChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setForm((f) => ({ ...f, image: ev.target.result }));
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    if (!form.name || !form.sku || !form.categoryId || !form.basePrice) return;
    setSaving(true);
    setSaveError("");
    const payload = {
      name: form.name,
      sku: form.sku,
      categoryId: Number(form.categoryId),
      description: form.description,
      basePrice: Number(form.basePrice),
      stock: Number(form.stock),
      unit: form.unit,
      active: form.active,
      complementaryIds: form.complementaryIds,
    };
    try {
      if (editProduct) {
        await productsApi.update(editProduct.id, payload);
      } else {
        await productsApi.create(payload);
      }
      await refreshProducts();
      setShowModal(false);
    } catch (err) {
      setSaveError(err.message || "Error al guardar el producto");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(id) {
    const product = products.find((p) => p.id === id);
    if (!product) return;
    try {
      await productsApi.update(id, { active: !product.active });
      await refreshProducts();
    } catch (err) {
      console.error("toggleActive error:", err);
    }
  }

  function openImport() {
    setImportStep(IMPORT_STEPS.UPLOAD);
    setImportRows([]);
    setImportFileName("");
    setImportDoneCount(0);
    setShowImport(true);
  }

  function handleImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: "array" });
      const rows = parseExcelRows(wb, categories);
      setImportRows(rows);
      setImportStep(IMPORT_STEPS.PREVIEW);
    };
    reader.readAsArrayBuffer(file);
  }

  async function handleConfirmImport() {
    const valid = importRows.filter((r) => r.errors.length === 0);
    setImporting(true);
    let created = 0;
    const failed = [];
    for (const r of valid) {
      try {
        await productsApi.create({
          name: r.name,
          sku: r.sku,
          categoryId: r.categoryId,
          description: r.description,
          basePrice: r.basePrice,
          stock: r.stock,
          unit: r.unit,
          active: true,
          complementaryIds: [],
        });
        created++;
      } catch (err) {
        failed.push({ sku: r.sku, reason: err.message });
      }
    }
    await refreshProducts();
    setImporting(false);
    setImportDoneCount(created);
    // Marcar en preview las filas que fallaron en la API
    if (failed.length) {
      setImportRows((prev) =>
        prev.map((r) => {
          const f = failed.find((x) => x.sku === r.sku);
          return f ? { ...r, errors: [...r.errors, `API: ${f.reason}`] } : r;
        }),
      );
    }
    setImportStep(IMPORT_STEPS.DONE);
  }

  const inputClass =
    "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Catálogo de Productos
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {products.length} productos en total
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={openImport}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
          >
            <Upload className="w-4 h-4" />
            Importar Excel
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition"
          >
            <Plus className="w-4 h-4" />
            Nuevo Producto
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o SKU..."
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white appearance-none"
          >
            <option value="">Todas las categorías</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">
                  Imagen
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">
                  SKU
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">
                  Nombre
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">
                  Categoría
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">
                  Precio Base
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">
                  Stock
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">
                  Unidad
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">
                  Estado
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((product) => (
                <tr
                  key={product.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <img
                      src={product.image || productFallback}
                      alt={product.name}
                      className="w-11 h-11 object-cover rounded-lg border border-gray-100"
                    />
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-500">
                    {product.sku}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-800 max-w-xs">
                    <div className="truncate">{product.name}</div>
                    <div className="text-xs text-gray-400 truncate">
                      {product.description}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full font-medium">
                      {getCategoryName(product.categoryId)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-800">
                    {formatCOP(product.basePrice)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {product.stock}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {product.unit}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-1 rounded-full font-medium ${product.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}
                    >
                      {product.active ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEdit(product)}
                        className="p-1.5 text-gray-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition"
                        title="Editar"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => toggleActive(product.id)}
                        className="p-1.5 text-gray-500 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition"
                        title={product.active ? "Desactivar" : "Activar"}
                      >
                        {product.active ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-10 text-center text-sm text-gray-400"
                  >
                    No se encontraron productos
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Product Modal */}
      {showModal && (
        <Modal
          title={editProduct ? "Editar Producto" : "Nuevo Producto"}
          onClose={() => setShowModal(false)}
        >
          <div className="space-y-4">
            {/* Image Upload */}
            <div>
              <label className={labelClass}>Imagen del Producto</label>
              <div className="relative group">
                <img
                  src={form.image || productFallback}
                  alt="preview"
                  className="w-full h-44 object-cover rounded-xl border border-gray-200"
                />
                <label className="absolute inset-0 flex flex-col items-center justify-center rounded-xl cursor-pointer bg-black bg-opacity-0 group-hover:bg-opacity-40 transition">
                  <Camera className="w-7 h-7 text-white opacity-0 group-hover:opacity-100 transition mb-1" />
                  <span className="text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition">
                    {form.image ? "Cambiar imagen" : "Subir imagen"}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageChange}
                  />
                </label>
                {form.image && (
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, image: null }))}
                    className="absolute top-2 right-2 p-1.5 bg-white rounded-full shadow text-gray-500 hover:text-red-600 transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Nombre *</label>
                <input
                  className={inputClass}
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="Nombre del producto"
                />
              </div>
              <div>
                <label className={labelClass}>SKU *</label>
                <input
                  className={inputClass}
                  value={form.sku}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, sku: e.target.value }))
                  }
                  placeholder="PAP-001"
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Categoría *</label>
              <select
                className={inputClass}
                value={form.categoryId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, categoryId: e.target.value }))
                }
              >
                <option value="">Seleccionar categoría</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Descripción</label>
              <textarea
                className={inputClass}
                rows={2}
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Descripción del producto"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Precio Base (COP) *</label>
                <input
                  className={inputClass}
                  type="number"
                  value={form.basePrice}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, basePrice: e.target.value }))
                  }
                  placeholder="0"
                />
              </div>
              <div>
                <label className={labelClass}>Stock</label>
                <input
                  className={inputClass}
                  type="number"
                  value={form.stock}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, stock: e.target.value }))
                  }
                  placeholder="0"
                />
              </div>
              <div>
                <label className={labelClass}>Unidad</label>
                <select
                  className={inputClass}
                  value={form.unit}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, unit: e.target.value }))
                  }
                >
                  {UNITS.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>
            {/* Complementary products (cross-selling) */}
            <div>
              <label className={labelClass + " flex items-center gap-1.5"}>
                <Link2 className="w-3.5 h-3.5 text-blue-500" />
                Productos complementarios{" "}
                <span className="text-gray-400 font-normal text-xs">
                  (cross-selling)
                </span>
              </label>

              {/* Selected chips */}
              {form.complementaryIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {form.complementaryIds.map((id) => {
                    const p = products.find((pr) => pr.id === id);
                    if (!p) return null;
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5 text-xs font-medium"
                      >
                        {p.name}
                        <button
                          type="button"
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              complementaryIds: f.complementaryIds.filter(
                                (i) => i !== id,
                              ),
                            }))
                          }
                          className="text-blue-400 hover:text-blue-700 transition"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
                <input
                  className={inputClass + " pl-8"}
                  value={crossSearch}
                  onChange={(e) => setCrossSearch(e.target.value)}
                  placeholder="Buscar productos a relacionar..."
                />
              </div>

              {/* Dropdown results */}
              {crossSearch.trim() &&
                (() => {
                  const q = crossSearch.toLowerCase();
                  const results = products
                    .filter(
                      (p) =>
                        p.id !== editProduct?.id &&
                        !form.complementaryIds.includes(p.id) &&
                        (p.name.toLowerCase().includes(q) ||
                          p.sku.toLowerCase().includes(q)),
                    )
                    .slice(0, 6);
                  return results.length > 0 ? (
                    <div className="border border-gray-200 rounded-lg mt-1 divide-y divide-gray-100 shadow-sm overflow-hidden">
                      {results.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setForm((f) => ({
                              ...f,
                              complementaryIds: [...f.complementaryIds, p.id],
                            }));
                            setCrossSearch("");
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-blue-50 transition"
                        >
                          <img
                            src={p.image || "/product.webp"}
                            alt={p.name}
                            className="w-7 h-7 rounded object-cover flex-shrink-0 border border-gray-100"
                            onError={(e) => {
                              e.target.src = "/product.webp";
                            }}
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">
                              {p.name}
                            </p>
                            <p className="text-xs text-gray-400 font-mono">
                              {p.sku}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 mt-1.5 px-1">
                      Sin resultados
                    </p>
                  );
                })()}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="active"
                checked={form.active}
                onChange={(e) =>
                  setForm((f) => ({ ...f, active: e.target.checked }))
                }
                className="rounded"
              />
              <label htmlFor="active" className="text-sm text-gray-700">
                Producto activo
              </label>
            </div>
            {saveError && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {saveError}
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowModal(false)}
                disabled={saving}
                className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editProduct ? "Guardar Cambios" : "Crear Producto"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Import Modal */}
      {showImport && (
        <Modal
          title="Importar Productos desde Excel"
          onClose={() => setShowImport(false)}
        >
          {/* ── Step 1: Upload ── */}
          {importStep === IMPORT_STEPS.UPLOAD && (
            <div className="space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600 space-y-1">
                <p className="font-medium text-gray-700 mb-1">
                  Columnas esperadas en la primera hoja:
                </p>
                <p>
                  <span className="font-mono bg-white border border-gray-200 px-1 rounded">
                    SKU
                  </span>{" "}
                  ·{" "}
                  <span className="font-mono bg-white border border-gray-200 px-1 rounded">
                    Nombre
                  </span>{" "}
                  ·{" "}
                  <span className="font-mono bg-white border border-gray-200 px-1 rounded">
                    Categoría
                  </span>{" "}
                  ·{" "}
                  <span className="font-mono bg-white border border-gray-200 px-1 rounded">
                    Descripción
                  </span>{" "}
                  ·{" "}
                  <span className="font-mono bg-white border border-gray-200 px-1 rounded">
                    Precio Base
                  </span>{" "}
                  ·{" "}
                  <span className="font-mono bg-white border border-gray-200 px-1 rounded">
                    Stock
                  </span>{" "}
                  ·{" "}
                  <span className="font-mono bg-white border border-gray-200 px-1 rounded">
                    Unidad
                  </span>
                </p>
                <p className="mt-1">
                  Categorías disponibles:{" "}
                  {categories.map((c) => c.name).join(", ")}
                </p>
                <p>Unidades válidas: {UNITS.join(", ")}</p>
              </div>

              <label
                className="flex flex-col items-center gap-3 border-2 border-dashed border-gray-300 rounded-xl p-10 text-center hover:border-blue-400 hover:bg-blue-50 transition cursor-pointer"
                onClick={() => importFileRef.current?.click()}
              >
                <FileSpreadsheet className="w-12 h-12 text-gray-300" />
                <span className="text-sm text-gray-500">
                  Arrastra tu archivo aquí o{" "}
                  <span className="text-blue-600 font-medium">
                    selecciona un archivo
                  </span>
                </span>
                <span className="text-xs text-gray-400">.xlsx, .xls, .csv</span>
              </label>
              <input
                ref={importFileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleImportFile}
              />

              <button
                onClick={() => setShowImport(false)}
                className="w-full py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
            </div>
          )}

          {/* ── Step 2: Preview ── */}
          {importStep === IMPORT_STEPS.PREVIEW &&
            (() => {
              const valid = importRows.filter((r) => r.errors.length === 0);
              const invalid = importRows.filter((r) => r.errors.length > 0);
              return (
                <div className="space-y-4">
                  <div className="flex items-center gap-4 text-sm">
                    <span className="flex items-center gap-1.5 text-green-700 font-medium">
                      <CheckCircle2 className="w-4 h-4" /> {valid.length}{" "}
                      válidos
                    </span>
                    {invalid.length > 0 && (
                      <span className="flex items-center gap-1.5 text-red-600 font-medium">
                        <AlertCircle className="w-4 h-4" /> {invalid.length} con
                        errores
                      </span>
                    )}
                    <span className="text-gray-400 text-xs ml-auto truncate max-w-[160px]">
                      {importFileName}
                    </span>
                  </div>

                  <div className="border border-gray-200 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2 text-gray-500 font-semibold">
                            Fila
                          </th>
                          <th className="text-left px-3 py-2 text-gray-500 font-semibold">
                            SKU
                          </th>
                          <th className="text-left px-3 py-2 text-gray-500 font-semibold">
                            Nombre
                          </th>
                          <th className="text-left px-3 py-2 text-gray-500 font-semibold">
                            Categoría
                          </th>
                          <th className="text-left px-3 py-2 text-gray-500 font-semibold">
                            Precio
                          </th>
                          <th className="text-left px-3 py-2 text-gray-500 font-semibold">
                            Estado
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {importRows.map((r, i) => (
                          <tr
                            key={i}
                            className={
                              r.errors.length ? "bg-red-50" : "bg-white"
                            }
                          >
                            <td className="px-3 py-1.5 text-gray-400">
                              {r._row}
                            </td>
                            <td className="px-3 py-1.5 font-mono text-gray-600">
                              {r.sku || (
                                <span className="text-red-400 italic">—</span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-gray-700 max-w-[120px] truncate">
                              {r.name || (
                                <span className="text-red-400 italic">—</span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-gray-600">
                              {r.categoryRaw || (
                                <span className="text-red-400 italic">—</span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-gray-600">
                              {r.basePrice ? (
                                formatCOP(r.basePrice)
                              ) : (
                                <span className="text-red-400 italic">—</span>
                              )}
                            </td>
                            <td className="px-3 py-1.5">
                              {r.errors.length === 0 ? (
                                <CheckCircle2 className="w-4 h-4 text-green-500" />
                              ) : (
                                <span className="text-red-500 flex items-start gap-1">
                                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                  <span>{r.errors.join(", ")}</span>
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {invalid.length > 0 && (
                    <p className="text-xs text-gray-500">
                      Las filas con errores serán omitidas. Solo se importarán
                      las {valid.length} filas válidas.
                    </p>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={() => setImportStep(IMPORT_STEPS.UPLOAD)}
                      className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
                    >
                      Volver
                    </button>
                    <button
                      onClick={handleConfirmImport}
                      disabled={valid.length === 0 || importing}
                      className="flex-1 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {importing && (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      )}
                      {importing
                        ? "Importando..."
                        : `Importar ${valid.length} producto${valid.length !== 1 ? "s" : ""}`}
                    </button>
                  </div>
                </div>
              );
            })()}

          {/* ── Step 3: Done ── */}
          {importStep === IMPORT_STEPS.DONE && (
            <div className="text-center space-y-4 py-4">
              <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
              <div>
                <p className="text-lg font-semibold text-gray-800">
                  {importDoneCount} producto{importDoneCount !== 1 ? "s" : ""}{" "}
                  importado{importDoneCount !== 1 ? "s" : ""}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Los productos ya están disponibles en el catálogo.
                </p>
              </div>
              <button
                onClick={() => setShowImport(false)}
                className="w-full py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition"
              >
                Cerrar
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
