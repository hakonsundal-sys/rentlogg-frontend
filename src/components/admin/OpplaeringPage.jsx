import { Fragment, useEffect, useRef, useState } from "react";
import { BookOpen, ChevronRight, Download, FileText, Plus, Trash2, Upload, UserPlus } from "lucide-react";
import { apiFetch, downloadPdf } from "../../api";
import { Card, Field, Loading, TabButton, uploadUrl, primaryBtnStyle, linkBtnStyle, inputStyle } from "../shared";
import SignaturePad from "../SignaturePad";

// The "Opplæring" tab under Ansatte. Documents that a staff member has received training — a lesson
// watched in the app, a routine read, a physical course held, an external certificate earned — and
// has signed for it. Everything here is company-scoped by the backend; this page never filters by
// company itself.
//
// Norwegian-only like the rest of the admin surface (see App.jsx) — the translated strings are the
// cleaner's own view of her training, not this one.

const KIND_LABEL = {
  lesson: "Leksjon i appen",
  document: "Dokument som skal leses",
  classroom: "Fysisk opplæring",
  external: "Eksternt kurs",
};

// One cell of the matrix. Grey means "nothing has happened", which is deliberately quieter than
// red — a course nobody has taken yet isn't a failure, an expired one is.
const STATUS = {
  none: { label: "—", title: "Ikke gjennomført", color: "var(--text-muted)", bg: "transparent" },
  in_progress: { label: "Påbegynt", title: "Påbegynt", color: "var(--text-secondary)", bg: "var(--border)" },
  done: { label: "OK", title: "Gjennomført", color: "var(--text-success)", bg: "var(--c-teal)" },
  expiring: { label: "Utløper", title: "Gjennomført, men utløper snart", color: "var(--accent-orange-dark)", bg: "var(--c-amber)" },
  expired: { label: "Utløpt", title: "Utløpt — må tas på nytt", color: "var(--text-danger)", bg: "var(--c-red)" },
};

const EMPTY_COURSE = {
  title: "", description: "", kind: "lesson", validity_months: "",
  requires_signature: true, requires_drawn_signature: false,
};

function day(value) {
  return value ? String(value).slice(0, 10) : "";
}

// openUserOnMount: jumped here from a row in the staff list, so open that person straight away
// instead of making the caller hunt for the name in the matrix.
export default function OpplaeringPage({ token, user, openUserOnMount }) {
  const [view, setView] = useState("oversikt");
  const [overview, setOverview] = useState(null);
  const [courses, setCourses] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [openUserId, setOpenUserId] = useState(openUserOnMount ?? null);
  const [openUser, setOpenUser] = useState(null);

  const isAdmin = user?.role === "admin";

  function loadAll() {
    setError("");
    Promise.all([
      apiFetch("/training/overview", { token }),
      apiFetch("/training/courses", { token }),
      apiFetch("/departments", { token }),
    ])
      .then(([overviewData, coursesData, departmentData]) => {
        setOverview(overviewData);
        setCourses(coursesData);
        setDepartments(departmentData);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(loadAll, [token]);

  useEffect(() => {
    if (!openUserId) return setOpenUser(null);
    setOpenUser(null);
    apiFetch(`/training/users/${openUserId}`, { token })
      .then(setOpenUser)
      .catch((err) => setError(err.message));
  }, [openUserId, token]);

  if (loading) return <Loading />;

  const visibleUsers = (overview?.users || []).filter(
    (u) => !departmentFilter || String(u.department_id || "") === departmentFilter
  );

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>Opplæring</h1>
        <div style={{ color: "var(--text-secondary)" }}>
          Dokumentasjon på hvem som har fått hvilken opplæring, og signert på den.
        </div>
      </div>

      <div style={{ display: "flex", borderBottom: "1px solid var(--border)", marginBottom: 20, overflowX: "auto" }}>
        <TabButton active={view === "oversikt"} onClick={() => setView("oversikt")}>Oversikt</TabButton>
        <TabButton active={view === "kurs"} onClick={() => setView("kurs")}>Kurs</TabButton>
        <TabButton active={view === "registrer"} onClick={() => setView("registrer")}>Registrer opplæring</TabButton>
      </div>

      {error && <div style={{ color: "var(--text-danger)", marginBottom: 12 }}>{error}</div>}

      {view === "oversikt" && (
        <Oversikt
          overview={overview}
          users={visibleUsers}
          departments={departments}
          departmentFilter={departmentFilter}
          setDepartmentFilter={setDepartmentFilter}
          openUserId={openUserId}
          setOpenUserId={setOpenUserId}
          openUser={openUser}
          token={token}
          isAdmin={isAdmin}
          onChanged={loadAll}
          setError={setError}
        />
      )}

      {view === "kurs" && (
        <Kurs
          courses={courses}
          staff={overview?.users || []}
          departments={departments}
          token={token}
          isAdmin={isAdmin}
          onChanged={loadAll}
          setError={setError}
        />
      )}

      {view === "registrer" && (
        <RegistrerOpplaering
          courses={courses.filter((c) => c.active)}
          staff={overview?.users || []}
          token={token}
          onChanged={loadAll}
          setError={setError}
        />
      )}
    </div>
  );
}

// --- Oversikt (matrisen) -----------------------------------------------------------------------

function Oversikt({
  overview, users, departments, departmentFilter, setDepartmentFilter,
  openUserId, setOpenUserId, openUser, token, isAdmin, onChanged, setError,
}) {
  if (!overview || overview.courses.length === 0) {
    return (
      <Card style={{ textAlign: "center", color: "var(--text-secondary)" }}>
        Ingen aktive kurs ennå. Opprett det første under «Kurs».
      </Card>
    );
  }

  async function deleteRecord(recordId) {
    setError("");
    try {
      await apiFetch(`/training/records/${recordId}`, { token, method: "DELETE" });
      onChanged();
      setOpenUserId(null);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 14, flexWrap: "wrap" }}>
        <Field label="Avdeling" style={{ margin: 0, minWidth: 160 }}>
          <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} style={inputStyle}>
            <option value="">Alle avdelinger</option>
            {departments.map((d) => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
          </select>
        </Field>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", paddingBottom: 10 }}>
          {users.length} ansatte &middot; {overview.courses.length} aktive kurs
        </div>
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-secondary)", fontSize: 11 }}>
                <th style={{ padding: "10px 14px", position: "sticky", left: 0, background: "var(--sidebar-bg)" }}>Ansatt</th>
                {overview.courses.map((c) => (
                  <th key={c.id} style={{ padding: "10px 10px", minWidth: 110 }}>
                    {c.title}
                    <div style={{ fontWeight: 400, textTransform: "none" }}>
                      {c.validity_months ? `gyldig ${c.validity_months} mnd` : "uten utløp"}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <Fragment key={u.id}>
                  <tr style={{ borderTop: "1px solid var(--border)", opacity: u.active ? 1 : 0.55 }}>
                    <td style={{ padding: "10px 14px", position: "sticky", left: 0, background: "var(--sidebar-bg)" }}>
                      <button
                        onClick={() => setOpenUserId(openUserId === u.id ? null : u.id)}
                        title={`Åpne opplæringen til ${u.name}`}
                        style={{
                          ...linkBtnStyle, display: "flex", alignItems: "center", gap: 4, fontWeight: 500,
                          color: openUserId === u.id ? "var(--accent-orange-dark)" : "var(--text-primary)",
                        }}
                      >
                        <ChevronRight
                          size={13}
                          style={{
                            color: "var(--text-muted)", flexShrink: 0,
                            transform: openUserId === u.id ? "rotate(90deg)" : "none", transition: "transform .12s",
                          }}
                        />
                        <span style={{ textDecoration: "underline", textDecorationColor: "var(--border)", textUnderlineOffset: 3 }}>
                          {u.name}
                        </span>
                      </button>
                    </td>
                    {overview.courses.map((c) => {
                      const cell = u.cells[c.id];
                      const look = STATUS[cell.status] || STATUS.none;
                      return (
                        <td key={c.id} style={{ padding: "8px 10px" }}>
                          <span
                            title={`${look.title}${cell.completed_at ? ` ${day(cell.completed_at)}` : ""}${cell.expires_at ? ` · gyldig til ${day(cell.expires_at)}` : ""}`}
                            style={{
                              display: "inline-block", padding: "2px 8px", borderRadius: "var(--radius-pill)",
                              background: look.bg, color: look.color, fontSize: 12, fontWeight: 600,
                            }}
                          >
                            {look.label}
                          </span>
                          {cell.outdated && (
                            <span title="Signert på en eldre versjon av kurset" style={{ marginLeft: 4, fontSize: 11, color: "var(--accent-orange-dark)" }}>
                              ↻
                            </span>
                          )}
                          {!cell.assigned && cell.status === "none" && (
                            <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 4 }}>ikke tildelt</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  {openUserId === u.id && (
                    <tr style={{ background: "var(--page-bg)" }}>
                      <td colSpan={overview.courses.length + 1} style={{ padding: "12px 14px" }}>
                        {!openUser ? <Loading /> : (
                          <PersonKort person={openUser} token={token} isAdmin={isAdmin} onDeleteRecord={deleteRecord} />
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div style={{ marginTop: 12, display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: "var(--text-secondary)" }}>
        {Object.entries(STATUS).map(([key, look]) => (
          <span key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              display: "inline-block", padding: "1px 7px", borderRadius: "var(--radius-pill)",
              background: look.bg, color: look.color, fontSize: 11, fontWeight: 600,
            }}>
              {look.label}
            </span>
            {look.title}
          </span>
        ))}
      </div>
    </>
  );
}

function PersonKort({ person, token, isAdmin, onDeleteRecord }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 600 }}>{person.user.name}</div>
        <button
          onClick={() => downloadPdf(`/training/users/${person.user.id}/certificate.pdf`, token, `opplaering-${person.user.name}.pdf`)}
          style={{ ...linkBtnStyle, display: "flex", alignItems: "center", gap: 6 }}
        >
          <Download size={13} /> Last ned opplæringsbevis
        </button>
      </div>

      {person.courses.length === 0 && (
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Ingen kurs tildelt eller gjennomført.</div>
      )}

      {person.courses.map((row) => (
        <div key={row.course_id} style={{ borderTop: "1px solid var(--border)", padding: "8px 0", fontSize: 13 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
            <strong>{row.title}</strong>
            <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>{row.kind_label}</span>
            <span style={{ color: (STATUS[row.status] || STATUS.none).color, fontSize: 12, fontWeight: 600 }}>
              {(STATUS[row.status] || STATUS.none).title}
            </span>
          </div>
          {row.history.map((rec) => (
            <div key={rec.id} style={{ color: "var(--text-secondary)", fontSize: 12, marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span>
                {rec.completed_at ? `Gjennomført ${day(rec.completed_at)}` : `Påbegynt ${day(rec.started_at)}`}
                {rec.signed_initials ? ` · signert av ${rec.signed_initials}` : ""}
                {rec.instructor ? ` · holdt av ${rec.instructor}` : ""}
                {rec.expires_at ? ` · gyldig til ${day(rec.expires_at)}` : ""}
                {rec.slides_total ? ` · ${rec.slides_seen || 0}/${rec.slides_total} lysbilder` : ""}
              </span>
              {rec.signature_path && (
                <img
                  src={uploadUrl(rec.signature_path, token)}
                  alt="Signatur"
                  style={{ height: 34, background: "white", border: "1px solid var(--border)", borderRadius: 4, padding: 2 }}
                />
              )}
              {rec.evidence_path && (
                <a href={uploadUrl(rec.evidence_path, token)} target="_blank" rel="noreferrer" style={{ color: "var(--accent-orange-dark)" }}>
                  {rec.evidence_name || "Bevis"}
                </a>
              )}
              {isAdmin && (
                <button
                  onClick={() => onDeleteRecord(rec.id)}
                  title="Slett denne registreringen"
                  style={{ ...linkBtnStyle, color: "var(--text-danger)" }}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// --- Kurs ---------------------------------------------------------------------------------------

function Kurs({ courses, staff, departments, token, isAdmin, onChanged, setError }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_COURSE);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [assignFor, setAssignFor] = useState(null);

  function startNew() {
    setForm(EMPTY_COURSE);
    setEditingId(null);
    setShowForm(true);
  }

  function startEdit(course) {
    setForm({
      title: course.title,
      description: course.description || "",
      kind: course.kind,
      validity_months: course.validity_months ?? "",
      requires_signature: !!course.requires_signature,
      requires_drawn_signature: !!course.requires_drawn_signature,
    });
    setEditingId(course.id);
    setShowForm(true);
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const body = JSON.stringify({
        ...form,
        validity_months: form.validity_months === "" ? null : Number(form.validity_months),
      });
      if (editingId) await apiFetch(`/training/courses/${editingId}`, { token, method: "PATCH", body });
      else await apiFetch("/training/courses", { token, method: "POST", body });
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_COURSE);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(course) {
    setError("");
    try {
      await apiFetch(`/training/courses/${course.id}`, {
        token, method: "PATCH", body: JSON.stringify({ active: !course.active }),
      });
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeCourse(course) {
    setError("");
    try {
      await apiFetch(`/training/courses/${course.id}`, { token, method: "DELETE" });
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  async function uploadFile(course, file) {
    setError("");
    const body = new FormData();
    body.append("file", file);
    body.append("name", file.name);
    try {
      await apiFetch(`/training/courses/${course.id}/files`, { token, method: "POST", body });
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeFile(course, fileId) {
    setError("");
    try {
      await apiFetch(`/training/courses/${course.id}/files/${fileId}`, { token, method: "DELETE" });
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        {isAdmin && (
          <button onClick={startNew} style={{ ...primaryBtnStyle, display: "flex", alignItems: "center", gap: 6 }}>
            <Plus size={15} /> Nytt kurs
          </button>
        )}
      </div>

      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <form onSubmit={submit}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Field label="Tittel" style={{ flex: 1, minWidth: 220 }}>
                <input required autoFocus value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} style={inputStyle} />
              </Field>
              <Field label="Type" style={{ minWidth: 190 }}>
                <select value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))} style={inputStyle}>
                  {Object.entries(KIND_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
              <Field label="Gyldig i (måneder)" style={{ minWidth: 150 }}>
                <input
                  type="number" min={1} max={120} placeholder="Uten utløp"
                  value={form.validity_months}
                  onChange={(e) => setForm((f) => ({ ...f, validity_months: e.target.value }))}
                  style={inputStyle}
                />
              </Field>
            </div>
            <Field label="Beskrivelse">
              <textarea
                rows={2} value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                style={{ ...inputStyle, width: "100%", resize: "vertical" }}
              />
            </Field>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginTop: 4 }}>
              <input
                type="checkbox" checked={form.requires_signature}
                onChange={(e) => setForm((f) => ({ ...f, requires_signature: e.target.checked }))}
              />
              Den ansatte må signere med navnet sitt
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, marginTop: 6 }}>
              <input
                type="checkbox" checked={form.requires_drawn_signature} style={{ marginTop: 3 }}
                onChange={(e) => setForm((f) => ({ ...f, requires_drawn_signature: e.target.checked }))}
              />
              <span>
                ... og tegne signaturen sin med fingeren
                <span style={{ display: "block", fontSize: 12, color: "var(--text-secondary)" }}>
                  Signaturen havner i opplæringsbeviset. Juridisk sier den ikke mer enn navn og
                  tidspunkt gjør, men den leses som en signatur av en kunde eller et tilsyn.
                </span>
              </span>
            </label>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14 }}>
              <button type="submit" disabled={saving} style={primaryBtnStyle}>{saving ? "Lagrer..." : "Lagre kurs"}</button>
              <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} style={linkBtnStyle}>Avbryt</button>
            </div>
          </form>
        </Card>
      )}

      {courses.length === 0 && (
        <Card style={{ textAlign: "center", color: "var(--text-secondary)" }}>Ingen kurs opprettet ennå.</Card>
      )}

      {courses.map((course) => (
        <Card key={course.id} style={{ marginBottom: 14, opacity: course.active ? 1 : 0.6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ minWidth: 240, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <BookOpen size={16} style={{ color: "var(--accent-orange)" }} />
                <strong>{course.title}</strong>
                {!course.active && <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>(deaktivert)</span>}
              </div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
                {course.kind_label}
                {course.validity_months ? ` · gyldig ${course.validity_months} måneder` : " · uten utløp"}
                {course.requires_signature ? " · krever signatur" : " · uten signatur"}
                {course.requires_drawn_signature ? " · tegnet signatur" : ""}
                {course.kind === "lesson" && ` · versjon ${course.version}`}
              </div>
              {course.description && <div style={{ fontSize: 13, marginTop: 6 }}>{course.description}</div>}
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 8 }}>
                {course.assigned_count} tildelt · {course.done_count} gjennomført
                {course.attention_count > 0 && ` · ${course.attention_count} utløpt eller utløper snart`}
              </div>
              {course.kind === "lesson" && (
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                  {course.languages.length === 0
                    ? "Ingen lysbilder lastet opp ennå."
                    : `Lysbilder: ${course.languages.map((l) => `${l.language} (${l.slides})`).join(", ")}`}
                </div>
              )}
              {course.files.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 13 }}>
                  {course.files.map((f) => (
                    <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <FileText size={13} style={{ color: "var(--text-secondary)" }} />
                      <a href={uploadUrl(f.file_path, token)} target="_blank" rel="noreferrer" style={{ color: "var(--accent-orange-dark)" }}>
                        {f.name}
                      </a>
                      <button onClick={() => removeFile(course, f.id)} style={{ ...linkBtnStyle, color: "var(--text-danger)" }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
              <button
                onClick={() => setAssignFor(assignFor === course.id ? null : course.id)}
                style={{ ...linkBtnStyle, display: "flex", alignItems: "center", gap: 6 }}
              >
                <UserPlus size={13} /> Tildel
              </button>
              <button
                onClick={() => downloadPdf(`/training/courses/${course.id}/participants.pdf`, token, `deltakerliste-${course.title}.pdf`)}
                style={{ ...linkBtnStyle, display: "flex", alignItems: "center", gap: 6 }}
              >
                <Download size={13} /> Deltakerliste
              </button>
              <label style={{ ...linkBtnStyle, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <Upload size={13} /> Last opp dokument
                <input
                  type="file" style={{ display: "none" }}
                  onChange={(e) => { if (e.target.files?.[0]) uploadFile(course, e.target.files[0]); e.target.value = ""; }}
                />
              </label>
              {isAdmin && (
                <>
                  <button onClick={() => startEdit(course)} style={linkBtnStyle}>Rediger</button>
                  <button onClick={() => toggleActive(course)} style={linkBtnStyle}>
                    {course.active ? "Deaktiver" : "Aktiver"}
                  </button>
                  <button onClick={() => removeCourse(course)} style={{ ...linkBtnStyle, color: "var(--text-danger)" }}>
                    Slett
                  </button>
                </>
              )}
            </div>
          </div>

          {assignFor === course.id && (
            <TildelSkjema
              course={course}
              staff={staff}
              departments={departments}
              token={token}
              onDone={() => { setAssignFor(null); onChanged(); }}
              setError={setError}
            />
          )}
        </Card>
      ))}
    </>
  );
}

function TildelSkjema({ course, staff, departments, token, onDone, setError }) {
  const [mode, setMode] = useState("role");
  const [departmentId, setDepartmentId] = useState("");
  const [picked, setPicked] = useState([]);
  const [dueAt, setDueAt] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const body = { course_id: course.id, due_at: dueAt || null };
      if (mode === "role") body.role = "cleaner";
      else if (mode === "department") body.department_id = Number(departmentId);
      else body.user_ids = picked;

      const result = await apiFetch("/training/assignments", { token, method: "POST", body: JSON.stringify(body) });
      // "0 nye" is a normal, useful answer here (everyone already had it), not an error — say it
      // rather than silently closing as if nothing was asked.
      if (result.added === 0) setError(`Alle ${result.targeted} var allerede tildelt «${course.title}».`);
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ borderTop: "1px solid var(--border)", marginTop: 12, paddingTop: 12 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <Field label="Tildel til" style={{ margin: 0, minWidth: 180 }}>
          <select value={mode} onChange={(e) => setMode(e.target.value)} style={inputStyle}>
            <option value="role">Alle renholdere</option>
            <option value="department">En avdeling</option>
            <option value="users">Enkeltpersoner</option>
          </select>
        </Field>
        {mode === "department" && (
          <Field label="Avdeling" style={{ margin: 0, minWidth: 160 }}>
            <select required value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} style={inputStyle}>
              <option value="">Velg avdeling</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Frist (valgfritt)" style={{ margin: 0, minWidth: 150 }}>
          <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} style={inputStyle} />
        </Field>
        <button type="submit" disabled={saving || (mode === "users" && picked.length === 0)} style={primaryBtnStyle}>
          {saving ? "Tildeler..." : "Tildel kurset"}
        </button>
      </div>

      {mode === "users" && (
        <div style={{
          marginTop: 10, maxHeight: 200, overflowY: "auto", border: "1px solid var(--border)",
          borderRadius: "var(--radius)", padding: 8,
        }}>
          {staff.map((s) => (
            <label key={s.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, padding: "3px 0" }}>
              <input
                type="checkbox"
                checked={picked.includes(s.id)}
                onChange={(e) => setPicked((list) => (e.target.checked ? [...list, s.id] : list.filter((id) => id !== s.id)))}
              />
              {s.name}
              {!s.active && <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>(deaktivert)</span>}
            </label>
          ))}
        </div>
      )}
    </form>
  );
}

// --- Registrer opplæring -------------------------------------------------------------------------

// For the training that happens away from the app: a course held in a room, a certificate earned
// somewhere else. The signature field is the employee's own name as given to whoever registers it;
// the backend separately records who entered it.
function RegistrerOpplaering({ courses, staff, token, onChanged, setError }) {
  const today = new Date().toISOString().slice(0, 10);
  const EMPTY = { course_id: "", user_id: "", completed_at: today, instructor: "", signed_initials: "", note: "" };
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedFor, setSavedFor] = useState("");
  const [hasInk, setHasInk] = useState(false);
  const padRef = useRef(null);

  const course = courses.find((c) => String(c.id) === String(form.course_id));

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const body = new FormData();
      Object.entries(form).forEach(([key, value]) => body.append(key, value ?? ""));
      if (file) body.append("evidence", file);
      // Tegnes her og nå, mens personen står foran den som holdt kurset — det er hele poenget med
      // en signatur man skriver med fingeren i stedet for å taste et navn på vegne av noen.
      const drawn = await padRef.current?.toBlob();
      if (drawn) body.append("signature", drawn, "signatur.png");
      await apiFetch("/training/records", { token, method: "POST", body });
      const person = staff.find((s) => String(s.id) === String(form.user_id));
      setSavedFor(person?.name || "");
      setForm({ ...EMPTY, course_id: form.course_id });
      setFile(null);
      setHasInk(false);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (courses.length === 0) {
    return (
      <Card style={{ textAlign: "center", color: "var(--text-secondary)" }}>
        Opprett et kurs først — da kan gjennomført opplæring registreres på det.
      </Card>
    );
  }

  return (
    <Card>
      {savedFor && (
        <div style={{ fontSize: 13, marginBottom: 12, color: "var(--text-success)" }}>
          Opplæring registrert for {savedFor}.
        </div>
      )}
      <form onSubmit={submit}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Field label="Kurs" style={{ flex: 1, minWidth: 220 }}>
            <select required value={form.course_id} onChange={(e) => setForm((f) => ({ ...f, course_id: e.target.value }))} style={inputStyle}>
              <option value="">Velg kurs</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </Field>
          <Field label="Ansatt" style={{ flex: 1, minWidth: 200 }}>
            <select required value={form.user_id} onChange={(e) => setForm((f) => ({ ...f, user_id: e.target.value }))} style={inputStyle}>
              <option value="">Velg ansatt</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Dato" style={{ minWidth: 150 }}>
            <input required type="date" value={form.completed_at} onChange={(e) => setForm((f) => ({ ...f, completed_at: e.target.value }))} style={inputStyle} />
          </Field>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Field label="Holdt av" style={{ flex: 1, minWidth: 200 }}>
            <input
              placeholder="Navn eller kursleverandør" value={form.instructor}
              onChange={(e) => setForm((f) => ({ ...f, instructor: e.target.value }))} style={inputStyle}
            />
          </Field>
          <Field label={course && !course.requires_signature ? "Signatur (valgfritt)" : "Signatur — den ansattes navn"} style={{ flex: 1, minWidth: 200 }}>
            <input
              required={!course || !!course.requires_signature}
              value={form.signed_initials}
              onChange={(e) => setForm((f) => ({ ...f, signed_initials: e.target.value }))}
              style={inputStyle}
            />
          </Field>
        </div>
        <Field label="Notat (valgfritt)">
          <textarea
            rows={2} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            style={{ ...inputStyle, width: "100%", resize: "vertical" }}
          />
        </Field>
        {course?.requires_drawn_signature && (
          <div style={{ marginTop: 12 }}>
            <SignaturePad key={savedFor} ref={padRef} onChange={setHasInk} />
          </div>
        )}
        <Field label="Kursbevis eller annet vedlegg (valgfritt)">
          <input type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ fontSize: 13 }} />
        </Field>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
          <button type="submit" disabled={saving || (course?.requires_drawn_signature && !hasInk)} style={primaryBtnStyle}>
            {saving ? "Lagrer..." : "Registrer opplæring"}
          </button>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Det lagres hvem som registrerte dette, sammen med signaturen.
          </span>
        </div>
      </form>
    </Card>
  );
}
