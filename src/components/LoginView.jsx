import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import { Card } from "./shared";
import { useI18n } from "../i18n";
import { BUILD_TIME, fetchDeployedBuild, isStale, reloadLatest } from "../version";

// Oslo time regardless of the phone's own zone, and for every language: everyone reading this is
// standing in Norway, and a timestamp that disagrees with the clock on the wall is worse than no
// timestamp at all.
function formatBuildTime(iso, language) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(language === "no" ? "nb-NO" : language, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Oslo",
    // 24-hour in every language. English otherwise formats "09:32 AM", and a shift that starts at
    // 04:00 is read off a 24-hour clock here no matter which language the app is set to.
    hour12: false,
  }).format(date);
}

export default function LoginView({ onLogin, checkinPending }) {
  const { t, language } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [deployed, setDeployed] = useState(null);

  // Runs once, on the one screen where a stale bundle actually shows up as a problem. Never
  // rejects and never surfaces an error: this is a diagnostic, and a diagnostic that puts a red
  // message over the login box has made things worse.
  useEffect(() => {
    let cancelled = false;
    fetchDeployedBuild().then((v) => {
      if (!cancelled) setDeployed(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const stale = isStale(deployed);
  const builtAt = formatBuildTime(BUILD_TIME, language);

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
      {/* Above the form on purpose. When this shows, it is a likelier explanation for a login that
          won't go through than anything the person is about to type, so it has to be read first. */}
      {stale && (
        <div style={{
          background: "var(--brand-bg)", border: "1px solid var(--brand)",
          borderRadius: "var(--radius)", padding: "12px 14px", marginBottom: 14,
        }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--brand-dark)" }}>
            {t("login.updateAvailable")}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.5 }}>
            {t("login.updateAvailableBody")}
          </div>
          <button type="button" onClick={reloadLatest} style={{
            marginTop: 10, width: "100%", background: "var(--brand)", color: "white",
            border: "none", padding: "9px", borderRadius: "var(--radius)", fontSize: 14, cursor: "pointer",
          }}>
            {t("login.reload")}
          </button>
        </div>
      )}

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
            marginTop: 16, width: "100%", background: "var(--brand)", color: "white",
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

      {/* Always present, not only when the check above fires. The check needs version.json to be
          reachable, and someone whose app is misbehaving badly enough to ask for help is exactly
          the person for whom that fetch may have failed too. The written instruction works with no
          JavaScript having succeeded at all, and the build stamp turns "har du prøvd å laste den
          på nytt?" over the phone into a question with a checkable answer. */}
      <div style={{
        textAlign: "center", fontSize: 12, color: "var(--text-muted)",
        marginTop: 20, lineHeight: 1.6,
      }}>
        {builtAt && <div>{t("login.lastUpdated", { date: builtAt })}</div>}
        <div style={{ marginTop: 4 }}>{t("login.trouble")}</div>
        <button type="button" onClick={reloadLatest} style={{
          marginTop: 6, background: "none", border: "none", padding: 0,
          color: "var(--text-secondary)", fontSize: 12, textDecoration: "underline", cursor: "pointer",
        }}>
          {t("login.reload")}
        </button>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "8px 10px", borderRadius: "var(--radius)",
  border: "1px solid var(--border)", background: "var(--surface-0)",
  color: "var(--text-primary)", fontSize: 14, boxSizing: "border-box",
};
