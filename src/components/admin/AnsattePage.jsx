import { Fragment, useEffect, useState } from "react";
import { GraduationCap, KeyRound, Pencil, Trash2, UserPlus } from "lucide-react";
import { apiFetch } from "../../api";
import { Card, Field, Loading, TabButton, primaryBtnStyle, linkBtnStyle, inputStyle } from "../shared";
import { LANGUAGES, DEFAULT_LANGUAGE } from "../../i18n";
import { hasModule, MODULE_TRAINING } from "../../modules";
import OpplaeringPage from "./OpplaeringPage";

const ROLE_LABEL = { admin: "Administrator", manager: "Driftsleder", cleaner: "Renholder" };

// Renholder is what this form creates nearly every time — an admin or driftsleder is rare enough
// to be worth deliberately changing the dropdown for.
const EMPTY_NEW_USER = {
  name: "", email: "", password: "", role: "cleaner", department_id: "", company_id: "",
  // Norwegian by default because that is still what most of the office staff created here read —
  // the languages that matter are picked deliberately, per person, at creation time.
  language: DEFAULT_LANGUAGE,
};

// The list arrives sorted by name from the backend; keep that order as rows are added or renamed.
const byName = (a, b) => a.name.localeCompare(b.name, "nb");

// Only cleaner/manager accounts can have their password reset from here — matches the backend's
// own restriction (PATCH /auth/users/:id/password), which deliberately excludes admin accounts
// so this page can't be used to take over a co-admin's login.
function canResetPassword(role) {
  return role === "cleaner" || role === "manager";
}

// Ansatte and Opplæring are two views of the same staff, so they share this page and its own tab
// bar rather than taking two sidebar entries — the same shape Kunder/Kundebrukere already uses.
// The Opplæring tab exists only for a company that has the add-on module (see src/modules.js);
// super_admin has no company of its own and therefore never sees it.
export default function AnsattePage({ token, user }) {
  const [activeTab, setActiveTab] = useState("ansatte");
  // Who the Opplæring tab should open when you jump there from a row in the staff list. Without
  // this the only way into one person's training was clicking their name in the matrix, which does
  // not look clickable — Håkon had to ask where the certificate was, which is the answer.
  const [openTrainingFor, setOpenTrainingFor] = useState(null);
  const showTraining = hasModule(user, MODULE_TRAINING);

  function openTraining(userId) {
    setOpenTrainingFor(userId);
    setActiveTab("opplaering");
  }

  return (
    <div>
      {showTraining && (
        <div style={{ display: "flex", borderBottom: "1px solid var(--border)", marginBottom: 20, overflowX: "auto" }}>
          <TabButton active={activeTab === "ansatte"} onClick={() => setActiveTab("ansatte")}>Ansatte</TabButton>
          <TabButton active={activeTab === "opplaering"} onClick={() => { setOpenTrainingFor(null); setActiveTab("opplaering"); }}>Opplæring</TabButton>
        </div>
      )}
      {showTraining && activeTab === "opplaering"
        ? <OpplaeringPage token={token} user={user} openUserOnMount={openTrainingFor} />
        : <StaffList token={token} user={user} onOpenTraining={showTraining ? openTraining : null} />}
    </div>
  );
}

function StaffList({ token, user, onOpenTraining }) {
  // super_admin has no company of its own and manages staff across every company from here —
  // the backend already returns every company's users/departments for it (see auth.js's
  // GET /users and departments.js's GET /), this just adds a "Firma" column and makes sure each
  // row's department <select> only offers that row's own company's departments, not every
  // company's mixed together.
  const isSuperAdmin = user?.role === "super_admin";
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingUserId, setSavingUserId] = useState(null);
  const [resetUserId, setResetUserId] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetSuccessId, setResetSuccessId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [showNewUser, setShowNewUser] = useState(false);
  const [newUser, setNewUser] = useState(EMPTY_NEW_USER);
  const [creating, setCreating] = useState(false);
  const [createdName, setCreatedName] = useState("");
  const [editUserId, setEditUserId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", phone: "", language: DEFAULT_LANGUAGE });
  const [savingEdit, setSavingEdit] = useState(false);

  function loadAll() {
    // Only super_admin can read /companies — and it's also the only one that needs them: it has no
    // company of its own, so creating an account means saying which company the account lands in.
    Promise.all([
      apiFetch("/auth/users", { token }),
      apiFetch("/departments", { token }),
      isSuperAdmin ? apiFetch("/companies", { token }) : Promise.resolve([]),
    ])
      .then(([usersData, departmentsData, companiesData]) => {
        setUsers(usersData);
        setDepartments(departmentsData);
        setCompanies(companiesData);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(loadAll, [token]);

  function replaceUser(updated) {
    setUsers((list) => list.map((u) => (u.id === updated.id ? updated : u)));
  }

  function departmentsForUser(u) {
    return isSuperAdmin ? departments.filter((d) => d.company_id === u.company_id) : departments;
  }

  // Same rule as the rows above, but keyed off the company picked in the form rather than an
  // existing user's. An admin/manager only ever gets its own company's departments back anyway.
  const newUserDepartments = isSuperAdmin
    ? departments.filter((d) => String(d.company_id) === String(newUser.company_id))
    : departments;

  function updateNewUser(field, value) {
    setNewUser((prev) => ({ ...prev, [field]: value }));
  }

  async function createUser(e) {
    e.preventDefault();
    setError("");
    setCreating(true);
    try {
      const created = await apiFetch("/auth/users", {
        token,
        method: "POST",
        body: JSON.stringify({
          name: newUser.name,
          email: newUser.email,
          password: newUser.password,
          role: newUser.role,
          department_id: newUser.department_id ? Number(newUser.department_id) : null,
          language: newUser.language,
          ...(isSuperAdmin ? { company_id: Number(newUser.company_id) } : {}),
        }),
      });
      // The backend returns the same row shape GET /users does, so the new account can go straight
      // into the list, re-sorted into place.
      setUsers((list) => [...list, created].sort(byName));
      setCreatedName(created.name);
      setNewUser(EMPTY_NEW_USER);
      setShowNewUser(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function changeDepartment(userId, departmentId) {
    setError("");
    setSavingUserId(userId);
    try {
      replaceUser(await apiFetch(`/auth/users/${userId}`, {
        token, method: "PATCH", body: JSON.stringify({ department_id: departmentId || null }),
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingUserId(null);
    }
  }

  async function changeRole(userId, role) {
    setError("");
    setSavingUserId(userId);
    try {
      replaceUser(await apiFetch(`/auth/users/${userId}/role`, {
        token, method: "PATCH", body: JSON.stringify({ role }),
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingUserId(null);
    }
  }

  async function toggleActive(u) {
    setError("");
    setSavingUserId(u.id);
    try {
      replaceUser(await apiFetch(`/auth/users/${u.id}/active`, {
        token, method: "PATCH", body: JSON.stringify({ active: !u.active }),
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingUserId(null);
    }
  }

  async function deleteUser(userId) {
    setError("");
    try {
      await apiFetch(`/auth/users/${userId}`, { token, method: "DELETE" });
      setConfirmDeleteId(null);
      setUsers((list) => list.filter((u) => u.id !== userId));
    } catch (err) {
      setError(err.message);
      setConfirmDeleteId(null);
    }
  }

  function startEdit(u) {
    setEditUserId(u.id);
    setEditForm({ name: u.name, email: u.email, phone: u.phone || "", language: u.language || DEFAULT_LANGUAGE });
    setResetUserId(null);
    setError("");
  }

  async function submitEdit(e, userId) {
    e.preventDefault();
    setError("");
    setSavingEdit(true);
    try {
      const updated = await apiFetch(`/auth/users/${userId}`, {
        token, method: "PATCH", body: JSON.stringify(editForm),
      });
      // Renaming moves the row, so this re-sorts rather than replacing in place.
      setUsers((list) => list.map((u) => (u.id === updated.id ? updated : u)).sort(byName));
      setEditUserId(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingEdit(false);
    }
  }

  function startReset(userId) {
    setResetUserId(userId);
    setNewPassword("");
    setResetSuccessId(null);
    setError("");
  }

  async function submitReset(e, userId) {
    e.preventDefault();
    setError("");
    setResetting(true);
    try {
      await apiFetch(`/auth/users/${userId}/password`, {
        token, method: "PATCH", body: JSON.stringify({ password: newPassword }),
      });
      setResetUserId(null);
      setNewPassword("");
      setResetSuccessId(userId);
    } catch (err) {
      setError(err.message);
    } finally {
      setResetting(false);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>Ansatte</h1>
          <div style={{ color: "var(--text-secondary)" }}>
            {users.length} ansatte &middot; endre rolle, avdeling, aktiv status eller passord
          </div>
        </div>
        <button
          onClick={() => { setShowNewUser((open) => !open); setCreatedName(""); setError(""); }}
          style={{ ...primaryBtnStyle, display: "flex", alignItems: "center", gap: 6 }}
        >
          <UserPlus size={15} /> Ny ansatt
        </button>
      </div>

      {error && <div style={{ color: "var(--text-danger)", marginBottom: 12 }}>{error}</div>}

      {createdName && !showNewUser && (
        <Card style={{ marginBottom: 16, fontSize: 13 }}>
          Konto opprettet for <strong>{createdName}</strong>. Gi e-posten og passordet videre til {createdName} selv
          &mdash; passordet vises ikke igjen her.
        </Card>
      )}

      {showNewUser && (
        <Card style={{ marginBottom: 16 }}>
          <form onSubmit={createUser}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Field label="Fullt navn" style={{ flex: 1, minWidth: 180 }}>
                <input required autoFocus value={newUser.name} onChange={(e) => updateNewUser("name", e.target.value)} style={inputStyle} />
              </Field>
              <Field label="E-post / brukernavn" style={{ flex: 1, minWidth: 220 }}>
                <input required type="email" placeholder="navn@example.com" value={newUser.email} onChange={(e) => updateNewUser("email", e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Passord" style={{ flex: 1, minWidth: 140 }}>
                <input required type="text" minLength={6} placeholder="Minst 6 tegn" value={newUser.password} onChange={(e) => updateNewUser("password", e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Rolle" style={{ minWidth: 140 }}>
                <select value={newUser.role} onChange={(e) => updateNewUser("role", e.target.value)} style={inputStyle}>
                  {Object.entries(ROLE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
              {isSuperAdmin && (
                <Field label="Firma" style={{ minWidth: 160 }}>
                  <select
                    required
                    value={newUser.company_id}
                    onChange={(e) => setNewUser((prev) => ({ ...prev, company_id: e.target.value, department_id: "" }))}
                    style={inputStyle}
                  >
                    <option value="">Velg firma</option>
                    {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
              )}
              <Field label="Språk" style={{ minWidth: 130 }}>
                <select value={newUser.language} onChange={(e) => updateNewUser("language", e.target.value)} style={inputStyle}>
                  {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
              </Field>
              <Field label="Avdeling" style={{ minWidth: 140 }}>
                <select value={newUser.department_id} onChange={(e) => updateNewUser("department_id", e.target.value)} style={inputStyle}>
                  <option value="">Ingen</option>
                  {newUserDepartments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </Field>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
              <button type="submit" disabled={creating} style={primaryBtnStyle}>{creating ? "Oppretter..." : "Opprett bruker"}</button>
              <button type="button" onClick={() => setShowNewUser(false)} style={linkBtnStyle}>Avbryt</button>
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Brukeren kan logge inn med en gang &mdash; ingen invitasjonslenke sendes.
              </span>
            </div>
          </form>
        </Card>
      )}

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-secondary)", fontSize: 11 }}>
                <th style={{ padding: "10px 14px" }}>Navn</th>
                {isSuperAdmin && <th style={{ padding: "10px 14px" }}>Firma</th>}
                <th style={{ padding: "10px 14px" }}>E-post</th>
                <th style={{ padding: "10px 14px" }}>Rolle</th>
                <th style={{ padding: "10px 14px" }}>Telefon</th>
                <th style={{ padding: "10px 14px" }}>Avdeling</th>
                <th style={{ padding: "10px 14px" }}>Status</th>
                <th style={{ padding: "10px 14px" }}></th>
                <th style={{ padding: "10px 14px" }}></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === user?.id;
                return (
                <Fragment key={u.id}>
                  <tr style={{ borderTop: "1px solid var(--border)", opacity: u.active ? 1 : 0.55 }}>
                    <td style={{ padding: "10px 14px", fontWeight: 500 }}>{u.name}{isSelf ? " (deg)" : ""}</td>
                    {isSuperAdmin && <td style={{ padding: "10px 14px", color: "var(--text-secondary)" }}>{u.company_name || "—"}</td>}
                    <td style={{ padding: "10px 14px", color: "var(--text-secondary)" }}>{u.email}</td>
                    <td style={{ padding: "10px 14px" }}>
                      {isSelf ? (
                        ROLE_LABEL[u.role] || u.role
                      ) : (
                        <select
                          value={u.role}
                          disabled={savingUserId === u.id}
                          onChange={(e) => changeRole(u.id, e.target.value)}
                          style={{ ...inputStyle, padding: "4px 8px", fontSize: 12, width: 120 }}
                        >
                          {Object.entries(ROLE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      )}
                    </td>
                    <td style={{ padding: "10px 14px", color: "var(--text-secondary)" }}>{u.phone || "—"}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <select
                        value={u.department_id || ""}
                        disabled={savingUserId === u.id}
                        onChange={(e) => changeDepartment(u.id, e.target.value ? Number(e.target.value) : null)}
                        style={{ ...inputStyle, padding: "4px 8px", fontSize: 12, width: 140 }}
                      >
                        <option value="">Ingen</option>
                        {departmentsForUser(u).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      {isSelf ? (
                        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Aktiv</span>
                      ) : (
                        <button
                          onClick={() => toggleActive(u)}
                          disabled={savingUserId === u.id}
                          style={{ ...linkBtnStyle, color: u.active ? "var(--text-secondary)" : "var(--text-success)" }}
                        >
                          {u.active ? "Deaktiver" : "Aktiver"}
                        </button>
                      )}
                    </td>
                    <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <button onClick={() => startEdit(u)} style={{ ...linkBtnStyle, display: "flex", alignItems: "center", gap: 4 }}>
                          <Pencil size={13} /> Rediger
                        </button>
                        {onOpenTraining && (
                          <button onClick={() => onOpenTraining(u.id)} style={{ ...linkBtnStyle, display: "flex", alignItems: "center", gap: 4 }}>
                            <GraduationCap size={13} /> Opplæring
                          </button>
                        )}
                        {canResetPassword(u.role) && (
                          <button onClick={() => startReset(u.id)} style={{ ...linkBtnStyle, display: "flex", alignItems: "center", gap: 4 }}>
                            <KeyRound size={13} /> {resetSuccessId === u.id ? "Passord satt ✓" : "Sett nytt passord"}
                          </button>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      {!isSelf && (
                        <button onClick={() => setConfirmDeleteId(u.id)} style={{ ...linkBtnStyle, color: "var(--text-danger)", display: "flex", alignItems: "center", gap: 4 }}>
                          <Trash2 size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                  {editUserId === u.id && (
                    <tr style={{ background: "var(--surface-0)" }}>
                      <td colSpan={isSuperAdmin ? 9 : 8} style={{ padding: "10px 14px" }}>
                        <form onSubmit={(e) => submitEdit(e, u.id)} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                          <Field label="Navn" style={{ margin: 0 }}>
                            <input
                              required autoFocus value={editForm.name}
                              onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                              style={{ ...inputStyle, width: 200 }}
                            />
                          </Field>
                          <Field label="E-post / brukernavn" style={{ margin: 0 }}>
                            <input
                              required type="email" value={editForm.email}
                              onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                              style={{ ...inputStyle, width: 240 }}
                            />
                          </Field>
                          <Field label="Telefon" style={{ margin: 0 }}>
                            <input
                              value={editForm.phone}
                              onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                              style={{ ...inputStyle, width: 140 }}
                            />
                          </Field>
                          <Field label="Språk" style={{ margin: 0 }}>
                            <select
                              value={editForm.language}
                              onChange={(e) => setEditForm((f) => ({ ...f, language: e.target.value }))}
                              style={{ ...inputStyle, width: 130 }}
                            >
                              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                            </select>
                          </Field>
                          <button type="submit" disabled={savingEdit} style={primaryBtnStyle}>Lagre</button>
                          <button type="button" onClick={() => setEditUserId(null)} style={linkBtnStyle}>Avbryt</button>
                        </form>
                        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6 }}>
                          E-posten er også brukernavnet &mdash; endrer du den, må {u.name} logge inn med den nye.
                        </div>
                      </td>
                    </tr>
                  )}
                  {resetUserId === u.id && (
                    <tr style={{ background: "var(--surface-0)" }}>
                      <td colSpan={isSuperAdmin ? 9 : 8} style={{ padding: "10px 14px" }}>
                        <form onSubmit={(e) => submitReset(e, u.id)} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <Field label={`Nytt passord for ${u.name}`} style={{ margin: 0 }}>
                            <input
                              type="text" required minLength={8} autoFocus
                              value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                              placeholder="Minst 8 tegn" style={{ ...inputStyle, width: 200 }}
                            />
                          </Field>
                          <button type="submit" disabled={resetting} style={primaryBtnStyle}>Lagre</button>
                          <button type="button" onClick={() => setResetUserId(null)} style={linkBtnStyle}>Avbryt</button>
                        </form>
                        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6 }}>
                          Gi det nye passordet videre til {u.name} selv — det vises ikke igjen her.
                        </div>
                      </td>
                    </tr>
                  )}
                  {confirmDeleteId === u.id && (
                    <tr style={{ background: "var(--bg-danger)" }}>
                      <td colSpan={isSuperAdmin ? 9 : 8} style={{ padding: "10px 14px", fontSize: 13 }}>
                        Slette {u.name} permanent? Dette går ikke an å angre.
                        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                          <button onClick={() => deleteUser(u.id)} style={{ ...primaryBtnStyle, background: "var(--text-danger)" }}>Ja, slett</button>
                          <button onClick={() => setConfirmDeleteId(null)} style={linkBtnStyle}>Avbryt</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      {loading ? <Loading /> : users.length === 0 && <Card style={{ textAlign: "center", color: "var(--text-secondary)", marginTop: 16 }}>Ingen ansatte ennå.</Card>}
    </div>
  );
}
