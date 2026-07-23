import { LayoutGrid, MapPin, Users, AlertTriangle, UserPlus, FileText, CircleUser, LogOut } from "lucide-react";
import { RoleBadge } from "../shared";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { id: "lokasjoner", label: "Lokasjoner", icon: MapPin },
  { id: "kunder", label: "Kunder", icon: Users },
  { id: "avvik", label: "Avvik", icon: AlertTriangle },
  { id: "inviter", label: "Inviter brukere", icon: UserPlus },
  { id: "rapporter", label: "Rapporter", icon: FileText },
  { id: "profil", label: "Min profil", icon: CircleUser },
];

export default function Sidebar({ currentPage, setCurrentPage, user, onLogout }) {
  return (
    <div style={{
      width: 260, minHeight: "100vh", background: "var(--sidebar-bg)",
      borderRight: "1px solid var(--sidebar-border)", display: "flex", flexDirection: "column",
      padding: "20px 16px", boxSizing: "border-box", flexShrink: 0,
    }}>
      <div style={{ marginBottom: 28, paddingLeft: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 18, fontWeight: 700 }}>
          <span style={{
            width: 26, height: 26, borderRadius: "var(--radius-sm)", background: "var(--brand-gradient)",
            color: "white", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 14,
          }}>
            R
          </span>
          Rentlogg
        </div>
        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2, marginLeft: 34 }}>
          Scan. Verify. Trust.
        </div>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
        {NAV_ITEMS.map((item) => {
          const active = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10, textAlign: "left",
                padding: "10px 12px", borderRadius: "var(--radius)", border: "none", cursor: "pointer",
                background: active ? "var(--sidebar-active-bg)" : "transparent",
                color: active ? "var(--accent-orange)" : "var(--text-primary)",
                fontSize: 14, fontWeight: active ? 600 : 400,
              }}
            >
              <item.icon size={17} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div style={{
        marginTop: 16, background: "var(--sidebar-active-bg)", borderRadius: "var(--radius)", padding: 12,
      }}>
        <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Innlogget som</div>
        <div style={{ fontSize: 14, fontWeight: 600, margin: "2px 0 6px" }}>{user.name}</div>
        <RoleBadge role={user.role} />
        <button
          onClick={onLogout}
          style={{
            display: "flex", alignItems: "center", gap: 6, marginTop: 10, background: "none", border: "none",
            color: "var(--text-secondary)", fontSize: 13, cursor: "pointer", padding: 0,
          }}
        >
          <LogOut size={14} /> Logg ut
        </button>
      </div>
    </div>
  );
}
