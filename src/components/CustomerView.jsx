import { useEffect, useState } from "react";
import { AlertTriangle, Clock, Download } from "lucide-react";
import { apiFetch, downloadPdf, downloadZip } from "../api";
import { Card, StatusBadge } from "./shared";

export default function CustomerView({ token }) {
  const [sites, setSites] = useState([]);
  const [deviations, setDeviations] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([apiFetch("/sites", { token }), apiFetch("/deviations", { token })])
      .then(([sites, deviations]) => {
        setSites(sites);
        setDeviations(deviations);
      })
      .catch((err) => setError(err.message));
  }, [token]);

  if (error) return <Card style={{ color: "var(--text-danger)" }}>{error}</Card>;

  return (
    <div>
      {sites.map((s) => {
        const siteDeviations = deviations.filter((d) => d.site_id === s.id && d.status !== "resolved");
        return (
          <Card key={s.id} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 500 }}>{s.name}</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                  <Clock size={13} /> Sist rengjort: {s.last_cleaned_at || "Aldri"}
                </div>
              </div>
              <StatusBadge status={s.status} />
            </div>
            {siteDeviations.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                {siteDeviations.map((d) => (
                  <div key={d.id} style={{ fontSize: 13, color: "var(--text-danger)", display: "flex", alignItems: "center", gap: 6 }}>
                    <AlertTriangle size={14} /> {d.description} ({d.priority})
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                onClick={() => downloadPdf(`/reports/sites/${s.id}/pdf`, token, `rapport-${s.id}.pdf`)}
                style={{
                  background: "none", border: "1px solid var(--border)", borderRadius: "var(--radius)",
                  padding: "6px 12px", fontSize: 12, cursor: "pointer", color: "var(--text-secondary)",
                }}
              >
                Last ned rapport (PDF)
              </button>
              <button
                onClick={() => downloadZip(`/reports/sites/${s.id}/photos.zip`, token, `bilder-${s.id}.zip`).catch((err) => setError(err.message))}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: "none", border: "1px solid var(--border)", borderRadius: "var(--radius)",
                  padding: "6px 12px", fontSize: 12, cursor: "pointer", color: "var(--text-secondary)",
                }}
              >
                <Download size={13} /> Last ned alle bilder
              </button>
            </div>
          </Card>
        );
      })}
      {sites.length === 0 && (
        <Card style={{ textAlign: "center", color: "var(--text-secondary)" }}>Ingen lokasjoner registrert for denne kunden ennå.</Card>
      )}
    </div>
  );
}
