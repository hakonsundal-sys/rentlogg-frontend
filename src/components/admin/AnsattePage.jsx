import { Fragment, useEffect, useState } from "react";
import { KeyRound, Trash2 } from "lucide-react";
import { apiFetch } from "../../api";
import { Card, Field, Loading, primaryBtnStyle, linkBtnStyle, inputStyle } from "../shared";

const ROLE_LABEL = { admin: "Administrator", manager: "Driftsleder", cleaner: "Renholder" };

// Only cleaner/manager accounts can have their password reset from here — matches the backend's
// own restriction (PATCH /auth/users/:id/password), which deliberately excludes admin accounts
// so this page can't be used to take over a co-admin's login.
function canResetPassword(role) {
  return role === "cleaner" || role === "manager";
}

export default function AnsattePage({ token, user }) {
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

  function loadAll() {
    Promise.all([apiFetch("/auth/users", { token }), apiFetch("/departments", { token })])
      .then(([usersData, departmentsData]) => {
        setUsers(usersData);
        setDepartments(departmentsData);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(loadAll, [token]);

  function replaceUser(updated) {
    setUsers((list) => list.map((u) => (u.id === updated.id ? updated : u)));
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
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>Ansatte</h1>
        <div style={{ color: "var(--text-secondary)" }}>
          {users.length} ansatte &middot; endre rolle, avdeling, aktiv status eller passord
        </div>
      </div>

      {error && <div style={{ color: "var(--text-danger)", marginBottom: 12 }}>{error}</div>}

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-secondary)", fontSize: 11 }}>
                <th style={{ padding: "10px 14px" }}>Navn</th>
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
                        {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
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
                      {canResetPassword(u.role) && (
                        <button onClick={() => startReset(u.id)} style={{ ...linkBtnStyle, display: "flex", alignItems: "center", gap: 4 }}>
                          <KeyRound size={13} /> {resetSuccessId === u.id ? "Passord satt ✓" : "Sett nytt passord"}
                        </button>
                      )}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      {!isSelf && (
                        <button onClick={() => setConfirmDeleteId(u.id)} style={{ ...linkBtnStyle, color: "var(--text-danger)", display: "flex", alignItems: "center", gap: 4 }}>
                          <Trash2 size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                  {resetUserId === u.id && (
                    <tr style={{ background: "var(--surface-0)" }}>
                      <td colSpan={8} style={{ padding: "10px 14px" }}>
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
                      <td colSpan={8} style={{ padding: "10px 14px", fontSize: 13 }}>
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
