import { useEffect, useState } from "react";
import { CheckCircle2, ChevronRight, AlertTriangle, Clock, WifiOff, CloudUpload } from "lucide-react";
import { apiFetch } from "../../api";
import { isNetworkError, subscribeQueue, useQueueStatus } from "../../offlineQueue";
import { saveDraft, loadDraft, listDrafts, clearAllDrafts, keys, newClientKey } from "./offlineDrafts";
import { Card, Loading, TabButton } from "../shared";
import { useI18n } from "../../i18n";
import ChecklistFill from "./ChecklistFill";
import SubmissionDetail from "./SubmissionDetail";
import { addDays, fmtDate, fmtTime, LOCALE_BY_LANGUAGE, todayOslo, weekdayShort, WEEK_ORDER } from "./format";

// Which draft is open, so a phone that discards the tab mid-round (camera open, screen locked)
// lands back in the same checklist instead of on the start page. sessionStorage for the same
// reasons App.jsx keeps the login there: gone when the tab closes, never shared across tabs.
const OPEN_KEY = "rentlogg_sc_open";

export function clearChecklistContext() {
  try {
    sessionStorage.removeItem(OPEN_KEY);
  } catch {
    // storage unavailable — nothing was persisted either
  }
  // A shared work phone: the next person must not find the previous one's drafts or cached lists.
  clearAllDrafts();
}

function rememberOpen(id) {
  try {
    if (id) sessionStorage.setItem(OPEN_KEY, String(id));
    else sessionStorage.removeItem(OPEN_KEY);
  } catch {
    // storage unavailable — resuming after a reload just won't happen
  }
}

function storedOpen() {
  try {
    return sessionStorage.getItem(OPEN_KEY);
  } catch {
    return null;
  }
}

// The employee's side of the Sjekklister module: today's lists, and the log.
export default function ChecklistEmployeeView({ token, user, pendingQrToken, onQrHandled }) {
  const { t, tn } = useI18n();
  const userId = user?.id ?? "anon";
  const { pendingCount, flushNow } = useQueueStatus();
  // A queued request the server turned down when it was finally sent (e.g. the login had expired).
  // Shown until dismissed — this is the one way offline work can be lost, so it must not flash past.
  const [queueFailure, setQueueFailure] = useState(null);
  // When the queue gets something through, the start page is stale (still says "not done", still
  // shows the offline copy) — reload it, and drop the "will be sent" note, which is no longer true.
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => subscribeQueue((e) => {
    if (e.type === "failed") setQueueFailure(e.error);
    if (e.type === "success") {
      setRefreshKey((k) => k + 1);
      setJustSubmitted((s) => (s?.queued ? null : s));
    }
  }), []);
  const [tab, setTab] = useState("today");
  const [filling, setFilling] = useState(null); // the draft being filled in
  const [justSubmitted, setJustSubmitted] = useState(null);
  const [error, setError] = useState("");

  // Resume a draft the phone threw away. A draft that no longer exists (submitted from elsewhere,
  // discarded) just falls back to the start page.
  useEffect(() => {
    const id = storedOpen();
    if (!id) return;
    if (String(id).startsWith("local:")) {
      loadDraft(id).then((d) => (d ? setFilling(d) : rememberOpen(null)));
      return;
    }
    apiFetch(`/simple-checklists/submissions/${id}`, { token })
      .then((d) => (d.submitted_at ? rememberOpen(null) : setFilling(d)))
      .catch(async (err) => {
        // No signal: reopen what the phone last saw of this draft rather than losing the screen.
        const copy = isNetworkError(err) ? await loadDraft(keys.server(userId, id)) : null;
        if (copy) setFilling(copy);
        else rememberOpen(null);
      });
  }, [token]);

  // A scanned list QR: resolve it and open the list. Runs once per token; the URL parameter is
  // cleared either way, so a reload doesn't reopen it.
  useEffect(() => {
    if (!pendingQrToken) return;
    apiFetch(`/simple-checklists/by-qr/${encodeURIComponent(pendingQrToken)}`, { token })
      .then((r) => start({ id: r.id }))
      .catch((err) => setError(err.message))
      .finally(() => onQrHandled?.());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingQrToken]);

  async function start(list) {
    setError("");
    setJustSubmitted(null);
    // A list already being filled in offline continues there, connection or not.
    const localKey = keys.local(userId, list.id);
    const local = await loadDraft(localKey);
    if (local) return open(local, localKey);
    try {
      const draft = await apiFetch(`/simple-checklists/${list.id}/start`, { token, method: "POST" });
      open(draft, draft.id);
    } catch (err) {
      if (!isNetworkError(err)) return setError(err.message);
      // No connection: start from the cached copy of the list's items, if the phone has one.
      const items = list.items || (await loadDraft(keys.today(userId)))?.lists?.find((l) => l.id === list.id)?.items;
      if (!items?.length) return setError(t("sc.offline.noCopy"));
      const draft = {
        local: true,
        client_key: newClientKey(),
        checklist_id: list.id,
        checklist_name: list.name,
        description: list.description || null,
        started_at: new Date().toISOString(),
        note: "",
        photos: [],
        answers: items.map((it) => ({
          id: `l${it.id}`, item_id: it.id, label: it.label, help_text: it.help_text,
          measure_unit: it.measure_unit, measure_min: it.measure_min, measure_max: it.measure_max,
          requires_photo: it.requires_photo, status: null, comment: null, measured_value: null,
        })),
      };
      await saveDraft(localKey, draft);
      open(draft, localKey);
    }
  }

  function open(draft, rememberKey) {
    rememberOpen(rememberKey);
    setFilling(draft);
    window.scrollTo(0, 0);
  }

  function closeFill() {
    rememberOpen(null);
    setFilling(null);
  }

  if (filling) {
    return (
      <ChecklistFill
        key={filling.id || filling.client_key}
        token={token}
        userId={userId}
        initial={filling}
        onBack={closeFill}
        onSubmitted={(done) => {
          closeFill();
          setJustSubmitted(done);
          window.scrollTo(0, 0);
        }}
      />
    );
  }

  return (
    <div>
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)", marginBottom: 16 }}>
        <TabButton active={tab === "today"} onClick={() => setTab("today")}>{t("sc.tab.today")}</TabButton>
        <TabButton active={tab === "log"} onClick={() => setTab("log")}>{t("sc.tab.log")}</TabButton>
      </div>
      {error && <div style={{ color: "var(--text-danger)", marginBottom: 12 }}>{error}</div>}
      {pendingCount > 0 && (
        <Card style={{ marginBottom: 12, background: "var(--c-amber)", borderColor: "transparent", padding: 12 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
            <CloudUpload size={18} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{tn("cleaner.offline.pending", pendingCount)}</span>
            <button onClick={flushNow} style={{ background: "none", border: "none", color: "var(--brand-dark)", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
              {t("cleaner.offline.retryNow")}
            </button>
          </div>
        </Card>
      )}
      {queueFailure && (
        <Card style={{ marginBottom: 12, background: "var(--bg-danger)", borderColor: "var(--border-danger)", padding: 12 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14, color: "var(--text-danger)" }}>
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{t("cleaner.queuedChangeFailed", { error: queueFailure })}</span>
            <button onClick={() => setQueueFailure(null)} aria-label="OK" style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 700, color: "var(--text-danger)" }}>×</button>
          </div>
        </Card>
      )}
      {tab === "today" ? (
        <TodayList token={token} userId={userId} onStart={start} justSubmitted={justSubmitted} refreshKey={refreshKey} />
      ) : (
        <EmployeeLog token={token} />
      )}
    </div>
  );
}

function TodayList({ token, userId, onStart, justSubmitted, refreshKey }) {
  const { t, tn, language } = useI18n();
  const locale = LOCALE_BY_LANGUAGE[language] || "nb-NO";
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  // Set when the lists shown are the phone's cached copy: when that copy was taken.
  const [cachedAt, setCachedAt] = useState(null);
  const [localDrafts, setLocalDrafts] = useState(new Map());

  useEffect(() => {
    // With the items, so the phone has everything it needs to start a list in a basement later.
    apiFetch("/simple-checklists/today?with_items=1", { token })
      .then((d) => {
        setData(d);
        setError("");
        setCachedAt(null);
        saveDraft(keys.today(userId), { ...d, cachedAt: new Date().toISOString() });
      })
      .catch(async (err) => {
        const copy = isNetworkError(err) ? await loadDraft(keys.today(userId)) : null;
        if (copy) {
          setData(copy);
          setCachedAt(copy.cachedAt);
        } else {
          setError(isNetworkError(err) ? t("sc.offline.noCopy") : err.message);
        }
      });
    listDrafts(keys.localPrefix(userId)).then((rows) =>
      setLocalDrafts(new Map(rows.filter((r) => r.value).map((r) => [r.value.checklist_id, r.value])))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, justSubmitted, refreshKey]);

  if (error) return <div style={{ color: "var(--text-danger)" }}>{error}</div>;
  if (!data) return <Loading />;

  const today = data.lists.filter((l) => l.due_today);
  const thisMonth = data.lists.filter((l) => l.due_this_month);
  const onDemand = data.lists.filter((l) => l.on_demand);
  const other = data.lists.filter((l) => !l.due_today && !l.on_demand && !l.due_this_month);

  function card(list) {
    const last = list.submissions_today[0];
    const deviations = list.submissions_today.reduce((n, s) => n + s.deviation_count, 0);
    const localDraft = localDrafts.get(list.id);
    const draft = list.my_draft || (localDraft && {
      answered: localDraft.answers.filter((a) => a.status).length,
      total: localDraft.answers.length,
    });
    const times = list.times_per_day || 1;
    const count = list.submissions_today.length;
    const late = list.state === "late";
    const label = draft
      ? t("sc.continue", { answered: draft.answered, total: draft.total })
      : last ? (count < times ? t("sc.startNext") : t("sc.startAgain")) : t("sc.start");
    return (
      <Card key={list.id} style={{ padding: 0, overflow: "hidden" }}>
        <button
          onClick={() => onStart(list)}
          style={{
            display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
            background: "none", border: "none", padding: 16, cursor: "pointer", color: "inherit",
          }}
        >
          <div style={{ flexShrink: 0 }}>
            {deviations > 0 ? (
              <AlertTriangle size={26} color="var(--text-danger)" />
            ) : list.state === "done" ? (
              <CheckCircle2 size={26} color="var(--text-success)" />
            ) : late || list.state === "partial" ? (
              <Clock size={26} color={late ? "var(--text-danger)" : "var(--text-warning)"} />
            ) : (
              <div style={{ width: 24, height: 24, borderRadius: 12, border: "2px solid var(--border)", margin: 1 }} />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{list.name}</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
              {tn("sc.items", list.item_count)}
              {list.schedule_mode === "weekly" && !list.on_demand && !list.due_today && ` · ${WEEK_ORDER.filter((d) => list.weekdays.includes(d)).map((d) => weekdayShort(d, locale)).join(", ")}`}
              {times > 1 && ` · ${t("sc.timesPerDay", { count: times })}`}
              {list.schedule_mode === "monthly_day" && ` · ${list.month_day === -1 ? t("sc.monthly.last") : t("sc.monthly.day", { day: list.month_day })}`}
              {list.done_this_month && ` · ${t("sc.monthly.doneThisMonth")}`}
              {list.due_time && list.due_today && ` · ${t("sc.dueBy", { time: list.due_time })}`}
            </div>
            {last ? (
              <div style={{ fontSize: 13, marginTop: 4, color: deviations > 0 ? "var(--text-danger)" : "var(--text-success)" }}>
                {t("sc.doneToday", { name: last.user_name, time: fmtTime(last.submitted_at, locale) })}
                {times > 1 && ` · ${t("sc.countOf", { count, times })}`}
                {deviations > 0 && ` · ${tn("sc.deviations", deviations)}`}
              </div>
            ) : null}
            {late ? (
              <div style={{ fontSize: 13, marginTop: 4, color: "var(--text-danger)", fontWeight: 600 }}>
                {t("sc.late", { time: list.due_time })}
              </div>
            ) : !last && list.due_today ? (
              <div style={{ fontSize: 13, marginTop: 4, color: "var(--text-warning)" }}>{t("sc.notDoneYet")}</div>
            ) : null}
          </div>
          <span style={{
            flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 2, fontSize: 13, fontWeight: 600,
            color: draft ? "white" : "var(--brand-dark)", background: draft ? "var(--brand)" : "var(--brand-bg)",
            padding: "6px 10px", borderRadius: "var(--radius-pill)", whiteSpace: "nowrap",
          }}>
            {label} <ChevronRight size={14} />
          </span>
        </button>
      </Card>
    );
  }

  return (
    <div>
      {cachedAt && (
        <Card style={{ marginBottom: 16, background: "var(--c-amber)", borderColor: "transparent", padding: 12 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14 }}>
            <WifiOff size={18} style={{ flexShrink: 0 }} />
            <span>{t("sc.offline.cached", { time: fmtTime(cachedAt.replace("T", " ").slice(0, 19), locale) })}</span>
          </div>
        </Card>
      )}
      {justSubmitted && (
        <Card style={{ marginBottom: 16, background: justSubmitted.queued ? "var(--c-amber)" : "var(--c-teal)", borderColor: "transparent" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", color: justSubmitted.queued ? "var(--text-primary)" : "var(--text-success)", fontWeight: 600 }}>
            {justSubmitted.queued ? <CloudUpload size={20} /> : <CheckCircle2 size={20} />}
            {justSubmitted.queued ? t("sc.offline.queuedThanks") : t("sc.submittedThanks")}
          </div>
        </Card>
      )}
      {data.lists.length === 0 && (
        <Card style={{ textAlign: "center", color: "var(--text-secondary)" }}>{t("sc.noLists")}</Card>
      )}
      <Section title={t("sc.section.today")} lists={today} render={card} />
      <Section title={t("sc.section.thisMonth")} lists={thisMonth} render={card} />
      <Section title={t("sc.section.onDemand")} lists={onDemand} render={card} />
      <Section title={t("sc.section.other")} lists={other} render={card} />
    </div>
  );
}

function Section({ title, lists, render }) {
  if (lists.length === 0) return null;
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{lists.map(render)}</div>
    </div>
  );
}

function EmployeeLog({ token }) {
  const { t, tn, language } = useI18n();
  const locale = LOCALE_BY_LANGUAGE[language] || "nb-NO";
  const [rows, setRows] = useState(null);
  const [onlyDeviations, setOnlyDeviations] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const from = addDays(todayOslo(), -30);
    apiFetch(`/simple-checklists/submissions?from=${from}${onlyDeviations ? "&deviations=1" : ""}`, { token })
      .then(setRows)
      .catch((err) => setError(err.message));
  }, [token, onlyDeviations]);

  if (openId) return <SubmissionDetail token={token} submissionId={openId} onBack={() => setOpenId(null)} />;

  return (
    <div>
      <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 14, marginBottom: 12, cursor: "pointer" }}>
        <input type="checkbox" checked={onlyDeviations} onChange={(e) => setOnlyDeviations(e.target.checked)} />
        {t("sc.log.deviationsOnly")}
      </label>
      {error && <div style={{ color: "var(--text-danger)" }}>{error}</div>}
      {!rows && !error && <Loading />}
      {rows?.length === 0 && <Card style={{ textAlign: "center", color: "var(--text-secondary)" }}>{t("sc.log.empty")}</Card>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows?.map((r) => (
          <Card key={r.id} style={{ padding: 0 }}>
            <button
              onClick={() => setOpenId(r.id)}
              style={{ display: "flex", gap: 10, alignItems: "center", width: "100%", textAlign: "left", background: "none", border: "none", padding: "12px 14px", cursor: "pointer", color: "inherit" }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{r.checklist_name}</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
                  {fmtDate(r.work_date)} {fmtTime(r.submitted_at, locale)} · {r.user_name}
                </div>
              </div>
              {r.deviation_count > 0 && (
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-danger)", background: "var(--c-red)", padding: "2px 8px", borderRadius: "var(--radius-pill)", whiteSpace: "nowrap" }}>
                  {tn("sc.deviations", r.deviation_count)}
                </span>
              )}
              <ChevronRight size={16} color="var(--text-secondary)" />
            </button>
          </Card>
        ))}
      </div>
    </div>
  );
}
