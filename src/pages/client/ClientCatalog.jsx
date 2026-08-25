import { useState, useMemo, useEffect, useRef } from "react";
import { useOutletContext } from "react-router-dom";
import {
  ShoppingCart,
  Grid,
  List,
  Plus,
  Minus,
  X,
  Package,
  Filter,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Info,
  CheckCircle2,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { useAuth } from "../../context/AuthContext";
import { catalogApi } from "../../services/api";
import { formatCOP } from "../../data/mockData";
import productFallback from "../../product.webp";

const PAGE_SIZE = 24;

const CATEGORY_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-purple-100 text-purple-700",
  "bg-emerald-100 text-emerald-700",
  "bg-orange-100 text-orange-700",
  "bg-pink-100 text-pink-700",
];

function ProductImage({ image, name, className }) {
  return (
    <img
      src={image || productFallback}
      alt={name}
      className={className}
      onError={(e) => {
        e.target.src = productFallback;
      }}
    />
  );
}

function ProductModal({
  product,
  price,
  categoryName,
  categoryColor,
  onClose,
  onAdd,
  readOnly,
  related,
  onPickRelated,
}) {
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  // Reset al cambiar de producto (relacionado seleccionado)
  useEffect(() => {
    setAdded(false);
    setQty(1);
  }, [product?.id]);

  function handleAdd() {
    onAdd(qty);
    setAdded(true);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Image */}
        <div className="relative w-full h-64 bg-gray-50">
          <ProductImage
            image={product.imageUrl}
            name={product.name}
            className="w-full h-full object-contain p-4"
          />
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 bg-white rounded-full shadow text-gray-500 hover:text-gray-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
          {product.stock < 20 && product.stock > 0 && (
            <span className="absolute top-3 left-3 text-xs px-2 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700">
              Pocas unidades
            </span>
          )}
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-blue-600 font-mono">{product.sku}</p>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryColor}`}
              >
                {categoryName}
              </span>
            </div>
            <h3 className="text-lg font-bold text-gray-900 leading-snug">
              {product.name}
            </h3>
            {product.description && (
              <p className="text-sm text-gray-500 mt-1">
                {product.description}
              </p>
            )}
          </div>

          <div>
            <p className="text-2xl font-bold text-blue-700">
              {formatCOP(price)}
            </p>
            <p className="text-xs text-gray-400">por {product.unit} · IVA incluido (19%)</p>
          </div>

          {/* Quantity + Add — solo para roles que crean pedidos */}
          {!readOnly && !added && (
            <div className="flex items-center gap-3 pt-1">
              <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
                <button
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  className="w-9 h-9 flex items-center justify-center text-gray-600 hover:bg-gray-100 transition"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <input
                  type="number"
                  min={1}
                  value={qty}
                  onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
                  className="w-14 text-center py-2 text-sm font-medium focus:outline-none border-x border-gray-300"
                />
                <button
                  onClick={() => setQty((q) => q + 1)}
                  className="w-9 h-9 flex items-center justify-center text-gray-600 hover:bg-gray-100 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              <button
                onClick={handleAdd}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold transition"
              >
                <ShoppingCart className="w-4 h-4" />
                Agregar a mi pedido
              </button>
            </div>
          )}

          {/* Confirmacion + venta cruzada — visible solo despues de agregar. */}
          {added && (
            <div className="pt-1 space-y-3">
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-3 py-2 text-sm">
                <CheckCircle2 className="w-4 h-4" />
                <span><strong>{qty}</strong> {qty > 1 ? 'unidades agregadas' : 'unidad agregada'} al pedido</span>
              </div>

              {related && related.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-2">
                    Tambien podrian interesarte
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {related.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => onPickRelated && onPickRelated(r)}
                        className="text-left bg-gray-50 hover:bg-blue-50 border border-gray-100 hover:border-blue-200 rounded-lg p-2 transition"
                      >
                        <ProductImage
                          image={r.imageUrl}
                          name={r.name}
                          className="w-full h-14 object-contain mb-1"
                        />
                        <p className="text-[11px] font-medium text-gray-700 line-clamp-2 leading-snug">
                          {r.name}
                        </p>
                        <p className="text-xs font-bold text-blue-700 mt-0.5">
                          {formatCOP(r.price)}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
                >
                  Seguir comprando
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ClientCatalog() {
  const context = useOutletContext() || {};
  const headerSearch = context.search || "";
  const { categories, granCategorias, addToCart, orders } = useApp();
  const { currentUser } = useAuth();
  const isReadOnly = currentUser?.clientRole === "admin_empresa";
  const [selectedGranCategoria, setSelectedGranCategoria] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [viewMode, setViewMode] = useState("grid");
  const [modalProduct, setModalProduct] = useState(null);
  const [page, setPage] = useState(1);

  // Debounce del search del header (300ms) — evita un fetch por tecla.
  const [debouncedSearch, setDebouncedSearch] = useState(headerSearch);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(headerSearch), 300);
    return () => clearTimeout(t);
  }, [headerSearch]);

  // Resetea página al cambiar filtros/búsqueda.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, selectedGranCategoria, selectedCategory]);

  // Al cambiar la gran categoría, si la subcategoría elegida ya no pertenece
  // a ella, se limpia para evitar un filtro inconsistente.
  function handleSelectGranCategoria(id) {
    setSelectedGranCategoria(id);
    if (
      selectedCategory &&
      categories.find((c) => c.id === selectedCategory)?.granCategoriaId !== id
    ) {
      setSelectedCategory(null);
    }
  }

  // Fetch server-side: backend filtra por search + categoryId y pagina.
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const reqIdRef = useRef(0);

  useEffect(() => {
    const myReqId = ++reqIdRef.current;
    setLoading(true);
    const params = { page, limit: PAGE_SIZE };
    if (debouncedSearch) params.search = debouncedSearch;
    if (selectedCategory) params.categoryId = selectedCategory;
    if (selectedGranCategoria) params.granCategoriaId = selectedGranCategoria;

    catalogApi
      .list(params)
      .then((res) => {
        if (myReqId !== reqIdRef.current) return; // descarta respuesta vieja
        setProducts(Array.isArray(res) ? res : (res.data ?? []));
        setTotal(typeof res?.total === "number" ? res.total : 0);
      })
      .catch((err) => {
        if (myReqId !== reqIdRef.current) return;
        console.error("[catalog] fetch error:", err);
        setProducts([]);
        setTotal(0);
      })
      .finally(() => {
        if (myReqId !== reqIdRef.current) return;
        setLoading(false);
      });
  }, [debouncedSearch, selectedGranCategoria, selectedCategory, page]);

  function getCategoryName(id) {
    return categories.find((c) => c.id === id)?.name || "—";
  }

  function getCategoryColor(id) {
    const idx = categories.findIndex((c) => c.id === id);
    return CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
  }

  // Sugeridos: derivados del historial del usuario en `orders`.
  // Usamos el snapshot de order_items (productId, productName, unitPrice, unit, sku),
  // que es independiente del catálogo cargado en pantalla.
  const suggestedProducts = useMemo(() => {
    if (!currentUser || !orders?.length) return [];
    const myOrders = orders.filter((o) => o.clientId === currentUser.id);
    const agg = {};
    for (const o of myOrders) {
      for (const it of o.items || []) {
        if (!agg[it.productId]) {
          agg[it.productId] = {
            id: it.productId,
            name: it.productName,
            sku: it.sku,
            unit: it.unit,
            price: it.unitPrice,
            qty: 0,
          };
        }
        agg[it.productId].qty += it.quantity;
      }
    }
    return Object.values(agg)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 6);
  }, [orders, currentUser]);

  function handleAdd(product, qty) {
    addToCart(product, qty, product.price);
  }

  function handleQuickAdd(e, product) {
    e.stopPropagation();
    handleAdd(product, 1);
  }

  // Click en tarjeta/fila: abre el modal para elegir cantidad antes de agregar.
  function handleCardClick(product) {
    setModalProduct(product);
  }

  function handleOpenDetail(e, product) {
    e.stopPropagation();
    setModalProduct(product);
  }

  // Productos relacionados para el modal: usa categorias relacionadas y, como
  // fallback, productos aleatorios de la misma categoria.
  const [relatedProducts, setRelatedProducts] = useState([]);
  useEffect(() => {
    if (!modalProduct) {
      setRelatedProducts([]);
      return;
    }
    let cancelled = false;
    catalogApi
      .related(modalProduct.id, 6)
      .then((res) => {
        if (cancelled) return;
        const items = Array.isArray(res) ? res : (res?.data ?? []);
        setRelatedProducts(items);
      })
      .catch(() => {
        if (!cancelled) setRelatedProducts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [modalProduct]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showingFrom = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(page * PAGE_SIZE, total);
  const modalPrice = modalProduct ? modalProduct.price : 0;
  const showSuggested =
    !isReadOnly &&
    suggestedProducts.length > 0 &&
    !debouncedSearch &&
    !selectedGranCategoria &&
    !selectedCategory &&
    page === 1;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">
          Catálogo de Productos
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          {loading
            ? "Cargando…"
            : total === 0
              ? "0 productos"
              : `Mostrando ${showingFrom}–${showingTo} de ${total} productos`}
        </p>
      </div>

      {/* Productos sugeridos según historial */}
      {showSuggested && (
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border border-blue-100 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-purple-600" />
            <h3 className="text-sm font-semibold text-gray-800">
              Sugeridos para ti
            </h3>
            <span className="text-xs text-gray-500">
              basado en tus pedidos anteriores
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {suggestedProducts.map((product) => (
              <div
                key={product.id}
                onClick={() => handleCardClick(product)}
                className="bg-white rounded-lg border border-gray-100 p-3 cursor-pointer hover:shadow-md hover:border-blue-300 transition group relative"
              >
                <button
                  onClick={(e) => handleOpenDetail(e, product)}
                  title="Ver detalle"
                  className="absolute top-1.5 right-1.5 p-1 bg-white/80 hover:bg-white text-gray-400 hover:text-blue-700 rounded-full transition"
                >
                  <Info className="w-3 h-3" />
                </button>
                <ProductImage
                  image={product.imageUrl}
                  name={product.name}
                  className="w-full h-20 object-contain mb-2"
                />
                <p className="text-xs font-medium text-gray-800 line-clamp-2 mb-1">
                  {product.name}
                </p>
                <p className="text-sm font-bold text-blue-700 mb-0.5">
                  {formatCOP(product.price)}
                </p>
                <p className="text-[10px] text-gray-400 mb-2">IVA incl.</p>
                <button
                  onClick={(e) => handleQuickAdd(e, product)}
                  className="w-full flex items-center justify-center gap-1 py-1.5 bg-blue-700 text-white rounded text-xs font-semibold hover:bg-blue-800 transition"
                >
                  <Plus className="w-3 h-3" />
                  Agregar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtros de categoría + View Toggle */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
            <select
              value={selectedGranCategoria ?? ""}
              onChange={(e) =>
                handleSelectGranCategoria(
                  e.target.value ? Number(e.target.value) : null,
                )
              }
              className="pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[200px]"
            >
              <option value="">Todas las categorías</option>
              {granCategorias
                .filter((g) => g.active)
                .map((gc) => (
                  <option key={gc.id} value={gc.id}>
                    {gc.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
            <select
              value={selectedCategory ?? ""}
              onChange={(e) =>
                setSelectedCategory(
                  e.target.value ? Number(e.target.value) : null,
                )
              }
              className="pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[220px]"
            >
              <option value="">Todas las subcategorías</option>
              {categories
                .filter(
                  (c) =>
                    c.active &&
                    (!selectedGranCategoria ||
                      c.granCategoriaId === selectedGranCategoria),
                )
                .map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div className="flex border border-gray-300 rounded-lg overflow-hidden">
          <button
            onClick={() => setViewMode("grid")}
            className={`p-2 transition ${viewMode === "grid" ? "bg-blue-700 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-2 transition ${viewMode === "list" ? "bg-blue-700 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Grid View */}
      {viewMode === "grid" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {products.map((product) => {
            const price = product.price;
            return (
              <div
                key={product.id}
                onClick={() => handleCardClick(product)}
                className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col hover:shadow-md hover:border-blue-200 transition-all overflow-hidden cursor-pointer group"
              >
                {/* Product image */}
                <div className="relative w-full h-44 overflow-hidden bg-gray-50">
                  <ProductImage
                    image={product.imageUrl}
                    name={product.name}
                    className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-300"
                  />
                  {product.stock < 20 && product.stock > 0 && (
                    <span className="absolute top-2 right-2 text-xs px-2 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700">
                      Pocas unidades
                    </span>
                  )}
                  <button
                    onClick={(e) => handleOpenDetail(e, product)}
                    title="Ver detalle"
                    className="absolute top-2 left-2 p-1.5 bg-white/90 hover:bg-white text-gray-500 hover:text-blue-700 rounded-full shadow-sm transition"
                  >
                    <Info className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Content */}
                <div className="p-4 flex flex-col flex-1">
                  <p className="text-xs text-blue-600 font-mono mb-1">
                    {product.sku}
                  </p>
                  <h3 className="text-sm font-semibold text-gray-800 mb-3 line-clamp-2 leading-snug flex-1">
                    {product.name}
                  </h3>
                  <div className="mb-3">
                    <p className="text-xl font-bold text-blue-700">
                      {formatCOP(price)}
                    </p>
                    <p className="text-xs text-gray-400">por {product.unit} · IVA incl.</p>
                  </div>
                  {!isReadOnly && (
                    <button
                      onClick={(e) => handleQuickAdd(e, product)}
                      className="w-full flex items-center justify-center gap-1.5 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-semibold transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Agregar al pedido
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {!loading && products.length === 0 && (
            <div className="col-span-4 py-16 text-center">
              <Package className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400">No se encontraron productos</p>
            </div>
          )}
        </div>
      )}

      {/* List View */}
      {viewMode === "list" && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 w-16"></th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">
                    Producto
                  </th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">
                    Categoría
                  </th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">
                    Precio
                  </th>
                  {!isReadOnly && <th className="px-4 py-3"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {products.map((product) => {
                  const price = product.price;
                  return (
                    <tr
                      key={product.id}
                      onClick={() => handleCardClick(product)}
                      className="hover:bg-blue-50 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <ProductImage
                          image={product.imageUrl}
                          name={product.name}
                          className="w-12 h-12 object-contain rounded-lg bg-gray-50 p-0.5"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-800">
                          {product.name}
                        </p>
                        <p className="text-xs text-blue-600 font-mono">
                          {product.sku}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${getCategoryColor(product.categoryId)}`}
                        >
                          {getCategoryName(product.categoryId)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-bold text-blue-700">
                          {formatCOP(price)}
                        </p>
                        <p className="text-xs text-gray-400">/{product.unit} · IVA incl.</p>
                      </td>
                      {!isReadOnly && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={(e) => handleOpenDetail(e, product)}
                              title="Ver detalle"
                              className="p-1.5 text-gray-400 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition"
                            >
                              <Info className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => handleQuickAdd(e, product)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-semibold transition"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Agregar
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {!loading && products.length === 0 && (
                  <tr>
                    <td
                      colSpan={isReadOnly ? 4 : 5}
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
      )}

      {/* Paginador */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-4 py-3">
          <p className="text-xs text-gray-500">
            Página {page} de {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Siguiente
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Product Detail Modal */}
      {modalProduct && (
        <ProductModal
          product={modalProduct}
          price={modalPrice}
          categoryName={getCategoryName(modalProduct.categoryId)}
          categoryColor={getCategoryColor(modalProduct.categoryId)}
          onClose={() => setModalProduct(null)}
          onAdd={(qty) => handleAdd(modalProduct, qty)}
          readOnly={isReadOnly}
          related={relatedProducts}
          onPickRelated={(p) => setModalProduct(p)}
        />
      )}
    </div>
  );
}
