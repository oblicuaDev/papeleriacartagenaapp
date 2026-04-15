import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import {
  productsApi, categoriesApi, priceListsApi, branchesApi,
  ordersApi, companiesApi, catalogApi, usersApi,
} from '../services/api';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const { currentUser } = useAuth();

  const [products,   setProducts]   = useState([]);
  const [categories, setCategories] = useState([]);
  const [priceLists, setPriceLists] = useState([]);
  const [branches,   setBranches]   = useState([]);
  const [orders,     setOrders]     = useState([]);
  const [companies,  setCompanies]  = useState([]);
  const [users,      setUsers]      = useState([]);
  const [cart,       setCart]       = useState([]);
  const [loadingApp, setLoadingApp] = useState(false);

  // Cargar datos base cuando el usuario está autenticado
  useEffect(() => {
    if (!currentUser) {
      setProducts([]); setCategories([]); setPriceLists([]);
      setBranches([]); setOrders([]); setCompanies([]); setUsers([]); setCart([]);
      return;
    }
    setLoadingApp(true);
    const role = currentUser.role;

    const loaders = [categoriesApi.list({ active: true })];

    if (role === 'admin') {
      loaders.push(
        productsApi.list({ active: true, limit: 100 }).then(r => r.data ?? r),
        priceListsApi.list(),
        branchesApi.list({ active: true }),
        ordersApi.list({ limit: 100 }).then(r => r.data ?? r),
        companiesApi.list({ active: true }),
        usersApi.list({ limit: 200 }),
      );
    } else if (role === 'advisor') {
      loaders.push(
        productsApi.list({ active: true, limit: 100 }).then(r => r.data ?? r),
        ordersApi.list({ limit: 100 }).then(r => r.data ?? r),
        companiesApi.list({ active: true }),
        usersApi.list({ role: 'client', limit: 200 }),
      );
    } else if (role === 'client') {
      loaders.push(
        catalogApi.list({ limit: 100 }).then(r => r.data ?? r),
        ordersApi.list({ limit: 100 }).then(r => r.data ?? r),
      );
    }

    Promise.allSettled(loaders).then(results => {
      const get = (i) => results[i]?.status === 'fulfilled' ? results[i].value : [];

      setCategories(get(0) || []);

      if (role === 'admin') {
        setProducts(get(1)   || []);
        setPriceLists(get(2) || []);
        setBranches(get(3)   || []);
        setOrders(get(4)     || []);
        setCompanies(get(5)  || []);
        setUsers(get(6)      || []);
      } else if (role === 'advisor') {
        setProducts(get(1)  || []);
        setOrders(get(2)    || []);
        setCompanies(get(3) || []);
        setUsers(get(4)     || []);
      } else if (role === 'client') {
        setProducts(get(1) || []);
        setOrders(get(2)   || []);
      }
      setLoadingApp(false);
    });
  }, [currentUser]);

  // ── Carrito ─────────────────────────────────────────────────
  function addToCart(product, quantity, unitPrice) {
    setCart(prev => {
      const existing = prev.find(i => i.productId === product.id);
      if (existing) {
        return prev.map(i =>
          i.productId === product.id ? { ...i, quantity: i.quantity + quantity } : i
        );
      }
      return [...prev, {
        productId:   product.id,
        productName: product.name,
        quantity,
        unitPrice,
        unit: product.unit,
      }];
    });
  }

  function updateCartItem(productId, quantity) {
    if (quantity <= 0) {
      setCart(prev => prev.filter(i => i.productId !== productId));
    } else {
      setCart(prev => prev.map(i => i.productId === productId ? { ...i, quantity } : i));
    }
  }

  function removeFromCart(productId) {
    setCart(prev => prev.filter(i => i.productId !== productId));
  }

  function clearCart() { setCart([]); }

  // ── Crear pedido → API ──────────────────────────────────────
  async function submitOrder(clientId, advisorId, notes) {
    const items = cart.map(i => ({
      productId: i.productId,
      quantity:  i.quantity,
      unitPrice: i.unitPrice,
    }));
    const created = await ordersApi.create({ notes, items });
    // Actualizar lista local
    setOrders(prev => [created, ...prev]);
    clearCart();
    return created.id;
  }

  // ── Actualizar pedido → API ─────────────────────────────────
  async function updateOrder(orderId, updates) {
    const updated = await ordersApi.update(orderId, updates);
    setOrders(prev =>
      prev.map(o => o.id === orderId ? { ...o, ...updated } : o)
    );
    return updated;
  }

  // ── Refrescar listas individuales (para CRUDs) ──────────────
  async function refreshOrders(params = {}) {
    const res = await ordersApi.list({ limit: 100, ...params });
    setOrders(res.data ?? res);
  }

  async function refreshProducts() {
    const role = currentUser?.role;
    if (role === 'client') {
      const res = await catalogApi.list({ limit: 100 });
      setProducts(res.data ?? res);
    } else {
      const res = await productsApi.list({ active: true, limit: 100 });
      setProducts(res.data ?? res);
    }
  }

  async function refreshCompanies() {
    const res = await companiesApi.list({ active: true });
    setCompanies(res);
  }

  async function refreshUsers(params = {}) {
    const res = await usersApi.list({ limit: 200, ...params });
    setUsers(res);
  }

  const cartTotal = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  return (
    <AppContext.Provider value={{
      products,   setProducts,
      categories, setCategories,
      priceLists, setPriceLists,
      branches,   setBranches,
      orders,     setOrders,
      companies,  setCompanies,
      users,      setUsers,
      cart, cartTotal, cartCount,
      loadingApp,
      addToCart, updateCartItem, removeFromCart, clearCart,
      submitOrder, updateOrder,
      refreshOrders, refreshProducts, refreshCompanies, refreshUsers,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
