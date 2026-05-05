import logo from "../../logo-cartagena.jpg";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LogOut, ClipboardList } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useApp } from "../../context/AppContext";

export default function AdvisorLayout() {
  const { currentUser, logout } = useAuth();
  const { branches } = useApp();
  const navigate = useNavigate();

  const branch = branches.find((b) => b.id === currentUser?.branchId);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-blue-900 text-white sticky top-0 z-30 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-4">
          {/* Logo */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="bg-white rounded-lg px-2 py-1">
              <img
                src={logo}
                alt="Papelería Cartagena"
                className="h-8 w-auto object-contain"
              />
            </div>
            {branch && (
              <span className="text-blue-300 text-xs hidden sm:block">
                {branch.name}
              </span>
            )}
          </div>

          {/* Nav */}
          <nav className="flex gap-1 ml-4">
            <NavLink
              to="/asesor"
              end
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? "bg-white bg-opacity-20 text-white"
                    : "text-blue-200 hover:text-white hover:bg-white hover:bg-opacity-10"
                }`
              }
            >
              <ClipboardList className="w-4 h-4" />
              Mis Pedidos
            </NavLink>
          </nav>

          <div className="flex-1" />

          {/* User */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <p className="text-sm text-white font-medium">
                {currentUser?.name}
              </p>
              <p className="text-xs text-blue-300">Asesor Comercial</p>
            </div>
            <div className="w-8 h-8 bg-blue-700 rounded-full flex items-center justify-center text-white text-xs font-bold">
              {currentUser?.initials}
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 text-blue-300 hover:text-white hover:bg-white hover:bg-opacity-10 rounded-lg text-sm transition"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:block">Salir</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
