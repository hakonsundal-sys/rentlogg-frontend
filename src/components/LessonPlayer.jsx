import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { apiFetch } from "../api";
import { Card, Field, uploadUrl, inputStyle } from "./shared";
import { useT } from "../i18n";


// Plays a lesson as image + narration audio, one slide at a time, with the narration also written
// out underneath — a phone in a cold room with no headphones is the normal case, not the exception,
// and the text has to carry the lesson on its own when the sound doesn't.
//
// This is what "opplæringsvideo" means in Rentlogg: not an mp4, but slides plus per-language audio.
// It costs a tenth of the disk a video would on Render's 1 GB volume, a new language is a set of
// audio files rather than a re-rendered film, and — the part a video can't do — the app can tell
// which slides were actually watched, which is the whole claim the signature below rests on.

export default function LessonPlayer({ slides, record, token, user, onSigned }) {
  const t = useT();
  // Resumes where she left off. A cleaner's phone routinely discards the tab mid-task (see
  // App.jsx's sessionStorage note); progress lives on the record so it survives that, and a new
  // device, and a different shift.
  const [index, setIndex] = useState(() => Math.min(record.last_slide_index || 0, slides.length - 1));
  const [seen, setSeen] = useState(() => {
    // What the server already counted, restored as "the first N slides" — the exact identities
    // don't matter, only how many of them she has been through.
    const initial = new Set();
    for (let i = 0; i < (record.slides_seen || 0) && i < slides.length; i++) initial.add(i);
    initial.add(Math.min(record.last_slide_index || 0, slides.length - 1));
    return initial;
  });

  const slide = slides[index];
  const isLast = index === slides.length - 1;
  const allSeen = seen.size >= slides.length;

  // Saved on every slide change rather than only at the end. Failures are swallowed: she is mid-
  // lesson on whatever signal the building has, and an error toast here would help nobody — the
  // worst case is that she resumes a slide or two earlier next time.
  useEffect(() => {
    apiFetch(`/training/me/records/${record.id}/progress`, {
      token,
      method: "PATCH",
      body: JSON.stringify({ last_slide_index: index, slides_seen: seen.size }),
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, seen.size]);

  function go(next) {
    const clamped = Math.max(0, Math.min(slides.length - 1, next));
    setIndex(clamped);
    setSeen((prev) => new Set(prev).add(clamped));
  }

  return (
    <div>
      <Card style={{ marginTop: 10, padding: 0, overflow: "hidden" }}>
        {slide.image_path ? (
          <img
            src={uploadUrl(slide.image_path, token)}
            alt=""
            style={{ width: "100%", display: "block", background: "var(--surface-0)" }}
          />
        ) : (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-secondary)" }}>—</div>
        )}

        <div style={{ padding: 14 }}>
          {slide.audio_path && (
            <audio
              // Keyed on the slide so the element is replaced (and the new file loaded) rather than
              // keeping the previous slide's audio element with a swapped src, which leaves some
              // mobile browsers playing the old clip.
              key={slide.id}
              src={uploadUrl(slide.audio_path, token)}
              controls
              autoPlay
              onEnded={() => { if (!isLast) go(index + 1); }}
              style={{ width: "100%", marginBottom: 10 }}
            />
          )}
          {slide.narration_text && (
            <div style={{ fontSize: 15, lineHeight: 1.6 }}>{slide.narration_text}</div>
          )}
        </div>
      </Card>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 10 }}>
        <button
          onClick={() => go(index - 1)}
          disabled={index === 0}
          style={{
            display: "flex", alignItems: "center", gap: 4, background: "none",
            border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "10px 14px",
            fontSize: 14, cursor: index === 0 ? "default" : "pointer",
            color: index === 0 ? "var(--text-muted)" : "var(--text-primary)",
          }}
        >
          <ChevronLeft size={16} /> {t("training.previous")}
        </button>

        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          {t("training.slideOf", { current: index + 1, total: slides.length })}
        </div>

        <button
          onClick={() => go(index + 1)}
          disabled={isLast}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            background: isLast ? "none" : "var(--accent-orange)",
            color: isLast ? "var(--text-muted)" : "white",
            border: isLast ? "1px solid var(--border)" : "none",
            borderRadius: "var(--radius)", padding: "10px 14px", fontSize: 14,
            cursor: isLast ? "default" : "pointer",
          }}
        >
          {t("training.next")} <ChevronRight size={16} />
        </button>
      </div>

      {/* The signature only unlocks once every slide has been opened. The server enforces the same
          rule (see routes/training.js) — this is the friendly half of it, so she can see how many
          are left rather than being refused at the end with no explanation. */}
      <SignCard
        record={record}
        token={token}
        user={user}
        requiresSignature
        onSigned={onSigned}
        disabled={!allSeen}
        disabledReason={t("training.seenCount", { seen: seen.size, total: slides.length })}
      />
    </div>
  );
}

// --- Signing -------------------------------------------------------------------------------------

// Shared by the lesson player and the "read this document" flow. The name is prefilled from the
// account, exactly like the initials field a cleaner signs a room off with — it's a confirmation
// that she is the one doing this, not a password.
export function SignCard({ record, token, user, requiresSignature, onSigned, disabled, disabledReason }) {
  const t = useT();
  const [name, setName] = useState(user?.name || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await apiFetch(`/training/me/records/${record.id}/sign`, {
        token, method: "POST", body: JSON.stringify({ signed_initials: name.trim() }),
      });
      onSigned();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card style={{ marginTop: 10 }}>
      <form onSubmit={submit}>
        <div style={{ fontSize: 14, marginBottom: 10 }}>{t("training.signPrompt")}</div>
        <Field label={t("training.yourName")}>
          <input
            required={!!requiresSignature}
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
          />
        </Field>
        {disabled && disabledReason && (
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8 }}>{disabledReason}</div>
        )}
        {error && <div style={{ color: "var(--text-danger)", fontSize: 13, marginTop: 8 }}>{error}</div>}
        <button
          type="submit"
          disabled={saving || disabled}
          style={{
            marginTop: 12, width: "100%", background: disabled ? "var(--border)" : "var(--accent-orange)",
            color: disabled ? "var(--text-secondary)" : "white", border: "none", padding: "12px 20px",
            borderRadius: "var(--radius)", fontSize: 15, fontWeight: 600, cursor: disabled ? "default" : "pointer",
          }}
        >
          {saving ? "…" : t("training.sign")}
        </button>
      </form>
    </Card>
  );
}
