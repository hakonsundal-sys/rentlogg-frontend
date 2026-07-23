import { useState } from "react";
import { apiFetch } from "../api";
import { Card } from "./shared";

export default function LoginView({ onLogin }) {
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
        <form onSubmit={submit}>
          <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>E-post</label>
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
          <label style={{ display: "block", fontSize: 13, margin: "12px 0 4px" }}>Passord</label>
          <input
            type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />
          {error && <div style={{ color: "var(--text-danger)", fontSize: 13, marginTop: 10 }}>{error}</div>}
          <button type="submit" disabled={loading} style={{
            marginTop: 16, width: "100%", background: "var(--accent-orange)", color: "white",
            border: "none", padding: "10px", borderRadius: "var(--radius)", fontSize: 14, cursor: "pointer",
          }}>
            {loading ? "Logger inn..." : "Logg inn"}
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
