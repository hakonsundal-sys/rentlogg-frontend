import { useEffect, useState } from "react";
import { FlaskConical, Pencil, Trash2, ShieldCheck, Clock, ExternalLink } from "lucide-react";
import { apiFetch } from "../../api";
import { Card, Field, Loading, inputStyle, primaryBtnStyle, linkBtnStyle, iconBtnStyle } from "../shared";

// Kjemikalieregisteret: bedriftens egne midler, med dosering, kontakttid og det renholderen må
// vite før hun åpner kanna. Et flervalg-alternativ på en oppgave kan peke hit, og da følger
// styrken og sikkerhetsnotatet med ut i renholderens skjerm når hun velger midlet.
//
// Ligger som fane under Lokasjoner og ikke som eget menypunkt — samme mønster som Kundebrukere
// under Kunder og Opplæring under Ansatte. Registeret settes opp én gang og brukes derfra.
const TOM = { name: "", strength: "", contact_seconds: "", safety_note: "", sds_url: "" };

export default function KjemikalierPage({ token }) {
  const [chemicals, setChemicals] = useState(null);
  const [form, setForm] = useState(TOM);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);

  function load() {
    apiFetch("/chemicals", { token }).then(setChemicals).catch((err) => setError(err.message));
  }
  useEffect(load, [token]);

  // Kontakttiden skrives i minutter og lagres i sekunder — ingen taster «600» når de mener ti
  // minutter. Merk at DETTE tallet ikke sperrer noe: det er det leverandøren oppgir, til oppslag.
  // Nedtellingen som faktisk blokkerer avkryssingen settes per oppgave («+ Trinn» under
  // Lokasjoner) og hører til hygiene-modulen. Registeret her er kjerne og gjelder alle.
  function toBody(f) {
    const mins = Number(f.contact_seconds);
    return {
      name: f.name,
      strength: f.strength,
      safety_note: f.safety_note,
      sds_url: f.sds_url,
      contact_seconds: f.contact_seconds !== "" && Number.isFinite(mins) ? Math.round(mins * 60) : "",
    };
  }

  async function save(e) {
    e.preventDefault();
    setError("");
    try {
      if (editingId) {
        await apiFetch(`/chemicals/${editingId}`, { token, method: "PATCH", body: JSON.stringify(toBody(form)) });
      } else {
        await apiFetch("/chemicals", { token, method: "POST", body: JSON.stringify(toBody(form)) });
      }
      setForm(TOM);
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(c) {
    setEditingId(c.id);
    setForm({
      name: c.name || "",
      strength: c.strength || "",
      contact_seconds: c.contact_seconds ? String(Math.round(c.contact_seconds / 60)) : "",
      safety_note: c.safety_note || "",
      sds_url: c.sds_url || "",
    });
  }

  async function remove(id) {
    try {
      await apiFetch(`/chemicals/${id}`, { token, method: "DELETE" });
      setConfirmDelete(null);
      if (editingId === id) { setEditingId(null); setForm(TOM); }
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  // The first load failing left this on the spinner for ever: the error was set, but the loading guard
  // ran first and never showed it.
  if (chemicals === null) return error ? <div style={{ color: "var(--text-danger)" }}>{error}</div> : <Loading />;

  return (
    <div>
      <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>Kjemikalier</h1>
      <div style={{ color: "var(--text-secondary)", marginBottom: 20 }}>
        {chemicals.length} midler · brukes av flervalg-oppgaver ute på lokasjonene
      </div>

      {error && <div style={{ color: "var(--text-danger)", marginBottom: 14, fontSize: 13 }}>{error}</div>}

      <Card style={{ marginBottom: 22 }}>
        <form onSubmit={save}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            <Field label="Navn">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Alkalisk skumvask"
                style={inputStyle}
              />
            </Field>
            <Field label="Styrke">
              <input
                value={form.strength}
                onChange={(e) => setForm({ ...form, strength: e.target.value })}
                placeholder="2 %"
                style={inputStyle}
              />
            </Field>
            <Field label="Kontakttid (min)">
              <input
                value={form.contact_seconds}
                onChange={(e) => setForm({ ...form, contact_seconds: e.target.value })}
                placeholder="10"
                inputMode="decimal"
                style={inputStyle}
              />
              <span style={{ display: "block", marginTop: 4, fontWeight: 400, fontSize: 11 }}>
                Det leverandøren oppgir. Sperrer ikke avkryssingen.
              </span>
            </Field>
            <Field label="Sikkerhetsdatablad (lenke)">
              <input
                value={form.sds_url}
                onChange={(e) => setForm({ ...form, sds_url: e.target.value })}
                placeholder="https://…"
                style={inputStyle}
              />
            </Field>
          </div>
          <Field label="Det renholderen må vite" style={{ marginTop: 12 }}>
            <textarea
              value={form.safety_note}
              onChange={(e) => setForm({ ...form, safety_note: e.target.value })}
              placeholder="Bruk hansker og vernebriller. Skal aldri blandes med syre."
              style={{ ...inputStyle, minHeight: 58, resize: "vertical" }}
            />
          </Field>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14 }}>
            <button type="submit" style={primaryBtnStyle}>
              {editingId ? "Lagre endringer" : "+ Legg til kjemikalie"}
            </button>
            {editingId && (
              <button type="button" onClick={() => { setEditingId(null); setForm(TOM); }} style={linkBtnStyle}>
                Avbryt
              </button>
            )}
          </div>
        </form>
      </Card>

      {chemicals.length === 0 ? (
        <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>
          Ingen kjemikalier ennå. Legg inn midlene dere bruker, så kan en oppgave be renholderen
          om å krysse av hvilket som ble brukt — og hun ser dosering og sikkerhetsnotat i samme skjerm.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {chemicals.map((c) => (
            <Card key={c.id}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                  background: "var(--brand)", color: "white",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <FlaskConical size={18} />
                </div>
                <div style={{ display: "flex", gap: 2 }}>
                  <button onClick={() => startEdit(c)} title="Rediger" style={iconBtnStyle}><Pencil size={15} /></button>
                  <button onClick={() => setConfirmDelete(c.id)} title="Slett" style={iconBtnStyle}><Trash2 size={15} /></button>
                </div>
              </div>

              <div style={{ fontWeight: 600, fontSize: 15, marginTop: 10, letterSpacing: "-0.015em" }}>{c.name}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
                {c.strength && (
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: "var(--radius-pill)",
                    background: "var(--brand-bg)", color: "var(--brand-dark)",
                  }}>
                    {c.strength}
                  </span>
                )}
                {c.contact_seconds > 0 && (
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: "var(--radius-pill)",
                    background: "var(--status-progress-bg)", color: "var(--status-progress-dark)",
                  }}>
                    <Clock size={11} /> {Math.round(c.contact_seconds / 60)} min
                  </span>
                )}
              </div>

              {c.safety_note && (
                <div style={{ display: "flex", gap: 7, marginTop: 10, fontSize: 12.5, color: "var(--text-secondary)" }}>
                  <ShieldCheck size={14} style={{ flexShrink: 0, marginTop: 2, color: "var(--brand)" }} />
                  <span>{c.safety_note}</span>
                </div>
              )}
              {c.sds_url && (
                <a
                  href={c.sds_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5, marginTop: 10,
                    fontSize: 12.5, color: "var(--brand-dark)", fontWeight: 500,
                  }}
                >
                  <ExternalLink size={13} /> Sikkerhetsdatablad
                </a>
              )}

              {confirmDelete === c.id && (
                <div style={{
                  marginTop: 12, padding: 10, borderRadius: "var(--radius)",
                  background: "var(--bg-danger)", border: "1px solid var(--border-danger)",
                }}>
                  <div style={{ fontSize: 12.5, color: "var(--text-danger)" }}>
                    Slette {c.name}? Oppgaver som peker hit mister koblingen, men beholder navnet sitt,
                    og utførte besøk beholder sin egen kopi.
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                    <button onClick={() => remove(c.id)} style={{ ...linkBtnStyle, color: "var(--text-danger)", fontWeight: 600 }}>
                      Slett
                    </button>
                    <button onClick={() => setConfirmDelete(null)} style={linkBtnStyle}>Avbryt</button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
