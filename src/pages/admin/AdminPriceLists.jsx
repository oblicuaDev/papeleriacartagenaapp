import { useState } from 'react';
import { Pencil, X, Upload, ListOrdered } from 'lucide-react';
import { useApp } from '../../context/AppContext';

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
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

const LIST_COLORS = ['bg-blue-500', 'bg-emerald-500', 'bg-purple-500'];

export default function AdminPriceLists() {
  const { priceLists, setPriceLists, users } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editList, setEditList] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', multiplier: '' });

  const clients = users.filter(u => u.role === 'client');

  function getClientCount(listId) {
    return clients.filter(c => c.priceListId === listId).length;
  }

  function openEdit(list) {
    setEditList(list);
    setForm({ name: list.name, description: list.description, multiplier: String(list.multiplier) });
    setShowModal(true);
  }

  function handleSave() {
    if (!form.name || !form.multiplier) return;
    setPriceLists(prev => prev.map(pl => pl.id === editList.id ? { ...pl, ...form, multiplier: Number(form.multiplier) } : pl));
    setShowModal(false);
  }

  const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Listas de Precios</h2>
          <p className="text-sm text-gray-500 mt-1">Gestiona los niveles de precio para tus clientes</p>
        </div>
        <button
          onClick={() => setShowImport(true)}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
        >
          <Upload className="w-4 h-4" />
          Importar precios via Excel
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {priceLists.map((list, idx) => {
          const multiplier = parseFloat(list.multiplier);
          const discount = Math.round((1 - multiplier) * 100);
          return (
            <div key={list.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className={`h-2 ${LIST_COLORS[idx % LIST_COLORS.length]}`} />
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${LIST_COLORS[idx % LIST_COLORS.length]}`}>
                      <ListOrdered className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-lg">{list.name}</h3>
                      <p className="text-xs text-gray-500">{list.description}</p>
                    </div>
                  </div>
                  <button onClick={() => openEdit(list)} className="p-1.5 text-gray-400 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition">
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-gray-50">
                    <span className="text-sm text-gray-600">Multiplicador</span>
                    <span className="text-sm font-bold text-gray-800">{multiplier.toFixed(2)}x</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-50">
                    <span className="text-sm text-gray-600">Descuento</span>
                    <span className={`text-sm font-bold ${discount > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                      {discount > 0 ? `-${discount}%` : 'Sin descuento'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-gray-600">Clientes asignados</span>
                    <span className="text-sm font-bold text-blue-700">{getClientCount(list.id)}</span>
                  </div>
                </div>

                <div className="mt-4 bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">
                    Ejemplo: Producto $100.000 → <span className="font-semibold text-gray-700">${(100000 * multiplier).toLocaleString('es-CO')}</span>
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Modal */}
      {showModal && (
        <Modal title={`Editar ${editList?.name}`} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
              <input className={inputClass} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
              <input className={inputClass} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Multiplicador (ej: 0.90 = 10% descuento)</label>
              <input className={inputClass} type="number" step="0.01" min="0" max="2" value={form.multiplier} onChange={e => setForm(f => ({ ...f, multiplier: e.target.value }))} />
              {form.multiplier && (
                <p className="text-xs text-gray-500 mt-1">
                  Descuento equivalente: {Math.round((1 - Number(form.multiplier)) * 100)}%
                </p>
              )}
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                Cancelar
              </button>
              <button onClick={handleSave} className="flex-1 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition">
                Guardar Cambios
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Import Modal */}
      {showImport && (
        <Modal title="Importar Precios desde Excel" onClose={() => setShowImport(false)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Carga un archivo Excel con los precios específicos por lista. Columnas requeridas: SKU, Lista A, Lista B, Lista C.
            </p>
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-400 transition">
              <Upload className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500 mb-2">Arrastra tu archivo aquí o</p>
              <label className="cursor-pointer">
                <span className="text-sm font-medium text-blue-600 hover:text-blue-700">Seleccionar archivo</span>
                <input type="file" accept=".xlsx,.xls,.csv" className="hidden" />
              </label>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
              <p className="text-xs text-blue-700">Esta es una demostración. El archivo no será procesado realmente.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowImport(false)} className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                Cancelar
              </button>
              <button onClick={() => setShowImport(false)} className="flex-1 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition">
                Importar (Demo)
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
