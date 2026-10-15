import { useEffect, useState } from "react";
import { FlaskConical, Plus, PenLine, Trash2 } from "lucide-react";
import { apiFetch } from "../api";
import { Card, Loading, primaryBtnStyle, linkBtnStyle, inputStyle } from "./shared";
import ProveTrend from "./ProveTrend";

// Kundens egen prøvetaking: kunden tar ATP- og hygieneprøver på rom OKV vasker, som en uavhengig
// verifisering av arbeidet. Samme form som driftslederens prøverunder (admin/ProvetakingPanel),
// men et annet formål — og derfor to adskilte sett: backend merker hver runde med performed_by,
// og en kunde ser aldri OKVs egne runder. Se scopedRound i routes/samples.js.
//
// Hvorfor avlesningen er et eget steg: Hygicult-prøven inkuberes et døgn ved 37 °C. Uttak og
// avlesning er to signaturer på to datoer, og runden står med tomme resultatfelt i mellomtiden.
// Det er den tilstanden lista øverst skal få kunden til å gjøre noe med.

function idag() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" }).format(new Date());
}

const VERDICT = {
  bra: { tekst: "Innenfor", farge: "var(--text-success)", bg: "var(--c-teal)" },
  mindre_bra: { tekst: "Mindre bra", farge: "var(--text-warning)", bg: "var(--c-amber)" },
  daarlig: { tekst: "Utenfor krav", farge: "var(--text-danger)", bg: "var(--c-red)" },
};

// Et tall mot en grense, tegnet som en strek. Idé hentet fra konseptskissen: 47 mot en grense på
// 30 leses raskere som en strek med hakk enn som to tall ved siden av hverandre.
//
// Grensene kommer fra punktet (`punkt.limits`, utledet på serveren), aldri fra en kopi her — de
// settes per prøvepunkt av OKV, og en kopi i frontend ville blitt stående når de justeres.
// `merker` er verdiene som tegnes inn som hakk; `tak` gir skalaen luft over den høyeste av dem.
function Skala({ verdi, merker, farge }) {
  const gyldige = merker.filter((m) => m != null);
  if (verdi == null || gyldige.length === 0) return null;
  const tak = Math.max(...gyldige) * 1.6 > verdi * 1.1 ? Math.max(...gyldige) * 1.6 : verdi * 1.1;
  const pct = (v) => `${Math.min(100, (v / tak) * 100)}%`;
  return (
    <div style={{ marginTop: 5 }}>
      <div style={{ position: "relative", height: 6, borderRadius: 3, background: "var(--surface-0)", border: "1px solid var(--border)" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: pct(verdi), background: farge, borderRadius: 3 }} />
        {gyldige.map((m, i) => (
          <div key={i} style={{ position: "absolute", left: pct(m), top: -2, bottom: -2, width: 1, background: "var(--text-muted)" }} />
        ))}
      </div>
    </div>
  );
}

// Én måleverdi med sin egen grense under. Står grensen tom, sies det rett ut i stedet for å
// farge tallet grønt — «ingen grense satt» og «innenfor kravet» er ikke det samme, og et ATP-tall
// uten grense er lagret, ikke vurdert.
function Maaling({ navn, verdi, enhet, grenseTekst, merker, nivaa }) {
  if (verdi == null) return null;
  const farge =
    nivaa === "daarlig" ? "var(--text-danger)"
      : nivaa === "mindre_bra" ? "var(--text-warning)"
        : nivaa === "bra" ? "var(--text-success)" : "var(--text-muted)";
  return (
    <div style={{ marginTop: 7 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 12, color: "var(--text-secondary)", minWidth: 62 }}>{navn}</span>
        <span style={{ fontSize: 15, fontWeight: 600, color: farge }}>{verdi}</span>
        {enhet && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{enhet}</span>}
      </div>
      <Skala verdi={verdi} merker={merker} farge={farge} />
      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>{grenseTekst}</div>
    </div>
  );
}

function Punkt({ punkt, redigerbar, onLagre }) {
  const v = punkt.verdict ? VERDICT[punkt.verdict] : null;
  const g = punkt.limits;
  // parts er serverens vurdering felt for felt — slik slipper flaten å gjenta regelen for når
  // et tall er bra, og kan aldri komme til å svare noe annet enn avviket gjør.
  const nivaaFor = (felt) => punkt.parts?.find((d) => d.felt === felt)?.nivaa ?? null;
  const felt = (navn, type = "number") => (
    <input
      type={type}
      defaultValue={punkt[navn] ?? ""}
      onBlur={(e) => {
        const rå = e.target.value.trim();
        const ny = rå === "" ? null : type === "number" ? Number(rå) : rå;
        if (ny !== (punkt[navn] ?? null)) onLagre(navn, ny);
      }}
      style={{ ...inputStyle, padding: "6px 8px", fontSize: 13 }}
    />
  );

  return (
    <div style={{ padding: "10px 0", borderTop: "1px solid var(--border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{punkt.object}</div>
          {punkt.area && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{punkt.area}</div>}
        </div>
        {v && (
          <span style={{
            background: v.bg, color: v.farge, padding: "2px 9px", borderRadius: "var(--radius-pill)",
            fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
          }}>
            {v.tekst}
          </span>
        )}
      </div>

      {redigerbar ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8, marginTop: 8 }}>
          <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>Totalkim{felt("totalkim")}</label>
          <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>ATP (RLU){felt("atp")}</label>
          <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
            E-coli
            <select
              defaultValue={punkt.ecoli ?? ""}
              onChange={(e) => onLagre("ecoli", e.target.value || null)}
              style={{ ...inputStyle, padding: "6px 8px", fontSize: 13 }}
            >
              <option value="">—</option>
              <option value="ikke_paavist">Ikke påvist</option>
              <option value="paavist">Påvist</option>
            </select>
          </label>
          <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
            Listeria
            <select
              defaultValue={punkt.listeria ?? ""}
              onChange={(e) => onLagre("listeria", e.target.value || null)}
              style={{ ...inputStyle, padding: "6px 8px", fontSize: 13 }}
            >
              <option value="">—</option>
              <option value="ikke_paavist">Ikke påvist</option>
              <option value="paavist">Påvist</option>
            </select>
          </label>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
          {punkt.ecoli && <span>E-coli {punkt.ecoli === "paavist" ? "påvist" : "ikke påvist"}  </span>}
          {punkt.listeria && <span>Listeria {punkt.listeria === "paavist" ? "påvist" : "ikke påvist"}</span>}
        </div>
      )}

      <Maaling
        navn="Totalkim" verdi={punkt.totalkim}
        merker={[g.totalkim_bra, g.totalkim_mindre_bra]}
        nivaa={nivaaFor("totalkim")}
        grenseTekst={`Bra under ${g.totalkim_bra} · mindre bra til ${g.totalkim_mindre_bra}`}
      />
      <Maaling
        navn="ATP" verdi={punkt.atp} enhet="RLU"
        merker={[g.atp_max]}
        nivaa={nivaaFor("atp")}
        grenseTekst={g.atp_max != null ? `Grense: under ${g.atp_max} RLU` : "Ingen grense satt — måles, men vurderes ikke"}
      />
      {punkt.comment && <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 5 }}>{punkt.comment}</div>}
    </div>
  );
}

export default function KundeProvetaking({ token, site, setError }) {
  const [runder, setRunder] = useState([]);
  const [laster, setLaster] = useState(true);
  const [apen, setApen] = useState(null);

  const [nyApen, setNyApen] = useState(false);
  const [nyDato, setNyDato] = useState(idag);
  const [nyAv, setNyAv] = useState("");
  const [nyPunkter, setNyPunkter] = useState([{ area: "", object: "" }]);
  const [lagrer, setLagrer] = useState(false);
  const [avlesNavn, setAvlesNavn] = useState("");

  function last() {
    apiFetch(`/samples?site_id=${site.id}`, { token })
      .then((d) => setRunder(d.rounds || []))
      .catch((err) => setError(err.message))
      .finally(() => setLaster(false));
  }
  useEffect(last, [token, site.id]);

  async function apneNy() {
    setNyApen(true);
    try {
      // Forrige runde av samme slag er utgangspunktet — prøveplanen sier at de faste punktene
      // tas hver gang, og å skrive dem inn på nytt for hånd er den sikreste måten å få dem
      // litt forskjellige hver gang.
      const f = await apiFetch(`/samples/suggest/${site.id}`, { token });
      if (f.points?.length) setNyPunkter(f.points.map((p) => ({ area: p.area || "", object: p.object })));
    } catch { /* uten forslag starter hun på et tomt punkt, som er greit nok */ }
  }

  async function opprett(e) {
    e.preventDefault();
    setLagrer(true);
    try {
      // apiFetch sender options rett videre til fetch, så body må allerede være en streng —
      // et rått objekt blir "[object Object]" og faller på body-parseren som 400.
      const r = await apiFetch("/samples", {
        token, method: "POST",
        body: JSON.stringify({
          site_id: site.id, taken_date: nyDato, taken_by_name: nyAv.trim(),
          points: nyPunkter.filter((p) => p.object.trim()),
        }),
      });
      setRunder((f) => [r, ...f]);
      setApen(r.id);
      setNyApen(false);
      setNyAv("");
      setNyPunkter([{ area: "", object: "" }]);
    } catch (err) { setError(err.message); } finally { setLagrer(false); }
  }

  async function lagrePunkt(rundeId, punktId, felt, verdi) {
    try {
      const oppdatert = await apiFetch(`/samples/${rundeId}/points/${punktId}`, {
        token, method: "PATCH", body: JSON.stringify({ [felt]: verdi }),
      });
      setRunder((f) => f.map((r) => (r.id === rundeId ? oppdatert : r)));
    } catch (err) { setError(err.message); }
  }

  async function signer(runde) {
    if (!avlesNavn.trim()) return setError("Skriv inn navnet ditt for å signere avlesningen.");
    try {
      const oppdatert = await apiFetch(`/samples/${runde.id}/read`, {
        token, method: "POST", body: JSON.stringify({ read_by_name: avlesNavn.trim() }),
      });
      setRunder((f) => f.map((r) => (r.id === runde.id ? oppdatert : r)));
      setAvlesNavn("");
      // Avviket opprettes av serveren, ikke her — men kunden skal få vite at det skjedde, i
      // stedet for å oppdage det uforklart i avvikslista senere.
      if (oppdatert.deviationsCreated > 0) {
        setError(
          `Avlesningen er signert. ${oppdatert.deviationsCreated} funn utenfor krav ble meldt som avvik til OKV.`
        );
      }
    } catch (err) { setError(err.message); }
  }

  const tilAvlesning = runder.filter((r) => r.status === "til_avlesning");

  if (laster) return <Loading />;

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 500 }}>
          <FlaskConical size={14} style={{ color: "var(--brand)" }} />
          Egen prøvetaking
        </div>
        {!nyApen && (
          <button onClick={apneNy} style={{ ...linkBtnStyle, display: "flex", alignItems: "center", gap: 4 }}>
            <Plus size={13} /> Nytt uttak
          </button>
        )}
      </div>

      {/* Venter på deg. Samme form som rom-godkjenningskortet øverst i CustomerView, med vilje:
          kunden har allerede lært hva et kort med farget venstrekant betyr. */}
      {tilAvlesning.length > 0 && (
        <Card style={{ marginTop: 8, borderLeft: "3px solid var(--text-warning)", padding: 12 }}>
          <div style={{ fontSize: 13 }}>
            {tilAvlesning.length === 1
              ? "1 runde står til avlesning"
              : `${tilAvlesning.length} runder står til avlesning`}
            <span style={{ color: "var(--text-muted)" }}> — prøvene inkuberes et døgn før de kan leses av.</span>
          </div>
        </Card>
      )}

      {nyApen && (
        <Card style={{ marginTop: 8, padding: 12 }}>
          <form onSubmit={opprett}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                Dato for uttak
                <input type="date" value={nyDato} max={idag()} onChange={(e) => setNyDato(e.target.value)} style={{ ...inputStyle, fontSize: 13 }} />
              </label>
              <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                Hvem tok prøvene
                <input value={nyAv} onChange={(e) => setNyAv(e.target.value)} placeholder="Fullt navn" maxLength={60} style={{ ...inputStyle, fontSize: 13 }} />
              </label>
            </div>

            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 10, marginBottom: 4 }}>Prøvepunkter</div>
            {nyPunkter.map((p, i) => (
              <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <input
                  value={p.area} placeholder="Lokale"
                  onChange={(e) => setNyPunkter((f) => f.map((x, j) => (j === i ? { ...x, area: e.target.value } : x)))}
                  style={{ ...inputStyle, fontSize: 13, flex: "0 1 140px" }}
                />
                <input
                  value={p.object} placeholder="Objekt — f.eks. håndtak kjølerom 1"
                  onChange={(e) => setNyPunkter((f) => f.map((x, j) => (j === i ? { ...x, object: e.target.value } : x)))}
                  style={{ ...inputStyle, fontSize: 13, flex: 1 }}
                />
                {nyPunkter.length > 1 && (
                  <button
                    type="button" aria-label="Fjern punkt"
                    onClick={() => setNyPunkter((f) => f.filter((_, j) => j !== i))}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => setNyPunkter((f) => [...f, { area: "", object: "" }])} style={linkBtnStyle}>
              + Legg til punkt
            </button>

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button type="submit" disabled={lagrer} style={primaryBtnStyle}>
                {lagrer ? "Lagrer …" : "Registrer uttak"}
              </button>
              <button type="button" onClick={() => setNyApen(false)} style={linkBtnStyle}>Avbryt</button>
            </div>
          </form>
        </Card>
      )}

      {runder.length === 0 && !nyApen && (
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8 }}>
          Ingen prøverunder registrert ennå.
        </div>
      )}

      {/* Trenden står under runde-lista, ikke over: kunden kommer hit for å føre dagens
          prøve, og historikken er det hun ser etterpå. Den henter sine egne data og viser
          ingenting før en runde faktisk er avlest. */}
      {runder.some((r) => r.read_date) && <ProveTrend token={token} site={site} />}

      {runder.map((runde) => {
        const erApen = apen === runde.id;
        const avlest = !!runde.read_date;
        const v = runde.worst ? VERDICT[runde.worst] : null;
        return (
          <Card key={runde.id} style={{ marginTop: 8, padding: 12 }}>
            <div
              onClick={() => setApen(erApen ? null : runde.id)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, cursor: "pointer", flexWrap: "wrap" }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Uttak {runde.taken_date}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {runde.taken_by_name}
                  {avlest ? ` · avlest ${runde.read_date} av ${runde.read_by_name}` : " · venter på avlesning"}
                </div>
              </div>
              <span style={{
                background: avlest ? (v?.bg ?? "var(--surface-0)") : "var(--c-amber)",
                color: avlest ? (v?.farge ?? "var(--text-secondary)") : "var(--text-warning)",
                padding: "2px 9px", borderRadius: "var(--radius-pill)", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
              }}>
                {avlest ? (v?.tekst ?? "Avlest") : "Til avlesning"}
              </span>
            </div>

            {erApen && (
              <div style={{ marginTop: 6 }}>
                {runde.points.map((p) => (
                  <Punkt
                    key={p.id} punkt={p} redigerbar={!avlest}
                    onLagre={(felt, verdi) => lagrePunkt(runde.id, p.id, felt, verdi)}
                  />
                ))}

                {!avlest && (
                  <div style={{ display: "flex", gap: 6, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <input
                      value={avlesNavn} onChange={(e) => setAvlesNavn(e.target.value)}
                      placeholder="Fullt navn" maxLength={60}
                      style={{ ...inputStyle, fontSize: 13, width: 150 }}
                    />
                    <button onClick={() => signer(runde)} style={{ ...primaryBtnStyle, display: "flex", alignItems: "center", gap: 5 }}>
                      <PenLine size={13} /> Signer avlesning
                    </button>
                    {/* Serveren nekter å signere så lenge et punkt står uten resultat, og sier
                        hvilke. Det står her også, så kunden vet det før hun trykker. */}
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      Alle punkter må ha minst ett resultat.
                    </span>
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
