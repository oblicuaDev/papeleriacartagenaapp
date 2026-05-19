import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, ShoppingCart, ClipboardList, User, CreditCard, CheckCircle,
  ChevronDown, ChevronUp, ArrowLeft, Package, Filter, Plus, Minus,
  Trash2, Phone, MapPin, FileText, Clock, Shield, HelpCircle, BookOpen,
  BarChart3, Star,
} from 'lucide-react';
import logo from '../logo-cartagena.jpg';
import CreditsFooter from '../components/CreditsFooter';

const STEPS = [
  {
    number: 1,
    icon: Search,
    title: 'Navegar el catálogo',
    color: 'blue',
    summary: 'Encuentra los productos que necesitas usando el buscador o los filtros por categoría.',
    details: [
      { icon: Search, text: 'Usa la barra de búsqueda en la parte superior para encontrar productos por nombre o código (SKU).' },
      { icon: Filter, text: 'Filtra por categoría con el menú desplegable para ver solo los productos de un tipo.' },
      { icon: BarChart3, text: 'Alterna entre vista en cuadrícula (tarjetas) y vista en lista según tu preferencia.' },
      { icon: Star, text: 'La sección "Sugeridos para ti" muestra los productos que pides con mayor frecuencia.' },
    ],
    tip: 'Haz clic en el ícono de información (ⓘ) de cualquier producto para ver la descripción completa, precio unitario y productos relacionados.',
  },
  {
    number: 2,
    icon: ShoppingCart,
    title: 'Agregar productos al carrito',
    color: 'purple',
    summary: 'Selecciona los productos y las cantidades que necesitas para tu pedido.',
    details: [
      { icon: Plus, text: 'Haz clic sobre la tarjeta del producto para agregar 1 unidad directamente al carrito.' },
      { icon: Plus, text: 'Usa el botón "Agregar al pedido" dentro del detalle del producto para elegir la cantidad exacta.' },
      { icon: Minus, text: 'Ajusta cantidades desde el carrito usando los botones + y – junto a cada producto.' },
      { icon: Trash2, text: 'Elimina un producto del carrito tocando el ícono de papelera.' },
    ],
    tip: 'El contador amarillo sobre el ícono del carrito muestra cuántos artículos diferentes has agregado.',
  },
  {
    number: 3,
    icon: ClipboardList,
    title: 'Revisar el carrito',
    color: 'emerald',
    summary: 'Verifica los productos seleccionados, cantidades y el total estimado antes de continuar.',
    details: [
      { icon: ShoppingCart, text: 'Abre el carrito haciendo clic en el ícono del carrito en la barra superior derecha.' },
      { icon: Minus, text: 'Ajusta cantidades o elimina productos que ya no necesitas.' },
      { icon: ClipboardList, text: 'Revisa el total estimado mostrado al final del carrito.' },
      { icon: CheckCircle, text: 'Cuando estés listo, haz clic en "Revisar y confirmar pedido" para avanzar.' },
    ],
    tip: 'El total mostrado es una estimación basada en tu lista de precios asignada. El precio final puede variar según disponibilidad.',
  },
  {
    number: 4,
    icon: User,
    title: 'Completar datos del pedido',
    color: 'orange',
    summary: 'Ingresa la información de entrega y cualquier indicación especial para tu pedido.',
    details: [
      { icon: User, text: 'Verifica que tu nombre y empresa aparezcan correctamente.' },
      { icon: MapPin, text: 'Confirma o actualiza la dirección de entrega.' },
      { icon: Phone, text: 'Ingresa un número de teléfono de contacto para coordinar la entrega.' },
      { icon: FileText, text: 'Agrega notas adicionales si hay instrucciones especiales (piso, oficina, horario de recepción, etc.).' },
    ],
    tip: 'Si necesitas factura electrónica, incluye los datos fiscales (NIT y razón social) en el campo de notas.',
  },
  {
    number: 5,
    icon: CreditCard,
    title: 'Seleccionar método de pago',
    color: 'pink',
    summary: 'Elige cómo realizarás el pago de tu pedido según las opciones disponibles.',
    details: [
      { icon: CreditCard, text: 'Selecciona el método de pago habilitado para tu empresa.' },
      { icon: Shield, text: 'Los métodos disponibles son configurados por tu asesor comercial según el acuerdo con tu empresa.' },
      { icon: FileText, text: 'Puedes agregar una referencia de pago o número de orden de compra interna si lo requieres.' },
    ],
    tip: 'Si necesitas activar un nuevo método de pago (transferencia, crédito, etc.), contacta a tu asesor comercial.',
  },
  {
    number: 6,
    icon: CheckCircle,
    title: 'Confirmar pedido',
    color: 'teal',
    summary: 'Revisa el resumen final y envía tu pedido. Recibirás seguimiento en tiempo real.',
    details: [
      { icon: ClipboardList, text: 'Revisa el resumen completo: productos, cantidades, total y datos de entrega.' },
      { icon: CheckCircle, text: 'Haz clic en "Confirmar pedido" para enviarlo al equipo de Papelería Cartagena.' },
      { icon: Clock, text: 'Tu pedido aparecerá en "Mis Pedidos" con estado "Pendiente" mientras es revisado.' },
      { icon: Phone, text: 'Tu asesor te contactará para confirmar disponibilidad y coordinar la entrega.' },
    ],
    tip: 'Puedes hacer seguimiento de tu pedido en la sección "Pedidos" del menú. Verás el historial de estados en tiempo real.',
  },
];

const FAQS = [
  {
    q: '¿Puedo modificar un pedido después de confirmarlo?',
    a: 'Una vez confirmado, contacta a tu asesor comercial directamente para solicitar modificaciones antes de que el pedido sea procesado y alistado.',
  },
  {
    q: '¿Cuánto tiempo tarda en llegar mi pedido?',
    a: 'El tiempo de entrega varía según tu ciudad y la disponibilidad de los productos. Tu asesor te informará el tiempo estimado al confirmar el pedido.',
  },
  {
    q: '¿Cómo puedo ver el estado de mis pedidos?',
    a: 'Ve a la sección "Pedidos" en el menú superior. Allí verás todos tus pedidos con su estado actual y el historial de cambios.',
  },
  {
    q: '¿Qué hago si un producto no aparece en el catálogo?',
    a: 'Contacta a tu asesor comercial para solicitar la inclusión del producto en tu catálogo personalizado.',
  },
  {
    q: '¿Mis precios son los mismos para todos los productos?',
    a: 'Los precios son personalizados por empresa según la lista de precios asignada. Es posible que veas precios diferentes a los de otras empresas.',
  },
  {
    q: '¿Qué significa "Pendiente por aprobar"?',
    a: 'En algunas empresas, los pedidos creados por compradores deben ser aprobados por un supervisor antes de ser enviados a Papelería Cartagena.',
  },
];

const COLOR_MAP = {
  blue:    { bg: 'bg-blue-50',    border: 'border-blue-200',    icon: 'bg-blue-700',    text: 'text-blue-700',    tip: 'bg-blue-50 border-blue-200 text-blue-800'    },
  purple:  { bg: 'bg-purple-50',  border: 'border-purple-200',  icon: 'bg-purple-600',  text: 'text-purple-700',  tip: 'bg-purple-50 border-purple-200 text-purple-800'  },
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', icon: 'bg-emerald-600', text: 'text-emerald-700', tip: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
  orange:  { bg: 'bg-orange-50',  border: 'border-orange-200',  icon: 'bg-orange-500',  text: 'text-orange-700',  tip: 'bg-orange-50 border-orange-200 text-orange-800'  },
  pink:    { bg: 'bg-pink-50',    border: 'border-pink-200',    icon: 'bg-pink-600',    text: 'text-pink-700',    tip: 'bg-pink-50 border-pink-200 text-pink-800'    },
  teal:    { bg: 'bg-teal-50',    border: 'border-teal-200',    icon: 'bg-teal-600',    text: 'text-teal-700',    tip: 'bg-teal-50 border-teal-200 text-teal-800'    },
};

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-4 text-left gap-3 hover:text-blue-700 transition"
      >
        <span className="text-sm font-semibold text-gray-800">{q}</span>
        {open ? <ChevronUp className="w-4 h-4 flex-shrink-0 text-blue-600" /> : <ChevronDown className="w-4 h-4 flex-shrink-0 text-gray-400" />}
      </button>
      {open && (
        <p className="text-sm text-gray-500 pb-4 leading-relaxed">{a}</p>
      )}
    </div>
  );
}

export default function UserManual() {
  const navigate = useNavigate();
  const [expandedStep, setExpandedStep] = useState(null);

  function expandAll() {
    setExpandedStep('all');
  }

  function isOpen(num) {
    return expandedStep === num || expandedStep === 'all';
  }

  function toggle(num) {
    if (expandedStep === 'all') {
      setExpandedStep(null);
    } else {
      setExpandedStep(isOpen(num) ? null : num);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Sticky header */}
      <header className="bg-gradient-to-r from-blue-900 to-blue-700 text-white sticky top-0 z-20 shadow-lg">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 text-blue-200 hover:text-white hover:bg-white hover:bg-opacity-10 rounded-lg transition flex-shrink-0"
            aria-label="Volver"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="bg-white rounded-lg px-2 py-1 flex-shrink-0">
            <img src={logo} alt="Papelería Cartagena" className="h-8 w-auto object-contain" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold leading-none">Manual de Usuario</h1>
            <p className="text-blue-200 text-xs mt-0.5">Cómo realizar un pedido</p>
          </div>
          <div className="flex items-center gap-1 text-blue-200 text-xs flex-shrink-0">
            <Clock className="w-3.5 h-3.5" />
            <span>~5 min</span>
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 text-white">
        <div className="max-w-4xl mx-auto px-4 py-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white bg-opacity-10 rounded-2xl mb-5 shadow-lg">
            <BookOpen className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">¿Cómo realizar un pedido?</h2>
          <p className="text-blue-200 max-w-lg mx-auto text-sm leading-relaxed">
            Sigue esta guía paso a paso para navegar el catálogo, seleccionar productos y
            enviar tu pedido de forma rápida y sencilla.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-6 mt-6 text-xs text-blue-300">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Menos de 5 minutos por pedido
            </div>
            <div className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              Proceso seguro y confirmado
            </div>
            <div className="flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5" />
              6 pasos simples
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 w-full flex-1">

        {/* Intro cards */}
        <div className="grid sm:grid-cols-3 gap-4 mb-10">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <Package className="w-6 h-6 text-blue-700 mb-3" />
            <h3 className="text-sm font-semibold text-gray-800 mb-1">¿Qué es la plataforma?</h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              Un sistema de proveeduría integral para pedir suministros de papelería
              y oficina de forma rápida y organizada, con precios personalizados por empresa.
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <ClipboardList className="w-6 h-6 text-emerald-600 mb-3" />
            <h3 className="text-sm font-semibold text-gray-800 mb-1">¿Cómo funciona?</h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              Exploras el catálogo, agregas productos al carrito, completas los
              datos de entrega y confirmas. Tu asesor coordina el resto.
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <Clock className="w-6 h-6 text-orange-500 mb-3" />
            <h3 className="text-sm font-semibold text-gray-800 mb-1">Tiempo estimado</h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              Una vez familiarizado, crear un pedido toma menos de 5 minutos.
              La primera vez puede tomar un poco más mientras exploras el catálogo.
            </p>
          </div>
        </div>

        {/* Steps header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">Pasos para realizar tu pedido</h3>
          <button
            onClick={expandedStep === 'all' ? () => setExpandedStep(null) : expandAll}
            className="text-xs font-medium text-blue-700 hover:text-blue-800 transition"
          >
            {expandedStep === 'all' ? 'Colapsar todo' : 'Ver todo'}
          </button>
        </div>

        {/* Steps */}
        <div className="space-y-3 mb-10">
          {STEPS.map((step) => {
            const Icon = step.icon;
            const c = COLOR_MAP[step.color];
            const open = isOpen(step.number);

            return (
              <div
                key={step.number}
                className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all ${open ? c.border : 'border-gray-100'}`}
              >
                <button
                  onClick={() => toggle(step.number)}
                  className="w-full flex items-center gap-4 p-5 text-left hover:bg-gray-50 transition"
                >
                  {/* Step number badge */}
                  <div className={`relative flex-shrink-0 w-11 h-11 ${c.icon} rounded-xl flex items-center justify-center shadow-sm`}>
                    <Icon className="w-5 h-5 text-white" />
                    <span className="absolute -top-1.5 -left-1.5 w-5 h-5 bg-white border-2 border-gray-200 rounded-full text-gray-700 text-[10px] font-bold flex items-center justify-center">
                      {step.number}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <span className={`text-xs font-bold ${c.text}`}>Paso {step.number}</span>
                    <p className="text-sm font-semibold text-gray-800">{step.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed line-clamp-1 sm:line-clamp-none">{step.summary}</p>
                  </div>

                  <div className="flex-shrink-0 text-gray-400">
                    {open ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </div>
                </button>

                {open && (
                  <div className={`border-t ${c.border} ${c.bg} px-5 py-4 space-y-4`}>
                    <ul className="space-y-3">
                      {step.details.map((d, di) => {
                        const DIcon = d.icon;
                        return (
                          <li key={di} className="flex items-start gap-3">
                            <DIcon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${c.text}`} />
                            <p className="text-sm text-gray-700 leading-relaxed">{d.text}</p>
                          </li>
                        );
                      })}
                    </ul>
                    {step.tip && (
                      <div className={`flex items-start gap-2 border rounded-lg px-4 py-3 ${c.tip}`}>
                        <HelpCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <p className="text-xs leading-relaxed">
                          <strong>Tip:</strong> {step.tip}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Flow summary */}
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-100 rounded-xl p-6 mb-10">
          <h3 className="text-sm font-bold text-gray-800 mb-4">Resumen del flujo de compra</h3>
          <div className="flex flex-wrap items-center gap-2">
            {STEPS.map((step, idx) => {
              const Icon = step.icon;
              const c = COLOR_MAP[step.color];
              return (
                <div key={step.number} className="flex items-center gap-2">
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${c.bg} ${c.text} border ${c.border}`}>
                    <Icon className="w-3 h-3" />
                    {step.title}
                  </div>
                  {idx < STEPS.length - 1 && (
                    <span className="text-gray-300 text-xs">→</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* FAQ */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-8">
          <h3 className="text-base font-bold text-gray-900 mb-2 flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-blue-700" />
            Preguntas frecuentes
          </h3>
          <p className="text-xs text-gray-500 mb-4">Respuestas a las dudas más comunes de nuestros clientes.</p>
          <div>
            {FAQS.map((faq, i) => <FaqItem key={i} q={faq.q} a={faq.a} />)}
          </div>
        </div>

        {/* Contact */}
        <div className="bg-blue-700 rounded-xl p-6 text-white text-center mb-8">
          <Phone className="w-8 h-8 mx-auto mb-3 opacity-80" />
          <h3 className="text-base font-bold mb-1">¿Necesitas ayuda adicional?</h3>
          <p className="text-blue-200 text-sm mb-4">
            Tu asesor comercial está disponible para guiarte en cualquier momento.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-blue-700 rounded-lg font-semibold text-sm hover:bg-blue-50 transition shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Ir al inicio de sesión
          </button>
        </div>
      </div>

      <CreditsFooter />
    </div>
  );
}
