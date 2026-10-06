import { useEffect, useState } from "react";
import { Info, AlertTriangle, CircleAlert, MapPin, Clock } from "lucide-react";
import { apiFetch, API_URL } from "../../api";
import { Card, Field, Loading, primaryBtnStyle, linkBtnStyle, inputStyle, ResponsibleBadge } from "../shared";

// /uploads is an authenticated route now — a plain <img src>/<a href> can't attach an
// Authorization header, so the token rides along as a query param instead.
function photoUrl(filePath, token) {
  const filename = filePath.split(/[\\/]/).pop();
  return `${API_URL}/uploads/${filename}?token=${encodeURIComponent(token)}`;
}

const PRIORITY = {
  low: { label: "Lav", icon: Info, color: "var(--text-secondary)" },
  medium: { label: "Middels", icon: AlertTriangle, color: "var(--text-warning)" },
  high: { label: "Høy", icon: CircleAlert, color: "var(--text-danger)" },
};
const STATUS_LABEL = { open: "ÅPEN", in_progress: "PÅGÅR", resolved: "LØST" };
const ASSIGNED_LABEL = { manager: "Sendt til driftsleder", customer: "Sendt til kunde" };

// Speiler DEVIATION_CATEGORIES i backendens routes/deviations.js. Endres den ene, må den andre
// følge etter — backend er porten som faktisk avviser en ukjent verdi, dette er bare etikettene.
const CATEGORY_LABEL = {
  hms: "HMS-avvik",
  kvalitet: "Kvalitetsavvik",
  kundeklage: "Kundeklage",
  naestenulykke: "Nestenulykke",
  forbedring: "Forbedringsforslag",
};

// Dagens dato i Oslo, til å avgjøre om en frist er passert. Samme grunn som ellers i systemet:
// serveren kan stå i UTC, og et avvik skal ikke bli rødt en time for tidlig.
function osloToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" }).format(new Date());
}

export default function AvvikPage({ token, refreshSummary }) {
  const [deviations, setDeviations] = useState([]);
  const [sites, setSites] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ title: "", description: "", priority: "medium", category: "", due_date: "" });
  const [confirmDelete, setConfirmDelete] = useState(null);

  function loadAll() {
    Promise.all([apiFetch("/deviations", { token }), apiFetch("/sites", { token }), apiFetch("/departments", { token }).catch(() => [])])
      .then(([devData, sitesData, departmentsData]) => {
        setDeviations(devData);
        setSites(sitesData);
        setDepartments(departmentsData);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(loadAll, [token]);

  const siteName = (id) => sites.find((s) => s.id === id)?.name || "—";
  const visibleDeviations = deviations
    .filter((d) => !departmentFilter || sites.find((s) => s.id === d.site_id)?.department_id === Number(departmentFilter))
    .filter((d) => !categoryFilter || (categoryFilter === "none" ? !d.category : d.category === categoryFilter));

  function startEdit(dev) {
    setEditingId(dev.id);
    setEditForm({ title: dev.title || "", description: dev.description, priority: dev.priority, category: dev.category || "", due_date: dev.due_date || "" });
  }

  async function saveEdit(id) {
    setError("");
    try {
      await apiFetch(`/deviations/${id}`, { token, method: "PATCH", body: JSON.stringify(editForm) });
      setEditingId(null);
      loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function markResolved(id) {
    try {
      await apiFetch(`/deviations/${id}`, { token, method: "PATCH", body: JSON.stringify({ status: "resolved" }) });
      loadAll();
      refreshSummary?.();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteDeviation(id) {
    try {
      await apiFetch(`/deviations/${id}`, { token, method: "DELETE" });
      setConfirmDelete(null);
      loadAll();
      refreshSummary?.();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>Avvik</h1>
          <div style={{ color: "var(--text-secondary)" }}>{visibleDeviations.length} registrerte avvik</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {departments.length > 0 && (
            <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} style={{ ...inputStyle, width: 180 }}>
              <option value="">Alle avdelinger</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={{ ...inputStyle, width: 190 }}>
            <option value="">Alle kategorier</option>
            {Object.entries(CATEGORY_LABEL).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
            <option value="none">Ikke kategorisert</option>
          </select>
        </div>
      </div>

      {error && <div style={{ color: "var(--text-danger)", marginBottom: 12 }}>{error}</div>}

      {visibleDeviations.map((dev) => {
        const p = PRIORITY[dev.priority] || PRIORITY.medium;
        const Icon = p.icon;
        return (
          <Card key={dev.id} style={{ marginBottom: 12 }}>
            {editingId === dev.id ? (
              <div>
                <Field label="Tittel" style={{ marginBottom: 8 }}>
                  <input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} style={inputStyle} />
                </Field>
                <Field label="Beskrivelse" style={{ marginBottom: 8 }}>
                  <textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
                  />
                </Field>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Field label="Prioritet" style={{ marginBottom: 8, width: 160 }}>
                    <select
                      value={editForm.priority}
                      onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}
                      style={inputStyle}
                    >
                      <option value="low">Lav</option>
                      <option value="medium">Middels</option>
                      <option value="high">Høy</option>
                    </select>
                  </Field>
                  {/* Kategorien er det trendanalysen hviler på. «Ikke satt» er et gyldig valg og
                      ikke en feil: et avvik meldt før kategoriene fantes skal kunne stå
                      ukategorisert heller enn å bli gjettet inn i en bøtte. */}
                  <Field label="Kategori" style={{ marginBottom: 8, width: 190 }}>
                    <select
                      value={editForm.category}
                      onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                      style={inputStyle}
                    >
                      <option value="">Ikke satt</option>
                      {Object.entries(CATEGORY_LABEL).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Frist" style={{ marginBottom: 8, width: 160 }}>
                    <input
                      type="date"
                      value={editForm.due_date}
                      onChange={(e) => setEditForm({ ...editForm, due_date: e.target.value })}
                      style={inputStyle}
                    />
                  </Field>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => saveEdit(dev.id)} style={primaryBtnStyle}>Lagre</button>
                  <button onClick={() => setEditingId(null)} style={linkBtnStyle}>Avbryt</button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ display: "flex", gap: 12 }}>
                  <Icon size={20} style={{ color: p.color, flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <div style={{ fontWeight: 600 }}>{dev.title || dev.description.slice(0, 40)}</div>
                    {dev.title && <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>{dev.description}</div>}
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 3 }}><MapPin size={12} /> {siteName(dev.site_id)}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 3 }}><Clock size={12} /> {(dev.run_started_at || dev.created_at).slice(0, 16)}</span>
                      <span style={{ fontWeight: 600, color: p.color }}>{p.label}</span>
                      {/* Kategori og frist i samme linje som resten av metadataene. Et avvik uten
                          kategori viser det åpent — blindsonen i statistikken skal være synlig,
                          ikke bortforklart. */}
                      <span style={{
                        padding: "1px 7px", borderRadius: "var(--radius-pill)", fontWeight: 600,
                        background: dev.category ? "var(--brand-bg)" : "transparent",
                        color: dev.category ? "var(--brand-dark)" : "var(--text-muted)",
                        border: dev.category ? "none" : "1px dashed var(--border)",
                      }}>
                        {dev.category ? CATEGORY_LABEL[dev.category] : "Ikke kategorisert"}
                      </span>
                      {dev.due_date && (
                        <span style={{
                          fontWeight: 600,
                          color: dev.status !== "resolved" && dev.due_date < osloToday()
                            ? "var(--text-danger)" : "var(--text-secondary)",
                        }}>
                          Frist {dev.due_date}
                          {dev.status !== "resolved" && dev.due_date < osloToday() ? " · forfalt" : ""}
                        </span>
                      )}
                    </div>
                    {(dev.room_name || dev.room_task_label) && (
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
                        {dev.room_name}{dev.room_task_label ? ` · ${dev.room_task_label}` : ""}
                        <ResponsibleBadge responsible={dev.room_responsible} />
                      </div>
                    )}
                    {dev.reported_by_initials && (
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>Meldt av: {dev.reported_by_initials}</div>
                    )}
                    {dev.reply_text && (
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--border)" }}>
                        <strong>Svar:</strong> {dev.reply_text} — {dev.replied_by_initials}
                        {dev.assigned_to && <span> ({ASSIGNED_LABEL[dev.assigned_to] || dev.assigned_to})</span>}
                      </div>
                    )}
                    {dev.status === "resolved" && (
                      <div style={{ fontSize: 12, color: dev.customer_approved_at ? "var(--text-success)" : "var(--text-secondary)", marginTop: 4 }}>
                        {dev.customer_approved_at
                          ? `Godkjent av kunde (${dev.customer_approved_by_initials})`
                          : "Venter på kundegodkjenning"}
                      </div>
                    )}
                    <DeviationSteps dev={dev} token={token} onChanged={loadAll} onError={setError} />
                    {dev.photos?.length > 0 && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                        {dev.photos.map((ph) => (
                          <a key={ph.id} href={photoUrl(ph.file_path, token)} target="_blank" rel="noreferrer">
                            <img src={photoUrl(ph.file_path, token)} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: "var(--radius-sm)" }} />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999, whiteSpace: "nowrap",
                  background: dev.status === "resolved" ? "var(--c-teal)" : "var(--bg-danger)",
                  color: dev.status === "resolved" ? "var(--text-success)" : "var(--text-danger)",
                }}>
                  {STATUS_LABEL[dev.status]}
                </span>
              </div>
            )}

            {editingId !== dev.id && (
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button onClick={() => startEdit(dev)} style={secondaryBtnStyle}>Rediger</button>
                {dev.status !== "resolved" && (
                  <button onClick={() => markResolved(dev.id)} style={secondaryBtnStyle}>Merk løst</button>
                )}
                <button onClick={() => setConfirmDelete(dev.id)} style={{ ...secondaryBtnStyle, color: "var(--text-danger)" }}>Slett</button>
              </div>
            )}

            {confirmDelete === dev.id && (
              <div style={{ marginTop: 10, fontSize: 13, background: "var(--bg-danger)", padding: 10, borderRadius: "var(--radius)" }}>
                Slette dette avviket?
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button onClick={() => deleteDeviation(dev.id)} style={{ ...primaryBtnStyle, background: "var(--text-danger)" }}>Ja, slett</button>
                  <button onClick={() => setConfirmDelete(null)} style={linkBtnStyle}>Avbryt</button>
                </div>
              </div>
            )}
          </Card>
        );
      })}

      {loading ? <Loading /> : visibleDeviations.length === 0 && (
        <Card style={{ textAlign: "center", color: "var(--text-secondary)" }}>Ingen registrerte avvik.</Card>
      )}
    </div>
  );
}

const secondaryBtnStyle = {
  background: "none", border: "1px solid var(--border)", color: "var(--text-primary)",
  padding: "6px 12px", borderRadius: "var(--radius)", fontSize: 12, cursor: "pointer",
};

// Avviksbehandlingen i fire steg, som en vertikal sekvens — fordi det ER en sekvens, og fordi
// et tilsyn leser den ovenfra og ned. Hvert utfylt steg bærer sine egne initialer og sitt eget
// tidspunkt, siden stegene skjer på ulike tidspunkt og ofte av ulike folk.
//
// Steg 1 er alltid utfylt (det er selve meldingen). De tre neste kan fylles ut i hvilken som
// helst rekkefølge — virkeligheten går ikke alltid pent nedover — men lukkingen krever at det
// korrigerende tiltaket står. Se routes/deviations.js for hvorfor bare det ene er påkrevd.
const DEV_STEPS = [
  { key: "immediate", label: "Strakstiltak", hint: "Hva ble gjort umiddelbart for å gjøre det trygt?" },
  { key: "cause", label: "Årsak", hint: "Hvorfor skjedde det?" },
  { key: "corrective", label: "Korrigerende tiltak", hint: "Hva hindrer at det skjer igjen?" },
];

function StepNode({ filled, last, children }) {
  return (
    <div style={{ display: "flex", gap: 12 }}>
      {/* Sporet: prikken og streken ned til neste steg. Streken er det som gjør det til en
          sekvens og ikke fire løsrevne felt. */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
        <span style={{
          width: 20, height: 20, borderRadius: 999, flexShrink: 0,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          background: filled ? "var(--brand)" : "var(--surface-0)",
          border: filled ? "none" : "2px solid var(--border)",
          color: "white",
        }}>
          {filled && (
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor"
                 strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 12.5 4.5 4.5L19 7" />
            </svg>
          )}
        </span>
        {!last && <span style={{ flex: 1, width: 2, background: "var(--border)", minHeight: 14 }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingBottom: last ? 0 : 14 }}>{children}</div>
    </div>
  );
}

function DeviationSteps({ dev, token, onChanged, onError }) {
  const [openStep, setOpenStep] = useState(null);
  const [draft, setDraft] = useState({ text: "", initials: "" });
  const [signature, setSignature] = useState("");
  const [closing, setClosing] = useState(false);

  // Et urørt avvik viser én lenke, ikke hele sporet.
  //
  // Da dette først ble bygget fikk «lyspære gikk» på et kontorbygg fem noder og tre tomme felt
  // der det tidligere sto «Merk løst». Firetrinnsbehandling er riktig for et avvik som fortjener
  // det, og unødig tyngde for et som ikke gjør det — og de fleste avvik gjør ikke. Sporet folder
  // seg derfor ut når noen faktisk begynner å behandle saken, og er én lenke fram til det.
  // Dette skjuler aldri noe som finnes: har ett steg innhold, står hele sporet åpent.
  const harBehandling = !!(dev.immediate_action || dev.root_cause || dev.corrective_action || dev.closed_at);
  const [utfoldet, setUtfoldet] = useState(false);
  const vis = harBehandling || utfoldet;

  async function saveStep(step) {
    if (!draft.text.trim() || !draft.initials.trim()) return;
    try {
      await apiFetch(`/deviations/${dev.id}/step/${step}`, {
        token, method: "PATCH", body: JSON.stringify(draft),
      });
      setOpenStep(null);
      setDraft({ text: "", initials: "" });
      onChanged();
    } catch (err) {
      onError(err.message);
    }
  }

  async function close() {
    if (!signature.trim()) return;
    try {
      await apiFetch(`/deviations/${dev.id}/close`, {
        token, method: "PATCH", body: JSON.stringify({ signature }),
      });
      setClosing(false);
      setSignature("");
      onChanged();
    } catch (err) {
      onError(err.message);
    }
  }

  if (!vis) {
    return (
      <div style={{ marginTop: 10 }}>
        <button onClick={() => setUtfoldet(true)} style={linkBtnStyle}>
          + Behandle avviket
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
        color: "var(--text-secondary)", marginBottom: 12,
      }}>
        Behandling
      </div>

      <StepNode filled>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Meldt</div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 1 }}>
          {dev.reported_by_initials || "—"} · {String(dev.created_at || "").slice(0, 16)}
        </div>
      </StepNode>

      {DEV_STEPS.map((s) => {
        const text = dev[`${s.key === "immediate" ? "immediate_action" : s.key === "cause" ? "root_cause" : "corrective_action"}`];
        const by = dev[`${s.key === "immediate" ? "immediate_action_by" : s.key === "cause" ? "root_cause_by" : "corrective_action_by"}`];
        const at = dev[`${s.key === "immediate" ? "immediate_action_at" : s.key === "cause" ? "root_cause_at" : "corrective_action_at"}`];
        return (
          <StepNode key={s.key} filled={!!text}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{s.label}</div>
            {text ? (
              <>
                <div style={{ fontSize: 13, marginTop: 2 }}>{text}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 1 }}>
                  {by} · {String(at || "").slice(0, 16)}
                </div>
              </>
            ) : openStep === s.key ? (
              <div style={{ marginTop: 6 }}>
                <textarea
                  value={draft.text}
                  onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
                  placeholder={s.hint}
                  autoFocus
                  style={{ ...inputStyle, minHeight: 52, resize: "vertical", fontSize: 13 }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    value={draft.initials}
                    onChange={(e) => setDraft((d) => ({ ...d, initials: e.target.value }))}
                    placeholder="Ditt navn"
                    style={{ ...inputStyle, width: 150, fontSize: 13 }}
                  />
                  <button onClick={() => saveStep(s.key)} style={primaryBtnStyle}>Lagre</button>
                  <button onClick={() => { setOpenStep(null); setDraft({ text: "", initials: "" }); }} style={linkBtnStyle}>
                    Avbryt
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setOpenStep(s.key); setDraft({ text: "", initials: "" }); }}
                style={{ ...linkBtnStyle, marginTop: 2 }}
              >
                + {s.label}
              </button>
            )}
          </StepNode>
        );
      })}

      <StepNode filled={!!dev.closed_at} last>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Lukket og signert</div>
        {dev.closed_at ? (
          <div style={{ fontSize: 12, color: "var(--text-success)", marginTop: 1 }}>
            {dev.closed_signature} · {String(dev.closed_at).slice(0, 16)}
          </div>
        ) : closing ? (
          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="Signer med navnet ditt"
              autoFocus
              style={{ ...inputStyle, width: 190, fontSize: 13 }}
            />
            <button onClick={close} style={primaryBtnStyle}>Lukk avviket</button>
            <button onClick={() => { setClosing(false); setSignature(""); }} style={linkBtnStyle}>Avbryt</button>
          </div>
        ) : dev.corrective_action ? (
          <button onClick={() => setClosing(true)} style={{ ...linkBtnStyle, marginTop: 2 }}>+ Signer og lukk</button>
        ) : (
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 1 }}>
            Krever at korrigerende tiltak er fylt ut
          </div>
        )}
      </StepNode>
    </div>
  );
}
