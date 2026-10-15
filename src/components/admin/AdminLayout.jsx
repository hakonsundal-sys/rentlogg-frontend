import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import TopBanner from "./TopBanner";
import DashboardPage from "./DashboardPage";
import LokasjonerPage from "./LokasjonerPage";
import KunderPage from "./KunderPage";
import AvdelingerPage from "./AvdelingerPage";
import AnsattePage from "./AnsattePage";
import AvvikPage from "./AvvikPage";
import EtterkontrollPage from "./EtterkontrollPage";
import InviterBrukerePage from "./InviterBrukerePage";
import RapporterPage from "./RapporterPage";
import MinProfilPage from "./MinProfilPage";
import TimerPage from "./TimerPage";
import SjekklisterPage from "./SjekklisterPage";
import ErrorBoundary from "../ErrorBoundary";
import { isChecklistOnly } from "../../modules";
import { apiFetch } from "../../api";
import { readDefaultDepartment, writeDefaultDepartment } from "../../dashboardDepartment";

const PAGES = {
  dashboard: DashboardPage,
  lokasjoner: LokasjonerPage,
  kunder: KunderPage,
  avdelinger: AvdelingerPage,
  ansatte: AnsattePage,
  avvik: AvvikPage,
  etterkontroll: EtterkontrollPage,
  inviter: InviterBrukerePage,
  rapporter: RapporterPage,
  timer: TimerPage,
  sjekklister: SjekklisterPage,
  profil: MinProfilPage,
};

export default function AdminLayout({ token, user, onLogout }) {
  // A checklist-only company has no dashboard of cleaning visits to land on.
  const [currentPage, setCurrentPage] = useState(() => (isChecklistOnly(user) ? "sjekklister" : "dashboard"));
  const [summary, setSummary] = useState(null);
  const [summaryFailed, setSummaryFailed] = useState(false);

  // Which department the dashboard is narrowed to ("" = all). Starts on the one this person saved as
  // their default, if any; see dashboardDepartment.js.
  const [dashboardDepartment, setDashboardDepartment] = useState(() => readDefaultDepartment(user));

  function refreshSummary() {
    const query = dashboardDepartment ? `?department_id=${dashboardDepartment}` : "";
    apiFetch(`/dashboard/summary${query}`, { token })
      .then((data) => { setSummary(data); setSummaryFailed(false); })
      .catch((err) => {
        // A saved default that no longer exists (the department was removed): fall back to everything
        // and forget it, instead of showing an error on every visit from now on.
        if (err?.code === "invalid_department") {
          writeDefaultDepartment(user, "");
          setDashboardDepartment("");
          return;
        }
        // Remembered, so the dashboard can say so: it used to wait on "Laster..." for ever when this
        // one request failed, with no message and nothing to press.
        setSummaryFailed(true);
      });
  }

  useEffect(() => {
    refreshSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, dashboardDepartment]);

  const PageComponent = PAGES[currentPage] || (isChecklistOnly(user) ? SjekklisterPage : DashboardPage);

  return (
    <div className="admin-shell">
      <Sidebar currentPage={currentPage} setCurrentPage={setCurrentPage} user={user} onLogout={onLogout} />
      <div className="admin-content">
        {/* Trial/pricing banner hidden until a working payment flow exists — re-enable by restoring this line. */}
        {/* <TopBanner trial={summary?.trial} /> */}
        {/* One page that cannot render must not take the sidebar with it, and switching page starts
            the boundary afresh (key), so leaving the broken page is always possible. */}
        <ErrorBoundary key={currentPage}>
          <PageComponent
            token={token} user={user} summary={summary} summaryFailed={summaryFailed} refreshSummary={refreshSummary}
            departmentId={dashboardDepartment} onDepartmentChange={setDashboardDepartment}
          />
        </ErrorBoundary>
      </div>
    </div>
  );
}
