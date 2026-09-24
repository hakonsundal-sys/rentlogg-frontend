import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import { Card } from "./shared";
import { useT } from "../i18n";

export default function AcceptInvitePage({ token: inviteToken, onLogin, onCancel }) {
  const t = useT();
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
    return <div style={{ maxWidth: 360, margin: "80px auto", textAlign: "center", color: "var(--text-secondary)" }}>{t("common.loading")}</div>;
  }

  if (status === "invalid") {
    return (
      <div style={{ maxWidth: 360, margin: "40px auto 0" }}>
        <Card style={{ textAlign: "center" }}>
          <div style={{ marginBottom: 12 }}>{t("invite.invalid")}</div>
          <button onClick={onCancel} style={{
            background: "var(--brand)", color: "white", border: "none",
            padding: "10px 20px", borderRadius: "var(--radius)", fontSize: 14, cursor: "pointer",
          }}>
            {t("invite.goToLogin")}
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 360, margin: "40px auto 0" }}>
      <Card>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600 }}>{t("invite.title")}</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            {t("invite.invitedAs", { email: invite.email, role: t(`invite.role.${invite.role}`) })}
          </div>
        </div>
        <form onSubmit={submit}>
          <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>{t("invite.fullName")}</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
          <label style={{ display: "block", fontSize: 13, margin: "12px 0 4px" }}>{t("invite.choosePassword")}</label>
          <input required type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
          {error && <div style={{ color: "var(--text-danger)", fontSize: 13, marginTop: 10 }}>{error}</div>}
          <button type="submit" disabled={submitting} style={{
            marginTop: 16, width: "100%", background: "var(--brand)", color: "white",
            border: "none", padding: "10px", borderRadius: "var(--radius)", fontSize: 14, cursor: "pointer",
          }}>
            {submitting ? t("invite.creating") : t("invite.createAccount")}
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
