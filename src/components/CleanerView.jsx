import { useEffect, useRef, useState } from "react";
import {
  QrCode, MapPin, Camera, AlertTriangle, CheckCircle2, Circle, ChevronLeft, ShieldCheck,
} from "lucide-react";
import { apiFetch } from "../api";
import { Card, StatusBadge } from "./shared";

function getPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000 }
    );
  });
}

export default function CleanerView({ token }) {
  const [sites, setSites] = useState([]);
  const [run, setRun] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [showDeviationForm, setShowDeviationForm] = useState(false);
  const [deviationText, setDeviationText] = useState("");
  const [photoCount, setPhotoCount] = useState(0);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    apiFetch("/sites", { token }).then(setSites).catch((err) => setError(err.message));
  }, [token]);

  async function scan() {
    setError("");
    setScanning(true);
    try {
      const unfinished = sites.filter((s) => s.status !== "ok");
      const pool = unfinished.length ? unfinished : sites;
      if (!pool.length) throw new Error("Ingen lokasjoner tilgjengelig");
      const site = pool[Math.floor(Math.random() * pool.length)];

      const position = await getPosition();
      const checkin = await apiFetch(`/sites/checkin/${site.qr_token}`, {
        token, method: "POST", body: JSON.stringify(position || {}),
      });
      const fullRun = await apiFetch(`/checklists/runs/${checkin.runId}`, { token });
      setRun({ ...fullRun, site: checkin.site, gps_verified: checkin.gps_verified });
      setPhotoCount(0);
      setShowDeviationForm(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  }

  async function toggleItem(item) {
    const done = !item.done;
    setRun((r) => ({ ...r, items: r.items.map((i) => (i.id === item.id ? { ...i, done } : i)) }));
    try {
      await apiFetch(`/checklists/runs/${run.id}/items/${item.id}`, {
        token, method: "PATCH", body: JSON.stringify({ done }),
      });
    } catch (err) {
      setError(err.message);
    }
  }

  async function submitDeviation() {
    if (!deviationText.trim()) return;
    try {
      await apiFetch("/deviations", {
        token, method: "POST",
        body: JSON.stringify({ site_id: run.site.id, run_id: run.id, description: deviationText, priority: "medium" }),
      });
      setDeviationText("");
      setShowDeviationForm(false);
      setRun((r) => ({ ...r, site: { ...r.site, status: "deviation" } }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function uploadPhoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    const form = new FormData();
    form.append("photo", file);
    form.append("kind", "general");
    try {
      await apiFetch(`/checklists/runs/${run.id}/photos`, { token, method: "POST", body: form });
      setPhotoCount((c) => c + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      e.target.value = "";
    }
  }

  async function complete() {
    try {
      await apiFetch(`/checklists/runs/${run.id}/complete`, { token, method: "POST" });
      setRun(null);
      apiFetch("/sites", { token }).then(setSites).catch(() => {});
    } catch (err) {
      setError(err.message);
    }
  }

  if (!run) {
    return (
      <Card style={{ textAlign: "center", padding: 40 }}>
        <QrCode size={40} style={{ margin: "0 auto 12px", color: "var(--text-secondary)" }} />
        <div style={{ marginBottom: 16, color: "var(--text-secondary)" }}>Skann QR-koden ved lokasjonen for å starte oppdraget</div>
        {error && <div style={{ color: "var(--text-danger)", fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <button onClick={scan} disabled={scanning} style={{
          background: "var(--text-accent)", color: "var(--surface-2)", border: "none",
          padding: "10px 20px", borderRadius: "var(--radius)", fontSize: 14, cursor: "pointer",
        }}>
          {scanning ? "Skanner..." : "Simuler QR-skann"}
        </button>
      </Card>
    );
  }

  const doneCount = run.items.filter((i) => i.done).length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <button onClick={() => setRun(null)} style={{
          display: "flex", alignItems: "center", gap: 4, background: "none", border: "none",
          color: "var(--text-secondary)", fontSize: 13, cursor: "pointer",
        }}>
          <ChevronLeft size={16} /> Tilbake
        </button>
        <StatusBadge status={run.site.status} />
      </div>

      {error && <div style={{ color: "var(--text-danger)", fontSize: 13, marginBottom: 12 }}>{error}</div>}

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 500, fontSize: 16, marginBottom: 2 }}>{run.site.name}</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>{run.site.address || ""}</div>
        {run.gps_verified ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-success)" }}>
            <ShieldCheck size={15} /> Posisjon bekreftet
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-secondary)" }}>
            <MapPin size={15} /> Posisjon ikke bekreftet
          </div>
        )}
      </Card>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontWeight: 500 }}>Sjekkliste</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{doneCount}/{run.items.length}</div>
        </div>
        {run.items.map((item) => (
          <div key={item.id} onClick={() => toggleItem(item)} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 0",
            borderTop: "1px solid var(--border)", cursor: "pointer",
          }}>
            {item.done ? <CheckCircle2 size={18} style={{ color: "var(--text-success)" }} /> : <Circle size={18} style={{ color: "var(--text-muted)" }} />}
            <span style={{ fontSize: 14, textDecoration: item.done ? "line-through" : "none", color: item.done ? "var(--text-secondary)" : "var(--text-primary)" }}>
              {item.label}
            </span>
          </div>
        ))}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={uploadPhoto} style={{ display: "none" }} />
          <button onClick={() => fileInputRef.current.click()} style={{
            display: "flex", alignItems: "center", gap: 6, flex: 1, justifyContent: "center",
            background: "var(--surface-0)", border: "1px solid var(--border)",
            padding: "10px", borderRadius: "var(--radius)", fontSize: 13, cursor: "pointer",
          }}>
            <Camera size={16} /> Ta bilde{photoCount > 0 ? ` (${photoCount})` : ""}
          </button>
          <button onClick={() => setShowDeviationForm((v) => !v)} style={{
            display: "flex", alignItems: "center", gap: 6, flex: 1, justifyContent: "center",
            background: "var(--bg-danger)", color: "var(--text-danger)", border: "1px solid var(--border-danger)",
            padding: "10px", borderRadius: "var(--radius)", fontSize: 13, cursor: "pointer",
          }}>
            <AlertTriangle size={16} /> Meld avvik
          </button>
        </div>

        {showDeviationForm && (
          <div style={{ marginTop: 12 }}>
            <textarea
              value={deviationText}
              onChange={(e) => setDeviationText(e.target.value)}
              placeholder="Beskriv avviket..."
              style={{
                width: "100%", minHeight: 70, padding: 10, borderRadius: "var(--radius)",
                border: "1px solid var(--border)", background: "var(--surface-2)",
                color: "var(--text-primary)", fontSize: 14, resize: "vertical", boxSizing: "border-box",
              }}
            />
            <button onClick={submitDeviation} style={{
              marginTop: 8, background: "var(--text-accent)", color: "var(--surface-2)",
              border: "none", padding: "8px 16px", borderRadius: "var(--radius)", fontSize: 13, cursor: "pointer",
            }}>
              Send avvik
            </button>
          </div>
        )}

        <button onClick={complete} style={{
          marginTop: 16, width: "100%", background: "var(--text-success)", color: "white",
          border: "none", padding: "10px", borderRadius: "var(--radius)", fontSize: 14, cursor: "pointer",
        }}>
          Fullfør oppdrag
        </button>
      </Card>
    </div>
  );
}
