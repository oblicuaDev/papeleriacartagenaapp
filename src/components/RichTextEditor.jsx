import { useEffect, useRef } from "react";
import { Bold, Italic, Underline, List, ListOrdered } from "lucide-react";

// Editor de texto enriquecido mínimo (negrita, cursiva, subrayado, listas).
// Emite HTML; el backend lo sanea antes de guardarlo.
const TOOLS = [
  { cmd: "bold", icon: Bold, title: "Negrita" },
  { cmd: "italic", icon: Italic, title: "Cursiva" },
  { cmd: "underline", icon: Underline, title: "Subrayado" },
  { cmd: "insertUnorderedList", icon: List, title: "Lista con viñetas" },
  { cmd: "insertOrderedList", icon: ListOrdered, title: "Lista numerada" },
];

export default function RichTextEditor({ value, onChange, placeholder, minHeight = 140 }) {
  const ref = useRef(null);

  // Valor inicial (no controlado: re-escribir innerHTML movería el cursor).
  useEffect(() => {
    if (ref.current && value) ref.current.innerHTML = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function emit() {
    const el = ref.current;
    if (!el) return;
    // Un editor "vacío" suele quedar con <br>/<div><br></div>: normalizar.
    if (!el.textContent.trim() && !el.querySelector("li")) el.innerHTML = "";
    onChange(el.innerHTML);
  }

  function exec(cmd) {
    ref.current?.focus();
    document.execCommand(cmd, false, null);
    emit();
  }

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
      <div className="flex items-center gap-1 px-2 py-1.5 bg-gray-50 border-b border-gray-200">
        {TOOLS.map(({ cmd, icon: Icon, title }) => (
          <button
            key={cmd}
            type="button"
            title={title}
            // mouseDown + preventDefault: no pierde la selección del editor
            onMouseDown={(e) => { e.preventDefault(); exec(cmd); }}
            className="p-1.5 rounded text-gray-600 hover:bg-gray-200 transition"
          >
            <Icon className="w-4 h-4" />
          </button>
        ))}
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={emit}
        style={{ minHeight }}
        className="rich-text px-3 py-2.5 text-sm text-gray-800 focus:outline-none"
      />
    </div>
  );
}
