import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";
import { apiFetch } from "../api";
import { Card, Loading, linkBtnStyle } from "./shared";

// Trend per prøvepunkt. Delt mellom kundeflaten og admin, så de to aldri kan vise samme tall
// forskjellig — backend avgrenser allerede hva hver rolle får se (kunden bare sine egne runder,
// staben begge slag), så komponenten trenger ingen rollelogikk av eget.
//
// ### Hvorfor små multipler og ikke én graf med mange kurver
//
// Hvert prøvepunkt har SIN EGEN grenseverdi. En felles y-akse over flere objekter ville satt
// målinger med ulike krav på samme skala, og en kurve som ligger høyt ville sett verre ut enn en
// som ligger lavt selv om den lave strøk og den høye besto. Én graf per punkt, hver mot sin egen
// grenselinje, er den eneste formen som ikke lyver her. Det løser samtidig at en lokasjon kan ha
// femten punkter — femten kurver i ett felt hadde vært uleselig uansett farge.
//
// ### Hvorfor formen og ikke fargen bærer dommen
//
// Grønn/gul/rød er målt mot hverandre: rød↔gul ligger på ΔE 14,4 for normalt syn og grønn↔gul på
// 6,2 for protanopi. Det er under det som skal til for å skille dem trygt. Derfor har hver dom
// sin egen markørform — sirkel, rombe, trekant — og de som stryker får verdien skrevet rett på.
// Fargen er forsterkning, ikke informasjonen.

const DOM = {
  bra: { form: "sirkel", farge: "var(--text-success)", tekst: "Bra" },
  mindre_bra: { form: "rombe", farge: "var(--text-warning)", tekst: "Mindre bra" },
  daarlig: { form: "trekant", farge: "var(--text-danger)", tekst: "Utenfor krav" },
};

function Markor({ x, y, dom, stor = false }) {
  const d = DOM[dom] || { form: "sirkel", farge: "var(--text-muted)" };
  const r = stor ? 5.5 : 4.5;
  // 2px ring i flatefargen, så to markører som ligger oppå hverandre fortsatt leses som to.
  const ring = { stroke: "var(--surface-1)", strokeWidth: 2 };
  if (d.form === "rombe") {
    return <rect x={x - r} y={y - r} width={r * 2} height={r * 2} transform={`rotate(45 ${x} ${y})`} fill={d.farge} {...ring} />;
  }
  if (d.form === "trekant") {
    const h = r * 1.25;
    return <polygon points={`${x},${y - h} ${x + h},${y + h * 0.8} ${x - h},${y + h * 0.8}`} fill={d.farge} {...ring} />;
  }
  return <circle cx={x} cy={y} r={r} fill={d.farge} {...ring} />;
}

// Én serie: ett prøvepunkt, én måletype, over tid.
function Graf({ samples, felt, grense, enhet }) {
  const data = samples.filter((s) => s[felt] != null);
  if (data.length === 0) return null;

  const W = 268, H = 96, PAD = { t: 10, r: 10, b: 18, l: 34 };
  const verdier = data.map((s) => s[felt]);
  // Grenselinjen må alltid få plass i bildet, ellers kan en kurve som ligger langt under den se
  // ut som om den nærmer seg noe. Taket er derfor det høyeste av målingene og grensen, med luft.
  const tak = Math.max(...verdier, grense ?? 0) * 1.18 || 1;
  const x = (i) => PAD.l + (data.length === 1 ? (W - PAD.l - PAD.r) / 2 : (i / (data.length - 1)) * (W - PAD.l - PAD.r));
  const y = (v) => PAD.t + (1 - v / tak) * (H - PAD.t - PAD.b);

  const linje = data.map((s, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(s[felt])}`).join(" ");
  const gy = grense != null ? y(grense) : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, display: "block", overflow: "visible" }}
         role="img" aria-label={`${felt} over tid for dette prøvepunktet`}>
      {/* Grenselinjen. Stiplet og i dempet blekk, ikke i rødt: den er en referanse, ikke en
          hendelse, og rødt her ville konkurrert med markørene som faktisk er dårlige. */}
      {gy != null && (
        <>
          <line x1={PAD.l} y1={gy} x2={W - PAD.r} y2={gy} stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="3 3" />
          <text x={W - PAD.r} y={gy - 4} textAnchor="end" fontSize="9" fill="var(--text-muted)">
            grense {grense}
          </text>
        </>
      )}
      <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} stroke="var(--border)" strokeWidth="1" />
      <text x={PAD.l - 6} y={PAD.t + 4} textAnchor="end" fontSize="9" fill="var(--text-muted)">{Math.round(tak)}</text>
      <text x={PAD.l - 6} y={H - PAD.b} textAnchor="end" fontSize="9" fill="var(--text-muted)">0</text>

      {data.length > 1 && <path d={linje} fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity="0.45" />}

      {data.map((s, i) => {
        // Dommen for DETTE feltet, ikke punktets samlede. `verdict` er den verste på tvers av
        // totalkim, ATP og hurtigtestene, så en totalkim på 19 ville blitt tegnet som stryk bare
        // fordi ATP-en samme dag var for høy — og tallet 19 ville stått rødt ved siden av en
        // grense på 80. Hver graf viser én måling og må felle sin egen dom.
        const dom = s.parts?.find((d) => d.felt === felt)?.nivaa ?? null;
        const daarlig = dom === "daarlig";
        return (
          <g key={i}>
            <Markor x={x(i)} y={y(s[felt])} dom={dom} stor={daarlig} />
            {/* Bare de som stryker får tallet på seg. Et tall på hvert punkt ville gjort grafen
                til en tabell med pynt — og det er bruddene leseren er ute etter. */}
            {daarlig && (
              // Etiketten står over markøren, men vippes under når punktet ligger for nær taket.
              // Uten det ville en strykverdi nær toppen lagt seg oppå akseetiketten — og en
              // strykverdi ER som regel den høyeste i serien, så det er ikke et kanttilfelle.
              <text
                x={x(i)} y={y(s[felt]) < PAD.t + 14 ? y(s[felt]) + 17 : y(s[felt]) - 10}
                textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-danger)"
              >
                {s[felt]}
              </text>
            )}
            <title>{`${s.taken_date}: ${s[felt]}${enhet ? " " + enhet : ""} — ${DOM[dom]?.tekst ?? "ikke vurdert"}`}</title>
          </g>
        );
      })}
      {/* Første og siste dato, ikke alle: med fire målinger får man plass, med tolv ikke. */}
      <text x={PAD.l} y={H - 5} fontSize="9" fill="var(--text-muted)">{data[0].taken_date.slice(5)}</text>
      {data.length > 1 && (
        <text x={W - PAD.r} y={H - 5} textAnchor="end" fontSize="9" fill="var(--text-muted)">
          {data[data.length - 1].taken_date.slice(5)}
        </text>
      )}
    </svg>
  );
}

function Forklaring() {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", fontSize: 11, color: "var(--text-secondary)", marginBottom: 12 }}>
      {Object.values(DOM).map((d) => (
        <span key={d.tekst} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
            <Markor x={6.5} y={6.5} dom={Object.keys(DOM).find((k) => DOM[k] === d)} />
          </svg>
          {d.tekst}
        </span>
      ))}
    </div>
  );
}

export default function ProveTrend({ token, site }) {
  const [data, setData] = useState(null);
  const [feil, setFeil] = useState("");
  const [tabell, setTabell] = useState(false);

  useEffect(() => {
    apiFetch(`/samples/trend/${site.id}`, { token })
      .then(setData)
      .catch((err) => setFeil(err.message));
  }, [token, site.id]);

  if (feil) return <Card style={{ color: "var(--text-danger)" }}>{feil}</Card>;
  if (!data) return <Loading />;

  const punkter = (data.points || []).filter((p) => p.samples.some((s) => s.totalkim != null || s.atp != null));
  if (punkter.length === 0) {
    return (
      <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8 }}>
        Ingen avleste prøver å vise trend for ennå. En runde teller først når den er signert.
      </div>
    );
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 500 }}>
          <TrendingUp size={14} style={{ color: "var(--brand)" }} />
          Trend per prøvepunkt
        </div>
        <button onClick={() => setTabell((t) => !t)} style={linkBtnStyle}>
          {tabell ? "Vis grafer" : "Vis som tabell"}
        </button>
      </div>

      {tabell ? (
        // Tabellvisningen er ikke en reserveløsning — den er den eneste formen som gir eksakte
        // tall, og den eneste som virker med skjermleser.
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 420 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-secondary)", fontSize: 11 }}>
                <th style={{ padding: "4px 8px 6px 0" }}>Objekt</th>
                <th style={{ padding: "4px 8px 6px 0" }}>Dato</th>
                <th style={{ padding: "4px 8px 6px 0" }}>Totalkim</th>
                <th style={{ padding: "4px 8px 6px 0" }}>ATP</th>
                <th style={{ padding: "4px 0 6px" }}>Resultat</th>
              </tr>
            </thead>
            <tbody>
              {punkter.flatMap((p) =>
                p.samples.map((s, i) => (
                  <tr key={p.object + i} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "5px 8px 5px 0" }}>{i === 0 ? p.object : ""}</td>
                    <td style={{ padding: "5px 8px 5px 0", color: "var(--text-secondary)" }}>{s.taken_date}</td>
                    <td style={{ padding: "5px 8px 5px 0" }}>{s.totalkim ?? "—"}</td>
                    <td style={{ padding: "5px 8px 5px 0" }}>{s.atp ?? "—"}</td>
                    <td style={{ padding: "5px 0", color: DOM[s.verdict]?.farge ?? "var(--text-muted)" }}>
                      {DOM[s.verdict]?.tekst ?? "Ikke vurdert"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <Forklaring />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
            {punkter.map((p) => (
              <Card key={p.object} style={{ padding: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{p.object}</div>
                {p.area && <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>{p.area}</div>}
                {p.samples.some((s) => s.totalkim != null) && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 2 }}>Totalkim</div>
                    <Graf samples={p.samples} felt="totalkim" grense={p.limits?.totalkim_mindre_bra} />
                  </div>
                )}
                {p.samples.some((s) => s.atp != null) && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 2 }}>ATP (RLU)</div>
                    <Graf samples={p.samples} felt="atp" grense={p.limits?.atp_max} enhet="RLU" />
                    {p.limits?.atp_max == null && (
                      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                        Ingen grense satt — målingene vises, men er ikke vurdert.
                      </div>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
