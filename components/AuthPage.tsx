"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Building2 } from "lucide-react";

import { createClient } from "../lib/supabase/client";
import { Button } from "./Button";

type AuthPageProps = {
  type: "login" | "register";
  setActiveView: (view: string) => void;
};

export function AuthPage({ type, setActiveView }: AuthPageProps) {
  const supabase = useMemo(() => createClient(), []);
  const register = type === "register";

  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [sector, setSector] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const handleSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");

    const cleanEmail = email.trim().toLowerCase();
    const cleanCompanyName = companyName.trim();
    const cleanFullName = fullName.trim();
    const cleanSector = sector.trim();

    if (!cleanEmail) {
      setErrorMessage("Introduce un email.");
      return;
    }

    if (!password) {
      setErrorMessage("Introduce una contraseña.");
      return;
    }

    if (register && !cleanCompanyName) {
      setErrorMessage("Introduce el nombre de la empresa.");
      return;
    }

    if (register && !cleanSector) {
      setErrorMessage("Selecciona un sector.");
      return;
    }

    try {
      setIsLoading(true);

      if (register) {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              full_name: cleanFullName,
              company_name: cleanCompanyName,
              sector: cleanSector,
            },
          },
        });

        if (error) {
          throw error;
        }

        if (!data.session) {
          setSuccessMessage(
            "Cuenta creada. Revisa tu email para confirmar la cuenta antes de iniciar sesión."
          );
          return;
        }

        const { error: companyError } = await supabase.rpc(
          "create_company_for_current_user",
          {
            company_name: cleanCompanyName,
          }
        );

        if (companyError) {
          await supabase.auth.signOut();
          throw companyError;
        }

        setActiveView("dashboard");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        throw error;
      }

      setActiveView("dashboard");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Ha ocurrido un error inesperado.";

      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F9FA] px-6 py-10">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/70">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#0F4C5C] text-white">
            <Building2 size={19} />
          </div>

          <div>
            <div className="font-bold text-slate-950">COPPE</div>
            <div className="text-xs text-slate-500">
              {register ? "Crear cuenta" : "Iniciar sesión"}
            </div>
          </div>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {register ? (
            <label className="block text-sm font-medium text-slate-700">
              Nombre completo
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:border-[#0F4C5C]"
              />
            </label>
          ) : null}

          <label className="block text-sm font-medium text-slate-700">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:border-[#0F4C5C]"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Contraseña
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:border-[#0F4C5C]"
            />
          </label>

          {register ? (
            <>
              <label className="block text-sm font-medium text-slate-700">
                Empresa
                <input
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:border-[#0F4C5C]"
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Sector
                <select
                  value={sector}
                  onChange={(event) => setSector(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:border-[#0F4C5C]"
                >
                  <option value="">Selecciona un sector</option>
                  <option value="Hotel / alojamiento turístico">
                    Hotel / alojamiento turístico
                  </option>
                  <option value="Inmobiliaria">Inmobiliaria</option>
                  <option value="Clínica">Clínica</option>
                </select>
              </label>
            </>
          ) : null}

          {errorMessage ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          {successMessage ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {successMessage}
            </div>
          ) : null}

          <Button className="mt-2 w-full" type="submit" disabled={isLoading}>
            {isLoading
              ? register
                ? "Creando cuenta..."
                : "Entrando..."
              : register
                ? "Crear cuenta"
                : "Entrar"}
          </Button>

          <button
            type="button"
            className="mt-4 w-full text-sm font-semibold text-[#0F4C5C] hover:underline"
            onClick={() => setActiveView(register ? "login" : "register")}
          >
            {register ? "Ya tengo cuenta" : "Crear cuenta nueva"}
          </button>

          <button
            type="button"
            className="mt-3 w-full text-sm text-slate-500 hover:text-slate-700"
            onClick={() => setActiveView("landing")}
          >
            Volver al inicio
          </button>
        </form>
      </div>
    </div>
  );
}