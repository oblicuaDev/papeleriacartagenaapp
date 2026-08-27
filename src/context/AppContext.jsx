import { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { splitIva } from "../data/mockData";
import {
  productsApi,
  categoriesApi,
  granCategoriasApi,
  priceListsApi,
  branchesApi,
  ordersApi,
  companiesApi,
  catalogApi,
  usersApi,
} from "../services/api";

// Exported so detail pages can fetch a full order without polluting context
export { ordersApi };

const AppContext = createContext(null);

// Itera todas las páginas de un endpoint paginado hasta agotar `total`.
// Backend cap actual: 1000 por página. Asumimos response { data, total, page, limit }.
async function fetchAllPaginated(apiFn, baseParams = {}, pageSize = 1000) {
  const all = [];
  let page = 1;
  let total = Infinity;
  let firstResponse = null;
  while (all.length < total) {
    const res = await apiFn({ ...baseParams, page, limit: pageSize });
    if (!firstResponse) firstResponse = res;
    const rows = Array.isArray(res) ? res : (res.data ?? []);
    all.push(...rows);
    if (Array.isArray(res)) { total = rows.length; break; }
    total = typeof res.total === 'number' ? res.total : rows.length;
    if (rows.length === 0 || rows.length < pageSize) break;
    page += 1;
  }
  // Logs temporales — eliminar tras validar carga completa
  console.log('[catalog/products] response sample:', firstResponse);
  console.log('[catalog/products] total reportado:', total, '— cargados:', all.length, '— páginas:', page);
  return all;
}

const CART_STORAGE_KEY = "pc_cart";

// El carrito se persiste en localStorage para que un pedido a medio armar
// sobreviva a recargas y al cierre de la pestana/navegador. Se guarda junto
// al userId para no arrastrar el carrito de otra cuenta en el mismo navegador.
function loadStoredCart() {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "null");
    return {
      userId: raw?.userId ?? null,
      items: Array.isArray(raw?.items) ? raw.items : [],
    };
  } catch {
    return { userId: null, items: [] };
  }
}

export function AppProvider({ children }) {
  const { currentUser, loading: authLoading } = useAuth();

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [granCategorias, setGranCategorias] = useState([]);
  const [priceLists, setPriceLists] = useState([]);
  const [branches, setBranches] = useState([]);
  const [orders, setOrders] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [users, setUsers] = useState([]);
  const [cart, setCart] = useState(() => loadStoredCart().items);
  const [loadingApp, setLoadingApp] = useState(false);

  // Cargar datos base cuando el usuario está autenticado
  useEffect(() => {
    // Mientras AuthContext hidrata la sesion (token -> perfil) no tocamos nada,
    // para no borrar el carrito persistido en una recarga.
    if (authLoading) return;

    if (!currentUser) {
      setProducts([]);
      setCategories([]);
      setGranCategorias([]);
      setPriceLists([]);
      setBranches([]);
      setOrders([]);
      setCompanies([]);
      setUsers([]);
      clearCart();
      return;
    }

    // Si el carrito guardado pertenece a otra cuenta, descartarlo.
    const stored = loadStoredCart();
    if (stored.userId != null && stored.userId !== currentUser.id) {
      clearCart();
    }

    setLoadingApp(true);
    const role = currentUser.role;

    const loaders = [
      categoriesApi.list({ active: true }),
      granCategoriasApi.list({ active: true }),
    ];

    if (role === "admin") {
      loaders.push(
        fetchAllPaginated(productsApi.list, { active: true }),
        priceListsApi.list(),
        branchesApi.list({ active: true }),
        ordersApi.list({ limit: 100 }).then((r) => r.data ?? r),
        companiesApi.list({ active: true }),
        usersApi.list({ limit: 200 }),
      );
    } else if (role === "advisor") {
      // Cargamos TODOS los users (no solo clients) para poder mostrar repartidores
      // disponibles al momento de asignar un pedido.
      loaders.push(
        fetchAllPaginated(productsApi.list, { active: true }),
        ordersApi.list({ limit: 100 }).then((r) => r.data ?? r),
        companiesApi.list({ active: true }),
        usersApi.list({ limit: 300 }),
      );
    } else if (role === "client") {
      // El catálogo se consulta server-side desde ClientCatalog (paginado +
      // filtros en backend), por eso aquí no precargamos `products`. Otras
      // vistas del cliente (detalle/repetir pedido) usan el snapshot del
      // pedido en order_items, que ya viaja con productName/sku/unitPrice.
      loaders.push(
        ordersApi.list({ limit: 100 }).then((r) => r.data ?? r),
        usersApi.list({ limit: 200 }),
        companiesApi.list({ active: true }),
      );
    } else if (role === "delivery") {
      // Backend ya filtra por estados operativos (Alistamiento / En Ruta / Entregado).
      loaders.push(ordersApi.list({ limit: 100 }).then((r) => r.data ?? r));
    }

    Promise.allSettled(loaders).then((results) => {
      const get = (i) =>
        results[i]?.status === "fulfilled" ? results[i].value : [];

      setCategories(get(0) || []);
      setGranCategorias(get(1) || []);

      if (role === "admin") {
        setProducts(get(2) || []);
        setPriceLists(get(3) || []);
        setBranches(get(4) || []);
        setOrders(get(5) || []);
        setCompanies(get(6) || []);
        setUsers(get(7) || []);
      } else if (role === "advisor") {
        setProducts(get(2) || []);
        setOrders(get(3) || []);
        setCompanies(get(4) || []);
        setUsers(get(5) || []);
      } else if (role === "client") {
        setOrders(get(2) || []);
        setUsers(get(3) || []);
        setCompanies(get(4) || []);
      } else if (role === "delivery") {
        setOrders(get(2) || []);
      }
      setLoadingApp(false);
    });
  }, [currentUser, authLoading]);

  // Persistir el carrito en cada cambio (junto al userId dueno).
  useEffect(() => {
    // No escribir mientras la sesion aun se hidrata: sobreescribiria el userId
    // dueno con null y romperia el chequeo de "carrito de otra cuenta".
    if (authLoading) return;
    try {
      localStorage.setItem(
        CART_STORAGE_KEY,
        JSON.stringify({ userId: currentUser?.id ?? null, items: cart }),
      );
    } catch {
      /* almacenamiento no disponible: el carrito sigue en memoria */
    }
  }, [cart, currentUser, authLoading]);

  // ── Carrito ─────────────────────────────────────────────────
  function addToCart(product, quantity, unitPrice) {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id
            ? { ...i, quantity: i.quantity + quantity }
            : i,
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          quantity,
          unitPrice,
          unit: product.unit,
        },
      ];
    });
  }

  function updateCartItem(productId, quantity) {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((i) => i.productId !== productId));
    } else {
      setCart((prev) =>
        prev.map((i) => (i.productId === productId ? { ...i, quantity } : i)),
      );
    }
  }

  function removeFromCart(productId) {
    setCart((prev) => prev.filter((i) => i.productId !== productId));
  }

  function clearCart() {
    setCart([]);
    try {
      localStorage.removeItem(CART_STORAGE_KEY);
    } catch {
      /* noop */
    }
  }

  // ── Crear pedido → API ──────────────────────────────────────
  // Backend resuelve precio (sucursal > company > user > base) y rechaza
  // mismatches con 409. Mandamos unitPrice solo como verificacion: si el
  // backend ve algo distinto, lanza error y mostramos al usuario que el
  // precio cambio.
  async function submitOrder(_clientId, _advisorId, notes) {
    const items = cart.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
      unitPrice: i.unitPrice, // verificacion contra precio backend
    }));
    const created = await ordersApi.create({ notes, items });
    setOrders((prev) => [created, ...prev]);
    clearCart();
    return created.id;
  }

  // ── Actualizar pedido → API ─────────────────────────────────
  async function updateOrder(orderId, updates) {
    const updated = await ordersApi.update(orderId, updates);
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, ...updated } : o)),
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
    if (role === "delivery" || role === "client") return; // estos roles no usan products global
    const all = await fetchAllPaginated(productsApi.list, { active: true });
    setProducts(all);
  }

  async function refreshCompanies() {
    const res = await companiesApi.list({ active: true });
    setCompanies(res);
  }

  async function refreshCategories() {
    const res = await categoriesApi.list();
    setCategories(res || []);
  }

  async function refreshGranCategorias() {
    const res = await granCategoriasApi.list();
    setGranCategorias(res || []);
  }

  async function refreshBranches() {
    const res = await branchesApi.list();
    setBranches(res || []);
  }

  async function refreshPriceLists() {
    const res = await priceListsApi.list();
    setPriceLists(res || []);
  }

  async function refreshUsers(params = {}) {
    const res = await usersApi.list({ limit: 200, ...params });
    setUsers(res);
  }

  const cartTotal = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const { subtotal: cartSubtotal, iva: cartIva } = splitIva(cartTotal);

  return (
    <AppContext.Provider
      value={{
        products,
        setProducts,
        categories,
        setCategories,
        granCategorias,
        setGranCategorias,
        priceLists,
        setPriceLists,
        branches,
        setBranches,
        orders,
        setOrders,
        companies,
        setCompanies,
        users,
        setUsers,
        cart,
        cartTotal,
        cartSubtotal,
        cartIva,
        cartCount,
        loadingApp,
        addToCart,
        updateCartItem,
        removeFromCart,
        clearCart,
        submitOrder,
        updateOrder,
        refreshOrders,
        refreshProducts,
        refreshCompanies,
        refreshUsers,
        refreshCategories,
        refreshGranCategorias,
        refreshBranches,
        refreshPriceLists,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
