import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import LoginView from "./components/LoginView";
import AcceptInvitePage from "./components/AcceptInvitePage";
import AdminLayout from "./components/admin/AdminLayout";
import SuperAdminLayout from "./components/admin/SuperAdminLayout";
import CleanerView, { clearCleanerContext } from "./components/CleanerView";
import CustomerView from "./components/CustomerView";
import { RoleBadge } from "./components/shared";

function inviteTokenFromUrl() {
  return new URLSearchParams(window.location.search).get("invite");
}

// Set by the backend's GET /checkin/:qrToken redirect — what a site's printed QR code opens
// when scanned with a phone's plain camera app (previously that link 404'd; the in-app scanner
// itself never used a URL, it just read the token straight out of the QR image).
function checkinTokenFromUrl() {
  return new URLSearchParams(window.location.search).get("checkin");
}

// sessionStorage, not localStorage: survives the specific problem this exists for (a mobile OS
// discarding this tab's whole JS state while the native camera is open, or the screen is locked
// mid-upload, which forces a full reload — previously that silently dropped a cleaner or customer
// straight back to the login screen, mid-checklist, with no memory of where they'd been) without
// keeping the session alive indefinitely or sharing it across tabs the way localStorage would —
// it's cleared the moment the tab/browser actually closes, same lifetime the in-memory version
// already had for every *other* case (closing the tab on purpose, switching devices).
const AUTH_STORAGE_KEY = "rentlogg_auth";

function authFromStorage() {
  try {
    const raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // corrupt JSON, or sessionStorage unavailable (private browsing) — just log in fresh
  }
}

export default function App() {
  const [auth, setAuthState] = useState(authFromStorage);
  const [inviteToken, setInviteToken] = useState(inviteTokenFromUrl);
  const [checkinToken, setCheckinToken] = useState(checkinTokenFromUrl);

  function setAuth(value) {
    setAuthState(value);
    try {
      if (value) sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(value));
      else sessionStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // sessionStorage unavailable — the app still works, it just can't survive a forced reload
    }
    // A cleaner's device is usually shared (one work phone, not one per person) — don't let the
    // next person who logs in on it inherit whichever site/room the previous cleaner had open.
    if (!value) clearCleanerContext();
  }

  function clearInviteParam() {
    window.history.replaceState(null, "", window.location.pathname);
    setInviteToken(null);
  }

  function clearCheckinParam() {
    window.history.replaceState(null, "", window.location.pathname);
    setCheckinToken(null);
  }

  function handleAuthenticated(token, user) {
    clearInviteParam();
    setAuth({ token, user });
  }

  // A ?checkin= link means something for a cleaner (their check-in flow) or a customer (jumps
  // to that site's "Fyll ut sjekkliste i dag") — for every other role it's just dead weight
  // sitting in the address bar, so drop it once we know who actually logged in.
  useEffect(() => {
    if (auth && checkinToken && auth.user.role !== "cleaner" && auth.user.role !== "customer") clearCheckinParam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth, checkinToken]);

  if (inviteToken) {
    return <Shell><AcceptInvitePage token={inviteToken} onLogin={handleAuthenticated} onCancel={clearInviteParam} /></Shell>;
  }

  if (!auth) {
    return <Shell><LoginView onLogin={handleAuthenticated} checkinPending={!!checkinToken} /></Shell>;
  }

  const { token, user } = auth;

  if (user.role === "super_admin") {
    return <SuperAdminLayout token={token} user={user} onLogout={() => setAuth(null)} />;
  }

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
      {user.role === "cleaner" && (
        <CleanerView token={token} user={user} pendingCheckinToken={checkinToken} onCheckinHandled={clearCheckinParam} />
      )}
      {user.role === "customer" && (
        <CustomerView token={token} user={user} pendingCheckinToken={checkinToken} onCheckinHandled={clearCheckinParam} />
      )}
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
        Dokumentert etterkontroll
      </div>
      {children}
    </div>
  );
}
