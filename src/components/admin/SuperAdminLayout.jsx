import { useState } from "react";
import { Building2, UserPlus, CircleUser } from "lucide-react";
import Sidebar from "./Sidebar";
import SelskaperPage from "./SelskaperPage";
import InviterBrukerePage from "./InviterBrukerePage";
import MinProfilPage from "./MinProfilPage";

// super_admin has no company of its own, so none of AdminLayout's company-scoped pages
// (Dashboard, Lokasjoner, Kunder, Avvik, Rapporter) apply — this is a separate, much shorter
// layout for the one thing a super_admin actually does: create companies and invite their
// first admin.
const NAV_ITEMS = [
  { id: "firmaer", label: "Firmaer", icon: Building2 },
  { id: "inviter", label: "Inviter brukere", icon: UserPlus },
  { id: "profil", label: "Min profil", icon: CircleUser },
];

const PAGES = {
  firmaer: SelskaperPage,
  inviter: InviterBrukerePage,
  profil: MinProfilPage,
};

export default function SuperAdminLayout({ token, user, onLogout }) {
  const [currentPage, setCurrentPage] = useState("firmaer");
  const PageComponent = PAGES[currentPage] || SelskaperPage;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--page-bg)" }}>
      <Sidebar currentPage={currentPage} setCurrentPage={setCurrentPage} user={user} onLogout={onLogout} navItems={NAV_ITEMS} />
      <div style={{ flex: 1, padding: "24px 32px", boxSizing: "border-box", minWidth: 0 }}>
        <PageComponent token={token} user={user} />
      </div>
    </div>
  );
}
