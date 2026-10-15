import { useEffect, useMemo, useState } from "react";
import { Trash2, Lock } from "lucide-react";
import { apiFetch } from "../../api";
import { Card, Loading, uploadUrl, inputStyle } from "../shared";

// What a cleaner has put under "Mine bilder". Only she and the administrators can see these; they are
// never part of a visit, a report or the customer's view. Listed here so the people who answer for the work
// can see what she wanted to document — and remove one that should not be kept.
function formatWhen(createdAt) {
  const date = new Date(`${String(createdAt).replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return createdAt;
  return new Intl.DateTimeFormat("nb", {
    timeZone: "Europe/Oslo", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

export default function PersonligeBilderPanel({ token }) {
  const [photos, setPhotos] = useState(null);
  const [personId, setPersonId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/my-photos/all", { token }).then(setPhotos).catch((err) => { setError(err.message); setPhotos([]); });
  }, [token]);

  const people = useMemo(() => {
    const seen = new Map();
    (photos || []).forEach((p) => { if (!seen.has(p.user_id)) seen.set(p.user_id, p.user_name); });
    return [...seen.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1]), "nb"));
  }, [photos]);

  async function remove(photo) {
    if (!window.confirm(`Slette bildet fra ${photo.user_name}? Det kan ikke angres.`)) return;
    try {
      await apiFetch(`/my-photos/${photo.id}`, { token, method: "DELETE" });
      setPhotos((list) => list.filter((p) => p.id !== photo.id));
    } catch (err) {
      setError(err.message);
    }
  }

  if (!photos) return <Loading />;
  const shown = personId ? photos.filter((p) => p.user_id === Number(personId)) : photos;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, color: "var(--text-secondary)", fontSize: 13, marginBottom: 14, maxWidth: 640 }}>
        <Lock size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Bilder renholderne selv har lagt inn under «Mine bilder». Bare personen selv og administratorer ser dem. De er aldri
          med i rapporter, dagsrapporten eller kundens visning.
        </span>
      </div>
      {people.length > 0 && (
        <select value={personId} onChange={(e) => setPersonId(e.target.value)} aria-label="Person" style={{ ...inputStyle, width: "auto", marginBottom: 14 }}>
          <option value="">Alle ({photos.length})</option>
          {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      )}
      {error && <div style={{ color: "var(--text-danger)", marginBottom: 12 }}>{error}</div>}
      {shown.length === 0 && <div style={{ color: "var(--text-secondary)" }}>Ingen bilder ennå.</div>}
      {shown.map((p) => (
        <Card key={p.id} style={{ marginBottom: 10, display: "flex", gap: 14, alignItems: "flex-start" }}>
          <a href={uploadUrl(p.file_path, token)} target="_blank" rel="noreferrer" style={{ flexShrink: 0 }}>
            <img
              src={uploadUrl(p.file_path, token)} alt="" loading="lazy" decoding="async"
              style={{ width: 96, height: 96, objectFit: "cover", borderRadius: "var(--radius-sm)", display: "block" }}
            />
          </a>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{p.user_name}</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>{formatWhen(p.created_at)}</div>
            {p.note && <div style={{ fontSize: 14, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{p.note}</div>}
          </div>
          <button
            onClick={() => remove(p)} aria-label="Slett bilde" title="Slett bilde"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4, flexShrink: 0 }}
          >
            <Trash2 size={16} />
          </button>
        </Card>
      ))}
    </div>
  );
}
