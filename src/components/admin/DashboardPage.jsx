import { useState } from "react";
import { Sparkles, X, ClipboardList, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { Card } from "../shared";

const ROLE_CHIP = { admin: "Administrator", manager: "Driftsleder" };

export default function DashboardPage({ user, summary }) {
  const [showOnboarding, setShowOnboarding] = useState(true);

  if (!summary) return <div style={{ color: "var(--text-secondary)" }}>Laster...</div>;

  const activity = [
    ...summary.recentActivity.map((a) => ({
      key: `run-${a.id}`,
      title: a.siteName,
      subtitle: `${a.cleanerName} · ${a.status === "completed" ? "Fullført" : "Pågår"}`,
      badge: a.status === "completed" ? "FULLFØRT" : "PÅGÅR",
      badgeColor: a.status === "completed" ? "var(--text-success)" : "var(--accent-orange-dark)",
      badgeBg: a.status === "completed" ? "var(--c-teal)" : "var(--accent-orange-bg)",
    })),
    ...summary.plannedToday.map((p) => ({
      key: `planned-${p.siteId}`,
      title: p.siteName,
      subtitle: p.assignedCleanerName ? `${p.assignedCleanerName} · Tildelt` : "Ikke tildelt",
      badge: "PLANLAGT",
      badgeColor: "var(--text-secondary)",
      badgeBg: "var(--surface-0)",
    })),
  ];

  return (
    <div>
      <div style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 999, background: "var(--accent-orange-bg)", color: "var(--accent-orange-dark)", fontSize: 12, fontWeight: 600, marginBottom: 10 }}>
        <Sparkles size={12} style={{ marginRight: 4 }} /> {ROLE_CHIP[user.role] || user.role}
      </div>
      <h1 style={{ fontSize: 28, margin: "0 0 4px" }}>Hei {user.name} 👋</h1>
      <div style={{ color: "var(--text-secondary)", marginBottom: 24 }}>Oversikt over driften</div>

      {showOnboarding && (
        <Card style={{ marginBottom: 24, position: "relative" }}>
          <button onClick={() => setShowOnboarding(false)} style={{
            position: "absolute", top: 16, right: 16, background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)",
          }}>
            <X size={16} />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, marginBottom: 10 }}>
            💡 Første gangs oppsett
          </div>
          <div style={{ color: "var(--text-secondary)", marginBottom: 8 }}>Slik kommer du i gang. Det er tre enkle steg:</div>
          <ol style={{ margin: 0, paddingLeft: 20, color: "var(--text-primary)", lineHeight: 1.8 }}>
            <li><strong>Opprett kunde</strong> — gå til <em>Kunder</em> og legg til firmaet du skal vaske for.</li>
            <li><strong>Opprett lokasjon</strong> — gå inn på kunden og legg til bygningen eller etasjen som skal rengjøres.</li>
            <li><strong>Inviter folk</strong> — send lenke til kunden, driftslederen og renholderne som skal bruke appen.</li>
          </ol>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        <StatCard icon={ClipboardList} label="Oppdrag totalt" value={summary.totalRunsToday + summary.plannedToday.length} />
        <StatCard icon={CheckCircle2} label="Fullført" value={summary.completedToday} color="var(--text-success)" />
        <StatCard icon={Clock} label="Pågående" value={summary.inProgressToday} color="var(--accent-orange-dark)" />
        <StatCard icon={AlertTriangle} label="Åpne avvik" value={summary.openDeviationsCount} color="var(--text-danger)" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 16 }}>
        <Card>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Siste aktivitet</div>
          {activity.length === 0 && <div style={{ color: "var(--text-secondary)", fontSize: 14 }}>Ingen aktivitet i dag ennå.</div>}
          {activity.map((a) => (
            <div key={a.key} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 0", borderTop: "1px solid var(--border)",
            }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{a.title}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{a.subtitle}</div>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 999,
                background: a.badgeBg, color: a.badgeColor,
              }}>
                {a.badge}
              </span>
            </div>
          ))}
        </Card>

        <div style={{
          background: "linear-gradient(135deg, var(--accent-orange), var(--accent-orange-dark))",
          borderRadius: 12, padding: 20, color: "white",
        }}>
          <div style={{ fontSize: 13, opacity: 0.9 }}>Aktive lokasjoner</div>
          <div style={{ fontSize: 40, fontWeight: 700, margin: "4px 0" }}>{summary.activeSites}</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>Oversikt over alle dine lokasjoner.</div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <Card>
      <Icon size={18} style={{ color: color || "var(--text-secondary)", marginBottom: 10 }} />
      <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600 }}>{value}</div>
    </Card>
  );
}
