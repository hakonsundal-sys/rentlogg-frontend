import { useEffect, useState } from "react";
import { ClipboardCheck, MapPin, Clock, CheckCircle2, AlertTriangle, CircleAlert } from "lucide-react";
import { apiFetch } from "../../api";
import { Card, Field, Loading, primaryBtnStyle, linkBtnStyle, inputStyle } from "../shared";

// Etterkontroll: OKVs egen kontroll av eget arbeid, utført av en teamleder etter at renholderen
// er ferdig og uavhengig av om kunden skal godkjenne. Se backendens db.js ved
// room_run_items.control_status for hvorfor dette er et eget spor og ikke kundegodkjenningen.
//
// Hele siden er bygget rundt én antakelse: en kontroll som må letes fram rom for rom blir ikke
// gjort. Derfor er arbeidslista det første man ser, og den sier antallet uten at man må navigere.
//
// ETTERKONTROLL ER VALGFRI, og språket her skal si det. Teamlederen tar kontrollen de dagene
// hun er innom, ikke på hvert eneste besøk. Et rom som aldri blir kontrollert blokkerer
// ingenting — verken fullføring, kundegodkjenning eller rapport (bekreftet: controlled_at leses
// ingen steder utenfor kontrollen selv). Derfor «klar for kontroll» og ikke «venter på
// kontroll»: lista er et tilbud om hva som kan kontrolleres, ikke en gjeld som vokser.

const STATUSES = [
  { key: "ok", label: "Godkjent", icon: CheckCircle2, color: "var(--text-success)" },
  { key: "mangler", label: "Mangler", icon: AlertTriangle, color: "var(--text-warning)" },
  { key: "kritisk", label: "Kritisk avvik", icon: CircleAlert, color: "var(--text-danger)" },
];
const STATUS_BY_KEY = Object.fromEntries(STATUSES.map((s) => [s.key, s]));

export default function EtterkontrollPage({ token }) {
  const [venter, setVenter] = useState([]);
  const [kontrollert, setKontrollert] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openRunId, setOpenRunId] = useState(null);

  function loadAll() {
    setLoading(true);
    apiFetch("/rooms/awaiting-control", { token })
      .then((d) => {
        setVenter(d.venter || []);
        setKontrollert(d.kontrollert || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(loadAll, [token]);

  if (loading) return <Loading />;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>Etterkontroll</h1>
        <div style={{ color: "var(--text-secondary)" }}>
          {venter.length === 0
            ? "Ingen utførte rom å kontrollere akkurat nå."
            : `${venter.length} ${venter.length === 1 ? "rom" : "rom"} klar for kontroll · ta dem du rekker`}
        </div>
      </div>

      {error && <div style={{ color: "var(--text-danger)", marginBottom: 12 }}>{error}</div>}

      {venter.map((rad) => (
        <Card key={rad.id} style={{ marginBottom: 12 }}>
          <RunHeader rad={rad} />
          {openRunId === rad.id ? (
            <ControlForm
              runId={rad.id}
              token={token}
              onDone={() => { setOpenRunId(null); loadAll(); }}
              onCancel={() => setOpenRunId(null)}
              onError={setError}
            />
          ) : (
            <button onClick={() => { setError(""); setOpenRunId(rad.id); }} style={{ ...primaryBtnStyle, marginTop: 10 }}>
              {rad.controlled_count > 0 ? "Fortsett kontrollen" : "Kontroller rommet"}
            </button>
          )}
        </Card>
      ))}

      {kontrollert.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Kontrollert</h2>
          {kontrollert.map((rad) => (
            <Card key={rad.id} style={{ marginBottom: 8, padding: "10px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", fontSize: 13 }}>
                <span><strong>{rad.site_name}</strong> · {rad.room_name}</span>
                <span style={{ color: "var(--text-secondary)" }}>
                  {rad.controlled_at?.slice(0, 16)} · {rad.controlled_by_name}
                  <Tally rad={rad} />
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Tally({ rad }) {
  if (!rad.mangler_count && !rad.kritisk_count) return null;
  return (
    <>
      {rad.mangler_count > 0 && <span style={{ color: "var(--text-warning)", marginLeft: 8 }}>{rad.mangler_count} mangler</span>}
      {rad.kritisk_count > 0 && <span style={{ color: "var(--text-danger)", marginLeft: 8 }}>{rad.kritisk_count} kritisk</span>}
    </>
  );
}

function RunHeader({ rad }) {
  const utfort = (rad.completed_at || rad.ready_for_approval_at || "").slice(0, 16);
  return (
    <div>
      <div style={{ fontWeight: 600 }}>{rad.site_name} · {rad.room_name}</div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", gap: 12, marginTop: 4, flexWrap: "wrap" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 3 }}><MapPin size={12} /> {rad.room_area || "—"}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 3 }}><Clock size={12} /> {utfort}</span>
        {rad.signed_initials && <span>Utført av: {rad.signed_initials}</span>}
        <span>{rad.controlled_count}/{rad.item_count} vurdert</span>
      </div>
    </div>
  );
}

function ControlForm({ runId, token, onDone, onCancel, onError }) {
  const [items, setItems] = useState(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    apiFetch(`/rooms/runs/${runId}/items`, { token })
      .then((d) => setItems(d.items || []))
      .catch((err) => onError(err.message));
  }
  useEffect(load, [runId, token]);

  if (!items) return <Loading />;

  // Statusen lagres med én gang den settes, ikke ved «lagre» til slutt. En teamleder som blir
  // avbrutt midt i et rom skal finne igjen det hun rakk — derfor viser lista også «3/8 vurdert».
  async function setStatus(item, status) {
    if (!name.trim()) return onError("Skriv navnet ditt før du kontrollerer.");
    const kommentar = status === "ok" ? "" : (item.control_comment || "");
    // Mangler og kritisk krever en setning om hva som manglet. Finnes den ikke ennå, settes
    // statusen lokalt så kommentarfeltet åpner seg — og lagres når teksten er skrevet.
    if (status !== "ok" && !kommentar.trim()) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, control_status: status, control_comment: "" } : i)));
      return;
    }
    await lagre(item, status, kommentar);
  }

  async function lagre(item, status, comment) {
    try {
      await apiFetch(`/rooms/runs/${runId}/items/${item.id}/control`, {
        token, method: "PATCH",
        body: JSON.stringify({ status, comment, name: name.trim() }),
      });
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, control_status: status, control_comment: comment, control_by_name: name.trim() } : i)));
      onError("");
    } catch (err) {
      onError(err.message);
    }
  }

  async function signer() {
    setSaving(true);
    try {
      // Skyll det som bare står i skjermen først. Serveren avviser uansett en signatur med
      // uvurderte punkt, men den feilmeldingen ville vært uforståelig for en teamleder som
      // nettopp har satt status på alt.
      for (const i of ulagrede) {
        await lagre(i, i.control_status, (i.control_comment || "").trim());
      }
      await apiFetch(`/rooms/runs/${runId}/control`, { token, method: "POST", body: JSON.stringify({ name: name.trim() }) });
      onDone();
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Et punkt teller som vurdert først når det VILLE blitt godtatt av serveren: status satt, og
  // en kommentar der statusen krever det. Uten dette siste leddet ble knappen aktiv av en
  // lokal tilstand serveren ikke delte — valgt «Mangler» åpner kommentarfeltet og setter
  // statusen i skjermen, men lagres ikke før teksten finnes. Målt: skjermen sa fire vurdert
  // mens serveren hadde to.
  const mangelfulle = items.filter(
    (i) => !i.control_status || (i.control_status !== "ok" && !(i.control_comment || "").trim())
  );
  const uvurdert = mangelfulle.length;

  // Satt lokalt, men ikke bekreftet av serveren ennå — control_by_name settes først når lagringen
  // gikk gjennom. Disse skylles før signaturen, så en kommentar man nettopp skrev ikke går tapt
  // fordi feltet aldri mistet fokus.
  const ulagrede = items.filter((i) => i.control_status && !i.control_by_name);
  const kritiske = items.filter((i) => i.control_status === "kritisk").length;

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
      <Field label="Ditt navn" style={{ marginBottom: 12, maxWidth: 260 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Skriv navnet ditt" style={inputStyle} />
      </Field>

      {items.map((item) => (
        <div key={item.id} style={{ padding: "8px 0", borderTop: "1px solid var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 14 }}>
              {item.label}
              {!item.done && <span style={{ color: "var(--text-muted)", fontSize: 12 }}> · ikke utført</span>}
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              {STATUSES.map((s) => {
                const valgt = item.control_status === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => setStatus(item, s.key)}
                    style={{
                      display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", fontSize: 12.5,
                      borderRadius: "var(--radius)", cursor: "pointer",
                      border: `1px solid ${valgt ? s.color : "var(--border)"}`,
                      background: valgt ? s.color : "var(--surface-1)",
                      color: valgt ? "#fff" : "var(--text-secondary)",
                      fontWeight: valgt ? 600 : 400,
                    }}
                  >
                    <s.icon size={13} /> {s.label}
                  </button>
                );
              })}
            </div>
          </div>
          {item.control_status && item.control_status !== "ok" && (
            <div style={{ marginTop: 6 }}>
              <input
                value={item.control_comment || ""}
                onChange={(e) => setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, control_comment: e.target.value } : i)))}
                onBlur={(e) => e.target.value.trim() && lagre(item, item.control_status, e.target.value.trim())}
                placeholder="Hva var ikke i orden?"
                style={{ ...inputStyle, fontSize: 13 }}
              />
            </div>
          )}
        </div>
      ))}

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
        <button onClick={signer} disabled={saving || uvurdert > 0 || !name.trim()} style={{ ...primaryBtnStyle, opacity: uvurdert > 0 || !name.trim() ? 0.5 : 1 }}>
          <ClipboardCheck size={15} style={{ marginRight: 6, verticalAlign: "-2px" }} />
          Signer kontrollen
        </button>
        <button onClick={onCancel} style={linkBtnStyle}>Lukk</button>
        {/* Sagt før signaturen, ikke etter: at et kritisk funn blir en sak med firetrinns-
            behandling er en konsekvens teamlederen skal kjenne mens hun fortsatt kan ombestemme
            seg om alvorlighetsgraden. */}
        {kritiske > 0 && uvurdert === 0 && (
          <span style={{ fontSize: 12.5, color: "var(--text-danger)" }}>
            {kritiske === 1 ? "1 kritisk funn blir et avvik" : `${kritiske} kritiske funn blir avvik`} når du signerer
          </span>
        )}
        {uvurdert > 0 && (
          <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
            {uvurdert} punkt mangler vurdering
          </span>
        )}
      </div>
    </div>
  );
}
