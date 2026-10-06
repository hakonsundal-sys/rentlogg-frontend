import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, Check, MessageSquare, AlertTriangle, Minus, WifiOff } from "lucide-react";
import { apiFetch } from "../../api";
import { queueableFetch, isNetworkError } from "../../offlineQueue";
import { Card } from "../shared";
import { useI18n } from "../../i18n";
import { PhotoStrip } from "./SubmissionDetail";
import { fmtNumber, fmtRange } from "./format";
import { saveDraft, deleteDraft, keys, localVerdict, parseNumber, newClientKey } from "./offlineDrafts";

// Filling in one checklist, in one of two modes:
//
//   Server draft (the normal case). The draft lives in simple_checklist_submissions and every tap is
//   saved straight away. When the signal drops mid-round, each save goes into the offline queue
//   (offlineQueue.js) instead of failing, and replays in order when the phone is back online — the
//   submit included. The screen keeps its own state either way.
//
//   Local draft (`initial.local`). The list was started with no connection at all, from the cached
//   copy of its items. Everything stays on the phone (offlineDrafts.js, IndexedDB — photos included)
//   until "Send inn", which sends the whole fill as ONE request to /:id/submit-complete through the
//   same queue. The server re-checks every rule and makes its own verdict on measurements.
//
// Three answers per item rather than a single tick: a non-cleaning checklist is usually a control
// ("is the fire exit clear?"), and "no, it wasn't" has to be recordable as such — with a reason —
// instead of being an unticked box nobody can tell apart from "forgot".
export default function ChecklistFill({ token, userId, initial, onBack, onSubmitted }) {
  const { t, tn } = useI18n();
  const isLocal = !!initial.local;
  const storeKey = isLocal ? keys.local(userId, initial.checklist_id) : keys.server(userId, initial.id);
  const [detail, setDetail] = useState(() => withPreviews(initial));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // True once anything had to be queued: the banner tells her it is saved, just not sent yet.
  const [offline, setOffline] = useState(isLocal);
  // Which items have their optional comment field open. A deviation always shows it.
  const [openComments, setOpenComments] = useState(() => new Set(initial.answers.filter((a) => a.comment).map((a) => a.id)));
  const [note, setNote] = useState(initial.note || "");
  // Saves still in flight. A comment is saved on blur, and tapping "Send inn" is what blurs it — so
  // submit has to wait for that save, or the server sees the deviation without its reason.
  const pending = useRef(new Set());

  // Keep a local copy of every change. For a local draft it is the only copy; for a server draft it
  // is what the screen falls back to if reopening it fails for lack of network.
  useEffect(() => {
    saveDraft(storeKey, { ...detail, note, photos: detail.photos.map(({ previewUrl, ...p }) => p) });
  }, [detail, note, storeKey]);

  const answered = detail.answers.filter((a) => a.status).length;
  const total = detail.answers.length;
  const remaining = total - answered;
  const unexplained = detail.answers.filter((a) => a.status === "deviation" && !a.comment?.trim()).length;
  // Same rule as the backend: a required photo, unless the item was marked "Ikke relevant".
  const missingPhotos = detail.answers.filter(
    (a) => a.requires_photo && a.status !== "na" && !detail.photos.some((p) => p.answer_id === a.id)
  ).length;
  const blocked = remaining > 0 || unexplained > 0 || missingPhotos > 0;

  function replaceAnswer(updated) {
    setDetail((d) => ({ ...d, answers: d.answers.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)) }));
  }

  function saveAnswer(answer, patch) {
    const p = doSaveAnswer(answer, patch);
    pending.current.add(p);
    p.finally(() => pending.current.delete(p));
    return p;
  }

  // What a patch does to an answer, worked out here so the screen is right before (or without) the
  // server's reply. For a measurement that means the local verdict preview.
  function applyPatch(answer, patch) {
    const next = { ...answer, ...patch };
    if ("measured_value" in patch) {
      const n = parseNumber(patch.measured_value);
      next.measured_value = n;
      next.status = n === null ? null : localVerdict(answer, n);
    }
    if ("status" in patch && answer.measure_unit) next.measured_value = null;
    return next;
  }

  async function doSaveAnswer(answer, patch) {
    setError("");
    if ("measured_value" in patch && Number.isNaN(parseNumber(patch.measured_value))) {
      setError(t("error.measurement_invalid"));
      return;
    }
    const before = answer;
    replaceAnswer(applyPatch(answer, patch)); // optimistic — a tap must feel instant on a slow line
    if (isLocal) return;
    try {
      const saved = await queueableFetch(`/simple-checklists/submissions/${detail.id}/answers/${answer.id}`, {
        token, method: "PATCH", body: JSON.stringify(patch),
      });
      if (saved?.queued) setOffline(true);
      else replaceAnswer(saved);
    } catch (err) {
      replaceAnswer(before);
      setError(err.message);
    }
  }

  function setStatus(answer, status) {
    // Tapping the chosen answer again clears it — the only way to undo a mis-tap.
    const next = answer.status === status ? null : status;
    saveAnswer(answer, { status: next });
  }

  function restOkLocally() {
    setDetail((d) => ({
      ...d,
      answers: d.answers.map((a) => (a.status === null && !a.measure_unit ? { ...a, status: "ok" } : a)),
    }));
  }

  async function restOk() {
    setError("");
    setBusy(true);
    try {
      // The response replaces every answer, so a comment still being saved must land first.
      await Promise.allSettled([...pending.current]);
      if (isLocal) return restOkLocally();
      const r = await queueableFetch(`/simple-checklists/submissions/${detail.id}/answer-rest-ok`, { token, method: "POST" });
      if (r?.queued) { setOffline(true); restOkLocally(); } else setDetail((d) => ({ ...withPreviews(r), photos: mergePhotos(r.photos, d.photos) }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhoto(file, answerId) {
    if (!file) return;
    setError("");
    const localPhoto = { id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, answer_id: answerId, file, previewUrl: URL.createObjectURL(file) };
    if (isLocal) {
      setDetail((d) => ({ ...d, photos: [...d.photos, { ...localPhoto, local: true }] }));
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      if (answerId) fd.append("answer_id", String(answerId));
      const photo = await queueableFetch(`/simple-checklists/submissions/${detail.id}/photos`, { token, method: "POST", body: fd });
      if (photo?.queued) {
        setOffline(true);
        // Shown from the phone until it is sent; it can't be removed before the server has it.
        setDetail((d) => ({ ...d, photos: [...d.photos, { ...localPhoto, queued: true }] }));
      } else {
        setDetail((d) => ({ ...d, photos: [...d.photos, photo] }));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deletePhoto(photo) {
    setError("");
    if (photo.local) {
      setDetail((d) => ({ ...d, photos: d.photos.filter((p) => p.id !== photo.id) }));
      return;
    }
    try {
      await apiFetch(`/simple-checklists/submissions/${detail.id}/photos/${photo.id}`, { token, method: "DELETE" });
      setDetail((d) => ({ ...d, photos: d.photos.filter((p) => p.id !== photo.id) }));
    } catch (err) {
      setError(isNetworkError(err) ? t("cleaner.noConnection") : err.message);
    }
  }

  async function saveNote() {
    if ((detail.note || "") === note) return;
    setDetail((d) => ({ ...d, note }));
    if (isLocal) return;
    try {
      const r = await queueableFetch(`/simple-checklists/submissions/${detail.id}`, { token, method: "PATCH", body: JSON.stringify({ note }) });
      if (r?.queued) setOffline(true);
    } catch (err) {
      setError(err.message);
    }
  }

  // A local draft goes in as one multipart request: the answers as JSON, every photo as a file field
  // named after its item. client_key makes a replay of the same request harmless.
  function buildCompleteForm() {
    const fd = new FormData();
    const itemOf = (answerId) => detail.answers.find((a) => a.id === answerId)?.item_id;
    fd.append("payload", JSON.stringify({
      client_key: detail.client_key,
      completed_at: new Date().toISOString(),
      note,
      answers: detail.answers.map((a) => ({
        item_id: a.item_id, label: a.label, status: a.status, comment: a.comment || "", measured_value: a.measured_value,
      })),
    }));
    detail.photos.forEach((p) => {
      const field = p.answer_id ? `photo_item_${itemOf(p.answer_id)}` : "photo_general";
      fd.append(field, p.file, p.file?.name || "bilde.jpg");
    });
    return fd;
  }

  async function submit() {
    setError("");
    setBusy(true);
    try {
      await Promise.allSettled([...pending.current]);
      await saveNote();
      const r = isLocal
        ? await queueableFetch(`/simple-checklists/${detail.checklist_id}/submit-complete`, { token, method: "POST", body: buildCompleteForm() })
        : await queueableFetch(`/simple-checklists/submissions/${detail.id}/submit`, { token, method: "POST" });
      await deleteDraft(storeKey);
      onSubmitted(r?.queued ? { ...detail, queued: true } : r);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    if (!window.confirm(t("sc.discardConfirm"))) return;
    if (isLocal) {
      await deleteDraft(storeKey);
      onBack();
      return;
    }
    try {
      await apiFetch(`/simple-checklists/submissions/${detail.id}`, { token, method: "DELETE" });
      await deleteDraft(storeKey);
      onBack();
    } catch (err) {
      setError(isNetworkError(err) ? t("cleaner.noConnection") : err.message);
    }
  }

  return (
    <div>
      <button onClick={onBack} style={backBtnStyle}>
        <ArrowLeft size={15} /> {t("sc.back")}
      </button>

      {offline && (
        <div style={{
          display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px", marginBottom: 12,
          borderRadius: "var(--radius)", background: "var(--c-amber)", color: "var(--text-primary)", fontSize: 13,
        }}>
          <WifiOff size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{t("sc.offline.filling")}</span>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{detail.checklist_name}</div>
        {detail.description && <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>{detail.description}</div>}
        <ProgressBar answered={answered} total={total} label={t("sc.progress", { answered, total })} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {detail.answers.map((a, i) => (
          <AnswerCard
            key={a.id}
            index={i}
            answer={a}
            photos={detail.photos.filter((p) => p.answer_id === a.id)}
            token={token}
            commentOpen={openComments.has(a.id) || a.status === "deviation"}
            onOpenComment={() => setOpenComments((s) => new Set(s).add(a.id))}
            onStatus={(status) => setStatus(a, status)}
            onComment={(comment) => saveAnswer(a, { comment })}
            onMeasure={(value) => saveAnswer(a, { measured_value: value })}
            onPhoto={(file) => uploadPhoto(file, a.id)}
            onDeletePhoto={deletePhoto}
          />
        ))}
      </div>

      {remaining > 0 && (
        <button onClick={restOk} disabled={busy} style={{ ...secondaryBtnStyle, width: "100%", marginTop: 12 }}>
          <Check size={16} /> {t("sc.allRestOk")}
        </button>
      )}

      <Card style={{ marginTop: 14 }}>
        <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>
          {t("sc.noteLabel")}
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={saveNote}
          rows={2}
          style={textareaStyle}
        />
        <PhotoStrip photos={detail.photos.filter((p) => !p.answer_id)} token={token} onDelete={deletePhoto} />
        <PhotoButton label={t("sc.photo.general")} onFile={(f) => uploadPhoto(f, null)} disabled={busy} style={{ marginTop: 10 }} />
      </Card>

      {error && <div style={{ color: "var(--text-danger)", marginTop: 12, fontSize: 14 }}>{error}</div>}

      <div style={{ marginTop: 14, fontSize: 13, color: "var(--text-secondary)", textAlign: "center", minHeight: 18 }}>
        {remaining > 0
          ? tn("sc.remaining", remaining)
          : unexplained > 0
            ? t("error.deviation_comment_required")
            : missingPhotos > 0
              ? t("sc.photo.missing", { count: missingPhotos })
              : ""}
      </div>
      <button
        onClick={submit}
        disabled={busy || blocked}
        style={{
          ...submitBtnStyle,
          opacity: busy || blocked ? 0.5 : 1,
          cursor: busy || blocked ? "default" : "pointer",
        }}
      >
        {busy ? t("sc.submitting") : t("sc.submit")}
      </button>
      <button onClick={discard} style={{ ...linkStyle, display: "block", margin: "14px auto 0" }}>
        {t("sc.discard")}
      </button>
    </div>
  );
}

// Photos kept on the phone (local drafts, queued uploads) carry their File; an object URL to show
// them has to be recreated after a reload, since URLs from the previous page are dead.
function withPreviews(d) {
  return {
    ...d,
    photos: (d.photos || []).map((p) => (p.file && !p.previewUrl ? { ...p, previewUrl: URL.createObjectURL(p.file) } : p)),
  };
}

// The server's photo list plus the ones still waiting in the queue, which it doesn't know about yet.
function mergePhotos(serverPhotos, current) {
  return [...serverPhotos, ...current.filter((p) => p.queued)];
}

function AnswerCard({ index, answer, photos, token, commentOpen, onOpenComment, onStatus, onComment, onMeasure, onPhoto, onDeletePhoto }) {
  const { t } = useI18n();
  const [comment, setComment] = useState(answer.comment || "");
  const isDeviation = answer.status === "deviation";
  const isMeasure = !!answer.measure_unit;

  return (
    <Card style={{
      padding: 14,
      borderColor: isDeviation ? "var(--border-danger)" : answer.status ? "var(--border)" : "var(--border)",
      background: isDeviation ? "var(--bg-danger)" : "var(--surface-1)",
    }}>
      <div style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.35 }}>
        <span style={{ color: "var(--text-secondary)", marginRight: 6 }}>{index + 1}.</span>
        {answer.label}
      </div>
      {answer.help_text && <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>{answer.help_text}</div>}

      {isMeasure ? (
        <MeasureInput answer={answer} onMeasure={onMeasure} onStatus={onStatus} />
      ) : (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 10 }}>
        <ChoiceButton active={answer.status === "ok"} kind="ok" onClick={() => onStatus("ok")}>
          <Check size={15} /> {t("sc.status.ok")}
        </ChoiceButton>
        <ChoiceButton active={isDeviation} kind="deviation" onClick={() => onStatus("deviation")}>
          <AlertTriangle size={15} /> {t("sc.status.deviation")}
        </ChoiceButton>
        <ChoiceButton active={answer.status === "na"} kind="na" onClick={() => onStatus("na")}>
          <Minus size={15} /> {t("sc.status.na")}
        </ChoiceButton>
      </div>
      )}

      {commentOpen ? (
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onBlur={() => { if ((answer.comment || "") !== comment) onComment(comment); }}
          placeholder={isDeviation ? t("sc.deviationPlaceholder") : t("sc.commentPlaceholder")}
          rows={2}
          style={{ ...textareaStyle, marginTop: 10, borderColor: isDeviation && !comment.trim() ? "var(--text-danger)" : "var(--border)" }}
        />
      ) : null}

      <PhotoStrip photos={photos} token={token} onDelete={onDeletePhoto} />
      {answer.requires_photo && answer.status !== "na" && photos.length === 0 ? (
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-warning)", marginTop: 8 }}>{t("sc.photo.required")}</div>
      ) : null}

      <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
        {!commentOpen && (
          <button onClick={onOpenComment} style={linkStyle}>
            <MessageSquare size={13} /> {t("sc.note")}
          </button>
        )}
        <PhotoButton label={t("sc.photo.add")} onFile={onPhoto} asLink />
      </div>
    </Card>
  );
}

// A measurement is answered with the number, not with OK/Avvik — the limit decides, on the server
// (the same verdict the rest of Rentlogg uses). "Ikke relevant" is still a choice the person makes.
// type="text" + inputMode="decimal", not type="number": Android's number pad eats the comma, and
// people type 3,5.
function MeasureInput({ answer, onMeasure, onStatus }) {
  const { t } = useI18n();
  const [value, setValue] = useState(fmtNumber(answer.measured_value));
  const range = fmtRange(answer, t);
  const hasLimit = !!range;
  const verdict = answer.measured_value === null || answer.measured_value === undefined
    ? null
    : answer.status === "deviation" ? "fail" : "pass";

  function commit() {
    const trimmed = value.trim();
    if (trimmed === fmtNumber(answer.measured_value)) return;
    onMeasure(trimmed === "" ? null : trimmed);
  }

  return (
    <div style={{ marginTop: 10 }}>
      {hasLimit && (
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
          {t("sc.measure.limit", { range })}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
        <div style={{ position: "relative", flex: 1 }}>
          <input
            type="text"
            inputMode="decimal"
            value={value}
            disabled={answer.status === "na"}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            placeholder={t("sc.measure.placeholder")}
            aria-label={t("sc.measure.placeholder")}
            style={{
              width: "100%", boxSizing: "border-box", minHeight: 44, padding: "8px 52px 8px 12px",
              borderRadius: "var(--radius)", fontSize: 18, fontWeight: 600, fontFamily: "inherit",
              border: `1.5px solid ${verdict === "fail" ? "var(--text-danger)" : verdict === "pass" ? "var(--text-success)" : "var(--border)"}`,
              background: "var(--surface-1)", color: "var(--text-primary)",
            }}
          />
          <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)", fontSize: 15 }}>
            {answer.measure_unit}
          </span>
        </div>
        <ChoiceButton active={answer.status === "na"} kind="na" onClick={() => { setValue(""); onStatus("na"); }}>
          <Minus size={15} /> {t("sc.status.na")}
        </ChoiceButton>
      </div>
      {verdict && (
        <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6, color: verdict === "fail" ? "var(--text-danger)" : "var(--text-success)" }}>
          {verdict === "fail" ? t("sc.measure.outside") : hasLimit ? t("sc.measure.within") : t("sc.measure.recorded")}
        </div>
      )}
    </div>
  );
}

function ChoiceButton({ active, kind, onClick, children }) {
  const palette = {
    ok: { color: "var(--text-success)", bg: "var(--text-success)" },
    deviation: { color: "var(--text-danger)", bg: "var(--text-danger)" },
    na: { color: "var(--text-secondary)", bg: "var(--text-secondary)" },
  }[kind];
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
        minHeight: 44, padding: "6px 4px", borderRadius: "var(--radius)", cursor: "pointer",
        fontSize: 13, fontWeight: 600, lineHeight: 1.15, textAlign: "center",
        border: `1.5px solid ${active ? palette.bg : "var(--border)"}`,
        background: active ? palette.bg : "var(--surface-1)",
        color: active ? "white" : palette.color,
      }}
    >
      {children}
    </button>
  );
}

function PhotoButton({ label, onFile, disabled, asLink, style }) {
  const input = useRef(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }}
      />
      <button
        onClick={() => input.current?.click()}
        disabled={disabled}
        style={asLink ? linkStyle : { ...secondaryBtnStyle, ...style }}
      >
        <Camera size={asLink ? 13 : 15} /> {label}
      </button>
    </>
  );
}

function ProgressBar({ answered, total, label }) {
  const pct = total ? Math.round((answered / total) * 100) : 0;
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ height: 6, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "var(--brand)", transition: "width 0.2s" }} />
      </div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>{label}</div>
    </div>
  );
}

const backBtnStyle = {
  display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none",
  color: "var(--brand-dark)", fontSize: 14, fontWeight: 500, cursor: "pointer", padding: "4px 0", marginBottom: 10,
};
const linkStyle = {
  display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none", padding: 0,
  color: "var(--brand-dark)", fontSize: 13, fontWeight: 500, cursor: "pointer",
};
const secondaryBtnStyle = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
  background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--radius-pill)",
  padding: "10px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer", color: "var(--text-primary)",
};
const submitBtnStyle = {
  width: "100%", background: "var(--brand)", color: "white", border: "none", borderRadius: "var(--radius-pill)",
  padding: "14px 16px", fontSize: 16, fontWeight: 700, marginTop: 6,
};
const textareaStyle = {
  width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: "var(--radius)",
  border: "1px solid var(--border)", background: "var(--surface-0)", color: "var(--text-primary)",
  fontSize: 14, fontFamily: "inherit", resize: "vertical",
};
