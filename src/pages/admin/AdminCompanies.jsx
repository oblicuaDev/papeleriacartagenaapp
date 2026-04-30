import { useState } from 'react';
import { Plus, X, Building, GitBranch, ChevronDown, ChevronUp, Phone, MapPin, Edit2, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { companiesApi, sucursalesApi } from '../../services/api';

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

const EMPTY_COMPANY  = { name: '', nit: '', email: '', phone: '', address: '', advisorId: '', priceListId: '' };
const EMPTY_SUCURSAL = { name: '', address: '', city: '', advisorId: '', priceListId: '' };

// Convierte "" -> null para selects opcionales (deja undefined fuera de payload)
function nullable(value) {
  if (value === '' || value === undefined || value === null) return null;
  return Number(value);
}

export default function AdminCompanies() {
  const { companies, refreshCompanies, users, priceLists } = useApp();
  const advisors = (users || []).filter(u => u.role === 'advisor' && u.active);
  const [expandedId, setExpandedId] = useState(null);
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [companyForm, setCompanyForm] = useState(EMPTY_COMPANY);
  const [showSucursalModal, setShowSucursalModal] = useState(false);
  const [sucursalTargetCompanyId, setSucursalTargetCompanyId] = useState(null);
  const [editingSucursal, setEditingSucursal] = useState(null);
  const [sucursalForm, setSucursalForm] = useState(EMPTY_SUCURSAL);

  const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

  // ── Company CRUD ───────────────────────────────────────────────────────────
  function openCreateCompany() {
    setEditingCompany(null);
    setCompanyForm(EMPTY_COMPANY);
    setShowCompanyModal(true);
  }

  function openEditCompany(company) {
    setEditingCompany(company);
    setCompanyForm({
      name:        company.name        || '',
      nit:         company.nit         || '',
      email:       company.email       || '',
      phone:       company.phone       || '',
      address:     company.address     || '',
      advisorId:   company.advisorId   ?? '',
      priceListId: company.priceListId ?? '',
    });
    setShowCompanyModal(true);
  }

  async function handleSaveCompany() {
    if (!companyForm.name) return;
    const payload = {
      name:        companyForm.name,
      nit:         companyForm.nit         || null,
      email:       companyForm.email       || null,
      phone:       companyForm.phone       || null,
      address:     companyForm.address     || null,
      advisorId:   nullable(companyForm.advisorId),
      priceListId: nullable(companyForm.priceListId),
    };
    if (editingCompany) {
      await companiesApi.update(editingCompany.id, payload);
    } else {
      await companiesApi.create(payload);
    }
    await refreshCompanies();
    setShowCompanyModal(false);
  }

  async function handleDeleteCompany(id) {
    await companiesApi.remove(id);
    if (expandedId === id) setExpandedId(null);
    await refreshCompanies();
  }

  // ── Sucursal CRUD ─────────────────────────────────────────────────────────
  function openCreateSucursal(companyId) {
    setEditingSucursal(null);
    setSucursalForm(EMPTY_SUCURSAL);
    setSucursalTargetCompanyId(companyId);
    setShowSucursalModal(true);
  }

  function openEditSucursal(companyId, sucursal) {
    setEditingSucursal(sucursal);
    setSucursalForm({
      name:        sucursal.name        || '',
      address:     sucursal.address     || '',
      city:        sucursal.city        || '',
      advisorId:   sucursal.advisorId   ?? '',
      priceListId: sucursal.priceListId ?? '',
    });
    setSucursalTargetCompanyId(companyId);
    setShowSucursalModal(true);
  }

  async function handleSaveSucursal() {
    if (!sucursalForm.name) return;
    const payload = {
      name:        sucursalForm.name,
      address:     sucursalForm.address || null,
      city:        sucursalForm.city    || null,
      advisorId:   nullable(sucursalForm.advisorId),
      priceListId: nullable(sucursalForm.priceListId),
    };
    if (editingSucursal) {
      await sucursalesApi.update(sucursalTargetCompanyId, editingSucursal.id, payload);
    } else {
      await sucursalesApi.create(sucursalTargetCompanyId, payload);
    }
    await refreshCompanies();
    setShowSucursalModal(false);
  }

  async function handleDeleteSucursal(companyId, sucursalId) {
    await sucursalesApi.remove(companyId, sucursalId);
    await refreshCompanies();
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Empresas</h2>
          <p className="text-sm text-gray-500 mt-1">{companies.length} empresas registradas</p>
        </div>
        <button
          onClick={openCreateCompany}
          className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition"
        >
          <Plus className="w-4 h-4" />
          Nueva Empresa
        </button>
      </div>

      {/* Companies list */}
      <div className="space-y-3">
        {companies.map(company => (
          <div key={company.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Company row */}
            <div className="flex items-center gap-4 px-5 py-4">
              <div className="w-10 h-10 bg-blue-50 text-blue-700 rounded-xl flex items-center justify-center flex-shrink-0">
                <Building className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-gray-800">{company.name}</p>
                  {company.nit && (
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">NIT {company.nit}</span>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-0.5 flex-wrap">
                  {company.email && <p className="text-xs text-gray-400">{company.email}</p>}
                  {company.phone && (
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <Phone className="w-3 h-3" />{company.phone}
                    </span>
                  )}
                  {company.address && (
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <MapPin className="w-3 h-3" />{company.address}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <span className="text-xs text-gray-400 mr-2">
                  {company.sucursales.length} sucursal{company.sucursales.length !== 1 ? 'es' : ''}
                </span>
                <button
                  onClick={() => openEditCompany(company)}
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDeleteCompany(company.id)}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setExpandedId(expandedId === company.id ? null : company.id)}
                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition ml-1"
                >
                  {expandedId === company.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Sucursales panel */}
            {expandedId === company.id && (
              <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <GitBranch className="w-3.5 h-3.5" />
                    Sucursales
                  </p>
                  <button
                    onClick={() => openCreateSucursal(company.id)}
                    className="flex items-center gap-1 text-xs text-blue-700 font-medium hover:text-blue-800 transition px-2 py-1 bg-blue-50 rounded-lg"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Agregar sucursal
                  </button>
                </div>

                {company.sucursales.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2">Sin sucursales registradas</p>
                ) : (
                  <div className="space-y-2">
                    {company.sucursales.map(suc => (
                      <div key={suc.id} className="flex items-center gap-3 bg-white rounded-lg px-4 py-3 border border-gray-100">
                        <div className="w-7 h-7 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center flex-shrink-0">
                          <GitBranch className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-700">{suc.name}</p>
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
                            onClick={() => openEditSucursal(company.id, suc)}
                            className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteSucursal(company.id, suc.id)}
                            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
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
          </div>
        ))}

        {companies.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-100 px-5 py-12 text-center">
            <Building className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400">No hay empresas registradas</p>
          </div>
        )}
      </div>

      {/* Company Modal */}
      {showCompanyModal && (
        <Modal
          title={editingCompany ? 'Editar Empresa' : 'Nueva Empresa'}
          onClose={() => setShowCompanyModal(false)}
        >
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Nombre de la empresa *</label>
              <input
                className={inputClass}
                value={companyForm.name}
                onChange={e => setCompanyForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ej. Distribuciones Norte S.A.S."
              />
            </div>
            <div>
              <label className={labelClass}>NIT</label>
              <input
                className={inputClass}
                value={companyForm.nit}
                onChange={e => setCompanyForm(f => ({ ...f, nit: e.target.value }))}
                placeholder="900.123.456-7"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Email</label>
                <input
                  className={inputClass}
                  type="email"
                  value={companyForm.email}
                  onChange={e => setCompanyForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="contacto@empresa.com"
                />
              </div>
              <div>
                <label className={labelClass}>Teléfono</label>
                <input
                  className={inputClass}
                  value={companyForm.phone}
                  onChange={e => setCompanyForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="601-234-5678"
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Dirección principal</label>
              <input
                className={inputClass}
                value={companyForm.address}
                onChange={e => setCompanyForm(f => ({ ...f, address: e.target.value }))}
                placeholder="Cra 7 # 15-30, Bogotá"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Asesor asignado</label>
                <select
                  className={inputClass}
                  value={companyForm.advisorId}
                  onChange={e => setCompanyForm(f => ({ ...f, advisorId: e.target.value }))}
                >
                  <option value="">— Sin asignar —</option>
                  {advisors.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">Se asigna automáticamente a sus pedidos.</p>
              </div>
              <div>
                <label className={labelClass}>Lista de precios</label>
                <select
                  className={inputClass}
                  value={companyForm.priceListId}
                  onChange={e => setCompanyForm(f => ({ ...f, priceListId: e.target.value }))}
                >
                  <option value="">— Sin lista —</option>
                  {(priceLists || []).map(pl => (
                    <option key={pl.id} value={pl.id}>{pl.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowCompanyModal(false)}
                className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveCompany}
                className="flex-1 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition"
              >
                {editingCompany ? 'Guardar cambios' : 'Crear Empresa'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Sucursal Modal */}
      {showSucursalModal && (
        <Modal
          title={editingSucursal ? 'Editar Sucursal' : 'Nueva Sucursal'}
          onClose={() => setShowSucursalModal(false)}
        >
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Nombre de la sucursal *</label>
              <input
                className={inputClass}
                value={sucursalForm.name}
                onChange={e => setSucursalForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ej. Sede Norte"
              />
            </div>
            <div>
              <label className={labelClass}>Ciudad</label>
              <input
                className={inputClass}
                value={sucursalForm.city}
                onChange={e => setSucursalForm(f => ({ ...f, city: e.target.value }))}
                placeholder="Bogotá"
              />
            </div>
            <div>
              <label className={labelClass}>Dirección</label>
              <input
                className={inputClass}
                value={sucursalForm.address}
                onChange={e => setSucursalForm(f => ({ ...f, address: e.target.value }))}
                placeholder="Cra 15 # 85-20"
              />
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 space-y-3">
              <p className="text-xs font-semibold text-blue-800 uppercase tracking-wider">
                Overrides por sucursal (opcional)
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Asesor</label>
                  <select
                    className={inputClass}
                    value={sucursalForm.advisorId}
                    onChange={e => setSucursalForm(f => ({ ...f, advisorId: e.target.value }))}
                  >
                    <option value="">— Hereda de empresa —</option>
                    {advisors.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Lista de precios</label>
                  <select
                    className={inputClass}
                    value={sucursalForm.priceListId}
                    onChange={e => setSucursalForm(f => ({ ...f, priceListId: e.target.value }))}
                  >
                    <option value="">— Hereda de empresa —</option>
                    {(priceLists || []).map(pl => (
                      <option key={pl.id} value={pl.id}>{pl.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowSucursalModal(false)}
                className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveSucursal}
                className="flex-1 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 transition"
              >
                {editingSucursal ? 'Guardar cambios' : 'Agregar Sucursal'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
