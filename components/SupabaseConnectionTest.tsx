"use client";

import { useEffect, useState } from "react";

import { createClient } from "../lib/supabase/client";

type ConnectionState = "loading" | "success" | "warning" | "error";

type ConnectionStatus = {
  state: ConnectionState;
  message: string;
};

export function SupabaseConnectionTest() {
  const [status, setStatus] = useState<ConnectionStatus>({
    state: "loading",
    message: "Comprobando conexión con Supabase...",
  });

  useEffect(() => {
    async function checkConnection() {
      try {
        const supabase = createClient();

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          setStatus({
            state: "warning",
            message: `Supabase está conectado, pero no se pudo leer la sesión: ${
              userError.message || "sin detalle del error"
            }`,
          });

          return;
        }

        if (!user) {
          setStatus({
            state: "warning",
            message:
              "Supabase está conectado, pero no hay ninguna sesión activa.",
          });

          return;
        }

        const { data: company, error: companyError } = await supabase
          .from("companies")
          .select("id, name")
          .limit(1)
          .maybeSingle();

        if (companyError) {
          setStatus({
            state: "warning",
            message: `Autenticación activa, pero no se pudo leer la empresa: ${
              companyError.message || "sin detalle del error"
            }`,
          });

          return;
        }

        if (!company) {
          setStatus({
            state: "warning",
            message: `Sesión activa para ${user.email}, pero todavía no hay una empresa asociada a este usuario.`,
          });

          return;
        }

        setStatus({
          state: "success",
          message: `Supabase conectado correctamente. Sesión activa: ${user.email}. Empresa detectada: ${company.name}.`,
        });
      } catch (error) {
        setStatus({
          state: "error",
          message:
            error instanceof Error
              ? error.message
              : "No se pudo comprobar la conexión con Supabase.",
        });
      }
    }

    checkConnection();
  }, []);

  const styles: Record<ConnectionState, string> = {
    loading: "border-slate-200 bg-white text-slate-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    error: "border-red-200 bg-red-50 text-red-800",
  };

  return (
    <div
      className={`mb-5 rounded-2xl border p-4 text-sm ${styles[status.state]}`}
    >
      <div className="font-semibold">Estado de Supabase</div>
      <p className="mt-1 leading-6">{status.message}</p>
    </div>
  );
}