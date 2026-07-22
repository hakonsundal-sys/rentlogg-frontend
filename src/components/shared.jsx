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
      padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600, letterSpacing: 0.3,
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
      borderRadius: 12, padding: 16, ...style,
    }}>
      {children}
    </div>
  );
}
