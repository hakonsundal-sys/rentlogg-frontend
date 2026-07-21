import { useState } from "react";
import LoginView from "./components/LoginView";
import AdminView from "./components/AdminView";
import CleanerView from "./components/CleanerView";
import CustomerView from "./components/CustomerView";

const ROLE_LABELS = {
  admin: "Renholdsbedrift",
  manager: "Renholdsbedrift",
  cleaner: "Renholder",
  customer: "Kunde",
};

export default function App() {
  const [auth, setAuth] = useState(null); // { token, user }

  if (!auth) {
    return <Shell><LoginView onLogin={(token, user) => setAuth({ token, user })} /></Shell>;
  }

  const { token, user } = auth;

  return (
    <Shell>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          {user.name} · {ROLE_LABELS[user.role]}
        </div>
        <button onClick={() => setAuth(null)} style={{
          background: "none", border: "1px solid var(--border)", borderRadius: "var(--radius)",
          padding: "6px 12px", fontSize: 13, cursor: "pointer", color: "var(--text-secondary)",
        }}>
          Logg ut
        </button>
      </div>
      {(user.role === "admin" || user.role === "manager") && <AdminView token={token} />}
      {user.role === "cleaner" && <CleanerView token={token} />}
      {user.role === "customer" && <CustomerView token={token} />}
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 500 }}>Rentlogg</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Dokumentasjon for renholdsoppdrag</div>
      </div>
      {children}
    </div>
  );
}
