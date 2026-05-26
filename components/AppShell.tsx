"use client";

import {
  CalendarClock,
  Inbox,
  LayoutDashboard,
  Settings,
  UsersRound,
} from "lucide-react";

import { mockCompany } from "../data/mockData";
import { classNames } from "../lib/utils";

import { CustomerDetail } from "./CustomerDetail";
import { Customers } from "./Customers";
import { Dashboard } from "./Dashboard";
import { DemoForm } from "./DemoForm";
import { FollowUps } from "./FollowUps";
import { Inquiries } from "./Inquiries";
import { InquiryDetail } from "./InquiryDetail";
import { SettingsPage } from "./SettingsPage";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

const navigation = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "inquiries", label: "Consultas", icon: Inbox },
  { key: "customers", label: "Clientes", icon: UsersRound },
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
  const openInquiry = (id: string) => {
    setSelectedInquiryId(id);
    setActiveView("inquiryDetail");
  };

  const openCustomer = (id: string) => {
    setSelectedCustomerId(id);
    setActiveView("customerDetail");
  };

  const renderContent = () => {
    switch (activeView) {
      case "dashboard":
        return (
          <Dashboard
            setActiveView={setActiveView}
            openInquiry={openInquiry}
          />
        );

      case "inquiries":
        return <Inquiries openInquiry={openInquiry} />;

      case "inquiryDetail":
        return (
          <InquiryDetail
            inquiryId={selectedInquiryId}
            setActiveView={setActiveView}
          />
        );

      case "customers":
        return <Customers openCustomer={openCustomer} />;

      case "customerDetail":
        return (
          <CustomerDetail
            customerId={selectedCustomerId}
            setActiveView={setActiveView}
            openInquiry={openInquiry}
          />
        );

      case "followups":
        return <FollowUps openInquiry={openInquiry} />;

      case "settings":
        return <SettingsPage />;

      case "demoForm":
        return (
          <DemoForm
            setActiveView={setActiveView}
            openInquiry={openInquiry}
          />
        );

      default:
        return (
          <Dashboard
            setActiveView={setActiveView}
            openInquiry={openInquiry}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F9FA] text-slate-900">
      <div className="flex min-h-screen">
        <Sidebar
          activeView={activeView}
          setActiveView={setActiveView}
          navigation={navigation}
          onSignOut={onSignOut}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            activeView={activeView}
            setActiveView={setActiveView}
            navigation={navigation}
            company={mockCompany}
            userEmail={userEmail}
            onSignOut={onSignOut}
          />

          <main className="flex-1 p-4 md:p-6 lg:p-8">
            {renderContent()}
          </main>

          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white px-2 py-2 lg:hidden">
            <div className="grid grid-cols-5 gap-1">
              {navigation.map((item) => {
                const Icon = item.icon;
                const active = activeView === item.key;

                return (
                  <button
                    key={item.key}
                    onClick={() => setActiveView(item.key)}
                    className={classNames(
                      "flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] font-medium",
                      active
                        ? "bg-[#E6F3F6] text-[#0F4C5C]"
                        : "text-slate-500"
                    )}
                  >
                    <Icon size={17} />
                    <span className="truncate">
                      {item.label.split(" ")[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}