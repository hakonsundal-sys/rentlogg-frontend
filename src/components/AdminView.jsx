import { useEffect, useState } from "react";
import { apiFetch, downloadPdf } from "../api";
import { Card, StatusBadge } from "./shared";

export default function AdminView({ token }) {
  const [sites, setSites] = useState([]);
  const [clients, setClients] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([apiFetch("/sites", { token }), apiFetch("/clients", { token })])
      .then(([sites, clients]) => {
        setSites(sites);
        setClients(clients);
      })
      .catch((err) => setError(err.message));
  }, [token]);

  const clientName = (id) => clients.find((c) => c.id === id)?.name || "—";
  const deviationCount = sites.filter((s) => s.status === "deviation").length;
  const overdueCount = sites.filter((s) => s.status === "overdue").length;

  if (error) return <Card style={{ color: "var(--text-danger)" }}>{error}</Card>;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        <Card><div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Lokasjoner</div><div style={{ fontSize: 24, fontWeight: 500 }}>{sites.length}</div></Card>
        <Card><div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Forsinket</div><div style={{ fontSize: 24, fontWeight: 500 }}>{overdueCount}</div></Card>
        <Card><div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Åpne avvik</div><div style={{ fontSize: 24, fontWeight: 500 }}>{deviationCount}</div></Card>
      </div>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "var(--surface-0)", textAlign: "left" }}>
              <th style={{ padding: 12, fontWeight: 500 }}>Lokasjon</th>
              <th style={{ padding: 12, fontWeight: 500 }}>Kunde</th>
              <th style={{ padding: 12, fontWeight: 500 }}>Sist rengjort</th>
              <th style={{ padding: 12, fontWeight: 500 }}>Status</th>
              <th style={{ padding: 12, fontWeight: 500 }}></th>
            </tr>
          </thead>
          <tbody>
            {sites.map((s) => (
              <tr key={s.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: 12 }}>{s.name}</td>
                <td style={{ padding: 12, color: "var(--text-secondary)" }}>{clientName(s.client_id)}</td>
                <td style={{ padding: 12, color: "var(--text-secondary)" }}>{s.last_cleaned_at || "Aldri"}</td>
                <td style={{ padding: 12 }}><StatusBadge status={s.status} /></td>
                <td style={{ padding: 12 }}>
                  <button
                    onClick={() => downloadPdf(`/reports/sites/${s.id}/pdf`, token, `rapport-${s.id}.pdf`)}
                    style={{
                      background: "none", border: "1px solid var(--border)", borderRadius: "var(--radius)",
                      padding: "4px 10px", fontSize: 12, cursor: "pointer", color: "var(--text-secondary)",
                    }}
                  >
                    PDF
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sites.length === 0 && (
          <div style={{ padding: 16, color: "var(--text-secondary)", fontSize: 13 }}>Ingen lokasjoner registrert ennå.</div>
        )}
      </Card>
    </div>
  );
}
