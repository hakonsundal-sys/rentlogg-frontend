import { useRef, useState } from "react";
import { X } from "lucide-react";
import { API_URL } from "../api";

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
  super_admin: { label: "SUPER ADMIN", bg: "var(--accent-orange-bg)", color: "var(--accent-orange-dark)" },
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

// Who's responsible for a room (rooms.responsible: 'company' or 'customer') — one shared visual
// language instead of the badge being hand-rolled per surface, which is how it first shipped
// (four separate copies across RunRoomsAndItems/RoomGrid/DeviationItem/CleanerHistoryView/
// AvvikPage, one of which was missed entirely until a later pass caught it). Deliberately its own
// blue rather than orange, which is already both the brand/CTA color and the "in progress" status
// pill color — a third meaning on the same hue made all three harder to tell apart at a glance.
// `perspective="customer"` (the customer's own views) always renders, labelling both sides
// ("Dere"/"Renholder") since a customer needs to tell their own rooms apart from OKV's in a
// single mixed list. `perspective="staff"` (default; cleaner/admin views) renders nothing for a
// company room — staff's default assumption is "it's ours", so only the exception needs a flag.
export function ResponsibleBadge({ responsible, perspective = "staff" }) {
  const isCustomer = responsible === "customer";
  if (perspective === "staff" && !isCustomer) return null;
  const label = perspective === "customer" ? (isCustomer ? "Dere" : "Renholder") : "Kunde";
  return (
    <span style={{
      fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: "var(--radius-pill)", whiteSpace: "nowrap",
      background: isCustomer ? "var(--accent-blue-bg)" : "var(--surface-2)",
      color: isCustomer ? "var(--accent-blue-dark)" : "var(--text-muted)",
    }}>
      {label}
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

// Simple "Laster..." placeholder for list pages, so the first render doesn't flash an
// "ingen X ennå" empty state before the initial fetch has actually come back.
export function Loading({ text = "Laster..." }) {
  return <div style={{ color: "var(--text-secondary)", fontSize: 13, padding: "8px 0" }}>{text}</div>;
}

// A visible label above a form control, unlike a placeholder that disappears once the field has
// a value — used across the admin CRUD forms (Lokasjoner/Kunder/Avdelinger/Avvik/Inviter) so a
// field being edited still shows what it is.
export function Field({ label, children, style }) {
  return (
    <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", ...style }}>
      <span style={{ display: "block", marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}

// One tab in a page-local tab bar — used by Kunder (Kunder/Kundebrukere) and by Lokasjoner's
// avdeling filter. Lived inline in KunderPage until a second page needed the exact same bar.
export function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none", border: "none", cursor: "pointer", padding: "10px 4px", marginRight: 24,
        fontSize: 14, fontWeight: 600, color: active ? "var(--accent-orange-dark)" : "var(--text-secondary)",
        borderBottom: active ? "2px solid var(--accent-orange)" : "2px solid transparent",
        whiteSpace: "nowrap", flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

// Shared control styling for the admin CRUD pages (Lokasjoner/Kunder/Avdelinger/Avvik/Inviter) —
// kept in one place so a new page can't drift into a different button/input shape than the rest.
export const primaryBtnStyle = {
  background: "var(--accent-orange)", color: "white", border: "none",
  padding: "9px 16px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer",
};
export const linkBtnStyle = {
  background: "none", border: "none", color: "var(--accent-orange-dark)", fontSize: 12, cursor: "pointer", fontWeight: 500,
};
export const iconBtnStyle = {
  background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4,
};
export const inputStyle = {
  padding: "8px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border)",
  background: "var(--surface-0)", color: "var(--text-primary)", fontSize: 14, boxSizing: "border-box", width: "100%",
};

// /uploads is an authenticated route now — a plain <a href> can't attach an Authorization
// header, so the token rides along as a query param instead.
function documentUrl(filePath, token) {
  const filename = filePath.split(/[\\/]/).pop();
  return `${API_URL}/uploads/${filename}?token=${encodeURIComponent(token)}`;
}

// Shared read/edit list for a site's document library — used by admin (with onDelete), and
// read-only by the customer and cleaner surfaces.
export function DocumentsList({ documents, onDelete, token }) {
  if (!documents.length) {
    return <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Ingen dokumenter ennå.</div>;
  }
  return (
    <div>
      {documents.map((d) => (
        <div key={d.id} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "6px 0", borderTop: "1px solid var(--border)",
        }}>
          <a href={documentUrl(d.file_path, token)} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: "var(--accent-orange-dark)" }}>
            {d.name}
          </a>
          {onDelete && (
            <button
              onClick={() => onDelete(d.id)}
              aria-label="Fjern dokument"
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 0 }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      ))}
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
