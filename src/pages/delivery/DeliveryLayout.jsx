import logo from '../../logo-cartagena.jpg';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LogOut, Truck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';

export default function DeliveryLayout() {
  const { currentUser, logout } = useAuth();
  const { branches } = useApp();
  const navigate = useNavigate();

  const branch = branches.find(b => b.id === currentUser?.branchId);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-orange-700 text-white sticky top-0 z-30 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-4">
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="bg-white rounded-lg px-2 py-1">
              <img src={logo} alt="Papelería Cartagena" className="h-8 w-auto object-contain" />
            </div>
            {branch && <span className="text-orange-200 text-xs hidden sm:block">{branch.name}</span>}
          </div>

          <nav className="flex gap-1 ml-4">
            <NavLink
              to="/entregas"
              end
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  isActive ? 'bg-white bg-opacity-20 text-white' : 'text-orange-100 hover:text-white hover:bg-white hover:bg-opacity-10'
                }`
              }
            >
              <Truck className="w-4 h-4" />
              Pedidos en ruta
            </NavLink>
          </nav>

          <div className="flex-1" />

          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <p className="text-sm text-white font-medium">{currentUser?.name}</p>
              <p className="text-xs text-orange-200">Repartidor</p>
            </div>
            <div className="w-8 h-8 bg-orange-900 rounded-full flex items-center justify-center text-white text-xs font-bold">
              {currentUser?.initials}
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 text-orange-100 hover:text-white hover:bg-white hover:bg-opacity-10 rounded-lg text-sm transition"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:block">Salir</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
