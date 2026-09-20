import { Fragment, useEffect, useMemo, useState } from "react";
import { KeyRound, Pencil, Trash2 } from "lucide-react";
import { apiFetch } from "../../api";
import { Card, Field, Loading, primaryBtnStyle, linkBtnStyle, inputStyle } from "../shared";

// The list arrives sorted by name from the backend; keep that order as rows are added or renamed.
const byName = (a, b) => a.name.localeCompare(b.name, "nb");

export default function KundebrukerePage({ token, user }) {
  const isSuperAdmin = user?.role === "super_admin";
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [savingUserId, setSavingUserId] = useState(null);
  const [resetUserId, setResetUserId] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetSuccessId, setResetSuccessId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [editUserId, setEditUserId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", phone: "" });
  const [savingEdit, setSavingEdit] = useState(false);

  function loadAll() {
    apiFetch("/auth/users?role=customer", { token })
      .then(setUsers)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(loadAll, [token]);

  // A narrower endpoint response (e.g. the active-toggle/password routes, which return the plain
  // STAFF_FIELDS shape without client_name/company_name) merges onto the existing row instead of
  // replacing it outright, so those columns don't blank out after an action that never touched them.
  function replaceUser(updated) {
    setUsers((list) => list.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
  }

  // Built from the rows themselves rather than a separate /clients fetch — every customer user
  // already carries its own client_id/client_name, so this is always in sync with who actually has
  // an account, not with every customer that merely exists.
  const clients = useMemo(() => {
    const byId = new Map();
    for (const u of users) {
      if (u.client_id != null && !byId.has(u.client_id)) byId.set(u.client_id, u.client_name || `#${u.client_id}`);
    }
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1], "nb"));
  }, [users]);

  const visibleUsers = clientFilter ? users.filter((u) => String(u.client_id) === clientFilter) : users;

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
    setEditForm({ name: u.name, email: u.email, phone: u.phone || "" });
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
      setUsers((list) => list.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)).sort(byName));
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

  const colSpan = isSuperAdmin ? 7 : 6;

  return (
    <div>
      <div style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>Kundebrukere</h1>
          <div style={{ color: "var(--text-secondary)" }}>
            {users.length} kundebrukere &middot; endre aktiv status eller passord
          </div>
        </div>
        {clients.length > 1 && (
          <Field label="Kunde" style={{ margin: 0, minWidth: 200 }}>
            <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} style={inputStyle}>
              <option value="">Alle kunder</option>
              {clients.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </Field>
        )}
      </div>

      {error && <div style={{ color: "var(--text-danger)", marginBottom: 12 }}>{error}</div>}

      <Card style={{ marginBottom: 16, fontSize: 13, color: "var(--text-secondary)" }}>
        Kundebrukere opprettes via <strong>Inviter brukere</strong> &mdash; her kan du bare følge opp kontoer som
        allerede finnes.
      </Card>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-secondary)", fontSize: 11 }}>
                <th style={{ padding: "10px 14px" }}>Navn</th>
                {isSuperAdmin && <th style={{ padding: "10px 14px" }}>Firma</th>}
                <th style={{ padding: "10px 14px" }}>Kunde</th>
                <th style={{ padding: "10px 14px" }}>E-post</th>
                <th style={{ padding: "10px 14px" }}>Telefon</th>
                <th style={{ padding: "10px 14px" }}>Status</th>
                <th style={{ padding: "10px 14px" }}></th>
                <th style={{ padding: "10px 14px" }}></th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((u) => (
                <Fragment key={u.id}>
                  <tr style={{ borderTop: "1px solid var(--border)", opacity: u.active ? 1 : 0.55 }}>
                    <td style={{ padding: "10px 14px", fontWeight: 500 }}>{u.name}</td>
                    {isSuperAdmin && <td style={{ padding: "10px 14px", color: "var(--text-secondary)" }}>{u.company_name || "—"}</td>}
                    <td style={{ padding: "10px 14px", color: "var(--text-secondary)" }}>{u.client_name || "—"}</td>
                    <td style={{ padding: "10px 14px", color: "var(--text-secondary)" }}>{u.email}</td>
                    <td style={{ padding: "10px 14px", color: "var(--text-secondary)" }}>{u.phone || "—"}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <button
                        onClick={() => toggleActive(u)}
                        disabled={savingUserId === u.id}
                        style={{ ...linkBtnStyle, color: u.active ? "var(--text-secondary)" : "var(--text-success)" }}
                      >
                        {u.active ? "Deaktiver" : "Aktiver"}
                      </button>
                    </td>
                    <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <button onClick={() => startEdit(u)} style={{ ...linkBtnStyle, display: "flex", alignItems: "center", gap: 4 }}>
                          <Pencil size={13} /> Rediger
                        </button>
                        <button onClick={() => startReset(u.id)} style={{ ...linkBtnStyle, display: "flex", alignItems: "center", gap: 4 }}>
                          <KeyRound size={13} /> {resetSuccessId === u.id ? "Passord satt ✓" : "Sett nytt passord"}
                        </button>
                      </div>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <button onClick={() => setConfirmDeleteId(u.id)} style={{ ...linkBtnStyle, color: "var(--text-danger)", display: "flex", alignItems: "center", gap: 4 }}>
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                  {editUserId === u.id && (
                    <tr style={{ background: "var(--surface-0)" }}>
                      <td colSpan={colSpan} style={{ padding: "10px 14px" }}>
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
                      <td colSpan={colSpan} style={{ padding: "10px 14px" }}>
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
                      <td colSpan={colSpan} style={{ padding: "10px 14px", fontSize: 13 }}>
                        Slette {u.name} permanent? Dette går ikke an å angre.
                        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                          <button onClick={() => deleteUser(u.id)} style={{ ...primaryBtnStyle, background: "var(--text-danger)" }}>Ja, slett</button>
                          <button onClick={() => setConfirmDeleteId(null)} style={linkBtnStyle}>Avbryt</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {loading ? <Loading /> : visibleUsers.length === 0 && (
        <Card style={{ textAlign: "center", color: "var(--text-secondary)", marginTop: 16 }}>
          {users.length === 0 ? "Ingen kundebrukere ennå." : "Ingen kundebrukere for valgt kunde."}
        </Card>
      )}
    </div>
  );
}
