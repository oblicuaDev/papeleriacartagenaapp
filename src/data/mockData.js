// =====================
// COMPANIES (EMPRESAS CLIENTE)
// =====================
export const INITIAL_COMPANIES = [
  {
    id: 1,
    name: 'Papelería El Centro',
    nit: '900.123.456-7',
    email: 'contacto@elcentro.com',
    phone: '601-234-5678',
    address: 'Cra 10 # 5-23, Bogotá',
    active: true,
    sucursales: [
      { id: 1, name: 'Sede Principal', address: 'Cra 10 # 5-23, Bogotá', city: 'Bogotá', active: true },
      { id: 2, name: 'Sucursal Chapinero', address: 'Cra 13 # 56-12, Bogotá', city: 'Bogotá', active: true },
    ],
  },
  {
    id: 2,
    name: 'Distribuciones Norte S.A.S.',
    nit: '800.987.654-3',
    email: 'compras@disnorte.com',
    phone: '604-456-7890',
    address: 'Av. El Poblado # 10-50, Medellín',
    active: true,
    sucursales: [
      { id: 1, name: 'Sede Medellín', address: 'Av. El Poblado # 10-50, Medellín', city: 'Medellín', active: true },
    ],
  },
];

// =====================
// USERS
// =====================
export const INITIAL_USERS = [
  {
    id: 1,
    name: 'Carlos Rodríguez',
    email: 'admin@oblicua.com',
    password: 'admin123',
    role: 'admin',
    initials: 'CR',
  },
  {
    id: 2,
    name: 'Ana Martínez',
    email: 'asesor@oblicua.com',
    password: 'asesor123',
    role: 'advisor',
    branchId: 1,
    initials: 'AM',
  },
  {
    id: 3,
    name: 'Papelería El Centro',
    email: 'supervisor@oblicua.com',
    password: 'cliente123',
    role: 'client',
    clientRole: 'supervisor',
    priceListId: 2,
    companyId: 1,
    sucursalId: 1,
    contactName: 'Lucía Gómez',
    phone: '311-234-5678',
    address: 'Cra 10 # 5-23, Bogotá',
    initials: 'PC',
    createdAt: '2024-01-15',
  },
  {
    id: 4,
    name: 'Comprador El Centro',
    email: 'cliente@oblicua.com',
    password: 'cliente123',
    role: 'client',
    clientRole: 'creador_pedidos',
    priceListId: 2,
    companyId: 1,
    sucursalId: 1,
    contactName: 'Pedro Sánchez',
    phone: '311-987-6543',
    address: 'Cra 10 # 5-23, Bogotá',
    initials: 'CE',
    createdAt: '2024-01-20',
  },
];

// =====================
// BRANCHES (SEDES)
// =====================
export const INITIAL_BRANCHES = [
  { id: 1, name: 'Sede Centro', city: 'Bogotá', address: 'Cra 7 # 15-30', phone: '601-234-5678', active: true },
  { id: 2, name: 'Sede Norte', city: 'Bogotá', address: 'Cra 15 # 85-20', phone: '601-345-6789', active: true },
];

// =====================
// CATEGORIES
// =====================
export const INITIAL_CATEGORIES = [
  { id: 1, name: 'Papel', description: 'Resmas, pliegos y tipos de papel', active: true },
  { id: 2, name: 'Escritura', description: 'Esferos, marcadores y lápices', active: true },
  { id: 3, name: 'Cartón y Embalaje', description: 'Cajas, cartulinas y embalaje', active: true },
  { id: 4, name: 'Archivadores y Carpetas', description: 'Carpetas, folders y archivadores', active: true },
  { id: 5, name: 'Útiles de Oficina', description: 'Cintas, sobres y accesorios', active: true },
];

// =====================
// PRICE LISTS
// =====================
export const INITIAL_PRICE_LISTS = [
  { id: 1, name: 'Lista A', description: 'Precio público', multiplier: 1.0 },
  { id: 2, name: 'Lista B', description: 'Precio distribuidor', multiplier: 0.90 },
  { id: 3, name: 'Lista C', description: 'Precio mayorista', multiplier: 0.80 },
];

// =====================
// PRODUCTS
// =====================
export const INITIAL_PRODUCTS = [
  { id: 1, name: 'Resma Papel Bond 75g A4', sku: 'PAP-001', categoryId: 1, description: 'Resma de 500 hojas papel bond 75g tamaño A4', basePrice: 12500, stock: 150, unit: 'Resma', active: true },
  { id: 2, name: 'Resma Papel Bond 75g Carta', sku: 'PAP-002', categoryId: 1, description: 'Resma de 500 hojas papel bond 75g tamaño Carta', basePrice: 11800, stock: 200, unit: 'Resma', active: true },
  { id: 3, name: 'Resma Papel 90g A4', sku: 'PAP-003', categoryId: 1, description: 'Resma de 500 hojas papel 90g tamaño A4, ideal para impresión profesional', basePrice: 18500, stock: 80, unit: 'Resma', active: true },
  { id: 4, name: 'Papel Fotocopia 70g A4', sku: 'PAP-004', categoryId: 1, description: 'Resma de 500 hojas papel económico 70g para fotocopias', basePrice: 9800, stock: 300, unit: 'Resma', active: true },
  { id: 5, name: 'Papel Kraft Pliego', sku: 'PAP-005', categoryId: 1, description: 'Pliego de papel kraft para embalajes y manualidades', basePrice: 850, stock: 500, unit: 'Pliego', active: true },
  { id: 6, name: 'Esfero Azul Caja x12', sku: 'ESC-001', categoryId: 2, description: 'Caja de 12 esferos de tinta azul, punta media', basePrice: 8400, stock: 120, unit: 'Caja', active: true },
  { id: 7, name: 'Esfero Negro Caja x12', sku: 'ESC-002', categoryId: 2, description: 'Caja de 12 esferos de tinta negra, punta media', basePrice: 8400, stock: 95, unit: 'Caja', active: true },
  { id: 8, name: 'Esfero Rojo Caja x12', sku: 'ESC-003', categoryId: 2, description: 'Caja de 12 esferos de tinta roja, punta media', basePrice: 8400, stock: 60, unit: 'Caja', active: true },
  { id: 9, name: 'Marcador Permanente Negro', sku: 'ESC-004', categoryId: 2, description: 'Marcador permanente negro punta gruesa', basePrice: 2800, stock: 200, unit: 'Unidad', active: true },
  { id: 10, name: 'Marcador Tablero Set x5', sku: 'ESC-005', categoryId: 2, description: 'Set de 5 marcadores para tablero en colores surtidos', basePrice: 15000, stock: 45, unit: 'Set', active: true },
  { id: 11, name: 'Caja Cartón 50x30x30 cm', sku: 'CAR-001', categoryId: 3, description: 'Caja de cartón corrugado referencia grande', basePrice: 4500, stock: 300, unit: 'Unidad', active: true },
  { id: 12, name: 'Caja Cartón 40x25x25 cm', sku: 'CAR-002', categoryId: 3, description: 'Caja de cartón corrugado referencia mediana', basePrice: 3200, stock: 400, unit: 'Unidad', active: true },
  { id: 13, name: 'Caja Cartón 30x20x20 cm', sku: 'CAR-003', categoryId: 3, description: 'Caja de cartón corrugado referencia pequeña', basePrice: 2100, stock: 500, unit: 'Unidad', active: true },
  { id: 14, name: 'Cartulina Blanca Pliego', sku: 'CAR-004', categoryId: 3, description: 'Pliego de cartulina blanca calibre 150g', basePrice: 1200, stock: 600, unit: 'Pliego', active: true },
  { id: 15, name: 'Cartulina Colores Paq x10', sku: 'CAR-005', categoryId: 3, description: 'Paquete de 10 pliegos de cartulina en colores surtidos', basePrice: 9500, stock: 80, unit: 'Paquete', active: true },
  { id: 16, name: 'Carpeta Colgante Caja x50', sku: 'ARC-001', categoryId: 4, description: 'Caja de 50 carpetas colgantes para archivador', basePrice: 32000, stock: 40, unit: 'Caja', active: true },
  { id: 17, name: 'Folder Carta Paq x50', sku: 'ARC-002', categoryId: 4, description: 'Paquete de 50 folders tamaño carta', basePrice: 18500, stock: 75, unit: 'Paquete', active: true },
  { id: 18, name: 'Archivador AZ Lomo 7cm', sku: 'ARC-003', categoryId: 4, description: 'Archivador de palanca lomo 7 cm, varios colores', basePrice: 14500, stock: 60, unit: 'Unidad', active: true },
  { id: 19, name: 'Cinta Adhesiva Transparente', sku: 'UTL-001', categoryId: 5, description: 'Rollo de cinta adhesiva transparente 48mm x 50m', basePrice: 4200, stock: 180, unit: 'Rollo', active: true },
  { id: 20, name: 'Sobre Manila Paq x100', sku: 'UTL-002', categoryId: 5, description: 'Paquete de 100 sobres manila tamaño oficio', basePrice: 12000, stock: 90, unit: 'Paquete', active: true },
];

// =====================
// ORDER STATUSES
// =====================
export const ORDER_STATUSES = ['Pendiente', 'Validar disponibilidad', 'Alistamiento', 'En Ruta', 'Entregado'];

// Label visible al usuario (estado interno → texto en UI)
export const STATUS_LABELS = {
  'Pendiente por aprobar': 'Pendiente por aprobar',
  'Pendiente':             'Aprobado',
  'Rechazado':             'Rechazado',
  'Validar disponibilidad':'Validar disponibilidad',
  'Alistamiento':          'Alistamiento',
  'En Ruta':               'En Ruta',
  'Entregado':             'Entregado',
};

export function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

export const STATUS_STYLES = {
  'Pendiente por aprobar': { bg: 'bg-rose-100', text: 'text-rose-800', border: 'border-rose-200' },
  'Pendiente': { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-200' },
  'Rechazado': { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-200' },
  'Validar disponibilidad': { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-200' },
  'Alistamiento': { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-200' },
  'En Ruta': { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-200' },
  'Entregado': { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-200' },
};

// =====================
// ORDERS
// =====================
export const INITIAL_ORDERS = [
  {
    id: 'ORD-001',
    clientId: 3,
    advisorId: 2,
    status: 'Entregado',
    createdAt: '2024-02-10',
    updatedAt: '2024-02-12',
    carrier: 'TCC',
    items: [
      { productId: 1, productName: 'Resma Papel Bond 75g A4', quantity: 10, unitPrice: 11250, unit: 'Resma' },
      { productId: 6, productName: 'Esfero Azul Caja x12', quantity: 5, unitPrice: 7560, unit: 'Caja' },
    ],
    notes: 'Entrega urgente solicitada',
    total: 150300,
    comments: [
      { id: 'c1', authorId: 2, authorName: 'Ana Martínez', authorRole: 'advisor', text: 'Pedido recibido y validado en bodega. Se procede con alistamiento.', createdAt: '2024-02-10T10:30:00' },
      { id: 'c2', authorId: 2, authorName: 'Ana Martínez', authorRole: 'advisor', text: 'Pedido despachado con TCC. Guía #TCC-2024-88321.', createdAt: '2024-02-12T08:15:00' },
    ],
    attachments: [
      { id: 'a1', name: 'remision-ORD-001.pdf', size: 142000, type: 'application/pdf', uploadedBy: 'Ana Martínez', uploadedAt: '2024-02-12T08:20:00' },
    ],
  },
  {
    id: 'ORD-002',
    clientId: 3,
    advisorId: 2,
    status: 'En Ruta',
    createdAt: '2024-02-20',
    updatedAt: '2024-02-21',
    carrier: 'Envia',
    items: [
      { productId: 2, productName: 'Resma Papel Bond 75g Carta', quantity: 5, unitPrice: 10620, unit: 'Resma' },
      { productId: 11, productName: 'Caja Cartón 50x30x30 cm', quantity: 20, unitPrice: 4050, unit: 'Unidad' },
    ],
    notes: '',
    total: 134100,
    comments: [
      { id: 'c3', authorId: 2, authorName: 'Ana Martínez', authorRole: 'advisor', text: 'Pedido alistado. Sale en ruta con Envia hoy.', createdAt: '2024-02-21T09:00:00' },
    ],
    attachments: [],
  },
  {
    id: 'ORD-003',
    clientId: 3,
    advisorId: 2,
    status: 'Alistamiento',
    createdAt: '2024-02-28',
    updatedAt: '2024-03-01',
    carrier: null,
    items: [
      { productId: 3, productName: 'Resma Papel 90g A4', quantity: 8, unitPrice: 16650, unit: 'Resma' },
      { productId: 16, productName: 'Carpeta Colgante Caja x50', quantity: 2, unitPrice: 28800, unit: 'Caja' },
    ],
    notes: 'Pedir factura',
    total: 190800,
    comments: [],
    attachments: [],
  },
  {
    id: 'ORD-004',
    clientId: 3,
    advisorId: 2,
    status: 'Pendiente',
    createdAt: '2024-03-01',
    updatedAt: '2024-03-01',
    carrier: null,
    items: [
      { productId: 1, productName: 'Resma Papel Bond 75g A4', quantity: 20, unitPrice: 11250, unit: 'Resma' },
      { productId: 9, productName: 'Marcador Permanente Negro', quantity: 30, unitPrice: 2520, unit: 'Unidad' },
      { productId: 19, productName: 'Cinta Adhesiva Transparente', quantity: 10, unitPrice: 3780, unit: 'Rollo' },
    ],
    notes: 'Para reabastecimiento mensual',
    total: 338700,
    comments: [],
    attachments: [],
  },
  {
    id: 'ORD-005',
    clientId: 4,
    advisorId: null,
    status: 'Pendiente por aprobar',
    createdAt: '2024-03-05',
    updatedAt: '2024-03-05',
    carrier: null,
    items: [
      { productId: 6, productName: 'Esfero Azul Caja x12', quantity: 10, unitPrice: 7560, unit: 'Caja' },
      { productId: 17, productName: 'Folder Carta Paq x50', quantity: 4, unitPrice: 16650, unit: 'Paquete' },
    ],
    notes: 'Pedido de reposición mensual de escritura',
    total: 142200,
    comments: [],
    attachments: [],
  },
];

// Helper: get price for a product given a priceListId
export function getPrice(basePrice, priceListId, priceLists) {
  const list = priceLists.find(pl => pl.id === priceListId);
  if (!list) return basePrice;
  return Math.round(basePrice * list.multiplier);
}

// Format currency COP
export function formatCOP(amount) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount);
}

// Discrimina IVA (19%) de un monto que ya lo incluye. Solo para preview
// client-side antes de que el pedido exista en backend (carrito) — una
// vez el pedido esta creado, usar siempre order.subtotal/order.iva
// persistidos, nunca recalcular para evitar divergencia con lo cobrado.
export const IVA_RATE = 0.19;

export function splitIva(total) {
  const subtotal = Math.round((Number(total) / (1 + IVA_RATE)) * 100) / 100;
  const iva = Math.round((Number(total) - subtotal) * 100) / 100;
  return { subtotal, iva };
}
