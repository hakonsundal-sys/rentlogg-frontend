import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, Coffee, LogOut, ShieldCheck, AlertTriangle, Plus, X } from "lucide-react";
import { apiFetch } from "../api";
import { Card } from "./shared";
import { useI18n } from "../i18n";

// The cleaner's half of the Timeregistrering module: what she is stamped into right now, and the
// one button that stamps her out. Stamping IN has no button at all — it happens on the QR scan she
// already does (see the backend's POST /sites/checkin/:qrToken), so the only new thing she has to
// remember at the end of a shift is this.
//
// Its own component rather than more of CleanerView (already 70 kB) and because it renders in two
// places there: on the "skann QR-kode" screen, where somebody who has walked out still needs to
// stamp out, and inside an open visit.

function osloTime(stamp) {
  if (!stamp) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(`${String(stamp).replace(" ", "T")}Z`));
}

// The hour/minute suffixes are translated ("2t 00m" / "2h 00m" / "2 ч 00 мин"), unlike the admin
// side, which is Norwegian-only — this card is read by the people the localization pass is for.
function useDuration() {
  const { t } = useI18n();
  return (minutes) => {
    const abs = Math.max(0, minutes || 0);
    return t("time.duration", { h: Math.floor(abs / 60), m: String(abs % 60).padStart(2, "0") });
  };
}

// A break is minutes, not hours: "45 min" rather than the duration formatter's "0t 45m".
function usePauseDuration() {
  const { t } = useI18n();
  const formatMinutes = useDuration();
  return (minutes) => (minutes < 60 ? t("time.pauseMinutes", { minutes }) : formatMinutes(minutes));
}

function minutesSince(stamp) {
  return Math.max(0, Math.round((Date.now() - new Date(`${String(stamp).replace(" ", "T")}Z`)) / 60000));
}

function getPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000 }
    );
  });
}

export default function TimeClockCard({ token, refreshKey }) {
  const { t, tn } = useI18n();
  const formatMinutes = useDuration();
  const formatPause = usePauseDuration();
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [showAddHours, setShowAddHours] = useState(false);
  const [saved, setSaved] = useState("");
  const [stoppingOut, setStoppingOut] = useState(false);
  const [askingPause, setAskingPause] = useState(false);
  // Re-rendered once a minute purely so a running shift's counter keeps up without a round-trip;
  // the number itself is derived from started_at, never accumulated, so a discarded tab (the whole
  // reason App.jsx persists auth at all) can't make it drift.
  const [, setTick] = useState(0);
  const timerRef = useRef(null);

  const load = useCallback(() => {
    apiFetch("/time/me/current", { token })
      .then(setState)
      // Silent: this card sits above the screen a cleaner checks in from every morning, and a dead
      // signal there should not produce an error banner on top of her actual work.
      .catch(() => {});
  }, [token]);

  useEffect(load, [load, refreshKey]);

  useEffect(() => {
    timerRef.current = setInterval(() => setTick((n) => n + 1), 60000);
    return () => clearInterval(timerRef.current);
  }, []);

  async function stampOut(pauseMinutes) {
    if (!state?.open) return;
    setStoppingOut(true);
    setError("");
    try {
      const position = await getPosition();
      const entry = await apiFetch(`/time/entries/${state.open.id}/stop`, {
        token, method: "POST", body: JSON.stringify({ ...(position || {}), pause_minutes: pauseMinutes || 0 }),
      });
      setAskingPause(false);
      // Say back what was recorded. The pause answer is one tap and it moves her pay, so the
      // screen has to show what that tap did — a mistap otherwise leaves no trace she would ever
      // notice. It also carries the one surprise worth explaining: on a site paid by a fixed
      // frame, the break came off nothing.
      setSaved(
        entry.pause_minutes > 0
          ? t(entry.billing_mode === "fixed" ? "time.stampedOutPauseFixed" : "time.stampedOutPause", {
              hours: formatMinutes(entry.minutes), pause: formatPause(entry.pause_minutes),
            })
          : t("time.stampedOut", { hours: formatMinutes(entry.minutes) })
      );
      load();
    } catch (err) {
      // Left on the pause question on purpose. The shift is still open, so nothing is lost — she
      // just gave a break that doesn't fit inside it and needs to give another.
      setError(err.message);
    } finally {
      setStoppingOut(false);
    }
  }

  // Nothing fetched yet, or the company doesn't have the module (in which case the caller wouldn't
  // have rendered this at all) — render nothing rather than an empty shell.
  if (!state) return null;

  const open = state.open;
  const missingCount = state.missing?.length || 0;

  if (askingPause && open) {
    return (
      <Card style={{ marginBottom: 12 }}>
        <PauseQuestion
          busy={stoppingOut}
          error={error}
          maxMinutes={minutesSince(open.started_at)}
          onAnswer={stampOut}
          onCancel={() => { setAskingPause(false); setError(""); }}
        />
      </Card>
    );
  }

  if (showAddHours) {
    return (
      <AddHoursForm
        token={token}
        onClose={() => setShowAddHours(false)}
        onSaved={(entry) => {
          setShowAddHours(false);
          const registered = entry.lines?.[0]?.minutes ?? entry.minutes;
          setSaved(t("time.hoursSaved", { hours: formatMinutes(registered), order: entry.order_name }));
          load();
        }}
      />
    );
  }

  return (
    <Card style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-secondary)" }}>
            <Clock size={14} /> {t("time.title")}
          </div>
          {open ? (
            <>
              <div style={{ fontSize: 20, fontWeight: 600, marginTop: 4 }}>
                {formatMinutes(minutesSince(open.started_at))}
              </div>
              <div style={{ fontSize: 13, marginTop: 2 }}>
                {t("time.stampedInAt", { site: open.site_name || open.order_name || "—", time: osloTime(open.started_at) })}
              </div>
              {open.start_gps_verified && (
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text-success)", marginTop: 4 }}>
                  <ShieldCheck size={13} /> {t("time.gpsVerified")}
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ fontSize: 16, fontWeight: 500, marginTop: 4 }}>{t("time.notStamped")}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2, lineHeight: 1.5 }}>
                {t("time.notStampedHint")}
              </div>
            </>
          )}
        </div>
        {open && (
          <button
            onClick={() => { setAskingPause(true); setError(""); }}
            disabled={stoppingOut}
            style={{
              display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
              background: "var(--brand)", color: "white", border: "none",
              padding: "10px 16px", borderRadius: "var(--radius)", fontSize: 14, fontWeight: 600,
              cursor: stoppingOut ? "default" : "pointer", opacity: stoppingOut ? 0.6 : 1,
            }}
          >
            <LogOut size={15} /> {stoppingOut ? t("time.stampingOut") : t("time.stampOut")}
          </button>
        )}
      </div>

      <div style={{
        display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", marginTop: 10, paddingTop: 10,
        borderTop: "1px solid var(--border)", fontSize: 12, color: "var(--text-secondary)",
      }}>
        <span>{t("time.todayTotal", { hours: formatMinutes(state.today_minutes) })}</span>
        <span>{t("time.monthTotal", { hours: formatMinutes(state.month_minutes) })}</span>
        <button
          onClick={() => { setShowAddHours(true); setSaved(""); }}
          style={{
            marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5,
            background: "none", border: "none", padding: 0, cursor: "pointer",
            color: "var(--brand-dark)", fontSize: 12, fontWeight: 600,
          }}
        >
          <Plus size={13} /> {t("time.addHours")}
        </button>
      </div>

      {saved && (
        <div style={{
          marginTop: 10, padding: "8px 10px", borderRadius: "var(--radius)",
          background: "var(--c-teal)", color: "var(--text-success)", fontSize: 12,
        }}>
          {saved}
        </div>
      )}

      {/* Shown to her, not only to the admin: the person who forgot to stamp out is the only one
          who still remembers when she actually left. She can't fix it herself — inventing an
          evening departure time is inventing payroll — so this tells her who can. */}
      {missingCount > 0 && (
        <div style={{
          display: "flex", gap: 8, alignItems: "flex-start", marginTop: 10, padding: "8px 10px",
          background: "var(--brand-bg)", borderRadius: "var(--radius)", fontSize: 12,
        }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1, color: "var(--brand-dark)" }} />
          <div>
            <div style={{ fontWeight: 600, color: "var(--brand-dark)" }}>
              {tn("time.missingCheckout", missingCount)}
            </div>
            <div style={{ color: "var(--text-secondary)", marginTop: 2, lineHeight: 1.5 }}>
              {state.missing.map((m) => `${m.work_date} · ${m.site_name}`).join(", ")}
            </div>
            <div style={{ color: "var(--text-secondary)", marginTop: 2, lineHeight: 1.5 }}>
              {t("time.missingCheckoutHint")}
            </div>
          </div>
        </div>
      )}

      {error && <div style={{ color: "var(--text-danger)", fontSize: 12, marginTop: 8 }}>{error}</div>}
    </Card>
  );
}

// Asked once, when she stamps out — not a button she presses twice during the shift.
//
// A pause button is the obvious design and the wrong one here: it only works if she remembers to
// end it, and a break left running quietly eats the rest of her shift. Shifts here start at four in
// the morning in a cold building, and the cost of forgetting is hours off her own pay. Asking at
// the end costs one extra tap and cannot be forgotten, because she cannot stamp out without
// answering (Håkon's call, 2026-09-24).
//
// No preselected answer. A default here is a guess about somebody's pay.
const PAUSE_PRESETS = [0, 30];

function PauseQuestion({ busy, error, maxMinutes, onAnswer, onCancel }) {
  const { t } = useI18n();
  const formatPause = usePauseDuration();
  const [custom, setCustom] = useState(null);
  const customMinutes = Math.round(Number(String(custom ?? "").replace(",", ".")) || 0);
  // The backend refuses a break that doesn't fit inside the shift. She should never meet that
  // refusal: an option that cannot be right isn't offered, and a typed one says so before she taps.
  const tooLong = customMinutes >= maxMinutes;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-secondary)" }}>
        <Coffee size={14} /> {t("time.pauseTitle")}
      </div>
      <div style={{ fontSize: 17, fontWeight: 600, marginTop: 6 }}>{t("time.pauseQuestion")}</div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2, lineHeight: 1.5 }}>
        {t("time.pauseHint")}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        {PAUSE_PRESETS.filter((minutes) => minutes === 0 || minutes < maxMinutes).map((minutes) => (
          <button
            key={minutes}
            onClick={() => onAnswer(minutes)}
            disabled={busy}
            style={{ ...pauseChoiceStyle, opacity: busy ? 0.6 : 1 }}
          >
            {minutes === 0 ? t("time.pauseNone") : t("time.pauseMinutes", { minutes })}
          </button>
        ))}
        {custom === null && (
          <button onClick={() => setCustom("")} disabled={busy} style={{ ...pauseChoiceStyle, opacity: busy ? 0.6 : 1 }}>
            {t("time.pauseOther")}
          </button>
        )}
      </div>

      {custom !== null && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            autoFocus
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder={t("time.pauseOtherPlaceholder")}
            style={{
              width: 90, padding: "10px 12px", fontSize: 15, borderRadius: "var(--radius)",
              border: "1px solid var(--border)", background: "var(--surface-1)", color: "var(--text-primary)",
            }}
          />
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{t("time.pauseUnit")}</span>
          <button
            onClick={() => onAnswer(customMinutes)}
            disabled={busy || !(customMinutes > 0) || tooLong}
            style={{
              marginLeft: "auto", background: "var(--brand)", color: "white", border: "none",
              padding: "10px 16px", borderRadius: "var(--radius)", fontSize: 14, fontWeight: 600,
              cursor: busy || !(customMinutes > 0) || tooLong ? "default" : "pointer",
              opacity: busy || !(customMinutes > 0) || tooLong ? 0.5 : 1,
            }}
          >
            {t("time.stampOut")}
          </button>
        </div>
      )}

      {custom !== null && customMinutes > 0 && tooLong && (
        <div style={{ color: "var(--text-danger)", fontSize: 12, marginTop: 8 }}>
          {t("time.pauseTooLong", { hours: formatPause(maxMinutes) })}
        </div>
      )}

      {error && <div style={{ color: "var(--text-danger)", fontSize: 12, marginTop: 10 }}>{error}</div>}

      <button
        onClick={onCancel}
        disabled={busy}
        style={{
          marginTop: 12, background: "none", border: "none", padding: 0, cursor: "pointer",
          color: "var(--text-secondary)", fontSize: 13,
        }}
      >
        {t("time.pauseCancel")}
      </button>
    </div>
  );
}

const pauseChoiceStyle = {
  flex: "1 1 auto", minWidth: 96, padding: "14px 12px", fontSize: 15, fontWeight: 600,
  background: "var(--surface-1)", color: "var(--text-primary)",
  border: "1px solid var(--border)", borderRadius: "var(--radius)", cursor: "pointer",
};

// "Før timer" — the hours that have no building to stand in: a staff meeting, driving between
// sites, a day of holiday or sick leave. Until orders existed a cleaner could not record any of
// it, because there was no QR code to scan for it.
//
// Only orders the company marked as bookable by hand appear here. A customer site is not one of
// them: those hours come from actually being there, which is what the scan is for.
function AddHoursForm({ token, onClose, onSaved }) {
  const { t } = useI18n();
  const [orders, setOrders] = useState([]);
  const [types, setTypes] = useState([]);
  const [form, setForm] = useState({
    order_id: "", time_type_id: "", work_date: osloToday(), start_time: "", end_time: "", hours: "", note: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/time/orders", { token })
      .then((list) => {
        setOrders(list);
        if (list.length === 1) setForm((f) => ({ ...f, order_id: list[0].id }));
      })
      .catch((err) => setError(err.message));
    apiFetch("/time/types", { token })
      .then((list) => setTypes(list.filter((x) => x.kind === "hours")))
      .catch(() => {});
  }, [token]);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const saved = await apiFetch("/time/me/entries", {
        token, method: "POST",
        body: JSON.stringify({
          order_id: Number(form.order_id),
          time_type_id: form.time_type_id ? Number(form.time_type_id) : null,
          work_date: form.work_date,
          start_time: form.start_time,
          end_time: form.end_time || "",
          hours: form.hours,
          note: form.note,
        }),
      });
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  const selectStyle = {
    width: "100%", padding: "10px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border)",
    background: "var(--surface-0)", color: "var(--text-primary)", fontSize: 15, boxSizing: "border-box",
  };

  return (
    <Card style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 600 }}>
          <Plus size={16} /> {t("time.addHours")}
        </div>
        <button onClick={onClose} aria-label={t("time.cancel")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4 }}>
          <X size={18} />
        </button>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12, lineHeight: 1.5 }}>
        {t("time.addHoursHint")}
      </div>

      <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          {t("time.order")}
          <select required value={form.order_id} onChange={(e) => set("order_id", e.target.value)} style={{ ...selectStyle, marginTop: 4 }}>
            <option value="">—</option>
            {orders.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>

        {types.length > 0 && (
          <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {t("time.type")}
            <select value={form.time_type_id} onChange={(e) => set("time_type_id", e.target.value)} style={{ ...selectStyle, marginTop: 4 }}>
              <option value="">—</option>
              {types.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
        )}

        <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          {t("time.date")}
          <input required type="date" value={form.work_date} onChange={(e) => set("work_date", e.target.value)} style={{ ...selectStyle, marginTop: 4 }} />
        </label>

        <div style={{ display: "flex", gap: 10 }}>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", flex: 1 }}>
            {t("time.fromTime")}
            <input required type="time" value={form.start_time} onChange={(e) => set("start_time", e.target.value)} style={{ ...selectStyle, marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", flex: 1 }}>
            {t("time.toTime")}
            <input type="time" value={form.end_time} onChange={(e) => set("end_time", e.target.value)} style={{ ...selectStyle, marginTop: 4 }} />
          </label>
        </div>

        {/* A sick day is "7,5 timer", not a clock reading — asking for an end time she never looked
            at would only get an invented one. Goes dead once she does give one. */}
        <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          {t("time.hoursAmount")}
          <input
            inputMode="decimal" value={form.hours} disabled={!!form.end_time}
            onChange={(e) => set("hours", e.target.value)} placeholder="7,5"
            style={{ ...selectStyle, marginTop: 4, opacity: form.end_time ? 0.5 : 1 }}
          />
        </label>
        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: -6 }}>{t("time.hoursAmountHint")}</div>

        <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          {t("time.noteLabel")}
          <input value={form.note} onChange={(e) => set("note", e.target.value)} placeholder={t("time.notePlaceholder")} style={{ ...selectStyle, marginTop: 4 }} />
        </label>

        {error && <div style={{ color: "var(--text-danger)", fontSize: 13 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={onClose} style={{
            flex: 1, padding: "12px", borderRadius: "var(--radius)", border: "1px solid var(--border)",
            background: "var(--surface-0)", color: "var(--text-primary)", fontSize: 14, cursor: "pointer",
          }}>
            {t("time.cancel")}
          </button>
          <button type="submit" disabled={saving} style={{
            flex: 2, padding: "12px", borderRadius: "var(--radius)", border: "none",
            background: "var(--brand)", color: "white", fontSize: 14, fontWeight: 600,
            cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1,
          }}>
            {saving ? t("time.savingHours") : t("time.saveHours")}
          </button>
        </div>
      </form>
    </Card>
  );
}

function osloToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" }).format(new Date());
}
