"use client";

import { useEffect, useState } from "react";

type DemoAccessState = "loading" | "error";

export function DemoAccessClient() {
  const [state, setState] = useState<DemoAccessState>("loading");

  useEffect(() => {
    let active = true;

    async function establishDemoSession() {
      const hashParameters = new URLSearchParams(
        window.location.hash.replace(/^#/, "")
      );
      const accessToken = hashParameters.get("access_token");
      const refreshToken = hashParameters.get("refresh_token");

      window.history.replaceState(null, "", "/demo/acceso");

      if (!accessToken || !refreshToken) {
        if (active) {
          setState("error");
        }
        return;
      }

      const response = await fetch("/api/demo-session", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          accessToken,
          refreshToken,
        }),
      });

      if (!active) {
        return;
      }

      if (!response.ok) {
        setState("error");
        return;
      }

      window.location.replace("/");
    }

    establishDemoSession();

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F7F9FA] px-6">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-200/70">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F05A28] text-xl font-black text-white">
          C
        </div>
        <h1 className="text-xl font-bold text-slate-950">
          {state === "loading"
            ? "Preparando la demostración"
            : "No se pudo abrir la demostración"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {state === "loading"
            ? "Estamos abriendo el espacio ficticio de Hotel Costa Azul."
            : "Genera un nuevo acceso ejecutando npm run demo:login e inténtalo de nuevo."}
        </p>
      </section>
    </main>
  );
}
