import { useEffect, useState } from 'react';
import { Plus, X, FileText, Search, Trash2, Edit2, Check } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { contractsApi, productsApi } from '../../services/api';
import { formatCOP } from '../../data/mockData';

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
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

const EMPTY_FORM = { companyId: '', dateFrom: '', dateTo: '', amount: '' };

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

function ymd(value) {
  return value ? String(value).slice(0, 10) : '';
}

function isActiveContract(c) {
  if (!c.active) return false;
  const today = new Date().toISOString().slice(0, 10);
  return ymd(c.dateFrom) <= today && today <= ymd(c.dateTo);
}

export default function AdminContracts() {
  const { companies } = useApp();
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedProducts, setSelectedProducts] = useState([]); // [{id, sku, name}]
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  async function refresh() {
    setLoading(true);
    try {
      const rows = await contractsApi.list();
      setContracts(rows || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  // Buscador de productos con debounce, reusa GET /products?search=
  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return; }
    const t = setTimeout(() => {
      productsApi.list({ search, limit: 20 })
        .then(res => setSearchResults(res?.data ?? []))
        .catch(() => setSearchResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setSelectedProducts([]);
    setSearch('');
    setSearchResults([]);
    setErrorMsg(null);
    setShowModal(true);
  }

  async function openEdit(contract) {
    setEditing(contract);
    setForm({
      companyId: contract.companyId,
      dateFrom: ymd(contract.dateFrom),
      dateTo: ymd(contract.dateTo),
      amount: String(contract.amount ?? ''),
    });
    setSearch('');
    setSearchResults([]);
    setErrorMsg(null);
    try {
      const detail = await contractsApi.get(contract.id);
      setSelectedProducts(detail.products || []);
    } catch {
      setSelectedProducts([]);
    }
    setShowModal(true);
  }

  function toggleProduct(product) {
    setSelectedProducts(prev =>
      prev.some(p => p.id === product.id)
        ? prev.filter(p => p.id !== product.id)
        : [...prev, product]
    );
  }

  function removeProduct(id) {
    setSelectedProducts(prev => prev.filter(p => p.id !== id));
  }

  async function handleSave() {
    setErrorMsg(null);
    if (!form.companyId || !form.dateFrom || !form.dateTo || form.amount === '') {
      setErrorMsg('Completa empresa, fechas y monto.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        companyId: Number(form.companyId),
        dateFrom: form.dateFrom,
        dateTo: form.dateTo,
        amount: Number(form.amount),
        productIds: selectedProducts.map(p => p.id),
      };
      if (editing) {
        await contractsApi.update(editing.id, payload);
      } else {
        await contractsApi.create(payload);
      }
      await refresh();
      setShowModal(false);
    } catch (err) {
      setErrorMsg(err?.message || 'No se pudo guardar el contrato');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(contract) {
    await contractsApi.update(contract.id, { active: !contract.active });
    await refresh();
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar este contrato?')) return;
    await contractsApi.remove(id);
    await refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Contratos</h2>
          <p className="text-sm text-gray-500 mt-1">
            Catálogo restringido por empresa: si un cliente tiene un contrato vigente, solo ve los SKUs incluidos.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition"
        >
          <Plus className="w-4 h-4" />
          Nuevo contrato
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Empresa</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Desde</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Hasta</th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Monto</th>
                <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">SKUs</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Estado</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-gray-400">Cargando...</td></tr>
              ) : contracts.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-gray-400">Sin contratos registrados</td></tr>
              ) : contracts.map(c => {
                const active = isActiveContract(c);
                return (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4 text-sm font-medium text-gray-800">{c.companyName}</td>
                    <td className="px-5 py-4 text-sm text-gray-600">{ymd(c.dateFrom)}</td>
                    <td className="px-5 py-4 text-sm text-gray-600">{ymd(c.dateTo)}</td>
                    <td className="px-5 py-4 text-sm text-gray-800 text-right">{formatCOP(c.amount)}</td>
                    <td className="px-5 py-4 text-sm text-gray-600 text-center">{c.productCount}</td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => handleToggleActive(c)}
                        className={`text-xs px-2.5 py-0.5 rounded-full font-medium border transition ${
                          active
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : 'bg-gray-100 text-gray-500 border-gray-200'
                        }`}
                        title={c.active ? 'Desactivar' : 'Activar'}
                      >
                        {active ? 'Vigente' : c.active ? 'Fuera de fecha' : 'Inactivo'}
                      </button>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEdit(c)} className="p-1.5 text-gray-400 hover:text-blue-600 transition">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(c.id)} className="p-1.5 text-gray-400 hover:text-red-600 transition">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <Modal title={editing ? 'Editar contrato' : 'Nuevo contrato'} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Empresa</label>
              <select
                className={inputClass}
                value={form.companyId}
                onChange={e => setForm(f => ({ ...f, companyId: e.target.value }))}
              >
                <option value="">Selecciona una empresa</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Fecha desde</label>
                <input type="date" className={inputClass} value={form.dateFrom}
                  onChange={e => setForm(f => ({ ...f, dateFrom: e.target.value }))} />
              </div>
              <div>
                <label className={labelClass}>Fecha hasta</label>
                <input type="date" className={inputClass} value={form.dateTo}
                  onChange={e => setForm(f => ({ ...f, dateTo: e.target.value }))} />
              </div>
            </div>

            <div>
              <label className={labelClass}>Monto (COP)</label>
              <input type="number" min="0" className={inputClass} value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>

            <div>
              <label className={labelClass}>SKUs incluidos en el contrato</label>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  className={inputClass + ' pl-9'}
                  placeholder="Buscar por SKU o nombre de producto..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              {searchResults.length > 0 && (
                <div className="border border-gray-200 rounded-lg max-h-40 overflow-y-auto mb-3">
                  {searchResults.map(p => {
                    const isSelected = selectedProducts.some(sp => sp.id === p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggleProduct(p)}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 transition ${
                          isSelected ? 'bg-blue-50' : ''
                        }`}
                      >
                        <span className="truncate">
                          <span className="font-mono text-xs text-gray-400 mr-2">{p.sku}</span>
                          {p.name}
                        </span>
                        {isSelected && <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}

              <p className="text-xs text-gray-400 mb-1.5">{selectedProducts.length} SKU(s) seleccionados</p>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                {selectedProducts.map(p => (
                  <span key={p.id} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-lg">
                    <span className="font-mono">{p.sku}</span>
                    <button onClick={() => removeProduct(p.id)} className="hover:text-blue-900">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {errorMsg && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{errorMsg}</div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 disabled:opacity-50 transition"
              >
                <FileText className="w-4 h-4" />
                {saving ? 'Guardando...' : 'Guardar contrato'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
