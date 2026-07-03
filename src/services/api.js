// ────────────────────────────────────────────────────────────
// api.js — Cliente HTTP para la API de Papelería Cartagena
// Base URL: /api/v1  (Nginx lo proxea a Node.js :3000)
// ────────────────────────────────────────────────────────────

const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

// Convierte snake_case → camelCase en todos los objetos/arrays de la respuesta
function toCamel(str) {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
function deepCamel(val) {
  if (Array.isArray(val))  return val.map(deepCamel);
  if (val !== null && typeof val === 'object' && !(val instanceof File)) {
    return Object.fromEntries(
      Object.entries(val).map(([k, v]) => [toCamel(k), deepCamel(v)])
    );
  }
  return val;
}

function getToken() {
  return localStorage.getItem('pc_token');
}

async function request(method, path, body = null, isFormData = false) {
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!isFormData) headers['Content-Type'] = 'application/json';

  const config = { method, headers };
  if (body) config.body = isFormData ? body : JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, config);

  // 204 No Content
  if (res.status === 204) return null;

  const raw = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  const data = deepCamel(raw);

  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const get  = (path)         => request('GET',    path);
const post = (path, body)   => request('POST',   path, body);
const put  = (path, body)   => request('PUT',    path, body);
const del  = (path)         => request('DELETE', path);
const postForm = (path, fd) => request('POST',   path, fd, true);

// ── Auth ────────────────────────────────────────────────────
export const authApi = {
  login:  (email, password) => post('/auth/login', { email, password }),
  logout: ()                => post('/auth/logout'),
  me:     ()                => get('/auth/me'),
};

// ── Companies ───────────────────────────────────────────────
export const companiesApi = {
  list:   (params = {}) => get('/companies?' + new URLSearchParams(params)),
  get:    (id)          => get(`/companies/${id}`),
  create: (data)        => post('/companies', data),
  update: (id, data)    => put(`/companies/${id}`, data),
  remove: (id)          => del(`/companies/${id}`),
};

// ── Sucursales ──────────────────────────────────────────────
export const sucursalesApi = {
  list:   (companyId)         => get(`/companies/${companyId}/sucursales`),
  create: (companyId, data)   => post(`/companies/${companyId}/sucursales`, data),
  update: (companyId, sId, d) => put(`/companies/${companyId}/sucursales/${sId}`, d),
  remove: (companyId, sId)    => del(`/companies/${companyId}/sucursales/${sId}`),
};

// ── Branches ────────────────────────────────────────────────
export const branchesApi = {
  list:   (params = {}) => get('/branches?' + new URLSearchParams(params)),
  create: (data)        => post('/branches', data),
  update: (id, data)    => put(`/branches/${id}`, data),
  remove: (id)          => del(`/branches/${id}`),
};

// ── Users ───────────────────────────────────────────────────
export const usersApi = {
  list:   (params = {}) => get('/users?' + new URLSearchParams(params)),
  get:    (id)          => get(`/users/${id}`),
  create: (data)        => post('/users', data),
  update: (id, data)    => put(`/users/${id}`, data),
  remove: (id)          => del(`/users/${id}`),
};

// ── Categories ──────────────────────────────────────────────
export const categoriesApi = {
  list:   (params = {}) => get('/categories?' + new URLSearchParams(params)),
  create: (data)        => post('/categories', data),
  update: (id, data)    => put(`/categories/${id}`, data),
  remove: (id)          => del(`/categories/${id}`),
  related:    (id)              => get(`/categories/${id}/related`),
  setRelated: (id, ids)         => put(`/categories/${id}/related`, { relatedCategoryIds: ids }),
};

// ── Price Lists ─────────────────────────────────────────────
export const priceListsApi = {
  list:   ()         => get('/price-lists'),
  create: (data)     => post('/price-lists', data),
  update: (id, data) => put(`/price-lists/${id}`, data),
  remove: (id)       => del(`/price-lists/${id}`),
  items:        (id)            => get(`/price-lists/${id}/items`),
  saveItems:    (id, items)     => put(`/price-lists/${id}/items`, { items }),
  companies:    (id)            => get(`/price-lists/${id}/companies`),
  setCompanies: (id, companyIds) => put(`/price-lists/${id}/companies`, { companyIds }),
};

// ── Products ────────────────────────────────────────────────
export const productsApi = {
  list:   (params = {}) => get('/products?' + new URLSearchParams(params)),
  get:    (id)          => get(`/products/${id}`),
  create: (data)        => post('/products', data),
  update: (id, data)    => put(`/products/${id}`, data),
  remove: (id)          => del(`/products/${id}`),
  uploadImage: (id, file) => {
    const fd = new FormData();
    fd.append('image', file);
    return postForm(`/products/${id}/image`, fd);
  },
  removeImage: (id)     => del(`/products/${id}/image`),
};

// ── Catalog (clientes) ──────────────────────────────────────
export const catalogApi = {
  list: (params = {}) => get('/catalog?' + new URLSearchParams(params)),
  related: (productId, limit = 6) =>
    get(`/catalog/related?productId=${productId}&limit=${limit}`),
};

// ── Orders ──────────────────────────────────────────────────
export const ordersApi = {
  list:   (params = {})     => get('/orders?' + new URLSearchParams(params)),
  get:    (id)              => get(`/orders/${id}`),
  create: (data)            => post('/orders', data),
  update: (id, data)        => put(`/orders/${id}`, data),
  updateItems: (id, data)   => put(`/orders/${id}/items`, data),
  timeline: (id)            => get(`/orders/${id}/timeline`),
  addComment:    (oId, txt) => post(`/orders/${oId}/comments`, { text: txt }),
  removeComment: (oId, cId) => del(`/orders/${oId}/comments/${cId}`),
  uploadAttachment: (oId, file, type) => {
    const fd = new FormData();
    fd.append('file', file);
    if (type) fd.append('type', type);
    return postForm(`/orders/${oId}/attachments`, fd);
  },
  getDownloadUrl: (oId, aId) => get(`/orders/${oId}/attachments/${aId}/download`),
  removeAttachment: (oId, aId) => del(`/orders/${oId}/attachments/${aId}`),
};

// ── Stats ───────────────────────────────────────────────────
export const statsApi = {
  admin:  (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return get('/stats/admin' + (qs ? `?${qs}` : ''));
  },
  advisor: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return get('/stats/advisor' + (qs ? `?${qs}` : ''));
  },
  client: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return get('/stats/client' + (qs ? `?${qs}` : ''));
  },
};
