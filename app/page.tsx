"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { AppShell } from "../components/AppShell";
import { AuthPage } from "../components/AuthPage";
import { Landing } from "../components/Landing";
import { createClient } from "../lib/supabase/client";

const publicViews = ["landing", "login", "register"];

export default function COPPEPrototype() {
  const supabase = useMemo(() => createClient(), []);

  const [activeView, setActiveView] = useState("landing");
  const [selectedInquiryId, setSelectedInquiryId] = useState("i1");
  const [selectedCustomerId, setSelectedCustomerId] = useState("c1");

  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadCurrentUser = async () => {
      const { data } = await supabase.auth.getUser();

      if (!mounted) {
        return;
      }

      setUser(data.user);

      if (data.user) {
        setActiveView("dashboard");
      }

      setIsAuthLoading(false);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;

      setUser(currentUser);

      if (currentUser) {
        setActiveView((currentView) =>
          publicViews.includes(currentView) ? "dashboard" : currentView
        );
      } else {
        setActiveView((currentView) =>
          publicViews.includes(currentView) ? currentView : "landing"
        );
      }
    });

    loadCurrentUser();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();

    setUser(null);
    setActiveView("landing");
    setSelectedInquiryId("i1");
    setSelectedCustomerId("c1");
  };

  if (isAuthLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F9FA] px-6">
        <div className="rounded-3xl border border-slate-200 bg-white px-6 py-5 text-sm font-medium text-slate-600 shadow-xl shadow-slate-200/70">
          Cargando COPPE...
        </div>
      </div>
    );
  }

  if (!user && activeView === "landing") {
    return <Landing setActiveView={setActiveView} />;
  }

  if (!user && activeView === "login") {
    return <AuthPage type="login" setActiveView={setActiveView} />;
  }

  if (!user && activeView === "register") {
    return <AuthPage type="register" setActiveView={setActiveView} />;
  }

  if (!user) {
    return <AuthPage type="login" setActiveView={setActiveView} />;
  }

  const appActiveView = publicViews.includes(activeView)
    ? "dashboard"
    : activeView;

  return (
    <AppShell
      activeView={appActiveView}
      setActiveView={setActiveView}
      selectedInquiryId={selectedInquiryId}
      setSelectedInquiryId={setSelectedInquiryId}
      selectedCustomerId={selectedCustomerId}
      setSelectedCustomerId={setSelectedCustomerId}
      userEmail={user.email ?? null}
      onSignOut={handleSignOut}
    />
  );
}
