import { useRef, useState } from "react";

export function StatusBadge({ status }) {
  const map = {
    ok: { label: "OK", cls: "c-teal" },
    overdue: { label: "Forsinket", cls: "c-amber" },
    deviation: { label: "Avvik", cls: "c-red" },
  };
  const s = map[status] || map.overdue;
  return (
    <span className={s.cls} style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 10px", borderRadius: "var(--radius-pill)", fontSize: 12, fontWeight: 500,
    }}>
      {s.label}
    </span>
  );
}

const ROLE_BADGE = {
  admin: { label: "ADMIN", bg: "var(--accent-orange-bg)", color: "var(--accent-orange-dark)" },
  manager: { label: "MANAGER", bg: "var(--accent-orange-bg)", color: "var(--accent-orange-dark)" },
  cleaner: { label: "RENHOLDER", bg: "var(--c-teal)", color: "var(--text-success)" },
  customer: { label: "KUNDE", bg: "var(--surface-0)", color: "var(--text-secondary)" },
};

export function RoleBadge({ role }) {
  const r = ROLE_BADGE[role] || ROLE_BADGE.customer;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "2px 8px", borderRadius: "var(--radius-sm)", fontSize: 11, fontWeight: 600, letterSpacing: 0.3,
      background: r.bg, color: r.color,
    }}>
      {r.label}
    </span>
  );
}

export function Card({ children, style }) {
  return (
    <div style={{
      background: "var(--surface-1)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)", padding: 16, ...style,
    }}>
      {children}
    </div>
  );
}

// Address lookup via Kartverket's free Geonorge address registry — no API key needed.
export function AddressAutocomplete({ value, onChange, placeholder = "Adresse", inputStyle, style }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(null);

  function handleInput(text) {
    onChange(text);
    clearTimeout(debounceRef.current);
    if (text.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://ws.geonorge.no/adresser/v1/sok?sok=${encodeURIComponent(text)}&fuzzy=true&treffPerSide=6`);
        const data = await res.json();
        setSuggestions(data.adresser || []);
        setOpen(true);
      } catch {
        setSuggestions([]);
      }
    }, 300);
  }

  function selectSuggestion(a) {
    onChange(`${a.adressetekst}, ${a.postnummer} ${a.poststed}`);
    setOpen(false);
    setSuggestions([]);
  }

  return (
    <div style={{ position: "relative", ...style }}>
      <input
        placeholder={placeholder}
        value={value}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        autoComplete="off"
        style={inputStyle}
      />
      {open && suggestions.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20, marginTop: 2,
          background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--radius)",
          boxShadow: "0 4px 12px rgba(0,0,0,0.12)", maxHeight: 220, overflowY: "auto",
        }}>
          {suggestions.map((a, i) => (
            <div
              key={i}
              onMouseDown={() => selectSuggestion(a)}
              style={{ padding: "8px 10px", fontSize: 13, cursor: "pointer", borderBottom: i < suggestions.length - 1 ? "1px solid var(--border)" : "none" }}
            >
              {a.adressetekst}, {a.postnummer} {a.poststed}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
