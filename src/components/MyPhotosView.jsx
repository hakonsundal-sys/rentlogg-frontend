import { useEffect, useRef, useState } from "react";
import { Camera, Trash2, Clock, Lock } from "lucide-react";
import { apiFetch } from "../api";
import { queueableFetch, subscribeQueue } from "../offlineQueue";
import { prepareImage } from "../imageResize";
import { useI18n } from "../i18n";
import { Card, uploadUrl } from "./shared";

// "Mine bilder": photos a cleaner keeps for herself, to document something that only she and the
// administrators should see. They are not part of any visit or report and never reach the customer —
// see services/personalPhotos.js on the backend, which is also what enforces it.
function formatWhen(createdAt, language) {
  if (!createdAt) return "";
  const date = new Date(`${String(createdAt).replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return createdAt;
  return new Intl.DateTimeFormat(language || "nb", {
    timeZone: "Europe/Oslo", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

export default function MyPhotosView({ token }) {
  const { t, language } = useI18n();
  const [photos, setPhotos] = useState(null);
  const [pending, setPending] = useState([]); // queued while offline: { tempId, previewUrl, note }
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  async function load() {
    try {
      setPhotos(await apiFetch("/my-photos", { token }));
    } catch (err) {
      setError(err.message);
      setPhotos((current) => current ?? []);
    }
  }

  useEffect(() => {
    load();
    // A photo that was queued without a connection is sent later; when it has gone, fetch the list again
    // and drop its placeholder.
    return subscribeQueue((event) => {
      if (event.type === "success") {
        setPending((list) => list.filter((p) => p.tempId !== event.tempId));
        load();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function onPick(e) {
    const picked = e.target.files[0];
    e.target.value = "";
    if (!picked) return;
    setError("");
    setUploading(true);
    try {
      const file = await prepareImage(picked);
      const form = new FormData();
      form.append("photo", file);
      if (note.trim()) form.append("note", note.trim());
      const result = await queueableFetch("/my-photos", { token, method: "POST", body: form });
      if (result.queued) {
        setPending((list) => [...list, { tempId: result.tempId, previewUrl: URL.createObjectURL(file), note: note.trim() }]);
      } else {
        setPhotos((list) => [result, ...(list || [])]);
      }
      setNote("");
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function remove(photo) {
    if (!window.confirm(t("cleaner.confirmRemovePhoto"))) return;
    try {
      await apiFetch(`/my-photos/${photo.id}`, { token, method: "DELETE" });
      setPhotos((list) => (list || []).filter((p) => p.id !== photo.id));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, color: "var(--text-secondary)", fontSize: 13, marginBottom: 12 }}>
          <Lock size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{t("myPhotos.intro")}</span>
        </div>
        <textarea
          value={note} onChange={(e) => setNote(e.target.value)} maxLength={500}
          placeholder={t("myPhotos.notePlaceholder")}
          style={{
            width: "100%", minHeight: 50, padding: 8, borderRadius: "var(--radius)", border: "1px solid var(--border)",
            background: "var(--surface-0)", color: "var(--text-primary)", fontSize: 13, resize: "vertical", boxSizing: "border-box",
          }}
        />
        <input ref={fileRef} type="file" accept="image/*" onChange={onPick} style={{ display: "none" }} />
        <button
          onClick={() => fileRef.current.click()} disabled={uploading}
          style={{
            display: "flex", alignItems: "center", gap: 6, justifyContent: "center", width: "100%", marginTop: 10,
            background: "var(--surface-0)", border: "1px solid var(--border)", padding: 12, borderRadius: "var(--radius)",
            fontSize: 14, cursor: uploading ? "default" : "pointer", opacity: uploading ? 0.6 : 1,
          }}
        >
          <Camera size={16} /> {uploading ? t("cleaner.uploading") : t("cleaner.takePhoto")}
        </button>
        {error && <div style={{ color: "var(--text-danger)", fontSize: 13, marginTop: 10 }}>{error}</div>}
      </Card>

      {pending.map((p) => (
        <PhotoRow key={p.tempId} src={p.previewUrl} dim title={t("cleaner.photoPending")} note={p.note} when={<Clock size={13} />} />
      ))}
      {photos && photos.length === 0 && pending.length === 0 && (
        <div style={{ color: "var(--text-secondary)", fontSize: 14, textAlign: "center", padding: 24 }}>{t("myPhotos.empty")}</div>
      )}
      {(photos || []).map((p) => (
        <PhotoRow
          key={p.id} src={uploadUrl(p.file_path, token)} href={uploadUrl(p.file_path, token)}
          note={p.note} when={formatWhen(p.created_at, language)}
          onRemove={() => remove(p)} removeLabel={t("cleaner.removePhoto")}
        />
      ))}
    </div>
  );
}

function PhotoRow({ src, href, dim, title, note, when, onRemove, removeLabel }) {
  const image = (
    <img
      src={src} alt="" loading="lazy" decoding="async" title={title}
      style={{ width: 84, height: 84, objectFit: "cover", borderRadius: "var(--radius-sm)", opacity: dim ? 0.55 : 1, display: "block" }}
    />
  );
  return (
    <Card style={{ marginBottom: 10, display: "flex", gap: 12, alignItems: "flex-start" }}>
      {href ? <a href={href} target="_blank" rel="noreferrer" style={{ flexShrink: 0 }}>{image}</a> : <div style={{ flexShrink: 0 }}>{image}</div>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>{when}</div>
        {note && <div style={{ fontSize: 14, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{note}</div>}
      </div>
      {onRemove && (
        <button
          onClick={onRemove} aria-label={removeLabel} title={removeLabel}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4, flexShrink: 0 }}
        >
          <Trash2 size={16} />
        </button>
      )}
    </Card>
  );
}
