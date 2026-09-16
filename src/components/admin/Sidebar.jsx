import { useState } from "react";
import { LayoutGrid, MapPin, Users, Building2, UserCog, AlertTriangle, UserPlus, FileText, CircleUser, LogOut, Menu, X } from "lucide-react";
import { RoleBadge } from "../shared";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { id: "lokasjoner", label: "Lokasjoner", icon: MapPin },
  { id: "kunder", label: "Kunder", icon: Users },
  { id: "avdelinger", label: "Avdelinger", icon: Building2 },
  { id: "ansatte", label: "Ansatte", icon: UserCog },
  { id: "avvik", label: "Avvik", icon: AlertTriangle },
  { id: "inviter", label: "Inviter brukere", icon: UserPlus },
  { id: "rapporter", label: "Rapporter", icon: FileText },
  { id: "profil", label: "Min profil", icon: CircleUser },
];

// navItems defaults to the full admin/manager nav — super_admin has no company of its own, so
// it belongs to none of those company-scoped pages and passes its own short list instead.
// Below 768px (see .admin-sidebar in index.css) this becomes a slide-in drawer opened by its own
// hamburger button, rather than the fixed 260px column it always was — that column previously had
// no responsive fallback at all, so every admin page just overflowed sideways on a phone.
export default function Sidebar({ currentPage, setCurrentPage, user, onLogout, navItems = NAV_ITEMS }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  function selectPage(id) {
    setCurrentPage(id);
    setMobileOpen(false);
  }

  return (
    <>
      {!mobileOpen && (
        <button className="admin-hamburger" onClick={() => setMobileOpen(true)} aria-label="Åpne meny">
          <Menu size={20} />
        </button>
      )}
      <div className={`admin-sidebar-backdrop${mobileOpen ? " open" : ""}`} onClick={() => setMobileOpen(false)} />
      <div
        className={`admin-sidebar${mobileOpen ? " open" : ""}`}
        style={{
          width: 260, minHeight: "100vh", background: "var(--sidebar-bg)",
          borderRight: "1px solid var(--sidebar-border)", display: "flex", flexDirection: "column",
          padding: "20px 16px", boxSizing: "border-box", flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, paddingLeft: 4 }}>
          <div>
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
              Dokumentert etterkontroll
            </div>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="admin-hamburger"
            style={{ position: "static", boxShadow: "none" }}
            aria-label="Lukk meny"
          >
            <X size={18} />
          </button>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
          {navItems.map((item) => {
            const active = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => selectPage(item.id)}
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
    </>
  );
}
