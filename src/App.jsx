import { useState } from "react";
import { LogOut } from "lucide-react";
import LoginView from "./components/LoginView";
import AcceptInvitePage from "./components/AcceptInvitePage";
import AdminLayout from "./components/admin/AdminLayout";
import CleanerView from "./components/CleanerView";
import CustomerView from "./components/CustomerView";
import { RoleBadge } from "./components/shared";

function inviteTokenFromUrl() {
  return new URLSearchParams(window.location.search).get("invite");
}

export default function App() {
  const [auth, setAuth] = useState(null); // { token, user }
  const [inviteToken, setInviteToken] = useState(inviteTokenFromUrl);

  function clearInviteParam() {
    window.history.replaceState(null, "", window.location.pathname);
    setInviteToken(null);
  }

  function handleAuthenticated(token, user) {
    clearInviteParam();
    setAuth({ token, user });
  }

  if (inviteToken) {
    return <Shell><AcceptInvitePage token={inviteToken} onLogin={handleAuthenticated} onCancel={clearInviteParam} /></Shell>;
  }

  if (!auth) {
    return <Shell><LoginView onLogin={handleAuthenticated} /></Shell>;
  }

  const { token, user } = auth;

  if (user.role === "admin" || user.role === "manager") {
    return <AdminLayout token={token} user={user} onLogout={() => setAuth(null)} />;
  }

  return (
    <Shell>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{user.name}</span>
          <RoleBadge role={user.role} />
        </div>
        <button onClick={() => setAuth(null)} style={{
          display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid var(--border)",
          borderRadius: "var(--radius)", padding: "6px 12px", fontSize: 13, cursor: "pointer", color: "var(--text-secondary)",
        }}>
          <LogOut size={14} /> Logg ut
        </button>
      </div>
      {user.role === "cleaner" && <CleanerView token={token} />}
      {user.role === "customer" && <CustomerView token={token} />}
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 2 }}>
        <span style={{
          width: 30, height: 30, borderRadius: "var(--radius-sm)", background: "var(--brand-gradient)",
          color: "white", display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontSize: 16, fontWeight: 700,
        }}>
          R
        </span>
        <div style={{ fontSize: 19, fontWeight: 700 }}>Rentlogg</div>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginLeft: 40, marginBottom: 20 }}>
        Scan. Verify. Trust.
      </div>
      {children}
    </div>
  );
}
