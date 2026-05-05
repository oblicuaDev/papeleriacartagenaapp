import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ShoppingCart, Grid, List, Plus, Minus, X, Package, Filter } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { formatCOP } from '../../data/mockData';
import productFallback from '../../product.webp';

const CATEGORY_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-purple-100 text-purple-700',
  'bg-emerald-100 text-emerald-700',
  'bg-orange-100 text-orange-700',
  'bg-pink-100 text-pink-700',
];

function ProductImage({ image, name, className }) {
  return (
    <img
      src={image || productFallback}
      alt={name}
      className={className}
      onError={(e) => { e.target.src = productFallback; }}
    />
  );
}

function ProductModal({ product, price, categoryName, categoryColor, onClose, onAdd, readOnly }) {
  const [qty, setQty] = useState(1);

  function handleAdd() {
    onAdd(qty);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={e => e.stopPropagation()}
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
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryColor}`}>
                {categoryName}
              </span>
            </div>
            <h3 className="text-lg font-bold text-gray-900 leading-snug">{product.name}</h3>
            {product.description && (
              <p className="text-sm text-gray-500 mt-1">{product.description}</p>
            )}
          </div>

          <div>
            <p className="text-2xl font-bold text-blue-700">{formatCOP(price)}</p>
            <p className="text-xs text-gray-400">por {product.unit}</p>
          </div>

          {/* Quantity + Add — solo para roles que crean pedidos */}
          {!readOnly && (
            <div className="flex items-center gap-3 pt-1">
              <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
                <button
                  onClick={() => setQty(q => Math.max(1, q - 1))}
                  className="w-9 h-9 flex items-center justify-center text-gray-600 hover:bg-gray-100 transition"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <input
                  type="number"
                  min={1}
                  value={qty}
                  onChange={e => setQty(Math.max(1, Number(e.target.value)))}
                  className="w-14 text-center py-2 text-sm font-medium focus:outline-none border-x border-gray-300"
                />
                <button
                  onClick={() => setQty(q => q + 1)}
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
        </div>
      </div>
    </div>
  );
}

export default function ClientCatalog() {
  const context = useOutletContext() || {};
  const headerSearch = context.search || '';
  const { products, categories, addToCart } = useApp();
  const { currentUser } = useAuth();
  const isReadOnly = currentUser?.clientRole === 'admin_empresa';
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [viewMode, setViewMode] = useState('grid');
  const [modalProduct, setModalProduct] = useState(null);

  const search = headerSearch;

  function getCategoryName(id) {
    return categories.find(c => c.id === id)?.name || '—';
  }

  function getCategoryColor(id) {
    const idx = categories.findIndex(c => c.id === id);
    return CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
  }

  // /catalog ya filtra active=true en backend; aqui solo aplicamos UI filters
  const filtered = products.filter(p => {
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase());
    const matchCat = selectedCategory ? p.categoryId === selectedCategory : true;
    return matchSearch && matchCat;
  });

  function handleAdd(product, qty) {
    // product.price ya viene resuelto por backend (sucursal > company > user > base)
    addToCart(product, qty, product.price);
  }

  const modalPrice = modalProduct ? modalProduct.price : 0;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Catálogo de Productos</h2>
        <p className="text-sm text-gray-500 mt-1">{filtered.length} productos disponibles</p>
      </div>

      {/* Category Dropdown + View Toggle */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
          <select
            value={selectedCategory ?? ''}
            onChange={e => setSelectedCategory(e.target.value ? Number(e.target.value) : null)}
            className="pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[220px]"
          >
            <option value="">Todas las categorías</option>
            {categories.filter(c => c.active).map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>

        <div className="flex border border-gray-300 rounded-lg overflow-hidden">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 transition ${viewMode === 'grid' ? 'bg-blue-700 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 transition ${viewMode === 'list' ? 'bg-blue-700 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Grid View */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map(product => {
            const price = product.price;
            return (
              <div
                key={product.id}
                onClick={() => setModalProduct(product)}
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
                </div>

                {/* Content */}
                <div className="p-4 flex flex-col flex-1">
                  <p className="text-xs text-blue-600 font-mono mb-1">{product.sku}</p>
                  <h3 className="text-sm font-semibold text-gray-800 mb-3 line-clamp-2 leading-snug flex-1">{product.name}</h3>
                  <div>
                    <p className="text-xl font-bold text-blue-700">{formatCOP(price)}</p>
                    <p className="text-xs text-gray-400">por {product.unit}</p>
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-4 py-16 text-center">
              <Package className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400">No se encontraron productos</p>
            </div>
          )}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 w-16"></th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Producto</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Categoría</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Precio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(product => {
                  const price = product.price;
                  return (
                    <tr
                      key={product.id}
                      onClick={() => setModalProduct(product)}
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
                        <p className="text-sm font-medium text-gray-800">{product.name}</p>
                        <p className="text-xs text-blue-600 font-mono">{product.sku}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getCategoryColor(product.categoryId)}`}>
                          {getCategoryName(product.categoryId)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-bold text-blue-700">{formatCOP(price)}</p>
                        <p className="text-xs text-gray-400">/{product.unit}</p>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">
                      No se encontraron productos
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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
        />
      )}
    </div>
  );
}
