import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import LoginView from "./components/LoginView";
import AcceptInvitePage from "./components/AcceptInvitePage";
import AdminLayout from "./components/admin/AdminLayout";
import SuperAdminLayout from "./components/admin/SuperAdminLayout";
import CleanerView, { clearCleanerContext } from "./components/CleanerView";
import CustomerView from "./components/CustomerView";
import { BrandMark, RoleBadge } from "./components/shared";
import LanguagePicker from "./components/LanguagePicker";
import { I18nProvider, useT } from "./i18n";
import { apiFetch } from "./api";

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
  return <AppInner />;
}

function AppInner() {
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

  // A language switch applies instantly in the UI (see i18n.jsx) — this just makes it follow the
  // person to their next device. Failures are swallowed on purpose: the choice is already saved in
  // this browser, and a cleaner on a dead signal shouldn't get an error toast for picking a
  // language. Not logged in yet (login/invite screen) means there's no account to save it on.
  function persistLanguage(code) {
    if (!auth) return;
    setAuth({ ...auth, user: { ...auth.user, language: code } });
    apiFetch("/auth/me", {
      token: auth.token,
      method: "PATCH",
      body: JSON.stringify({ language: code }),
    }).catch(() => {});
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

  // Which add-on modules the company has can change between logins (a super_admin turns one on
  // from "Firmaer"), and the copy this tab holds is whatever was true when the token was minted —
  // or whatever sessionStorage restored after the phone discarded the tab. Refreshed best-effort
  // on mount: a failure deliberately keeps the cached list rather than making someone's tabs
  // vanish on a dead signal, and the backend's own requireModule is what actually enforces it.
  useEffect(() => {
    if (!auth?.token) return;
    apiFetch("/modules", { token: auth.token })
      .then((modules) => {
        if (modules.join() !== (auth.user.modules || []).join()) {
          setAuth({ ...auth, user: { ...auth.user, modules } });
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.token]);

  // A ?checkin= link means something for a cleaner (their check-in flow) or a customer (jumps
  // to that site's "Fyll ut sjekkliste i dag") — for every other role it's just dead weight
  // sitting in the address bar, so drop it once we know who actually logged in.
  useEffect(() => {
    if (auth && checkinToken && auth.user.role !== "cleaner" && auth.user.role !== "customer") clearCheckinParam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth, checkinToken]);

  const body = renderBody();

  return (
    <I18nProvider user={auth?.user} onLanguageChange={persistLanguage}>
      {body}
    </I18nProvider>
  );

  function renderBody() {
    if (inviteToken) {
      return <Shell><AcceptInvitePage token={inviteToken} onLogin={handleAuthenticated} onCancel={clearInviteParam} /></Shell>;
    }

    if (!auth) {
      return <Shell><LoginView onLogin={handleAuthenticated} checkinPending={!!checkinToken} /></Shell>;
    }

    const { token, user } = auth;

    // The admin surfaces are deliberately still Norwegian-only for now (see the localization plan,
    // 2026-09-21): the people using them read Norwegian, and the ~380 strings behind LokasjonerPage
    // and friends would have swamped the translation pass that actually matters — the cleaner's.
    if (user.role === "super_admin") {
      return <SuperAdminLayout token={token} user={user} onLogout={() => setAuth(null)} />;
    }

    if (user.role === "admin" || user.role === "manager") {
      return <AdminLayout token={token} user={user} onLogout={() => setAuth(null)} />;
    }

    return <UserShell auth={auth} onLogout={() => setAuth(null)} checkinToken={checkinToken} onCheckinHandled={clearCheckinParam} />;
  }
}

function UserShell({ auth, onLogout, checkinToken, onCheckinHandled }) {
  const { token, user } = auth;
  const t = useT();

  return (
    <Shell>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{user.name}</span>
          <RoleBadge role={user.role} />
        </div>
        <button onClick={onLogout} style={{
          display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid var(--border)",
          borderRadius: "var(--radius)", padding: "6px 12px", fontSize: 13, cursor: "pointer", color: "var(--text-secondary)",
        }}>
          <LogOut size={14} /> {t("app.logout")}
        </button>
      </div>
      {user.role === "cleaner" && (
        <CleanerView token={token} user={user} pendingCheckinToken={checkinToken} onCheckinHandled={onCheckinHandled} />
      )}
      {user.role === "customer" && (
        <CustomerView token={token} user={user} pendingCheckinToken={checkinToken} onCheckinHandled={onCheckinHandled} />
      )}
    </Shell>
  );
}

function Shell({ children }) {
  const t = useT();

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px" }}>
      {/* The picker sits in the header rather than behind a profile menu because the screen that
          needs it most is the login screen — someone who can't read "Logg inn" can't be asked to
          log in first and change the language afterwards. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 2 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <BrandMark size={30} />
          <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.021em" }}>Rentlogg</div>
        </div>
        <LanguagePicker compact />
      </div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginLeft: 40, marginBottom: 20 }}>
        {t("app.tagline")}
      </div>
      {children}
    </div>
  );
}
