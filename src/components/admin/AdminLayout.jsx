import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import TopBanner from "./TopBanner";
import DashboardPage from "./DashboardPage";
import LokasjonerPage from "./LokasjonerPage";
import KunderPage from "./KunderPage";
import AvvikPage from "./AvvikPage";
import InviterBrukerePage from "./InviterBrukerePage";
import RapporterPage from "./RapporterPage";
import MinProfilPage from "./MinProfilPage";
import { apiFetch } from "../../api";

const PAGES = {
  dashboard: DashboardPage,
  lokasjoner: LokasjonerPage,
  kunder: KunderPage,
  avvik: AvvikPage,
  inviter: InviterBrukerePage,
  rapporter: RapporterPage,
  profil: MinProfilPage,
};

export default function AdminLayout({ token, user, onLogout }) {
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [summary, setSummary] = useState(null);

  function refreshSummary() {
    apiFetch("/dashboard/summary", { token }).then(setSummary).catch(() => {});
  }

  useEffect(() => {
    refreshSummary();
  }, [token]);

  const PageComponent = PAGES[currentPage] || DashboardPage;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--page-bg)" }}>
      <Sidebar currentPage={currentPage} setCurrentPage={setCurrentPage} user={user} onLogout={onLogout} />
      <div style={{ flex: 1, padding: "24px 32px", boxSizing: "border-box", minWidth: 0 }}>
        <TopBanner trial={summary?.trial} />
        <PageComponent token={token} user={user} summary={summary} refreshSummary={refreshSummary} />
      </div>
    </div>
  );
}
