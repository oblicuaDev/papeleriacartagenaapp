import logo from '../../logo-cartagena.jpg';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ShoppingCart, LogOut, X, Minus, Plus, Trash2, Search, ClipboardCheck, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { formatCOP } from '../../data/mockData';

export default function ClientLayout() {
  const { currentUser, logout } = useAuth();
  const { cart, cartTotal, cartCount, updateCartItem, removeFromCart, orders, users } = useApp();

  const isSupervisor = currentUser?.clientRole === 'supervisor';
  const companyClientIds = isSupervisor
    ? users.filter(u => u.role === 'client' && u.companyId === currentUser.companyId).map(u => u.id)
    : [];
  const pendingApprovalCount = isSupervisor
    ? orders.filter(o => o.status === 'Pendiente por aprobar' && companyClientIds.includes(o.clientId)).length
    : 0;
  const navigate = useNavigate();
  const [cartOpen, setCartOpen] = useState(false);
  const [search, setSearch] = useState('');

  function handleLogout() {
    logout();
    navigate('/login');
  }

  function handleConfirm() {
    setCartOpen(false);
    navigate('/cliente/confirmar-pedido');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-blue-900 text-white sticky top-0 z-30 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-4">
          {/* Logo */}
          <div className="flex items-center flex-shrink-0">
            <div className="bg-white rounded-lg px-2 py-1">
              <img
                src={logo}
                alt="Papelería Cartagena"
                className="h-8 w-auto object-contain"
              />
            </div>
          </div>

          {/* Search */}
          <div className="flex-1 max-w-md mx-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-300 w-4 h-4" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar productos..."
                className="w-full pl-9 pr-4 py-2 bg-blue-800 bg-opacity-60 text-white placeholder-blue-300 rounded-lg text-sm border border-blue-700 focus:outline-none focus:border-blue-400 focus:bg-blue-800"
              />
            </div>
          </div>

          {/* Nav */}
          <nav className="flex gap-1">
            <NavLink
              to="/cliente"
              end
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-sm font-medium transition ${isActive ? 'bg-white bg-opacity-20 text-white' : 'text-blue-200 hover:text-white hover:bg-white hover:bg-opacity-10'}`
              }
            >
              Catálogo
            </NavLink>
            <NavLink
              to="/cliente/pedidos"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-sm font-medium transition ${isActive ? 'bg-white bg-opacity-20 text-white' : 'text-blue-200 hover:text-white hover:bg-white hover:bg-opacity-10'}`
              }
            >
              Mis Pedidos
            </NavLink>
            {isSupervisor && (
              <>
                <NavLink
                  to="/cliente/aprobar-pedidos"
                  className={({ isActive }) =>
                    `relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition ${isActive ? 'bg-yellow-400 text-blue-900' : 'bg-yellow-400 bg-opacity-20 text-yellow-300 hover:bg-yellow-400 hover:bg-opacity-30 hover:text-yellow-200'}`
                  }
                >
                  <ClipboardCheck className="w-4 h-4" />
                  Aprobar Pedidos
                  {pendingApprovalCount > 0 && (
                    <span className="ml-1 w-5 h-5 bg-rose-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                      {pendingApprovalCount}
                    </span>
                  )}
                </NavLink>
                <NavLink
                  to="/cliente/administrar"
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition ${isActive ? 'bg-white bg-opacity-20 text-white' : 'text-blue-200 hover:text-white hover:bg-white hover:bg-opacity-10'}`
                  }
                >
                  <Users className="w-4 h-4" />
                  Administrar
                </NavLink>
              </>
            )}
          </nav>

          {/* Cart */}
          <button
            onClick={() => setCartOpen(true)}
            className="relative p-2 text-blue-200 hover:text-white hover:bg-white hover:bg-opacity-10 rounded-lg transition"
          >
            <ShoppingCart className="w-5 h-5" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-400 text-blue-900 text-xs font-bold rounded-full flex items-center justify-center">
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
          </button>

          {/* User */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-8 h-8 bg-blue-700 rounded-full flex items-center justify-center text-white text-xs font-bold hidden sm:flex">
              {currentUser?.initials}
            </div>
            <span className="text-sm text-blue-200 hidden md:block">{currentUser?.name}</span>
            <button onClick={handleLogout} className="p-1.5 text-blue-300 hover:text-white transition" title="Cerrar sesión">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Outlet context={{ search }} />
      </main>

      {/* Cart Slide-Over */}
      {cartOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black bg-opacity-50" onClick={() => setCartOpen(false)} />
          <div className="fixed right-0 top-0 h-full w-full sm:w-96 bg-white z-50 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-blue-700" />
                <h2 className="font-semibold text-gray-800">Carrito de Compras</h2>
                {cartCount > 0 && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">{cartCount} items</span>
                )}
              </div>
              <button onClick={() => setCartOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <>
              <div className="flex-1 overflow-y-auto p-4">
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center py-10">
                    <ShoppingCart className="w-12 h-12 text-gray-200 mb-3" />
                    <p className="text-gray-400 text-sm">Tu carrito está vacío</p>
                    <p className="text-gray-300 text-xs mt-1">Agrega productos desde el catálogo</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {cart.map(item => (
                      <div key={item.productId} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{item.productName}</p>
                          <p className="text-xs text-gray-500">{formatCOP(item.unitPrice)} / {item.unit}</p>
                          <p className="text-sm font-semibold text-blue-700 mt-1">
                            {formatCOP(item.unitPrice * item.quantity)}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <button
                            onClick={() => removeFromCart(item.productId)}
                            className="p-1 text-gray-300 hover:text-red-500 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => updateCartItem(item.productId, item.quantity - 1)}
                              className="w-6 h-6 flex items-center justify-center border border-gray-300 rounded text-gray-600 hover:bg-gray-100 transition"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                            <button
                              onClick={() => updateCartItem(item.productId, item.quantity + 1)}
                              className="w-6 h-6 flex items-center justify-center border border-gray-300 rounded text-gray-600 hover:bg-gray-100 transition"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {cart.length > 0 && (
                <div className="border-t border-gray-100 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">Total estimado</p>
                    <p className="text-xl font-bold text-gray-900">{formatCOP(cartTotal)}</p>
                  </div>
                  <button
                    onClick={handleConfirm}
                    className="w-full py-3 bg-blue-700 text-white rounded-xl text-sm font-semibold hover:bg-blue-800 transition"
                  >
                    Revisar y confirmar pedido
                  </button>
                </div>
              )}
            </>
          </div>
        </>
      )}
    </div>
  );
}
