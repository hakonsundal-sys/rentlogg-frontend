import { Suspense, useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import LoginView from "./components/LoginView";
import AcceptInvitePage from "./components/AcceptInvitePage";
import { clearCleanerContext } from "./cleanerContext";
import { lazyRetry } from "./lazyRetry";
import ChecklistEmployeeView, { clearChecklistContext } from "./components/checklist/ChecklistEmployeeView";
import { hasModule, isChecklistOnly, MODULE_CHECKLIST } from "./modules";
import { BrandMark, RoleBadge } from "./components/shared";
import LanguagePicker from "./components/LanguagePicker";
import { I18nProvider, useT, translateNow } from "./i18n";
import { apiFetch } from "./api";
import { pendingCount, clearQueue } from "./offlineQueue";

// One download per kind of user instead of everyone's code in the first one: a cleaner's phone no
// longer fetches the administration pages, and the login screen no longer waits for any of them.
const AdminLayout = lazyRetry(() => import("./components/admin/AdminLayout"));
const SuperAdminLayout = lazyRetry(() => import("./components/admin/SuperAdminLayout"));
const CleanerView = lazyRetry(() => import("./components/CleanerView"));
const CustomerView = lazyRetry(() => import("./components/CustomerView"));

// Shown while one of the above is on its way — the brand mark rather than words, so it needs no
// language (the person's language is not necessarily loaded yet) and nothing here can fail.
function LoadingScreen() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "80px 16px" }}>
      <BrandMark size={36} />
    </div>
  );
}


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
    if (!value) {
      clearCleanerContext();
      clearChecklistContext();
    }
  }

  // The offline queue keeps the login token of every unsent action (a replay has to authenticate),
  // and it is not emptied by clearing the session. Logging out with something still queued would
  // either leave a live token on a shared phone or, if it were wiped silently, throw away a
  // cleaner's unsent work without a word — so ask first, and clear only on a yes.
  async function logout() {
    const pending = await pendingCount();
    if (pending > 0) {
      if (!window.confirm(translateNow("app.logoutPending", { count: pending }))) return;
      await clearQueue();
    }
    setAuth(null);
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
    // /auth/me rather than /modules: it carries checklist_only too, which flips the whole shell.
    apiFetch("/auth/me", { token: auth.token })
      .then(({ modules = [], checklist_only = false }) => {
        if (modules.join() !== (auth.user.modules || []).join() || checklist_only !== !!auth.user.checklist_only) {
          setAuth({ ...auth, user: { ...auth.user, modules, checklist_only } });
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.token]);

  // The server stops honouring a token when its account is deactivated, its password changes, or the
  // 12 hours run out. Without this the person stayed on a screen where every request failed with
  // "invalid token" and had to work out for themselves that they should log in again. Only a
  // response to *this* session's token counts (see apiFetch), and a password change made here swaps
  // the token for the fresh one the server returned rather than ending the session.
  useEffect(() => {
    if (!auth?.token) return undefined;
    function onEnded(e) {
      if (e.detail?.token === auth.token) setAuth(null);
    }
    function onRefreshed(e) {
      if (e.detail?.from === auth.token) setAuth({ ...auth, token: e.detail.to });
    }
    window.addEventListener("rentlogg:session-ended", onEnded);
    window.addEventListener("rentlogg:token-refreshed", onRefreshed);
    return () => {
      window.removeEventListener("rentlogg:session-ended", onEnded);
      window.removeEventListener("rentlogg:token-refreshed", onRefreshed);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth]);

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
      <Suspense fallback={<LoadingScreen />}>{body}</Suspense>
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
      return <SuperAdminLayout token={token} user={user} onLogout={logout} />;
    }

    if (user.role === "admin" || user.role === "manager") {
      return <AdminLayout token={token} user={user} onLogout={logout} />;
    }

    return <UserShell auth={auth} onLogout={logout} checkinToken={checkinToken} onCheckinHandled={clearCheckinParam} />;
  }
}

function UserShell({ auth, onLogout, checkinToken, onCheckinHandled }) {
  const { token, user } = auth;
  const t = useT();
  const checklistOnly = isChecklistOnly(user);
  // A cleaning company can have the checklist module too (internal routines like a vehicle check).
  // Its cleaners then get a switch between the two — kept up here in the shell so the cleaning view
  // itself, which the whole workforce uses every day, is not touched by it.
  const canSwitch = user.role === "cleaner" && !checklistOnly && hasModule(user, MODULE_CHECKLIST);
  const [view, setView] = useState("cleaning");
  const showChecklists = user.role === "cleaner" && (checklistOnly || (canSwitch && view === "checklists"));

  // A QR check-in link means nothing to a checklist-only company — drop it rather than leaving it.
  useEffect(() => {
    if (checklistOnly && checkinToken) onCheckinHandled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checklistOnly, checkinToken]);

  return (
    <Shell>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{user.name}</span>
          <RoleBadge role={user.role} checklistOnly={checklistOnly} />
        </div>
        <button onClick={onLogout} style={{
          display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid var(--border)",
          borderRadius: "var(--radius)", padding: "6px 12px", fontSize: 13, cursor: "pointer", color: "var(--text-secondary)",
        }}>
          <LogOut size={14} /> {t("app.logout")}
        </button>
      </div>
      {canSwitch && (
        <div style={{ display: "flex", gap: 4, padding: 4, background: "var(--surface-0)", border: "1px solid var(--border)", borderRadius: "var(--radius-pill)", marginBottom: 16 }}>
          {[["cleaning", t("sc.switch.cleaning")], ["checklists", t("sc.switch.checklists")]].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              style={{
                flex: 1, border: "none", borderRadius: "var(--radius-pill)", padding: "8px 10px", cursor: "pointer",
                fontSize: 14, fontWeight: 600,
                background: view === key ? "var(--surface-1)" : "transparent",
                color: view === key ? "var(--brand-dark)" : "var(--text-secondary)",
                boxShadow: view === key ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {showChecklists && <ChecklistEmployeeView token={token} user={user} />}
      <Suspense fallback={<LoadingScreen />}>
        {user.role === "cleaner" && !showChecklists && (
          <CleanerView token={token} user={user} pendingCheckinToken={checkinToken} onCheckinHandled={onCheckinHandled} />
        )}
        {user.role === "customer" && (
          <CustomerView token={token} user={user} pendingCheckinToken={checkinToken} onCheckinHandled={onCheckinHandled} />
        )}
      </Suspense>
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
