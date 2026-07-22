import { useEffect, useRef, useState } from "react";
import { Camera, UserCircle2 } from "lucide-react";
import { apiFetch, API_URL } from "../../api";
import { Card } from "../shared";

export default function MinProfilPage({ token }) {
  const [profile, setProfile] = useState(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef(null);

  function load() {
    apiFetch("/auth/me", { token }).then((p) => {
      setProfile(p);
      setName(p.name);
      setPhone(p.phone || "");
    }).catch((err) => setError(err.message));
  }

  useEffect(load, [token]);

  async function save(e) {
    e.preventDefault();
    setError("");
    setSaved(false);
    try {
      const updated = await apiFetch("/auth/me", { token, method: "PATCH", body: JSON.stringify({ name, phone }) });
      setProfile(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message);
    }
  }

  async function uploadAvatar(e) {
    const file = e.target.files[0];
    if (!file) return;
    const form = new FormData();
    form.append("avatar", file);
    try {
      await apiFetch("/auth/me/avatar", { token, method: "POST", body: form });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      e.target.value = "";
    }
  }

  if (!profile) return <div style={{ color: "var(--text-secondary)" }}>Laster...</div>;

  return (
    <div>
      <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>Min profil</h1>
      <div style={{ color: "var(--text-secondary)", marginBottom: 20 }}>Oppdater navn, telefon og profilbilde.</div>

      <Card style={{ maxWidth: 480 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
          <div style={{ position: "relative" }}>
            <div style={{
              width: 64, height: 64, borderRadius: "50%", background: "var(--surface-0)",
              display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
              border: "1px solid var(--border)",
            }}>
              {profile.avatar_url ? (
                <img src={`${API_URL}${profile.avatar_url}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <UserCircle2 size={36} style={{ color: "var(--text-muted)" }} />
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={uploadAvatar} style={{ display: "none" }} />
            <button onClick={() => fileInputRef.current.click()} style={{
              position: "absolute", bottom: -2, right: -2, width: 24, height: 24, borderRadius: "50%",
              background: "var(--accent-orange)", color: "white", border: "2px solid var(--surface-1)",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
            }}>
              <Camera size={12} />
            </button>
          </div>
          <div>
            <div style={{ fontWeight: 600 }}>{profile.name}</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{profile.email}</div>
          </div>
        </div>

        {error && <div style={{ color: "var(--text-danger)", marginBottom: 12, fontSize: 13 }}>{error}</div>}

        <form onSubmit={save}>
          <label style={labelStyle}>Fullt navn</label>
          <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />

          <label style={labelStyle}>Telefon</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+47 ..." style={inputStyle} />

          <label style={labelStyle}>E-post</label>
          <input value={profile.email} disabled style={{ ...inputStyle, background: "var(--surface-0)", color: "var(--text-secondary)" }} />
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: -6, marginBottom: 16 }}>E-post kan ikke endres her.</div>

          <button type="submit" style={primaryBtnStyle}>{saved ? "Lagret ✓" : "Lagre endringer"}</button>
        </form>
      </Card>
    </div>
  );
}

const labelStyle = { display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6, marginTop: 14 };
const primaryBtnStyle = {
  marginTop: 16, background: "var(--accent-orange)", color: "white", border: "none",
  padding: "10px 18px", borderRadius: "var(--radius)", fontSize: 14, fontWeight: 600, cursor: "pointer",
};
const inputStyle = {
  padding: "9px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border)",
  background: "var(--surface-1)", color: "var(--text-primary)", fontSize: 14, boxSizing: "border-box", width: "100%",
};
