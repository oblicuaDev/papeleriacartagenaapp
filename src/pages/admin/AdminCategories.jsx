import { useState } from 'react';
import { Plus, Pencil, Eye, EyeOff, X, Tag } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { categoriesApi } from '../../services/api';

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

const CATEGORY_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-purple-100 text-purple-700',
  'bg-emerald-100 text-emerald-700',
  'bg-orange-100 text-orange-700',
  'bg-pink-100 text-pink-700',
];

export default function AdminCategories() {
  const { categories, products, refreshCategories } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [editCat, setEditCat] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', active: true });
  const [saving, setSaving] = useState(false);

  function getProductCount(catId) {
    return products.filter(p => p.categoryId === catId).length;
  }

  function openCreate() {
    setEditCat(null);
    setForm({ name: '', description: '', active: true });
    setShowModal(true);
  }

  function openEdit(cat) {
    setEditCat(cat);
    setForm({ name: cat.name, description: cat.description, active: cat.active });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name || saving) return;
    setSaving(true);
    try {
      if (editCat) {
        await categoriesApi.update(editCat.id, form);
      } else {
        await categoriesApi.create(form);
      }
      await refreshCategories();
      setShowModal(false);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(id) {
    const cat = categories.find(c => c.id === id);
    if (!cat) return;
    await categoriesApi.update(id, { active: !cat.active });
    await refreshCategories();
  }

  const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Categorías de Productos</h2>
          <p className="text-sm text-gray-500 mt-1">{categories.length} categorías configuradas</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition"
        >
          <Plus className="w-4 h-4" />
          Nueva Categoría
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map((cat, idx) => (
          <div key={cat.id} className={`bg-white rounded-xl shadow-sm border border-gray-100 p-5 ${!cat.active ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${CATEGORY_COLORS[idx % CATEGORY_COLORS.length]}`}>
                  <Tag className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800 text-sm">{cat.name}</h3>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${cat.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {cat.active ? 'Activa' : 'Inactiva'}
                  </span>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEdit(cat)} className="p-1.5 text-gray-400 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => toggleActive(cat.id)} className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition">
                  {cat.active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-3">{cat.description}</p>
            <div className="text-xs font-medium text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
              {getProductCount(cat.id)} productos en esta categoría
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <Modal title={editCat ? 'Editar Categoría' : 'Nueva Categoría'} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
              <input
                className={inputClass}
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Nombre de la categoría"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
              <textarea
                className={inputClass}
                rows={3}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Descripción de la categoría"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="catActive"
                checked={form.active}
                onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
                className="rounded"
              />
              <label htmlFor="catActive" className="text-sm text-gray-700">Categoría activa</label>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                Cancelar
              </button>
              <button onClick={handleSave} className="flex-1 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition">
                {editCat ? 'Guardar Cambios' : 'Crear Categoría'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
