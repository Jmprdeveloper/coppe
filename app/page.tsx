"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { AppShell } from "../components/AppShell";
import { AuthPage } from "../components/AuthPage";
import { Landing } from "../components/Landing";
import { MfaChallenge } from "../components/MfaChallenge";
import { PasswordRecovery } from "../components/PasswordRecovery";
import { createClient } from "../lib/supabase/client";

const publicViews = ["landing", "login", "register"];

export default function COPPEApp() {
  const supabase = useMemo(() => createClient(), []);

  const [activeView, setActiveView] = useState("landing");
  const [selectedInquiryId, setSelectedInquiryId] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");

  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isMfaLoading, setIsMfaLoading] = useState(false);
  const [requiresMfa, setRequiresMfa] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

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
    } = supabase.auth.onAuthStateChange((event, session) => {
      const currentUser = session?.user ?? null;

      setUser(currentUser);

      if (event === "PASSWORD_RECOVERY") {
        setIsPasswordRecovery(true);
        setIsAuthLoading(false);
        return;
      }

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

  useEffect(() => {
    let mounted = true;

    async function checkMfaRequirement() {
      if (!user) {
        setRequiresMfa(false);
        setIsMfaLoading(false);
        return;
      }

      setIsMfaLoading(true);

      const { data, error } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

      if (!mounted) {
        return;
      }

      setRequiresMfa(
        !error &&
          data?.currentLevel !== "aal2" &&
          data?.nextLevel === "aal2"
      );
      setIsMfaLoading(false);
    }

    checkMfaRequirement();

    return () => {
      mounted = false;
    };
  }, [supabase, user]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();

    setUser(null);
    setActiveView("landing");
    setSelectedInquiryId("");
    setSelectedCustomerId("");
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

  if (user && isMfaLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F9FA] px-6">
        <div className="rounded-3xl border border-slate-200 bg-white px-6 py-5 text-sm font-medium text-slate-600 shadow-xl shadow-slate-200/70">
          Comprobando seguridad de la sesión...
        </div>
      </div>
    );
  }

  if (user && isPasswordRecovery) {
    return (
      <PasswordRecovery
        onCompleted={() => {
          setIsPasswordRecovery(false);
          setActiveView("login");
        }}
      />
    );
  }

  if (user && requiresMfa) {
    return (
      <MfaChallenge
        onVerified={() => {
          setRequiresMfa(false);
        }}
        onSignOut={handleSignOut}
      />
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
