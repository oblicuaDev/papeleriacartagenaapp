import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Plus, X, Users, GitBranch, Edit2, Trash2, MapPin, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { usersApi, sucursalesApi } from '../../services/api';

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
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

const EMPTY_USER_FORM  = { name: '', email: '', password: '', sucursalId: '', clientRole: 'creador_pedidos' };
const EMPTY_SUC_FORM   = { name: '', city: '', address: '' };

export default function ClientManage() {
  const { currentUser } = useAuth();
  const { users, refreshUsers, companies, refreshCompanies } = useApp();

  // Solo admin_empresa puede administrar empresas/sucursales/usuarios
  if (currentUser && currentUser.clientRole !== 'admin_empresa') {
    return <Navigate to="/cliente" replace />;
  }

  const company = companies.find(c => c.id === currentUser?.companyId);

  // ── local UI state ──────────────────────────────────────────────────────
  const [tab, setTab]                   = useState('users');   // 'users' | 'sucursales'
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser]    = useState(null);
  const [userForm, setUserForm]          = useState(EMPTY_USER_FORM);
  const [showPwd, setShowPwd]            = useState(false);
  const [showSucModal, setShowSucModal]  = useState(false);
  const [editingSuc, setEditingSuc]      = useState(null);
  const [sucForm, setSucForm]            = useState(EMPTY_SUC_FORM);
  const [nextSucId, setNextSucId]        = useState(200);

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const lblCls   = 'block text-sm font-medium text-gray-700 mb-1';

  // Company users (exclude the supervisor themselves)
  const companyUsers = users.filter(
    u => u.role === 'client' && u.companyId === currentUser?.companyId && u.id !== currentUser?.id
  );

  const sucursales = company?.sucursales || [];

  function getSucursalName(id) {
    return sucursales.find(s => s.id === id)?.name || '—';
  }

  // ── User CRUD ───────────────────────────────────────────────────────────
  function openCreateUser() {
    setEditingUser(null);
    setUserForm(EMPTY_USER_FORM);
    setShowPwd(false);
    setShowUserModal(true);
  }

  function openEditUser(user) {
    setEditingUser(user);
    setUserForm({
      name:       user.name,
      email:      user.email,
      password:   user.password,
      sucursalId: user.sucursalId ? String(user.sucursalId) : '',
      clientRole: user.clientRole || 'creador_pedidos',
    });
    setShowPwd(false);
    setShowUserModal(true);
  }

  async function handleSaveUser() {
    if (!userForm.name || !userForm.email || !userForm.password) return;
    if (editingUser) {
      await usersApi.update(editingUser.id, {
        name:       userForm.name,
        email:      userForm.email,
        password:   userForm.password,
        sucursalId: userForm.sucursalId ? Number(userForm.sucursalId) : null,
        clientRole: userForm.clientRole,
      });
    } else {
      // PHASE 6: la lista de precios se resuelve en cascada (sucursal > empresa)
      // y se administra desde "Listas de precios". No se asigna en la creación
      // del usuario.
      await usersApi.create({
        name:        userForm.name,
        email:       userForm.email,
        password:    userForm.password,
        role:        'client',
        clientRole:  userForm.clientRole,
        companyId:   currentUser.companyId,
        sucursalId:  userForm.sucursalId ? Number(userForm.sucursalId) : null,
      });
    }
    await refreshUsers();
    setShowUserModal(false);
  }

  async function handleDeleteUser(id) {
    await usersApi.remove(id);
    await refreshUsers();
  }

  // ── Sucursal CRUD ────────────────────────────────────────────────────────
  function openCreateSuc() {
    setEditingSuc(null);
    setSucForm(EMPTY_SUC_FORM);
    setShowSucModal(true);
  }

  function openEditSuc(suc) {
    setEditingSuc(suc);
    setSucForm({ name: suc.name, city: suc.city || '', address: suc.address || '' });
    setShowSucModal(true);
  }

  async function handleSaveSuc() {
    if (!sucForm.name) return;
    const companyId = currentUser.companyId;
    if (editingSuc) {
      await sucursalesApi.update(companyId, editingSuc.id, sucForm);
    } else {
      await sucursalesApi.create(companyId, sucForm);
    }
    await refreshCompanies();
    setShowSucModal(false);
  }

  async function handleDeleteSuc(id) {
    await sucursalesApi.remove(currentUser.companyId, id);
    await refreshCompanies();
  }

  if (!company) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-400 text-sm">Tu cuenta no tiene empresa asignada.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Administrar empresa</h2>
        <p className="text-sm text-gray-500 mt-1">{company.name}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setTab('users')}
          className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition ${
            tab === 'users' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Users className="w-4 h-4" />
          Usuarios ({companyUsers.length})
        </button>
        <button
          onClick={() => setTab('sucursales')}
          className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition ${
            tab === 'sucursales' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <GitBranch className="w-4 h-4" />
          Sucursales ({sucursales.length})
        </button>
      </div>

      {/* ── USERS TAB ─────────────────────────────────────────────────── */}
      {tab === 'users' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Usuarios con acceso al portal de tu empresa
            </p>
            <button
              onClick={openCreateUser}
              className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition"
            >
              <Plus className="w-4 h-4" />
              Nuevo usuario
            </button>
          </div>

          {companyUsers.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 flex flex-col items-center justify-center py-16 text-center">
              <Users className="w-10 h-10 text-gray-200 mb-3" />
              <p className="text-sm text-gray-400">Sin usuarios creados aún</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100 overflow-hidden">
              {companyUsers.map(user => (
                <div key={user.id} className="flex items-center gap-4 px-5 py-4">
                  <div className="w-9 h-9 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {user.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{user.name}</p>
                    <p className="text-xs text-gray-400">{user.email}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      user.clientRole === 'supervisor' ? 'bg-purple-100 text-purple-700' :
                      user.clientRole === 'admin_empresa' ? 'bg-indigo-100 text-indigo-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {user.clientRole === 'supervisor' ? 'Supervisor' :
                       user.clientRole === 'admin_empresa' ? 'Admin empresa' :
                       'Creador de pedidos'}
                    </span>
                    {user.sucursalId && (
                      <span className="text-xs text-gray-400 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
                        {getSucursalName(user.sucursalId)}
                      </span>
                    )}
                    <button
                      onClick={() => openEditUser(user)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteUser(user.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── SUCURSALES TAB ────────────────────────────────────────────── */}
      {tab === 'sucursales' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Sucursales registradas en tu empresa
            </p>
            <button
              onClick={openCreateSuc}
              className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition"
            >
              <Plus className="w-4 h-4" />
              Nueva sucursal
            </button>
          </div>

          {sucursales.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 flex flex-col items-center justify-center py-16 text-center">
              <GitBranch className="w-10 h-10 text-gray-200 mb-3" />
              <p className="text-sm text-gray-400">Sin sucursales registradas</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100 overflow-hidden">
              {sucursales.map(suc => (
                <div key={suc.id} className="flex items-center gap-4 px-5 py-4">
                  <div className="w-9 h-9 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center flex-shrink-0">
                    <GitBranch className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{suc.name}</p>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {suc.city && <span className="text-xs text-gray-400">{suc.city}</span>}
                      {suc.address && (
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <MapPin className="w-3 h-3" />{suc.address}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => openEditSuc(suc)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteSuc(suc.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── User Modal ─────────────────────────────────────────────────── */}
      {showUserModal && (
        <Modal
          title={editingUser ? 'Editar usuario' : 'Nuevo usuario'}
          onClose={() => setShowUserModal(false)}
        >
          <div className="space-y-4">
            <div>
              <label className={lblCls}>Nombre completo *</label>
              <input
                className={inputCls}
                value={userForm.name}
                onChange={e => setUserForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Nombre del usuario"
              />
            </div>
            <div>
              <label className={lblCls}>Email *</label>
              <input
                className={inputCls}
                type="email"
                value={userForm.email}
                onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))}
                placeholder="usuario@empresa.com"
              />
            </div>
            <div>
              <label className={lblCls}>Contraseña *</label>
              <div className="relative">
                <input
                  className={inputCls + ' pr-10'}
                  type={showPwd ? 'text' : 'password'}
                  value={userForm.password}
                  onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className={lblCls}>Sucursal</label>
              <select
                className={inputCls}
                value={userForm.sucursalId}
                onChange={e => setUserForm(f => ({ ...f, sucursalId: e.target.value }))}
              >
                <option value="">— Sin sucursal —</option>
                {sucursales.map(s => (
                  <option key={s.id} value={s.id}>{s.name}{s.city ? ` — ${s.city}` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={lblCls}>Rol</label>
              <select
                className={inputCls}
                value={userForm.clientRole}
                onChange={e => setUserForm(f => ({ ...f, clientRole: e.target.value }))}
              >
                <option value="creador_pedidos">Creador de pedidos</option>
                <option value="supervisor">Supervisor</option>
                <option value="admin_empresa">Admin de empresa</option>
              </select>
              <p className="text-xs text-gray-400 mt-1">
                {userForm.clientRole === 'supervisor' && 'Aprueba pedidos solo de su sucursal.'}
                {userForm.clientRole === 'creador_pedidos' && 'Crea pedidos que requieren aprobación.'}
                {userForm.clientRole === 'admin_empresa' && 'Visión completa de todas las sucursales (solo lectura, no aprueba).'}
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowUserModal(false)}
                className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveUser}
                className="flex-1 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition"
              >
                {editingUser ? 'Guardar cambios' : 'Crear usuario'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Sucursal Modal ─────────────────────────────────────────────── */}
      {showSucModal && (
        <Modal
          title={editingSuc ? 'Editar sucursal' : 'Nueva sucursal'}
          onClose={() => setShowSucModal(false)}
        >
          <div className="space-y-4">
            <div>
              <label className={lblCls}>Nombre de la sucursal *</label>
              <input
                className={inputCls}
                value={sucForm.name}
                onChange={e => setSucForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ej. Sede Norte"
              />
            </div>
            <div>
              <label className={lblCls}>Ciudad</label>
              <input
                className={inputCls}
                value={sucForm.city}
                onChange={e => setSucForm(f => ({ ...f, city: e.target.value }))}
                placeholder="Bogotá"
              />
            </div>
            <div>
              <label className={lblCls}>Dirección</label>
              <input
                className={inputCls}
                value={sucForm.address}
                onChange={e => setSucForm(f => ({ ...f, address: e.target.value }))}
                placeholder="Cra 15 # 85-20"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowSucModal(false)}
                className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveSuc}
                className="flex-1 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition"
              >
                {editingSuc ? 'Guardar cambios' : 'Crear sucursal'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
