import { Clock, Sparkles } from "lucide-react";

export default function TopBanner({ trial }) {
  if (!trial) return null;

  return (
    <div style={{
      background: "var(--banner-gradient)", borderRadius: "var(--radius)",
      padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
      marginBottom: 20, gap: 16, flexWrap: "wrap",
    }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, color: "var(--accent-orange-dark)", fontSize: 14 }}>
          <Clock size={16} /> {trial.daysLeft} dager igjen av prøveperioden
        </div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
          {trial.siteCount} lokasjoner × {trial.pricePerSite} kr = <strong>{trial.monthlyTotal} kr/mnd</strong> ved abonnement
        </div>
      </div>
      <button
        onClick={() => alert("Oppgradering er ikke tilgjengelig ennå")}
        style={{
          display: "flex", alignItems: "center", gap: 6, background: "var(--accent-orange)", color: "white",
          border: "none", padding: "10px 18px", borderRadius: 999, fontSize: 13, fontWeight: 600,
          cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        <Sparkles size={15} /> Oppgrader nå
      </button>
    </div>
  );
}
