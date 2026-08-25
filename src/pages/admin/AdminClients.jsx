import { useState } from 'react';
import { Plus, X, Phone, MapPin, Calendar, Building, GitBranch, Info } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { usersApi } from '../../services/api';

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
  const [form, setForm] = useState(EMPTY_FORM);

  const clients = users.filter(u => u.role === 'client');

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
    setForm(EMPTY_FORM);
    setShowModal(true);
  }

  function handleCompanyChange(e) {
    setForm(f => ({ ...f, companyId: e.target.value, sucursalId: '' }));
  }

  async function handleSave() {
    if (!form.name || !form.email || !form.password) return;
    await usersApi.create({
      name:        form.name,
      contactName: form.contactName,
      email:       form.email,
      password:    form.password,
      phone:       form.phone,
      address:     form.address,
      companyId:   form.companyId ? Number(form.companyId) : null,
      sucursalId:  form.sucursalId ? Number(form.sucursalId) : null,
      clientRole:  form.clientRole,
      role:        'client',
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
          <h2 className="text-2xl font-bold text-gray-900">Clientes</h2>
          <p className="text-sm text-gray-500 mt-1">{clients.length} clientes registrados</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition"
        >
          <Plus className="w-4 h-4" />
          Nuevo Cliente
        </button>
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
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {clients.map(client => (
                <tr key={client.id} className="hover:bg-gray-50 transition-colors">
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
                </tr>
              ))}
              {clients.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-gray-400">
                    No hay clientes registrados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <Modal title="Nuevo Cliente" onClose={() => setShowModal(false)}>
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
                <label className={labelClass}>Contraseña *</label>
                <input className={inputClass} type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
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
              </select>
              <p className="text-xs text-gray-400 mt-1">
                {form.clientRole === 'supervisor'
                  ? 'Puede crear pedidos y aprobar los pedidos de creadores de su sucursal.'
                  : form.clientRole === 'administrador_contrato'
                  ? 'Como supervisor, pero ve y aprueba pedidos de TODAS las sucursales de la empresa.'
                  : 'Crea pedidos que quedan pendientes de aprobación por un supervisor.'}
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                Cancelar
              </button>
              <button onClick={handleSave} className="flex-1 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition">
                Crear Cliente
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
