import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building, ChevronDown, ChevronUp, GitBranch, MapPin, Phone, Eye } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';

export default function AdvisorCompanies() {
  const { companies, orders } = useApp();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [expandedId, setExpandedId] = useState(null);

  // Empresas asignadas a este asesor (a nivel empresa o sucursal).
  // El backend ya filtra el listado por advisor_id; aqui solo ordenamos.
  const myCompanies = useMemo(() => {
    return [...companies].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [companies]);

  function ordersForCompany(companyId) {
    // Conteo aproximado a partir del cache cargado en contexto.
    return orders.filter(o => o.companyId === companyId).length;
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Empresas asignadas</h2>
        <p className="text-sm text-gray-500 mt-1">
          {myCompanies.length} empresa{myCompanies.length !== 1 ? 's' : ''} bajo tu gestion
        </p>
      </div>

      {myCompanies.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 px-5 py-12 text-center">
          <Building className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-400">No tienes empresas asignadas</p>
        </div>
      ) : (
        <div className="space-y-3">
          {myCompanies.map(company => {
            const mySucursales = (company.sucursales || []).filter(
              s => s.advisorId == null || s.advisorId === currentUser?.id || company.advisorId === currentUser?.id
            );
            return (
              <div key={company.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
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
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-gray-400">
                      {mySucursales.length} sucursal{mySucursales.length !== 1 ? 'es' : ''}
                    </span>
                    <button
                      onClick={() => navigate(`/asesor?empresa=${company.id}`)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-50 rounded-lg transition"
                      title="Ver pedidos de esta empresa"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Pedidos
                      <span className="ml-1 text-gray-400">({ordersForCompany(company.id)})</span>
                    </button>
                    <button
                      onClick={() => setExpandedId(expandedId === company.id ? null : company.id)}
                      className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
                    >
                      {expandedId === company.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {expandedId === company.id && (
                  <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5 mb-3">
                      <GitBranch className="w-3.5 h-3.5" />
                      Sucursales asignadas
                    </p>
                    {mySucursales.length === 0 ? (
                      <p className="text-xs text-gray-400">Sin sucursales bajo tu gestion</p>
                    ) : (
                      <div className="space-y-2">
                        {mySucursales.map(suc => (
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
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
