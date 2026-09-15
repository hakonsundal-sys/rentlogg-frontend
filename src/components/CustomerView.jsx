import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, Clock, Download, History, CalendarDays, X } from "lucide-react";
import { apiFetch, downloadPdf, downloadZip } from "../api";
import { Card, StatusBadge, Loading } from "./shared";
import { DeviationItem } from "./DeviationItem";
import SiteHistoryView from "./SiteHistoryView";
import RoomGrid from "./RoomGrid";
import RunDetailModal from "./RunDetailModal";

function currentMonth() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" }).format(new Date()).slice(0, 7);
}

// Counterpart to the admin Rapporter page's vaskeplan grid — same room x day view, scoped to the
// customer's own site (the backend already restricts monthly-grid to a customer's own client via
// getSiteScopedForRooms). Opening a day passes userRole="customer" to RunDetailModal, which only
// offers the "Rediger" toggle when this site has rooms the customer themselves is responsible for
// (see rooms.responsible) — otherwise it's read-only same as before. Every room also gets a "Meld
// avvik" button via onReportDeviation regardless of edit mode — a customer can look back at any
// past day and report against the specific room they're looking at, not just "Generelt" from the
// disconnected form below.
function SiteVaskeplanView({ token, site, user, onReportDeviation, onClose, setError }) {
  const [month, setMonth] = useState(currentMonth);
  const [grid, setGrid] = useState(null);
  const [openDate, setOpenDate] = useState(null);

  useEffect(() => {
    setGrid(null);
    apiFetch(`/sites/${site.id}/rooms/monthly-grid?month=${month}`, { token }).then(setGrid).catch((err) => setError(err.message));
  }, [token, site.id, month]);

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 100,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "var(--surface-1)", borderRadius: "var(--radius-lg)", padding: 20,
            maxWidth: 760, width: "100%", maxHeight: "85vh", overflowY: "auto",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <div style={{ fontWeight: 600, fontSize: 16 }}>Vaskeplan — {site.name}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={selectStyle} />
              <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
                <X size={18} />
              </button>
            </div>
          </div>
          {!grid && <div style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 12 }}>Laster...</div>}
          {grid && grid.rooms.length > 0 && (
            <RoomGrid grid={grid} month={month} onOpenRun={(date) => setOpenDate(date)} userRole="customer" />
          )}
          {grid && grid.rooms.length === 0 && (
            <div style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 12 }}>Ingen rom å vise for denne lokasjonen.</div>
          )}
        </div>
      </div>

      {/* Rendered as a sibling, not nested inside the overlay above — RunDetailModal has its
          own click-outside-to-close overlay, and nesting it inside another one would make a
          click on its background bubble up and close both at once. */}
      {openDate && (
        <RunDetailModal
          token={token} siteId={site.id} date={openDate} userRole="customer" defaultInitials={user?.name}
          onReportDeviation={(room) => { setOpenDate(null); onClose(); onReportDeviation(room.id); }}
          onClose={() => setOpenDate(null)} setError={setError}
        />
      )}
    </>
  );
}

export default function CustomerView({ token, user }) {
  const [sites, setSites] = useState([]);
  const [deviations, setDeviations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [historySite, setHistorySite] = useState(null);
  const [vaskeplanSite, setVaskeplanSite] = useState(null);

  const [openFormSiteId, setOpenFormSiteId] = useState(null);
  const [formRooms, setFormRooms] = useState(null);
  const [formRoomId, setFormRoomId] = useState("");
  const [formTasks, setFormTasks] = useState([]);
  const [formTaskLabel, setFormTaskLabel] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPriority, setFormPriority] = useState("medium");
  const [formInitials, setFormInitials] = useState("");
  const [formPhoto, setFormPhoto] = useState(null);
  const formFileInputRef = useRef(null);

  useEffect(() => {
    Promise.all([apiFetch("/sites", { token }), apiFetch("/deviations", { token })])
      .then(([sites, deviations]) => {
        setSites(sites);
        setDeviations(deviations);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  // prefillRoomId comes from the vaskeplan's per-room "Meld avvik" button (see
  // SiteVaskeplanView below) — same form, just pre-pointed at the room they were just looking at
  // instead of starting from "Generelt".
  async function openReportForm(site, prefillRoomId) {
    setOpenFormSiteId(site.id);
    setFormRoomId(prefillRoomId || "");
    setFormTasks([]);
    setFormTaskLabel("");
    setFormDescription("");
    setFormPriority("medium");
    setFormInitials(user?.name || "");
    setFormPhoto(null);
    setFormRooms(null);
    try {
      const rooms = await apiFetch(`/sites/${site.id}/rooms`, { token });
      setFormRooms(rooms);
      if (prefillRoomId) {
        setFormTasks(await apiFetch(`/rooms/${prefillRoomId}/items`, { token }));
      }
    } catch {
      setFormRooms([]);
    }
    if (prefillRoomId) {
      setTimeout(() => document.getElementById(`site-${site.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
    }
  }

  async function onRoomChange(roomId) {
    setFormRoomId(roomId);
    setFormTaskLabel("");
    if (!roomId) {
      setFormTasks([]);
      return;
    }
    try {
      setFormTasks(await apiFetch(`/rooms/${roomId}/items`, { token }));
    } catch {
      setFormTasks([]);
    }
  }

  async function submitReport(site) {
    if (!formDescription.trim()) return;
    if (!formInitials.trim()) {
      setError("Skriv inn navnet ditt for å melde avvik.");
      return;
    }
    try {
      const created = await apiFetch("/deviations", {
        token, method: "POST",
        body: JSON.stringify({
          site_id: site.id,
          room_id: formRoomId || null,
          room_task_label: formTaskLabel || null,
          description: formDescription.trim(),
          priority: formPriority,
          initials: formInitials.trim(),
        }),
      });
      // A separate call, same as the cleaner's reply-with-photo flow — a photo can't be attached
      // in the same request as the JSON body. The deviation itself is already created at this
      // point, so a photo failure shouldn't look like the whole report failed.
      if (formPhoto) {
        const form = new FormData();
        form.append("photo", formPhoto);
        try {
          await apiFetch(`/deviations/${created.id}/photos`, { token, method: "POST", body: form });
        } catch (err) {
          setError(`Avviket ble meldt, men bildet kunne ikke lastes opp: ${err.message}`);
        }
      }
      setOpenFormSiteId(null);
      setDeviations(await apiFetch("/deviations", { token }));
    } catch (err) {
      setError(err.message);
    }
  }

  if (error) return <Card style={{ color: "var(--text-danger)" }}>{error}</Card>;
  if (loading) return <Loading />;

  return (
    <div>
      {sites.map((s) => {
        // A resolved avvik keeps showing until the customer actively approves it — that
        // signed confirmation is the point, not just letting it quietly disappear once the
        // cleaner says it's done.
        const siteDeviations = deviations.filter(
          (d) => d.site_id === s.id && (d.status !== "resolved" || !d.customer_approved_at)
        );
        return (
          <Card key={s.id} id={`site-${s.id}`} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 500 }}>{s.name}</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                  <Clock size={13} /> Sist rengjort: {s.last_cleaned_at || "Aldri"}
                </div>
              </div>
              <StatusBadge status={s.status} />
            </div>

            {siteDeviations.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                {siteDeviations.map((d) => (
                  <DeviationItem
                    key={d.id} token={token} user={user} deviation={d}
                    onApproved={(updated) => setDeviations((list) => list.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)))}
                    setError={setError}
                  />
                ))}
              </div>
            )}

            {openFormSiteId === s.id ? (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                {formRooms === null && <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Laster rom...</div>}
                {formRooms?.length > 0 && (
                  <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                    <select value={formRoomId} onChange={(e) => onRoomChange(e.target.value)} style={selectStyle}>
                      <option value="">Generelt (ikke rom-spesifikt)</option>
                      {formRooms.some((r) => r.responsible === "customer") ? (
                        <>
                          <optgroup label="Deres rom">
                            {formRooms.filter((r) => r.responsible === "customer").map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                          </optgroup>
                          <optgroup label="Renholders rom">
                            {formRooms.filter((r) => r.responsible !== "customer").map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                          </optgroup>
                        </>
                      ) : (
                        formRooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)
                      )}
                    </select>
                    {formRoomId && (
                      <select value={formTaskLabel} onChange={(e) => setFormTaskLabel(e.target.value)} style={selectStyle}>
                        <option value="">Generelt for rommet</option>
                        {formTasks.map((t) => <option key={t.id} value={t.label}>{t.label}</option>)}
                      </select>
                    )}
                  </div>
                )}
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Beskriv avviket..."
                  style={{
                    width: "100%", minHeight: 70, padding: 10, borderRadius: "var(--radius)",
                    border: "1px solid var(--border)", background: "var(--surface-2)",
                    color: "var(--text-primary)", fontSize: 14, resize: "vertical", boxSizing: "border-box",
                  }}
                />
                <input
                  ref={formFileInputRef} type="file" accept="image/*"
                  onChange={(e) => setFormPhoto(e.target.files[0] || null)} style={{ display: "none" }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <select value={formPriority} onChange={(e) => setFormPriority(e.target.value)} style={selectStyle}>
                    <option value="low">Lav</option>
                    <option value="medium">Middels</option>
                    <option value="high">Høy</option>
                  </select>
                  <input
                    value={formInitials} onChange={(e) => setFormInitials(e.target.value)}
                    placeholder="Fullt navn" maxLength={60}
                    style={{
                      padding: "7px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border)",
                      background: "var(--surface-0)", color: "var(--text-primary)", fontSize: 13, width: 160,
                    }}
                  />
                  <button
                    type="button" onClick={() => formFileInputRef.current.click()}
                    style={{ ...secondaryBtnStyle, display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <Camera size={13} /> {formPhoto ? formPhoto.name : "Legg ved bilde"}
                  </button>
                  <button onClick={() => setOpenFormSiteId(null)} style={{ ...secondaryBtnStyle }}>Avbryt</button>
                  <button onClick={() => submitReport(s)} style={primaryBtnStyle}>Send avvik</button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <button onClick={() => openReportForm(s)} style={{ ...secondaryBtnStyle, display: "flex", alignItems: "center", gap: 6 }}>
                  <AlertTriangle size={13} /> Meld avvik
                </button>
                <button onClick={() => setHistorySite(s)} style={{ ...secondaryBtnStyle, display: "flex", alignItems: "center", gap: 6 }}>
                  <History size={13} /> Se historikk
                </button>
                <button onClick={() => setVaskeplanSite(s)} style={{ ...secondaryBtnStyle, display: "flex", alignItems: "center", gap: 6 }}>
                  <CalendarDays size={13} /> Vaskeplan
                </button>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                onClick={() => downloadPdf(`/reports/sites/${s.id}/pdf`, token, `rapport-${s.id}.pdf`).catch((err) => setError(err.message))}
                style={secondaryBtnStyle}
              >
                Last ned rapport (PDF)
              </button>
              <button
                onClick={() => downloadZip(`/reports/sites/${s.id}/photos.zip`, token, `bilder-${s.id}.zip`).catch((err) => setError(err.message))}
                style={{ ...secondaryBtnStyle, display: "flex", alignItems: "center", gap: 6 }}
              >
                <Download size={13} /> Last ned alle bilder
              </button>
            </div>
          </Card>
        );
      })}
      {sites.length === 0 && (
        <Card style={{ textAlign: "center", color: "var(--text-secondary)" }}>Ingen lokasjoner registrert for denne kunden ennå.</Card>
      )}

      {historySite && (
        <SiteHistoryView
          token={token} user={user} site={historySite}
          deviations={deviations.filter((d) => d.site_id === historySite.id)}
          onApproved={(updated) => setDeviations((list) => list.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)))}
          setError={setError}
          onClose={() => setHistorySite(null)}
        />
      )}

      {vaskeplanSite && (
        <SiteVaskeplanView
          token={token} site={vaskeplanSite} user={user} setError={setError}
          onClose={() => setVaskeplanSite(null)}
          onReportDeviation={(roomId) => openReportForm(vaskeplanSite, roomId)}
        />
      )}
    </div>
  );
}

const secondaryBtnStyle = {
  background: "none", border: "1px solid var(--border)", borderRadius: "var(--radius)",
  padding: "6px 12px", fontSize: 12, cursor: "pointer", color: "var(--text-secondary)",
};
const primaryBtnStyle = {
  background: "var(--accent-orange)", color: "white", border: "none",
  padding: "7px 14px", borderRadius: "var(--radius)", fontSize: 12, cursor: "pointer",
};
const selectStyle = {
  padding: "7px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border)",
  background: "var(--surface-0)", color: "var(--text-primary)", fontSize: 13,
};
