import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import { Card } from "./shared";

const ROLE_LABELS = { admin: "Admin", manager: "Driftsleder", cleaner: "Renholder", customer: "Kunde" };

export default function AcceptInvitePage({ token: inviteToken, onLogin, onCancel }) {
  const [status, setStatus] = useState("loading"); // loading | valid | invalid
  const [invite, setInvite] = useState(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch(`/invitations/${inviteToken}`)
      .then((data) => {
        setInvite(data);
        setStatus("valid");
      })
      .catch(() => setStatus("invalid"));
  }, [inviteToken]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const data = await apiFetch(`/invitations/${inviteToken}/accept`, {
        method: "POST",
        body: JSON.stringify({ name, password }),
      });
      onLogin(data.token, data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "loading") {
    return <div style={{ maxWidth: 360, margin: "80px auto", textAlign: "center", color: "var(--text-secondary)" }}>Laster...</div>;
  }

  if (status === "invalid") {
    return (
      <div style={{ maxWidth: 360, margin: "40px auto 0" }}>
        <Card style={{ textAlign: "center" }}>
          <div style={{ marginBottom: 12 }}>Denne invitasjonen er ikke lenger gyldig.</div>
          <button onClick={onCancel} style={{
            background: "var(--text-accent)", color: "var(--surface-2)", border: "none",
            padding: "10px 20px", borderRadius: "var(--radius)", fontSize: 14, cursor: "pointer",
          }}>
            Gå til innlogging
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 360, margin: "40px auto 0" }}>
      <Card>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600 }}>Bli med i Rentlogg</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            {invite.email} · inviteres som {ROLE_LABELS[invite.role] || invite.role}
          </div>
        </div>
        <form onSubmit={submit}>
          <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>Fullt navn</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
          <label style={{ display: "block", fontSize: 13, margin: "12px 0 4px" }}>Velg passord</label>
          <input required type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
          {error && <div style={{ color: "var(--text-danger)", fontSize: 13, marginTop: 10 }}>{error}</div>}
          <button type="submit" disabled={submitting} style={{
            marginTop: 16, width: "100%", background: "var(--text-accent)", color: "var(--surface-2)",
            border: "none", padding: "10px", borderRadius: "var(--radius)", fontSize: 14, cursor: "pointer",
          }}>
            {submitting ? "Oppretter..." : "Opprett konto"}
          </button>
        </form>
      </Card>
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "8px 10px", borderRadius: "var(--radius)",
  border: "1px solid var(--border)", background: "var(--surface-0)",
  color: "var(--text-primary)", fontSize: 14, boxSizing: "border-box",
};
