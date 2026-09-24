import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, LogOut, ShieldCheck, AlertTriangle, Plus, X } from "lucide-react";
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
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [showAddHours, setShowAddHours] = useState(false);
  const [saved, setSaved] = useState("");
  const [stoppingOut, setStoppingOut] = useState(false);
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

  async function stampOut() {
    if (!state?.open) return;
    setStoppingOut(true);
    setError("");
    try {
      const position = await getPosition();
      await apiFetch(`/time/entries/${state.open.id}/stop`, {
        token, method: "POST", body: JSON.stringify(position || {}),
      });
      load();
    } catch (err) {
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
            onClick={stampOut}
            disabled={stoppingOut}
            style={{
              display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
              background: "var(--accent-orange)", color: "white", border: "none",
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
            color: "var(--accent-orange-dark)", fontSize: 12, fontWeight: 600,
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
          background: "var(--accent-orange-bg)", borderRadius: "var(--radius)", fontSize: 12,
        }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1, color: "var(--accent-orange-dark)" }} />
          <div>
            <div style={{ fontWeight: 600, color: "var(--accent-orange-dark)" }}>
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
            background: "var(--accent-orange)", color: "white", fontSize: 14, fontWeight: 600,
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
