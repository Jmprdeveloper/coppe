"use client";

import { useEffect, useMemo, useState } from "react";

import {
  CalendarClock,
  CalendarDays,
  Inbox,
  LayoutDashboard,
  Settings,
  UsersRound,
} from "lucide-react";

import { CompanyOnboarding } from "./CompanyOnboarding";
import {
  getCurrentCompany,
  type CurrentCompany,
} from "../lib/currentCompany";
import { createClient } from "../lib/supabase/client";
import { classNames } from "../lib/utils";
import { Appointments } from "./Appointments";
import { CustomerDetail } from "./CustomerDetail";
import { Customers } from "./Customers";
import { Dashboard } from "./Dashboard";
import { FollowUps } from "./FollowUps";
import { Inquiries } from "./Inquiries";
import { InquiryDetail } from "./InquiryDetail";
import { InquiryForm } from "./InquiryForm";
import { ScrollToTopButton } from "./ScrollToTopButton";
import { SettingsPage } from "./SettingsPage";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

const navigation = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "inquiries", label: "Casos", icon: Inbox },
  { key: "customers", label: "Clientes", icon: UsersRound },
  { key: "appointments", label: "Agenda interna", icon: CalendarDays },
  { key: "followups", label: "Seguimientos", icon: CalendarClock },
  { key: "settings", label: "Configuración", icon: Settings },
];

type AppShellProps = {
  activeView: string;
  setActiveView: (view: string) => void;
  selectedInquiryId: string;
  setSelectedInquiryId: (id: string) => void;
  selectedCustomerId: string;
  setSelectedCustomerId: (id: string) => void;
  userEmail: string | null;
  onSignOut: () => void;
};

export function AppShell({
  activeView,
  setActiveView,
  selectedInquiryId,
  setSelectedInquiryId,
  selectedCustomerId,
  setSelectedCustomerId,
  userEmail,
  onSignOut,
}: AppShellProps) {
  const supabase = useMemo(() => createClient(), []);

  const [company, setCompany] = useState<CurrentCompany | null>(null);
  const [isCompanyLoading, setIsCompanyLoading] = useState(true);
  const [companyErrorMessage, setCompanyErrorMessage] = useState("");
  const [isInquiryFormOpen, setIsInquiryFormOpen] = useState(
    activeView === "InquiryForm"
  );

  useEffect(() => {
    let mounted = true;

    async function loadCompany() {
      setIsCompanyLoading(true);
      setCompanyErrorMessage("");

      const { data, error } = await getCurrentCompany(supabase);

      if (!mounted) {
        return;
      }

      if (error) {
        setCompany(null);
        setCompanyErrorMessage(
          `No se pudo cargar la empresa asociada al usuario: ${
            error.message || "sin detalle del error"
          }`
        );
        setIsCompanyLoading(false);
        return;
      }

      setCompany(data ?? null);
      setIsCompanyLoading(false);
    }

    loadCompany();

    return () => {
      mounted = false;
    };
  }, [supabase]);

  const changeView = (view: string) => {
    if (view === "InquiryForm") {
      setIsInquiryFormOpen(true);
      return;
    }

    setIsInquiryFormOpen(false);
    setActiveView(view);
  };

  const handleCompanyCreated = (createdCompany: CurrentCompany) => {
    setCompany(createdCompany);
    setCompanyErrorMessage("");
    changeView("dashboard");
  };

  const handleCompanyUpdated = (updatedCompany: CurrentCompany) => {
    setCompany(updatedCompany);
    setCompanyErrorMessage("");
  };

  const openInquiry = (id: string) => {
    setIsInquiryFormOpen(false);
    setSelectedInquiryId(id);
    setActiveView("inquiryDetail");
  };

  const openCustomer = (id: string) => {
    setIsInquiryFormOpen(false);
    setSelectedCustomerId(id);
    setActiveView("customerDetail");
  };

  const renderContent = () => {
    switch (activeView) {
      case "dashboard":
        return (
          <Dashboard
            setActiveView={changeView}
            openInquiry={openInquiry}
          />
        );

      case "inquiries":
        return (
          <Inquiries
            openInquiry={openInquiry}
            setActiveView={changeView}
          />
        );

      case "inquiryDetail":
        return (
          <InquiryDetail
            inquiryId={selectedInquiryId}
            setActiveView={changeView}
          />
        );

      case "customers":
        return <Customers openCustomer={openCustomer} />;

      case "customerDetail":
        return (
          <CustomerDetail
            customerId={selectedCustomerId}
            setActiveView={changeView}
            openInquiry={openInquiry}
          />
        );

      case "appointments":
        return <Appointments openInquiry={openInquiry} />;

      case "followups":
        return <FollowUps openInquiry={openInquiry} />;

      case "settings":
        return <SettingsPage onCompanyUpdated={handleCompanyUpdated} />;

      case "InquiryForm":
        return (
          <Dashboard
            setActiveView={changeView}
            openInquiry={openInquiry}
          />
        );

      default:
        return (
          <Dashboard
            setActiveView={changeView}
            openInquiry={openInquiry}
          />
        );
    }
  };

  if (isCompanyLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F9FA] px-6">
        <div className="rounded-3xl border border-slate-200 bg-white px-6 py-5 text-sm font-medium text-slate-600 shadow-xl shadow-slate-200/70">
          Cargando empresa...
        </div>
      </div>
    );
  }

  if (companyErrorMessage) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F9FA] px-6">
        <div className="w-full max-w-lg rounded-3xl border border-red-200 bg-white p-6 text-center shadow-xl shadow-slate-200/70">
          <h1 className="text-lg font-bold text-slate-950">
            No se pudo cargar la empresa
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-500">
            {companyErrorMessage}
          </p>

          <button
            type="button"
            onClick={onSignOut}
            className="mt-5 rounded-xl bg-[#0F4C5C] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0b3d4a]"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  if (!company) {
    return (
      <CompanyOnboarding
        userEmail={userEmail}
        onCompanyCreated={handleCompanyCreated}
        onSignOut={onSignOut}
      />
    );
  }

  return (
    <div className="min-h-screen max-w-full overflow-x-clip bg-[#F7F9FA] text-slate-900">
      <div className="flex min-h-screen min-w-0">
        <Sidebar
          activeView={activeView}
          setActiveView={changeView}
          navigation={navigation}
          onSignOut={onSignOut}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            activeView={activeView}
            setActiveView={changeView}
            navigation={navigation}
            company={company}
            userEmail={userEmail}
            onSignOut={onSignOut}
            openInquiry={openInquiry}
            openCustomer={openCustomer}
          />

          <main className="min-w-0 max-w-full flex-1 p-4 pb-24 md:p-6 md:pb-24 lg:p-8">
            {renderContent()}
          </main>

          <ScrollToTopButton />

          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white px-2 py-2 lg:hidden">
            <div className="grid grid-cols-6 gap-1">
              {navigation.map((item) => {
                const Icon = item.icon;
                const active = activeView === item.key;

                return (
                  <button
                    key={item.key}
                    onClick={() => changeView(item.key)}
                    className={classNames(
                      "flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-medium",
                      active
                        ? "bg-[#E6F3F6] text-[#0F4C5C]"
                        : "text-slate-500"
                    )}
                  >
                    <Icon size={17} />
                    <span className="block w-full truncate text-center">
                      {item.label.split(" ")[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {isInquiryFormOpen ? (
        <InquiryForm
          setActiveView={changeView}
          openInquiry={openInquiry}
          onClose={() => {
            setIsInquiryFormOpen(false);

            if (activeView === "InquiryForm") {
              setActiveView("dashboard");
            }
          }}
        />
      ) : null}
    </div>
  );
}
