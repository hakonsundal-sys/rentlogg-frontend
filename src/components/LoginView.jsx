import { useState } from "react";
import { apiFetch } from "../api";
import { Card } from "./shared";
import { useT } from "../i18n";

export default function LoginView({ onLogin, checkinPending }) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      onLogin(data.token, data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: "40px auto 0" }}>
      <Card>
        {checkinPending && (
          <div style={{
            fontSize: 13, color: "var(--text-secondary)", background: "var(--surface-0)",
            border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "8px 10px", marginBottom: 14,
          }}>
            {t("login.checkinPending")}
          </div>
        )}
        <form onSubmit={submit}>
          <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>{t("login.email")}</label>
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
          <label style={{ display: "block", fontSize: 13, margin: "12px 0 4px" }}>{t("login.password")}</label>
          <input
            type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />
          {error && <div style={{ color: "var(--text-danger)", fontSize: 13, marginTop: 10 }}>{error}</div>}
          <button type="submit" disabled={loading} style={{
            marginTop: 16, width: "100%", background: "var(--accent-orange)", color: "white",
            border: "none", padding: "10px", borderRadius: "var(--radius)", fontSize: 14, cursor: "pointer",
          }}>
            {loading ? t("login.submitting") : t("login.submit")}
          </button>
        </form>
      </Card>

      {/* App.jsx rendrer allerede "Rentlogg / Dokumentert etterkontroll" over dette, så navnet
          gjentas ikke her. Det som mangler for en utenforstående er hvorfor det ikke finnes noen
          "opprett konto"-lenke, og en vei videre til noe som faktisk beskriver tjenesten: en naken
          e-post/passord-boks uten avsender er nøyaktig formen en phishing-side har, og det er en
          medvirkende grunn til at bedriftsfiltre blokkerte domenet for kundene våre. */}
      <p style={{ textAlign: "center", fontSize: 12.5, color: "var(--text-muted)", marginTop: 16, lineHeight: 1.5 }}>
        {t("login.noSelfSignup")}
        <br />
        <a href="/om.html" style={{ color: "var(--text-secondary)" }}>{t("login.about")}</a>
      </p>
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "8px 10px", borderRadius: "var(--radius)",
  border: "1px solid var(--border)", background: "var(--surface-0)",
  color: "var(--text-primary)", fontSize: 14, boxSizing: "border-box",
};
