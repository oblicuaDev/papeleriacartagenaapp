import { useState, useEffect, useMemo } from 'react';
import { Pencil, X, Plus, Trash2, Search, ListOrdered, Building, DollarSign, Loader2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { priceListsApi } from '../../services/api';
import { formatCOP } from '../../data/mockData';

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

const LIST_COLORS = ['bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-amber-500', 'bg-rose-500'];

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

export default function AdminPriceLists() {
  const { priceLists, companies, refreshPriceLists, refreshCompanies } = useApp();

  // CRUD lista
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [editList, setEditList] = useState(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoError, setInfoError] = useState(null);

  // Items modal
  const [showItemsModal, setShowItemsModal] = useState(false);
  const [itemsList, setItemsList] = useState(null);
  const [itemsRows, setItemsRows] = useState([]);
  const [itemsSearch, setItemsSearch] = useState('');
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsSaving, setItemsSaving] = useState(false);

  // Companies modal
  const [showCompaniesModal, setShowCompaniesModal] = useState(false);
  const [companiesList, setCompaniesList] = useState(null);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState(new Set());
  const [companiesSaving, setCompaniesSaving] = useState(false);

  // ── Lista CRUD ───────────────────────────────────────────────
  function openCreate() {
    setEditList(null);
    setForm({ name: '', description: '' });
    setInfoError(null);
    setShowInfoModal(true);
  }

  function openEdit(list) {
    setEditList(list);
    setForm({ name: list.name || '', description: list.description || '' });
    setInfoError(null);
    setShowInfoModal(true);
  }

  async function handleSaveInfo() {
    if (!form.name.trim()) {
      setInfoError('El nombre es obligatorio');
      return;
    }
    setSavingInfo(true);
    setInfoError(null);
    try {
      if (editList) {
        await priceListsApi.update(editList.id, {
          name: form.name.trim(),
          description: form.description || null,
        });
      } else {
        await priceListsApi.create({
          name: form.name.trim(),
          description: form.description || null,
          // multiplier opcional: backend pone 1.0 por defecto, los precios son por producto
          multiplier: 1.0,
        });
      }
      await refreshPriceLists();
      setShowInfoModal(false);
    } catch (err) {
      setInfoError(err?.message || 'No se pudo guardar la lista');
    } finally {
      setSavingInfo(false);
    }
  }

  async function handleDelete(list) {
    const ok = window.confirm(`¿Eliminar la lista "${list.name}"?`);
    if (!ok) return;
    try {
      await priceListsApi.remove(list.id);
      await refreshPriceLists();
    } catch (err) {
      alert(err?.message || 'No se pudo eliminar la lista');
    }
  }

  // ── Items modal ──────────────────────────────────────────────
  async function openItems(list) {
    setItemsList(list);
    setItemsSearch('');
    setItemsLoading(true);
    setShowItemsModal(true);
    try {
      const rows = await priceListsApi.items(list.id);
      // rows: { productId, name, sku, basePrice, listPrice, ... }
      setItemsRows(
        rows.map(r => ({
          productId: r.productId,
          name:      r.name,
          sku:       r.sku,
          unit:      r.unit,
          basePrice: Number(r.basePrice),
          price:     r.listPrice != null ? String(Math.round(Number(r.listPrice))) : '',
        }))
      );
    } catch (err) {
      alert(err?.message || 'No se pudieron cargar los items');
      setShowItemsModal(false);
    } finally {
      setItemsLoading(false);
    }
  }

  function setItemPrice(productId, value) {
    const clean = value.replace(/[^0-9.]/g, '');
    setItemsRows(prev =>
      prev.map(r => r.productId === productId ? { ...r, price: clean } : r)
    );
  }

  async function handleSaveItems() {
    setItemsSaving(true);
    try {
      const payload = itemsRows.map(r => ({
        productId: r.productId,
        // string vacío o 0 ⇒ borrar override (vuelve a base_price)
        price: r.price === '' ? null : Number(r.price),
      }));
      await priceListsApi.saveItems(itemsList.id, payload);
      await refreshPriceLists();
      setShowItemsModal(false);
    } catch (err) {
      alert(err?.message || 'No se pudieron guardar los precios');
    } finally {
      setItemsSaving(false);
    }
  }

  const filteredItems = useMemo(() => {
    const s = itemsSearch.trim().toLowerCase();
    if (!s) return itemsRows;
    return itemsRows.filter(r =>
      r.name.toLowerCase().includes(s) || r.sku.toLowerCase().includes(s)
    );
  }, [itemsRows, itemsSearch]);

  // ── Companies modal ──────────────────────────────────────────
  async function openCompanies(list) {
    setCompaniesList(list);
    try {
      const assigned = await priceListsApi.companies(list.id);
      setSelectedCompanyIds(new Set(assigned.map(c => c.id)));
      setShowCompaniesModal(true);
    } catch (err) {
      alert(err?.message || 'No se pudieron cargar empresas');
    }
  }

  function toggleCompany(id) {
    setSelectedCompanyIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSaveCompanies() {
    setCompaniesSaving(true);
    try {
      await priceListsApi.setCompanies(companiesList.id, [...selectedCompanyIds]);
      await refreshPriceLists();
      await refreshCompanies();
      setShowCompaniesModal(false);
    } catch (err) {
      alert(err?.message || 'No se pudieron guardar las empresas');
    } finally {
      setCompaniesSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Listas de Precios</h2>
          <p className="text-sm text-gray-500 mt-1">
            Cada lista contiene un precio fijo por producto y se asigna a una o más empresas.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition"
        >
          <Plus className="w-4 h-4" />
          Nueva lista
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {priceLists.map((list, idx) => (
          <div key={list.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className={`h-2 ${LIST_COLORS[idx % LIST_COLORS.length]}`} />
            <div className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${LIST_COLORS[idx % LIST_COLORS.length]}`}>
                    <ListOrdered className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-gray-900 text-base truncate">{list.name}</h3>
                    {list.description && (
                      <p className="text-xs text-gray-500 truncate">{list.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => openEdit(list)}
                    title="Editar info"
                    className="p-1.5 text-gray-400 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(list)}
                    title="Eliminar"
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center py-1.5 border-b border-gray-50">
                  <span className="text-gray-600 flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5" /> Productos con precio
                  </span>
                  <span className="font-bold text-gray-800">{list.itemCount ?? 0}</span>
                </div>
                <div className="flex justify-between items-center py-1.5">
                  <span className="text-gray-600 flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5" /> Empresas asignadas
                  </span>
                  <span className="font-bold text-blue-700">{list.companyCount ?? 0}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-4">
                <button
                  onClick={() => openItems(list)}
                  className="px-3 py-2 text-sm font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition flex items-center justify-center gap-1.5"
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  Precios
                </button>
                <button
                  onClick={() => openCompanies(list)}
                  className="px-3 py-2 text-sm font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition flex items-center justify-center gap-1.5"
                >
                  <Building className="w-3.5 h-3.5" />
                  Empresas
                </button>
              </div>
            </div>
          </div>
        ))}

        {priceLists.length === 0 && (
          <div className="col-span-full bg-white rounded-xl border border-gray-100 px-5 py-12 text-center">
            <ListOrdered className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400">No hay listas de precios. Crea una para empezar.</p>
          </div>
        )}
      </div>

      {/* Info Modal (create/edit) */}
      {showInfoModal && (
        <Modal
          title={editList ? `Editar ${editList.name}` : 'Nueva lista de precios'}
          onClose={() => setShowInfoModal(false)}
        >
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Nombre *</label>
              <input
                className={inputClass}
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ej. Cliente Centro - Abril"
              />
            </div>
            <div>
              <label className={labelClass}>Descripción</label>
              <input
                className={inputClass}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Notas internas (opcional)"
              />
            </div>
            {infoError && <p className="text-xs text-red-600">{infoError}</p>}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowInfoModal(false)}
                disabled={savingInfo}
                className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveInfo}
                disabled={savingInfo}
                className="flex-1 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {savingInfo && <Loader2 className="w-4 h-4 animate-spin" />}
                {editList ? 'Guardar cambios' : 'Crear lista'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Items Modal */}
      {showItemsModal && (
        <Modal
          title={`Precios de ${itemsList?.name}`}
          onClose={() => setShowItemsModal(false)}
          wide
        >
          <div className="space-y-4">
            <p className="text-xs text-gray-500">
              Define el precio fijo por producto. Deja vacío para usar el precio base del catálogo.
            </p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                value={itemsSearch}
                onChange={e => setItemsSearch(e.target.value)}
                placeholder="Buscar por nombre o SKU"
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {itemsLoading ? (
              <div className="flex items-center justify-center py-12 text-gray-400 gap-2 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Cargando productos…
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg overflow-hidden max-h-[55vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">SKU</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Producto</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Precio base</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Precio en lista</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredItems.map(r => (
                      <tr key={r.productId}>
                        <td className="px-3 py-2 font-mono text-xs text-gray-500">{r.sku}</td>
                        <td className="px-3 py-2 text-gray-800">{r.name}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{formatCOP(r.basePrice)}</td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={r.price}
                            onChange={e => setItemPrice(r.productId, e.target.value)}
                            placeholder="—"
                            className="w-32 text-right border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                      </tr>
                    ))}
                    {filteredItems.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-8 text-center text-sm text-gray-400">
                          Sin productos
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowItemsModal(false)}
                disabled={itemsSaving}
                className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveItems}
                disabled={itemsSaving || itemsLoading}
                className="flex-1 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {itemsSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                Guardar precios
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Companies Modal */}
      {showCompaniesModal && (
        <Modal
          title={`Empresas asignadas a ${companiesList?.name}`}
          onClose={() => setShowCompaniesModal(false)}
        >
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Marca las empresas que usarán esta lista de precios. Una empresa solo puede tener una lista a la vez.
            </p>
            <div className="border border-gray-200 rounded-lg max-h-72 overflow-y-auto divide-y divide-gray-100">
              {(companies || []).map(c => (
                <label
                  key={c.id}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedCompanyIds.has(c.id)}
                    onChange={() => toggleCompany(c.id)}
                    className="rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{c.name}</p>
                    {c.nit && <p className="text-xs text-gray-400">NIT {c.nit}</p>}
                  </div>
                  {c.priceListId && c.priceListId !== companiesList.id && (
                    <span className="text-[10px] uppercase tracking-wider text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                      Tiene otra lista
                    </span>
                  )}
                </label>
              ))}
              {(!companies || companies.length === 0) && (
                <p className="px-4 py-6 text-sm text-gray-400 text-center">No hay empresas registradas</p>
              )}
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowCompaniesModal(false)}
                disabled={companiesSaving}
                className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveCompanies}
                disabled={companiesSaving}
                className="flex-1 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {companiesSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                Guardar asignaciones
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
