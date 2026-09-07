import { useEffect, useState } from "react";
import { Send, Link2, X } from "lucide-react";
import { apiFetch } from "../../api";
import { Card, RoleBadge, Field, Loading, primaryBtnStyle, linkBtnStyle, iconBtnStyle, inputStyle } from "../shared";

const STATUS_LABEL = { used: "Brukt", revoked: "Trukket tilbake", expired: "Utløpt" };

export default function InviterBrukerePage({ token, user }) {
  const isSuperAdmin = user?.role === "super_admin";
  const [clients, setClients] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [invitations, setInvitations] = useState({ active: [], history: [] });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(isSuperAdmin ? "admin" : "cleaner");
  const [clientId, setClientId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState(null);

  function loadAll() {
    Promise.all([
      apiFetch("/invitations", { token }),
      apiFetch("/clients", { token }).catch(() => []),
      isSuperAdmin ? apiFetch("/companies", { token }).catch(() => []) : Promise.resolve([]),
    ])
      .then(([invitationsData, clientsData, companiesData]) => {
        setInvitations(invitationsData);
        setClients(clientsData);
        setCompanies(companiesData);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(loadAll, [token]);

  async function createInvite(e) {
    e.preventDefault();
    setError("");
    try {
      await apiFetch("/invitations", {
        token, method: "POST",
        body: JSON.stringify({
          email, role,
          client_id: role === "customer" ? Number(clientId) : undefined,
          company_id: isSuperAdmin ? Number(companyId) : undefined,
        }),
      });
      setEmail("");
      setClientId("");
      setCompanyId("");
      loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function revokeInvite(id) {
    try {
      await apiFetch(`/invitations/${id}`, { token, method: "DELETE" });
      loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  function inviteLink(invToken) {
    return `${window.location.origin}/?invite=${invToken}`;
  }

  function copyLink(inv) {
    navigator.clipboard?.writeText(inviteLink(inv.token));
    setCopiedId(inv.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  return (
    <div>
      <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>Invitasjoner</h1>
      <div style={{ color: "var(--text-secondary)", marginBottom: 20 }}>
        Send invitasjonslenke til renholdere eller kunder. De velger eget passord ved registrering.
      </div>

      {error && <div style={{ color: "var(--text-danger)", marginBottom: 12 }}>{error}</div>}

      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <Send size={16} /> Ny invitasjon
        </div>
        <form onSubmit={createInvite} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Field label="E-post" style={{ flex: 1, minWidth: 200 }}>
            <input required type="email" placeholder="navn@firma.no" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Rolle">
            <select value={role} onChange={(e) => setRole(e.target.value)} style={inputStyle}>
              <option value="cleaner">Renholder</option>
              <option value="manager">Driftsleder</option>
              <option value="customer">Kunde</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
          {role === "customer" && (
            <Field label="Kunde">
              <select required value={clientId} onChange={(e) => setClientId(e.target.value)} style={inputStyle}>
                <option value="">Velg kunde</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          )}
          {isSuperAdmin && (
            <Field label="Firma">
              <select required value={companyId} onChange={(e) => setCompanyId(e.target.value)} style={inputStyle}>
                <option value="">Velg firma</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          )}
          <button type="submit" style={primaryBtnStyle}>+ Opprett</button>
        </form>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 8 }}>
          {isSuperAdmin
            ? "Lenken er gyldig i 14 dager. Brukeren får rollen og tilknyttes det valgte firmaet."
            : "Lenken er gyldig i 14 dager. Brukeren får rollen og tilknyttes ditt firma automatisk."}
        </div>
      </Card>

      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8, letterSpacing: 0.5 }}>
        AKTIVE INVITASJONER ({invitations.active.length})
      </div>
      <Card style={{ marginBottom: 20 }}>
        {loading && <Loading />}
        {!loading && invitations.active.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: 13, padding: 8 }}>Ingen aktive invitasjoner.</div>
        )}
        {invitations.active.map((inv, i) => (
          <div key={inv.id} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "10px 0", borderTop: i === 0 ? "none" : "1px solid var(--border)",
          }}>
            <div>
              <div style={{ fontSize: 14 }}>{inv.email}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Utløper {inv.expires_at}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <RoleBadge role={inv.role} />
              <button onClick={() => copyLink(inv)} style={linkBtnStyle}>
                <Link2 size={13} style={{ verticalAlign: -2, marginRight: 3 }} />
                {copiedId === inv.id ? "Kopiert!" : "Kopier lenke"}
              </button>
              <button onClick={() => revokeInvite(inv.id)} style={iconBtnStyle}><X size={15} /></button>
            </div>
          </div>
        ))}
      </Card>

      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8, letterSpacing: 0.5 }}>
        HISTORIKK ({invitations.history.length})
      </div>
      <Card>
        {!loading && invitations.history.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: 13, padding: 8 }}>Ingen historikk ennå.</div>
        )}
        {invitations.history.map((inv, i) => (
          <div key={inv.id} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "8px 0", borderTop: i === 0 ? "none" : "1px solid var(--border)", fontSize: 14,
          }}>
            <span>{inv.email}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <RoleBadge role={inv.role} />
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{STATUS_LABEL[inv.status] || inv.status}</span>
            </span>
          </div>
        ))}
      </Card>
    </div>
  );
}
