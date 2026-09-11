import { useEffect, useState } from "react";
import { X, Pencil, FileText, Download } from "lucide-react";
import { apiFetch, downloadPdf, viewHtmlReport, API_URL } from "../api";
import { isNetworkError } from "../offlineQueue";
import RunRoomsAndItems from "./RunRoomsAndItems";

function photoUrl(filePath) {
  const filename = filePath.split(/[\\/]/).pop();
  return `${API_URL}/uploads/${filename}`;
}

// One checklist visit, viewable and (behind a "Rediger" toggle) editable, with an optional
// scroll-to-room on open — the piece a vaskeplan grid cell links to, wherever that grid shows
// up (admin Rapporter, a cleaner's own view). Shared instead of copied so all three keep
// behaving identically as this evolves.
export default function RunDetailModal({ token, runId, highlightRoomId, defaultInitials, onClose, setError }) {
  const [runDetail, setRunDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editInitials, setEditInitials] = useState(defaultInitials || "");

  useEffect(() => {
    setLoading(true);
    apiFetch(`/checklists/runs/${runId}`, { token })
      .then((data) => {
        setRunDetail(data);
        if (highlightRoomId) {
          setTimeout(() => {
            document.getElementById(`room-${highlightRoomId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 50);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, runId]);

  async function refresh() {
    try {
      setRunDetail(await apiFetch(`/checklists/runs/${runId}`, { token }));
    } catch (err) {
      // A mutation just made via RunRoomsAndItems may have been queued offline rather than sent
      // — there's nothing new to fetch yet, so a network failure here isn't a real error to show.
      if (!isNetworkError(err)) setError(err.message);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex",
        alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "var(--surface-1)", borderRadius: "var(--radius-lg)", padding: 24,
        maxWidth: 480, width: "100%", maxHeight: "85vh", overflowY: "auto",
      }}>
        {loading && <div style={{ color: "var(--text-secondary)" }}>Laster...</div>}
        {runDetail && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 16 }}>{runDetail.site_name}</div>
                {runDetail.site_address && <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{runDetail.site_address}</div>}
              </div>
              <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ marginTop: 12, fontSize: 13, color: "var(--text-secondary)", display: "grid", gap: 4 }}>
              <div>Renholder: <strong style={{ color: "var(--text-primary)" }}>{runDetail.cleaner_name}</strong></div>
              <div>Startet: {runDetail.started_at.slice(0, 16)}</div>
              {runDetail.completed_at && <div>Fullført: {runDetail.completed_at.slice(0, 16)}</div>}
              {runDetail.signed_initials && (
                <div>Signert: <strong style={{ color: "var(--text-primary)" }}>{runDetail.signed_initials}</strong></div>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <button
                onClick={() => viewHtmlReport(`/reports/runs/${runDetail.id}/html`, token).catch((err) => setError(err.message))}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: "var(--surface-0)", border: "1px solid var(--border)", borderRadius: "var(--radius)",
                  padding: "8px 12px", fontSize: 12, cursor: "pointer", color: "var(--text-secondary)",
                }}
              >
                <FileText size={14} /> Vis rapport
              </button>
              <button
                onClick={() => downloadPdf(`/reports/runs/${runDetail.id}/pdf`, token, `rapport-besok-${runDetail.id}.pdf`).catch((err) => setError(err.message))}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: "var(--surface-0)", border: "1px solid var(--border)", borderRadius: "var(--radius)",
                  padding: "8px 12px", fontSize: 12, cursor: "pointer", color: "var(--text-secondary)",
                }}
              >
                <Download size={14} /> Last ned PDF
              </button>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{runDetail.rooms?.length > 0 ? "Rom" : "Sjekkliste"}</div>
              {!isEditing ? (
                <button
                  onClick={() => setIsEditing(true)}
                  style={{
                    display: "flex", alignItems: "center", gap: 4, background: "none", border: "none",
                    color: "var(--accent-orange-dark)", fontSize: 12, fontWeight: 500, cursor: "pointer",
                  }}
                >
                  <Pencil size={12} /> Rediger
                </button>
              ) : (
                <button onClick={() => setIsEditing(false)} style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: 12, cursor: "pointer" }}>
                  Ferdig
                </button>
              )}
            </div>
            {isEditing && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>Signatur (navn)</label>
                <input
                  value={editInitials} onChange={(e) => setEditInitials(e.target.value)}
                  placeholder="Fullt navn" maxLength={60}
                  style={{
                    padding: "4px 8px", borderRadius: "var(--radius)", border: "1px solid var(--border)",
                    background: "var(--surface-0)", color: "var(--text-primary)", fontSize: 12, width: 150,
                  }}
                />
              </div>
            )}
            <RunRoomsAndItems
              token={token} runDetail={runDetail} editable={isEditing} editInitials={editInitials}
              onChanged={refresh} setError={setError}
            />

            {runDetail.photos.length > 0 && runDetail.rooms?.length > 0 && (
              <>
                <div style={{ marginTop: 16, fontWeight: 600, fontSize: 13 }}>Bilder</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  {runDetail.photos.map((p) => (
                    <a key={p.id} href={photoUrl(p.file_path)} target="_blank" rel="noreferrer">
                      <img src={photoUrl(p.file_path)} alt="" style={{ width: 70, height: 70, objectFit: "cover", borderRadius: "var(--radius-sm)" }} />
                    </a>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
