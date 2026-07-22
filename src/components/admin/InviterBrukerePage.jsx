import { useEffect, useState } from "react";
import { Send, Link2, X } from "lucide-react";
import { apiFetch } from "../../api";
import { Card, RoleBadge } from "../shared";

const STATUS_LABEL = { used: "Brukt", revoked: "Trukket tilbake", expired: "Utløpt" };

export default function InviterBrukerePage({ token }) {
  const [clients, setClients] = useState([]);
  const [invitations, setInvitations] = useState({ active: [], history: [] });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("cleaner");
  const [clientId, setClientId] = useState("");
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState(null);

  function loadAll() {
    apiFetch("/invitations", { token }).then(setInvitations).catch((err) => setError(err.message));
    apiFetch("/clients", { token }).then(setClients).catch(() => {});
  }

  useEffect(loadAll, [token]);

  async function createInvite(e) {
    e.preventDefault();
    setError("");
    try {
      await apiFetch("/invitations", {
        token, method: "POST",
        body: JSON.stringify({ email, role, client_id: role === "customer" ? Number(clientId) : undefined }),
      });
      setEmail("");
      setClientId("");
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
        <form onSubmit={createInvite} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            required type="email" placeholder="navn@firma.no" value={email}
            onChange={(e) => setEmail(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 200 }}
          />
          <select value={role} onChange={(e) => setRole(e.target.value)} style={inputStyle}>
            <option value="cleaner">Renholder</option>
            <option value="manager">Driftsleder</option>
            <option value="customer">Kunde</option>
            <option value="admin">Admin</option>
          </select>
          {role === "customer" && (
            <select required value={clientId} onChange={(e) => setClientId(e.target.value)} style={inputStyle}>
              <option value="">Velg kunde</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <button type="submit" style={primaryBtnStyle}>+ Opprett</button>
        </form>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 8 }}>
          Lenken er gyldig i 14 dager. Brukeren får rollen og tilknyttes ditt firma automatisk.
        </div>
      </Card>

      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8, letterSpacing: 0.5 }}>
        AKTIVE INVITASJONER ({invitations.active.length})
      </div>
      <Card style={{ marginBottom: 20 }}>
        {invitations.active.length === 0 && (
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
        {invitations.history.length === 0 && (
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

const primaryBtnStyle = {
  background: "var(--accent-orange)", color: "white", border: "none",
  padding: "9px 16px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
};
const linkBtnStyle = {
  background: "none", border: "none", color: "var(--accent-orange-dark)", fontSize: 12, cursor: "pointer", fontWeight: 500,
};
const iconBtnStyle = {
  background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4,
};
const inputStyle = {
  padding: "9px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border)",
  background: "var(--surface-0)", color: "var(--text-primary)", fontSize: 14, boxSizing: "border-box",
};
