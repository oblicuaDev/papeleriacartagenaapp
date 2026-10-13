import { useState } from 'react';
import { Plus, X, Phone, MapPin, Calendar, Building, GitBranch, Info, Pencil, UserX, UserCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { usersApi } from '../../services/api';
import ConfirmDialog from '../../components/ConfirmDialog';

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
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

const EMPTY_FORM = {
  name: '', contactName: '', email: '', password: '', phone: '', address: '',
  companyId: '', sucursalId: '', clientRole: 'creador_pedidos',
};

const CLIENT_ROLE_BADGES = {
  creador_pedidos:        { label: 'Creador de pedidos',       className: 'bg-gray-100 text-gray-600' },
  supervisor:              { label: 'Supervisor',                className: 'bg-purple-100 text-purple-700' },
  administrador_contrato:  { label: 'Administrador de Contrato', className: 'bg-amber-100 text-amber-700' },
  admin_empresa:           { label: 'Administrador de Empresa',  className: 'bg-blue-100 text-blue-700' },
};

export default function AdminClients() {
  const { users, refreshUsers, priceLists, companies } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'inactive'
  const [statusTarget, setStatusTarget] = useState(null);  // cliente a activar/desactivar
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState(null);

  const allClients = users.filter(u => u.role === 'client');
  const clients = allClients.filter(u =>
    statusFilter === 'all' ? true : statusFilter === 'active' ? u.active : !u.active
  );
  const inactiveCount = allClients.filter(u => !u.active).length;

  // Lista heredada: sucursal -> empresa -> nada
  function getInheritedPriceList(client) {
    if (!client.companyId) return null;
    const company = companies.find(c => c.id === client.companyId);
    const sucursal = company?.sucursales?.find(s => s.id === client.sucursalId);
    const id = sucursal?.priceListId || company?.priceListId || null;
    return id ? priceLists.find(pl => pl.id === id) : null;
  }

  function getCompanyName(id) {
    return companies.find(c => c.id === id)?.name || '—';
  }

  function getSucursalName(companyId, sucursalId) {
    const company = companies.find(c => c.id === companyId);
    return company?.sucursales.find(s => s.id === sucursalId)?.name || '—';
  }

  // sucursales available for the selected company
  const availableSucursales = form.companyId
    ? (companies.find(c => c.id === Number(form.companyId))?.sucursales || [])
    : [];

  function openCreate() {
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setError(null);
    setShowModal(true);
  }

  function openEdit(client) {
    setEditingUser(client);
    setForm({
      name:        client.name || '',
      contactName: client.contactName || '',
      email:       client.email || '',
      password:    '',
      phone:       client.phone || '',
      address:     client.address || '',
      companyId:   client.companyId ?? '',
      sucursalId:  client.sucursalId ?? '',
      clientRole:  client.clientRole || 'creador_pedidos',
    });
    setError(null);
    setShowModal(true);
  }

  function handleCompanyChange(e) {
    setForm(f => ({ ...f, companyId: e.target.value, sucursalId: '' }));
  }

  async function handleSave() {
    if (!form.name.trim() || !form.email.trim()) {
      setError('Nombre y email son obligatorios');
      return;
    }
    if (!editingUser && !form.password) {
      setError('La contraseña es obligatoria al crear');
      return;
    }
    if (form.password && form.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (!form.companyId || !form.sucursalId) {
      setError('Selecciona la empresa y la sucursal');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editingUser) {
        // La empresa no se cambia en la edición (la API no lo permite):
        // solo la sucursal dentro de la misma empresa.
        const payload = {
          name:        form.name.trim(),
          contactName: form.contactName,
          email:       form.email,
          phone:       form.phone,
          address:     form.address,
          sucursalId:  Number(form.sucursalId),
          clientRole:  form.clientRole,
        };
        if (form.password) payload.password = form.password;
        await usersApi.update(editingUser.id, payload);
      } else {
        await usersApi.create({
          name:        form.name.trim(),
          contactName: form.contactName,
          email:       form.email,
          password:    form.password,
          phone:       form.phone,
          address:     form.address,
          companyId:   Number(form.companyId),
          sucursalId:  Number(form.sucursalId),
          clientRole:  form.clientRole,
          role:        'client',
        });
      }
      await refreshUsers();
      setShowModal(false);
    } catch (err) {
      setError(err?.message || 'No se pudo guardar el cliente');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive() {
    setStatusBusy(true);
    setStatusError(null);
    try {
      await usersApi.update(statusTarget.id, { active: !statusTarget.active });
      await refreshUsers();
      setStatusTarget(null);
    } catch (err) {
      setStatusError(err?.message || 'No se pudo actualizar el estado del cliente');
    } finally {
      setStatusBusy(false);
    }
  }

  const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Clientes</h2>
          <p className="text-sm text-gray-500 mt-1">
            {allClients.length} clientes registrados
            {inactiveCount > 0 && <> · {inactiveCount} inactivo{inactiveCount !== 1 ? 's' : ''}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Filtrar por estado"
        >
          <option value="all">Todos los estados</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
        </select>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition"
        >
          <Plus className="w-4 h-4" />
          Nuevo Cliente
        </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Cliente</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Empresa / Sucursal</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Rol</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Contacto</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Lista de Precios</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Dirección</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Fecha</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Estado</th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {clients.map(client => (
                <tr key={client.id} className={`hover:bg-gray-50 transition-colors ${client.active ? '' : 'opacity-60'}`}>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {client.initials}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-800">{client.name}</p>
                        <p className="text-xs text-gray-400">{client.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    {client.companyId ? (
                      <div>
                        <div className="flex items-center gap-1 text-sm text-gray-700">
                          <Building className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                          {getCompanyName(client.companyId)}
                        </div>
                        {client.sucursalId && (
                          <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                            <GitBranch className="w-3 h-3 flex-shrink-0" />
                            {getSucursalName(client.companyId, client.sucursalId)}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    {(() => {
                      const meta = CLIENT_ROLE_BADGES[client.clientRole] || CLIENT_ROLE_BADGES.creador_pedidos;
                      return (
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${meta.className}`}>{meta.label}</span>
                      );
                    })()}
                  </td>
                  <td className="px-5 py-4">
                    <div className="text-sm text-gray-700">{client.contactName || '—'}</div>
                    {client.phone && (
                      <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                        <Phone className="w-3 h-3" />
                        {client.phone}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    {(() => {
                      const inherited = getInheritedPriceList(client);
                      return inherited ? (
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full font-medium">
                          {inherited.name}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">— Precio base —</span>
                      );
                    })()}
                  </td>
                  <td className="px-5 py-4">
                    {client.address ? (
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate max-w-32">{client.address}</span>
                      </div>
                    ) : '—'}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      <Calendar className="w-3 h-3" />
                      {client.createdAt || '—'}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${client.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {client.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => openEdit(client)}
                        title="Editar"
                        className="p-1.5 text-gray-400 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => { setStatusError(null); setStatusTarget(client); }}
                        title={client.active ? 'Desactivar' : 'Reactivar'}
                        className={`p-1.5 rounded-lg transition ${
                          client.active
                            ? 'text-gray-400 hover:text-amber-700 hover:bg-amber-50'
                            : 'text-gray-400 hover:text-green-700 hover:bg-green-50'
                        }`}
                      >
                        {client.active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {clients.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-sm text-gray-400">
                    {allClients.length ? 'No hay clientes con este estado' : 'No hay clientes registrados'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {statusTarget && (
        <ConfirmDialog
          title={statusTarget.active ? 'Desactivar cliente' : 'Reactivar cliente'}
          tone={statusTarget.active ? 'danger' : 'primary'}
          confirmLabel={statusTarget.active ? 'Sí, desactivar' : 'Sí, reactivar'}
          message={statusTarget.active ? (
            <>¿Desactivar a <strong>{statusTarget.name}</strong>? No podrá iniciar sesión ni usar el sistema. Sus pedidos, reclamos e historial se conservan y puede reactivarse en cualquier momento.</>
          ) : (
            <>¿Reactivar a <strong>{statusTarget.name}</strong>? Podrá volver a iniciar sesión.</>
          )}
          busy={statusBusy}
          error={statusError}
          onConfirm={handleToggleActive}
          onCancel={() => setStatusTarget(null)}
        />
      )}

      {showModal && (
        <Modal title={editingUser ? `Editar ${editingUser.name}` : 'Nuevo Cliente'} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            {/* Empresa + Sucursal */}
            <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 space-y-3">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Empresa y Sucursal</p>
              <div>
                <label className={labelClass}>Empresa *</label>
                <select
                  className={inputClass}
                  value={form.companyId}
                  onChange={handleCompanyChange}
                  disabled={!!editingUser}
                >
                  <option value="">— Seleccionar empresa —</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Sucursal</label>
                <select
                  className={inputClass}
                  value={form.sucursalId}
                  onChange={e => setForm(f => ({ ...f, sucursalId: e.target.value }))}
                  disabled={!form.companyId || availableSucursales.length === 0}
                >
                  <option value="">— Seleccionar sucursal —</option>
                  {availableSucursales.map(s => (
                    <option key={s.id} value={s.id}>{s.name} {s.city ? `— ${s.city}` : ''}</option>
                  ))}
                </select>
              </div>
              {editingUser && (
                <p className="text-xs text-blue-700/80">La empresa no se puede cambiar; sí la sucursal dentro de la misma empresa.</p>
              )}
            </div>

            {/* User data */}
            <div>
              <label className={labelClass}>Nombre usuario / razón social *</label>
              <input className={inputClass} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Papelería El Centro" />
            </div>
            <div>
              <label className={labelClass}>Nombre contacto</label>
              <input className={inputClass} value={form.contactName} onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))} placeholder="Nombre del responsable" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Email *</label>
                <input className={inputClass} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="cliente@empresa.com" />
              </div>
              <div>
                <label className={labelClass}>{editingUser ? 'Nueva contraseña' : 'Contraseña *'}</label>
                <input className={inputClass} type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder={editingUser ? 'Vacío = no cambiar' : '••••••••'} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Teléfono</label>
              <input className={inputClass} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="311-234-5678" />
            </div>
            <div>
              <label className={labelClass}>Dirección</label>
              <input className={inputClass} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Cra 10 # 5-23, Bogotá" />
            </div>
            <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-600">
              <Info className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
              <span>
                La <strong>lista de precios</strong> se hereda automáticamente desde la sucursal o empresa asignada.
                No es necesario configurarla manualmente.
              </span>
            </div>
            <div>
              <label className={labelClass}>Rol del usuario *</label>
              <select className={inputClass} value={form.clientRole} onChange={e => setForm(f => ({ ...f, clientRole: e.target.value }))}>
                <option value="creador_pedidos">Creador de pedidos</option>
                <option value="supervisor">Supervisor</option>
                <option value="administrador_contrato">Administrador de Contrato</option>
                {editingUser?.clientRole === 'admin_empresa' && (
                  <option value="admin_empresa">Administrador de Empresa</option>
                )}
              </select>
              <p className="text-xs text-gray-400 mt-1">
                {form.clientRole === 'supervisor'
                  ? 'Puede crear pedidos y aprobar los pedidos de creadores de su sucursal.'
                  : form.clientRole === 'administrador_contrato'
                  ? 'Como supervisor, pero ve y aprueba pedidos de TODAS las sucursales de la empresa.'
                  : form.clientRole === 'admin_empresa'
                  ? 'Consulta y administra la información de su empresa.'
                  : 'Crea pedidos que quedan pendientes de aprobación por un supervisor.'}
              </p>
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowModal(false)} disabled={saving} className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition disabled:opacity-50">
                {saving ? 'Guardando...' : editingUser ? 'Guardar cambios' : 'Crear Cliente'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
