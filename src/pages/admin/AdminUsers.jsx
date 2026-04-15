import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { usersApi } from '../../services/api';

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

const EMPTY_FORM = { name: '', email: '', password: '', branchId: '' };

export default function AdminUsers() {
  const { users, refreshUsers, branches } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const advisors = users.filter(u => u.role === 'advisor');

  function getBranchName(id) {
    return branches.find(b => b.id === id)?.name || '—';
  }

  function openCreate() {
    setForm({ ...EMPTY_FORM, branchId: branches[0]?.id || '' });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name || !form.email || !form.password) return;
    await usersApi.create({
      name:     form.name,
      email:    form.email,
      password: form.password,
      role:     'advisor',
      branchId: Number(form.branchId),
    });
    await refreshUsers();
    setShowModal(false);
  }

  const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Asesores Comerciales</h2>
          <p className="text-sm text-gray-500 mt-1">{advisors.length} asesores registrados</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition"
        >
          <Plus className="w-4 h-4" />
          Nuevo Asesor
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Asesor</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Email</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Sede</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {advisors.map(advisor => (
                <tr key={advisor.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {advisor.initials}
                      </div>
                      <span className="text-sm font-medium text-gray-800">{advisor.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-600">{advisor.email}</td>
                  <td className="px-5 py-4">
                    <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full font-medium">
                      {getBranchName(advisor.branchId)}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
                      Activo
                    </span>
                  </td>
                </tr>
              ))}
              {advisors.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-sm text-gray-400">
                    No hay asesores registrados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <Modal title="Nuevo Asesor" onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Nombre completo *</label>
              <input className={inputClass} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ana Martínez" />
            </div>
            <div>
              <label className={labelClass}>Email *</label>
              <input className={inputClass} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="asesor@oblicua.com" />
            </div>
            <div>
              <label className={labelClass}>Contraseña *</label>
              <input className={inputClass} type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
            </div>
            <div>
              <label className={labelClass}>Sede asignada</label>
              <select className={inputClass} value={form.branchId} onChange={e => setForm(f => ({ ...f, branchId: e.target.value }))}>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                Cancelar
              </button>
              <button onClick={handleSave} className="flex-1 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition">
                Crear Asesor
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
