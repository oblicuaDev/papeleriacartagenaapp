import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";

// Selector de cantidad reutilizable: botones -/+ mas un campo de texto libre
// para escribir la cantidad directamente (p. ej. 1000) sin tener que clickear.
//
// - Mantiene un borrador string interno para permitir dejar el campo vacio
//   mientras se escribe; al perder foco / Enter normaliza y hace clamp.
// - `onChange` siempre recibe un entero valido dentro de [min, max].
export default function QuantityInput({
  value,
  onChange,
  min = 1,
  max = 9999,
  size = "md",
  disabled = false,
  className = "",
}) {
  const clamp = (n) => Math.min(max, Math.max(min, n));
  const [draft, setDraft] = useState(String(value ?? min));

  // Sincroniza el borrador cuando el valor externo cambia (y no se esta editando).
  useEffect(() => {
    setDraft(String(value ?? min));
  }, [value, min]);

  function commit(raw) {
    const digits = String(raw).replace(/[^\d]/g, "");
    const next = digits === "" ? min : clamp(parseInt(digits, 10));
    setDraft(String(next));
    if (next !== value) onChange(next);
  }

  function step(delta) {
    const base = Number.isFinite(value) ? value : min;
    const next = clamp(base + delta);
    setDraft(String(next));
    if (next !== value) onChange(next);
  }

  const dims =
    size === "sm"
      ? { btn: "w-7 h-7", input: "w-12 py-1 text-sm", icon: "w-3 h-3" }
      : { btn: "w-9 h-9", input: "w-16 py-2 text-sm", icon: "w-3.5 h-3.5" };

  return (
    <div
      className={`inline-flex items-center border border-gray-300 rounded-lg overflow-hidden ${
        disabled ? "opacity-50" : ""
      } ${className}`}
    >
      <button
        type="button"
        disabled={disabled || value <= min}
        onClick={() => step(-1)}
        className={`${dims.btn} flex items-center justify-center text-gray-600 hover:bg-gray-100 transition disabled:hover:bg-transparent disabled:text-gray-300`}
      >
        <Minus className={dims.icon} />
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        disabled={disabled}
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
        onFocus={(e) => e.target.select()}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(e.currentTarget.value);
            e.currentTarget.blur();
          }
        }}
        className={`${dims.input} text-center font-medium text-gray-800 focus:outline-none border-x border-gray-300 disabled:bg-gray-100`}
      />
      <button
        type="button"
        disabled={disabled || value >= max}
        onClick={() => step(1)}
        className={`${dims.btn} flex items-center justify-center text-gray-600 hover:bg-gray-100 transition disabled:hover:bg-transparent disabled:text-gray-300`}
      >
        <Plus className={dims.icon} />
      </button>
    </div>
  );
}
