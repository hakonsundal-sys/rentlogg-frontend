import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, LogOut, ShieldCheck, AlertTriangle } from "lucide-react";
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
                {t("time.stampedInAt", { site: open.site_name, time: osloTime(open.started_at) })}
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
        display: "flex", gap: 16, flexWrap: "wrap", marginTop: 10, paddingTop: 10,
        borderTop: "1px solid var(--border)", fontSize: 12, color: "var(--text-secondary)",
      }}>
        <span>{t("time.todayTotal", { hours: formatMinutes(state.today_minutes) })}</span>
        <span>{t("time.monthTotal", { hours: formatMinutes(state.month_minutes) })}</span>
      </div>

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
