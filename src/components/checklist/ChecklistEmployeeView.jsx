import { useEffect, useState } from "react";
import { CheckCircle2, ChevronRight, AlertTriangle } from "lucide-react";
import { apiFetch } from "../../api";
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
export default function ChecklistEmployeeView({ token }) {
  const { t } = useI18n();
  const [tab, setTab] = useState("today");
  const [filling, setFilling] = useState(null); // the draft being filled in
  const [justSubmitted, setJustSubmitted] = useState(null);
  const [error, setError] = useState("");

  // Resume a draft the phone threw away. A draft that no longer exists (submitted from elsewhere,
  // discarded) just falls back to the start page.
  useEffect(() => {
    const id = storedOpen();
    if (!id) return;
    apiFetch(`/simple-checklists/submissions/${id}`, { token })
      .then((d) => (d.submitted_at ? rememberOpen(null) : setFilling(d)))
      .catch(() => rememberOpen(null));
  }, [token]);

  async function start(list) {
    setError("");
    setJustSubmitted(null);
    try {
      const draft = await apiFetch(`/simple-checklists/${list.id}/start`, { token, method: "POST" });
      rememberOpen(draft.id);
      setFilling(draft);
      window.scrollTo(0, 0);
    } catch (err) {
      setError(err.message);
    }
  }

  function closeFill() {
    rememberOpen(null);
    setFilling(null);
  }

  if (filling) {
    return (
      <ChecklistFill
        key={filling.id}
        token={token}
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
      {tab === "today" ? (
        <TodayList token={token} onStart={start} justSubmitted={justSubmitted} />
      ) : (
        <EmployeeLog token={token} />
      )}
    </div>
  );
}

function TodayList({ token, onStart, justSubmitted }) {
  const { t, tn, language } = useI18n();
  const locale = LOCALE_BY_LANGUAGE[language] || "nb-NO";
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/simple-checklists/today", { token }).then(setData).catch((err) => setError(err.message));
  }, [token, justSubmitted]);

  if (error) return <div style={{ color: "var(--text-danger)" }}>{error}</div>;
  if (!data) return <Loading />;

  const today = data.lists.filter((l) => l.due_today);
  const onDemand = data.lists.filter((l) => l.on_demand);
  const other = data.lists.filter((l) => !l.due_today && !l.on_demand);

  function card(list) {
    const last = list.submissions_today[0];
    const deviations = list.submissions_today.reduce((n, s) => n + s.deviation_count, 0);
    const draft = list.my_draft;
    const label = draft
      ? t("sc.continue", { answered: draft.answered, total: draft.total })
      : last ? t("sc.startAgain") : t("sc.start");
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
            {last ? (
              deviations > 0
                ? <AlertTriangle size={26} color="var(--text-danger)" />
                : <CheckCircle2 size={26} color="var(--text-success)" />
            ) : (
              <div style={{ width: 24, height: 24, borderRadius: 12, border: "2px solid var(--border)", margin: 1 }} />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{list.name}</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
              {tn("sc.items", list.item_count)}
              {!list.on_demand && !list.due_today && ` · ${WEEK_ORDER.filter((d) => list.weekdays.includes(d)).map((d) => weekdayShort(d, locale)).join(", ")}`}
            </div>
            {last ? (
              <div style={{ fontSize: 13, marginTop: 4, color: deviations > 0 ? "var(--text-danger)" : "var(--text-success)" }}>
                {t("sc.doneToday", { name: last.user_name, time: fmtTime(last.submitted_at, locale) })}
                {deviations > 0 && ` · ${tn("sc.deviations", deviations)}`}
              </div>
            ) : list.due_today ? (
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
      {justSubmitted && (
        <Card style={{ marginBottom: 16, background: "var(--c-teal)", borderColor: "transparent" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", color: "var(--text-success)", fontWeight: 600 }}>
            <CheckCircle2 size={20} /> {t("sc.submittedThanks")}
          </div>
        </Card>
      )}
      {data.lists.length === 0 && (
        <Card style={{ textAlign: "center", color: "var(--text-secondary)" }}>{t("sc.noLists")}</Card>
      )}
      <Section title={t("sc.section.today")} lists={today} render={card} />
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
