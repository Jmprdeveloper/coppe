"use client";

import React, { useState } from "react";
import {
  CalendarClock,
  Inbox,
  LayoutDashboard,
  Settings,
  UsersRound,
} from "lucide-react";

import { mockCompany, mockInquiries } from "../data/mockData";
import { classNames } from "../lib/utils";

import { AuthMock } from "../components/AuthMock";
import { CustomerDetail } from "../components/CustomerDetail";
import { Customers } from "../components/Customers";
import { Dashboard } from "../components/Dashboard";
import { DemoForm } from "../components/DemoForm";
import { FollowUps } from "../components/FollowUps";
import { Inquiries } from "../components/Inquiries";
import { InquiryDetail } from "../components/InquiryDetail";
import { Landing } from "../components/Landing";
import { SettingsPage } from "../components/SettingsPage";
import { Sidebar } from "../components/Sidebar";
import { Topbar } from "../components/Topbar";

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
};

function AppShell({
  activeView,
  setActiveView,
  selectedInquiryId,
  setSelectedInquiryId,
  selectedCustomerId,
  setSelectedCustomerId,
}: AppShellProps) {
  const openInquiry = (id: string) => {
    setSelectedInquiryId(id);
    setActiveView("inquiryDetail");
  };

  const openCustomer = (id: string) => {
    setSelectedCustomerId(id);
    setActiveView("customerDetail");
  };

  const selectedInquiry =
    mockInquiries.find((inquiry) => inquiry.id === selectedInquiryId) ||
    mockInquiries[0];

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
            inquiry={selectedInquiry}
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
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            activeView={activeView}
            setActiveView={setActiveView}
            navigation={navigation}
            company={mockCompany}
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

export default function COPPEPrototype() {
  const [activeView, setActiveView] = useState("landing");
  const [selectedInquiryId, setSelectedInquiryId] = useState("i1");
  const [selectedCustomerId, setSelectedCustomerId] = useState("c1");

  if (activeView === "landing") {
    return <Landing setActiveView={setActiveView} />;
  }

  if (activeView === "login") {
    return <AuthMock type="login" setActiveView={setActiveView} />;
  }

  if (activeView === "register") {
    return <AuthMock type="register" setActiveView={setActiveView} />;
  }

  return (
    <AppShell
      activeView={activeView}
      setActiveView={setActiveView}
      selectedInquiryId={selectedInquiryId}
      setSelectedInquiryId={setSelectedInquiryId}
      selectedCustomerId={selectedCustomerId}
      setSelectedCustomerId={setSelectedCustomerId}
    />
  );
}