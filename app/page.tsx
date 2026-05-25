"use client";

import { useState } from "react";

import { AppShell } from "../components/AppShell";
import { AuthMock } from "../components/AuthMock";
import { Landing } from "../components/Landing";

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