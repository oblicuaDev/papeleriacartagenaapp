import { useState, useEffect } from 'react';
import { Plus, Pencil, Eye, EyeOff, X, Tag, Trash2, Link2, Layers, ListChecks } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { categoriesApi, granCategoriasApi } from '../../services/api';

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
  const { categories, products, refreshCategories, granCategorias, refreshGranCategorias } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [editCat, setEditCat] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', active: true });
  const [saving, setSaving] = useState(false);
  const [relatedCat, setRelatedCat] = useState(null);
  const [relatedIds, setRelatedIds] = useState([]);
  const [relatedSaving, setRelatedSaving] = useState(false);

  // ── Gran Categorías (Papelería / Aseo / Cafetería) ──────────
  const [showGCModal, setShowGCModal] = useState(false);
  const [editGC, setEditGC] = useState(null);
  const [gcForm, setGcForm] = useState({ name: '', active: true });
  const [gcSaving, setGcSaving] = useState(false);
  const [assignGC, setAssignGC] = useState(null);
  const [assignIds, setAssignIds] = useState([]);
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignSearch, setAssignSearch] = useState('');

  function getSubcategoryCount(gcId) {
    return categories.filter((c) => c.granCategoriaId === gcId).length;
  }

  function getGranCategoriaName(gcId) {
    return granCategorias.find((g) => g.id === gcId)?.name || null;
  }

  function openGCCreate() {
    setEditGC(null);
    setGcForm({ name: '', active: true });
    setShowGCModal(true);
  }

  function openGCEdit(gc) {
    setEditGC(gc);
    setGcForm({ name: gc.name, active: gc.active });
    setShowGCModal(true);
  }

  async function handleGCSave() {
    if (!gcForm.name || gcSaving) return;
    setGcSaving(true);
    try {
      if (editGC) {
        await granCategoriasApi.update(editGC.id, gcForm);
      } else {
        await granCategoriasApi.create(gcForm);
      }
      await refreshGranCategorias();
      setShowGCModal(false);
    } finally {
      setGcSaving(false);
    }
  }

  async function toggleGCActive(gc) {
    await granCategoriasApi.update(gc.id, { active: !gc.active });
    await refreshGranCategorias();
  }

  async function handleGCDelete(gc) {
    const count = getSubcategoryCount(gc.id);
    if (count > 0) {
      alert(`"${gc.name}" tiene ${count} subcategoría(s) asignada(s). Reasígnalas antes de eliminar.`);
      return;
    }
    const ok = window.confirm(`¿Eliminar definitivamente la categoría "${gc.name}"?`);
    if (!ok) return;
    try {
      await granCategoriasApi.remove(gc.id);
      await refreshGranCategorias();
    } catch (err) {
      alert(err?.message || 'No se pudo eliminar la categoría');
    }
  }

  function openAssign(gc) {
    setAssignGC(gc);
    setAssignIds(categories.filter((c) => c.granCategoriaId === gc.id).map((c) => c.id));
    setAssignSearch('');
  }

  function toggleAssignId(id) {
    setAssignIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function saveAssign() {
    if (!assignGC || assignSaving) return;
    setAssignSaving(true);
    try {
      await granCategoriasApi.setCategories(assignGC.id, assignIds);
      await refreshCategories();
      setAssignGC(null);
    } catch (err) {
      alert(err?.message || 'No se pudo guardar la asignación');
    } finally {
      setAssignSaving(false);
    }
  }

  async function openRelated(cat) {
    setRelatedCat(cat);
    try {
      const list = await categoriesApi.related(cat.id);
      setRelatedIds(list.map((c) => c.id));
    } catch {
      setRelatedIds([]);
    }
  }

  function toggleRelatedId(id) {
    setRelatedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function saveRelated() {
    if (!relatedCat || relatedSaving) return;
    setRelatedSaving(true);
    try {
      await categoriesApi.setRelated(relatedCat.id, relatedIds);
      setRelatedCat(null);
    } catch (err) {
      alert(err?.message || 'No se pudo guardar');
    } finally {
      setRelatedSaving(false);
    }
  }

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

  async function handleDelete(cat) {
    const count = getProductCount(cat.id);
    if (count > 0) {
      alert(`La subcategoría "${cat.name}" tiene ${count} producto(s) asociado(s). Reasígnalos antes de eliminar.`);
      return;
    }
    const ok = window.confirm(`¿Eliminar definitivamente la subcategoría "${cat.name}"? Esta acción no se puede deshacer.`);
    if (!ok) return;
    try {
      await categoriesApi.remove(cat.id);
      await refreshCategories();
    } catch (err) {
      alert(err?.message || 'No se pudo eliminar la subcategoría');
    }
  }

  const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Categorías</h2>
            <p className="text-sm text-gray-500 mt-1">
              Agrupan las subcategorías según el plan único de cuentas: Papelería, Aseo, Cafetería.
            </p>
          </div>
          <button
            onClick={openGCCreate}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800 transition"
          >
            <Plus className="w-4 h-4" />
            Nueva Categoría
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          {granCategorias.map((gc) => (
            <div key={gc.id} className={`bg-white rounded-xl shadow-sm border border-gray-100 p-5 ${!gc.active ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-100 text-emerald-700">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800 text-sm">{gc.name}</h3>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${gc.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {gc.active ? 'Activa' : 'Inactiva'}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openGCEdit(gc)} title="Editar" className="p-1.5 text-gray-400 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => openAssign(gc)} title="Asignar subcategorías" className="p-1.5 text-gray-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition">
                    <ListChecks className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => toggleGCActive(gc)} title={gc.active ? 'Desactivar' : 'Activar'} className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition">
                    {gc.active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => handleGCDelete(gc)} title="Eliminar" className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="text-xs font-medium text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                {getSubcategoryCount(gc.id)} subcategoría(s) asignada(s)
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Subcategorías</h2>
          <p className="text-sm text-gray-500 mt-1">{categories.length} subcategorías configuradas</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition"
        >
          <Plus className="w-4 h-4" />
          Nueva Subcategoría
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
                <button onClick={() => openEdit(cat)} title="Editar" className="p-1.5 text-gray-400 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => openRelated(cat)} title="Subcategorías relacionadas" className="p-1.5 text-gray-400 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition">
                  <Link2 className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => toggleActive(cat.id)} title={cat.active ? 'Desactivar' : 'Activar'} className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition">
                  {cat.active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => handleDelete(cat)} title="Eliminar" className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-3">{cat.description}</p>
            <div className="flex items-center gap-2 mb-2">
              {getGranCategoriaName(cat.granCategoriaId) ? (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700">
                  {getGranCategoriaName(cat.granCategoriaId)}
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-400">
                  Sin categoría
                </span>
              )}
            </div>
            <div className="text-xs font-medium text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
              {getProductCount(cat.id)} productos en esta subcategoría
            </div>
          </div>
        ))}
      </div>

      {assignGC && (
        <Modal title={`Subcategorías de: ${assignGC.name}`} onClose={() => setAssignGC(null)}>
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Marca las subcategorías que pertenecen a esta categoría. Cada subcategoría solo puede pertenecer a una categoría a la vez.
            </p>
            <input
              autoFocus
              type="text"
              value={assignSearch}
              onChange={(e) => setAssignSearch(e.target.value)}
              placeholder="Buscar subcategoría..."
              className={inputClass}
            />
            <p className="text-xs text-gray-400">
              {assignIds.length} seleccionada(s)
            </p>
            <div className="max-h-72 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100">
              {categories
                .filter((c) =>
                  c.name.toLowerCase().includes(assignSearch.trim().toLowerCase())
                )
                .map((c) => {
                  const other = c.granCategoriaId && c.granCategoriaId !== assignGC.id
                    ? getGranCategoriaName(c.granCategoriaId)
                    : null;
                  return (
                    <label key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={assignIds.includes(c.id)}
                        onChange={() => toggleAssignId(c.id)}
                      />
                      <span className="flex-1 text-gray-700">{c.name}</span>
                      {!c.active && <span className="text-xs text-gray-400">inactiva</span>}
                      {other && <span className="text-xs text-orange-500">antes: {other}</span>}
                    </label>
                  );
                })}
              {categories.filter((c) =>
                c.name.toLowerCase().includes(assignSearch.trim().toLowerCase())
              ).length === 0 && (
                <p className="px-3 py-4 text-sm text-gray-400 text-center">
                  Sin resultados para "{assignSearch}"
                </p>
              )}
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setAssignGC(null)} className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                Cancelar
              </button>
              <button onClick={saveAssign} disabled={assignSaving} className="flex-1 py-2 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800 transition disabled:opacity-50">
                {assignSaving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showGCModal && (
        <Modal title={editGC ? 'Editar Categoría' : 'Nueva Categoría'} onClose={() => setShowGCModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
              <input
                className={inputClass}
                value={gcForm.name}
                onChange={e => setGcForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ej: Papelería"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="gcActive"
                checked={gcForm.active}
                onChange={e => setGcForm(f => ({ ...f, active: e.target.checked }))}
                className="rounded"
              />
              <label htmlFor="gcActive" className="text-sm text-gray-700">Categoría activa</label>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowGCModal(false)} className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                Cancelar
              </button>
              <button onClick={handleGCSave} className="flex-1 py-2 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800 transition">
                {editGC ? 'Guardar Cambios' : 'Crear Categoría'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {relatedCat && (
        <Modal title={`Relacionadas con: ${relatedCat.name}`} onClose={() => setRelatedCat(null)}>
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Selecciona subcategorías que sugeriran productos cruzados desde esta subcategoría.
            </p>
            <div className="max-h-72 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100">
              {categories.filter(c => c.id !== relatedCat.id).map(c => (
                <label key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={relatedIds.includes(c.id)}
                    onChange={() => toggleRelatedId(c.id)}
                  />
                  <span className="flex-1 text-gray-700">{c.name}</span>
                  {!c.active && <span className="text-xs text-gray-400">inactiva</span>}
                </label>
              ))}
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setRelatedCat(null)} className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                Cancelar
              </button>
              <button onClick={saveRelated} disabled={relatedSaving} className="flex-1 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition disabled:opacity-50">
                {relatedSaving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showModal && (
        <Modal title={editCat ? 'Editar Subcategoría' : 'Nueva Subcategoría'} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
              <input
                className={inputClass}
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Nombre de la subcategoría"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
              <textarea
                className={inputClass}
                rows={3}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Descripción de la subcategoría"
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
              <label htmlFor="catActive" className="text-sm text-gray-700">Subcategoría activa</label>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                Cancelar
              </button>
              <button onClick={handleSave} className="flex-1 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition">
                {editCat ? 'Guardar Cambios' : 'Crear Subcategoría'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
