import { useEffect, useState } from "react";
import { FlaskConical, Plus, Trash2, PenLine } from "lucide-react";
import { apiFetch } from "../../api";
import { Card, Field, Loading, primaryBtnStyle, linkBtnStyle, inputStyle } from "../shared";

// Mikrobiologisk prøvetaking — teamlederens egen kontroll, ved siden av etterkontrollen av
// renholderens arbeid. Formen følger OKVs skjema BA001: Lokale, Inv./Objekt, og resultatene
// Totalkim, ATP, E-coli og listeria.
//
// Det som skiller dette fra en måleoppgave i et romkjør er at prøven inkuberes et døgn: den som
// leser av er ofte en annen, dagen etter. Derfor er en runde to signaturer, og «til avlesning»
// er en helt vanlig tilstand og ikke en glemt oppgave.

// Grensene står på skjemaet, lest etter Hygicults tabell. Backenden regner ut dommen — dette er
// bare hvordan den vises, og teksten her må si det samme som src/routes/samples.js.
const DOM = {
  bra: { tekst: "Bra", farge: "var(--text-success)", bakgrunn: "var(--success-bg, rgba(22,163,74,.1))" },
  mindre_bra: { tekst: "Mindre bra", farge: "var(--text-warning)", bakgrunn: "rgba(217,119,6,.12)" },
  daarlig: { tekst: "Dårlig", farge: "var(--text-danger)", bakgrunn: "rgba(220,38,38,.12)" },
};

const Dom = ({ verdict }) => {
  if (!verdict) return <span style={{ fontSize: 12, color: "var(--text-muted)" }}>ikke avlest</span>;
  const d = DOM[verdict];
  return (
    <span style={{ fontSize: 12, fontWeight: 600, color: d.farge, background: d.bakgrunn, borderRadius: 999, padding: "2px 9px" }}>
      {d.tekst}
    </span>
  );
};

const idag = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" });

export default function ProvetakingPanel({ token }) {
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState("");
  const [rounds, setRounds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);

  const [nyApen, setNyApen] = useState(false);
  const [nyDato, setNyDato] = useState(idag());
  const [nyAv, setNyAv] = useState("");
  const [nyPunkter, setNyPunkter] = useState([{ area: "", object: "" }]);
  const [lagrer, setLagrer] = useState(false);

  useEffect(() => {
    apiFetch("/sites", { token })
      .then((s) => { setSites(s); if (s.length === 1) setSiteId(String(s[0].id)); })
      .catch((err) => setError(err.message));
  }, [token]);

  function lastRunder() {
    setLoading(true);
    apiFetch(`/samples${siteId ? `?site_id=${siteId}` : ""}`, { token })
      .then((d) => setRounds(d.rounds || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }
  useEffect(lastRunder, [token, siteId]);

  // Forrige runde på samme lokasjon som utgangspunkt: de faste punktene tas hver gang, og å
  // skrive dem inn på nytt hver gang er den sikreste måten å få dem litt forskjellig.
  async function apneNy() {
    setError("");
    setNyApen(true);
    setNyDato(idag());
    if (!siteId) return;
    try {
      const f = await apiFetch(`/samples/suggest/${siteId}`, { token });
      setNyPunkter(f.points?.length ? f.points : [{ area: "", object: "" }]);
    } catch {
      setNyPunkter([{ area: "", object: "" }]);
    }
  }

  async function opprett(e) {
    e.preventDefault();
    setError("");
    setLagrer(true);
    try {
      const r = await apiFetch("/samples", {
        token, method: "POST",
        body: JSON.stringify({
          site_id: Number(siteId), taken_date: nyDato, taken_by_name: nyAv,
          points: nyPunkter.filter((p) => p.object.trim()),
        }),
      });
      setNyApen(false);
      setNyAv("");
      setNyPunkter([{ area: "", object: "" }]);
      setRounds((list) => [r, ...list]);
      setOpenId(r.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setLagrer(false);
    }
  }

  async function lagrePunkt(rundeId, punktId, felt, verdi) {
    setError("");
    try {
      const oppdatert = await apiFetch(`/samples/${rundeId}/points/${punktId}`, {
        token, method: "PATCH", body: JSON.stringify({ [felt]: verdi }),
      });
      setRounds((list) => list.map((r) => (r.id === oppdatert.id ? { ...r, ...oppdatert } : r)));
    } catch (err) {
      setError(err.message);
    }
  }

  async function signerAvlesning(runde, navn) {
    setError("");
    try {
      const oppdatert = await apiFetch(`/samples/${runde.id}/read`, {
        token, method: "POST", body: JSON.stringify({ read_by_name: navn, read_date: idag() }),
      });
      setRounds((list) => list.map((r) => (r.id === oppdatert.id ? { ...r, ...oppdatert } : r)));
    } catch (err) {
      setError(err.message);
    }
  }

  async function slett(runde) {
    if (!window.confirm(`Slette prøverunden fra ${runde.taken_date}?`)) return;
    try {
      await apiFetch(`/samples/${runde.id}`, { token, method: "DELETE" });
      setRounds((list) => list.filter((r) => r.id !== runde.id));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 16 }}>
        <Field label="Lokasjon" style={{ minWidth: 220 }}>
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)} style={inputStyle}>
            <option value="">Alle lokasjoner</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <button
          onClick={apneNy}
          disabled={!siteId}
          title={siteId ? "" : "Velg lokasjon først"}
          style={{ ...primaryBtnStyle, display: "flex", alignItems: "center", gap: 6, opacity: siteId ? 1 : 0.5 }}
        >
          <Plus size={15} /> Ny prøverunde
        </button>
      </div>

      {error && <div style={{ color: "var(--text-danger)", marginBottom: 12 }}>{error}</div>}

      {nyApen && (
        <Card style={{ marginBottom: 20 }}>
          <form onSubmit={opprett}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
              <Field label="Uttatt dato" style={{ minWidth: 150 }}>
                <input required type="date" value={nyDato} max={idag()} onChange={(e) => setNyDato(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Prøver tatt av" style={{ flex: 1, minWidth: 200 }}>
                <input required value={nyAv} onChange={(e) => setNyAv(e.target.value)} placeholder="Fullt navn" style={inputStyle} />
              </Field>
            </div>

            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
              Prøvepunkter &mdash; forhåndsutfylt fra forrige runde på denne lokasjonen
            </div>
            {nyPunkter.map((p, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <input
                  value={p.area || ""} placeholder="Lokale"
                  onChange={(e) => setNyPunkter((l) => l.map((x, n) => (n === i ? { ...x, area: e.target.value } : x)))}
                  style={{ ...inputStyle, width: 150 }}
                />
                <input
                  value={p.object || ""} placeholder="Inv./objekt"
                  onChange={(e) => setNyPunkter((l) => l.map((x, n) => (n === i ? { ...x, object: e.target.value } : x)))}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button type="button" onClick={() => setNyPunkter((l) => l.filter((_, n) => n !== i))} style={linkBtnStyle}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => setNyPunkter((l) => [...l, { area: "", object: "" }])} style={linkBtnStyle}>
              + Legg til punkt
            </button>

            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button type="submit" disabled={lagrer} style={primaryBtnStyle}>{lagrer ? "Lagrer..." : "Registrer uttak"}</button>
              <button type="button" onClick={() => setNyApen(false)} style={linkBtnStyle}>Avbryt</button>
            </div>
          </form>
        </Card>
      )}

      {loading && <Loading />}
      {!loading && rounds.length === 0 && (
        <Card style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
          Ingen prøverunder registrert ennå.
        </Card>
      )}

      {rounds.map((r) => (
        <Card key={r.id} style={{ marginBottom: 12 }}>
          <div
            onClick={() => setOpenId(openId === r.id ? null : r.id)}
            style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flexWrap: "wrap" }}
          >
            <FlaskConical size={16} style={{ color: "var(--brand)", flexShrink: 0 }} />
            <span style={{ fontWeight: 600 }}>{r.taken_date}</span>
            <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>{r.site_name}</span>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{r.points.length} prøver &middot; {r.taken_by_name}</span>
            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
              {r.status === "til_avlesning"
                ? <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-warning)" }}>Til avlesning</span>
                : <Dom verdict={r.worst} />}
            </span>
          </div>

          {openId === r.id && (
            <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 620 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--text-secondary)", fontSize: 11 }}>
                      <th style={{ padding: "4px 8px 6px 0" }}>Lokale</th>
                      <th style={{ padding: "4px 8px 6px 0" }}>Inv./objekt</th>
                      <th style={{ padding: "4px 8px 6px 0" }}>Totalkim</th>
                      <th style={{ padding: "4px 8px 6px 0" }}>ATP</th>
                      <th style={{ padding: "4px 8px 6px 0" }}>E-coli</th>
                      <th style={{ padding: "4px 8px 6px 0" }}>Listeria</th>
                      <th style={{ padding: "4px 0 6px" }}>Resultat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.points.map((p) => (
                      <tr key={p.id} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "6px 8px 6px 0", color: "var(--text-secondary)" }}>{p.area || "—"}</td>
                        <td style={{ padding: "6px 8px 6px 0" }}>{p.object}</td>
                        {["totalkim", "atp"].map((felt) => (
                          <td key={felt} style={{ padding: "6px 8px 6px 0" }}>
                            <input
                              defaultValue={p[felt] ?? ""} disabled={!!r.read_date} inputMode="decimal"
                              onBlur={(e) => e.target.value !== String(p[felt] ?? "") && lagrePunkt(r.id, p.id, felt, e.target.value)}
                              style={{ ...inputStyle, width: 74, padding: "4px 6px" }}
                            />
                          </td>
                        ))}
                        {["ecoli", "listeria"].map((felt) => (
                          <td key={felt} style={{ padding: "6px 8px 6px 0" }}>
                            <select
                              value={p[felt] || ""} disabled={!!r.read_date}
                              onChange={(e) => lagrePunkt(r.id, p.id, felt, e.target.value)}
                              style={{ ...inputStyle, width: 112, padding: "4px 6px" }}
                            >
                              <option value="">—</option>
                              <option value="ikke_paavist">Ikke påvist</option>
                              <option value="paavist">Påvist</option>
                            </select>
                          </td>
                        ))}
                        <td style={{ padding: "6px 0" }}><Dom verdict={p.verdict} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
                Totalkim CFU/cm²: under 45 bra, 45&ndash;80 mindre bra, over 80 dårlig. Påvist E-coli eller listeria er aldri godkjent.
              </div>

              {r.read_date ? (
                <div style={{ marginTop: 12, fontSize: 13, color: "var(--text-secondary)" }}>
                  Avlest {r.read_date} av <strong>{r.read_by_name}</strong>. Resultatene er låst.
                </div>
              ) : (
                <SignerAvlesning runde={r} onSigner={signerAvlesning} onSlett={slett} />
              )}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function SignerAvlesning({ runde, onSigner, onSlett }) {
  const [navn, setNavn] = useState("");
  const uavlest = runde.points.filter((p) => !p.verdict).length;
  return (
    <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
      <Field label="Avlest av" style={{ minWidth: 200 }}>
        <input value={navn} onChange={(e) => setNavn(e.target.value)} placeholder="Fullt navn" style={inputStyle} />
      </Field>
      <button
        onClick={() => onSigner(runde, navn)}
        disabled={!navn.trim() || uavlest > 0}
        title={uavlest > 0 ? `Mangler resultat på ${uavlest} prøvepunkt` : ""}
        style={{ ...primaryBtnStyle, display: "flex", alignItems: "center", gap: 6, opacity: !navn.trim() || uavlest > 0 ? 0.5 : 1 }}
      >
        <PenLine size={14} /> Signer avlesning
      </button>
      {uavlest > 0 && (
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          Mangler resultat på {uavlest} av {runde.points.length} prøvepunkt.
        </span>
      )}
      <button onClick={() => onSlett(runde)} style={{ ...linkBtnStyle, marginLeft: "auto" }}>Slett runden</button>
    </div>
  );
}
