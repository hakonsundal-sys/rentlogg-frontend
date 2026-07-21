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
      padding: "2px 10px", borderRadius: 999, fontSize: 12, fontWeight: 500,
    }}>
      {s.label}
    </span>
  );
}

export function Card({ children, style }) {
  return (
    <div style={{
      background: "var(--surface-1)", border: "1px solid var(--border)",
      borderRadius: 12, padding: 16, ...style,
    }}>
      {children}
    </div>
  );
}
