"use client";

import { useMemo, useState } from "react";
import { Building2, LogOut, Sparkles } from "lucide-react";

import type { CurrentCompany } from "../lib/currentCompany";
import { createClient } from "../lib/supabase/client";

import { Button } from "./Button";

type CompanyOnboardingProps = {
  userEmail: string | null;
  onCompanyCreated: (company: CurrentCompany) => void;
  onSignOut: () => void;
};

type CreatedCompanyRow = {
  id: string;
  name: string;
  sector: string;
  description: string | null;
  tone: string | null;
  language: string | null;
};

export function CompanyOnboarding({
  userEmail,
  onCompanyCreated,
  onSignOut,
}: CompanyOnboardingProps) {
  const supabase = useMemo(() => createClient(), []);

  const [companyName, setCompanyName] = useState("");
  const [sector, setSector] = useState("");
  const [description, setDescription] = useState("");
  const [tone, setTone] = useState("profesional y cercano");
  const [language, setLanguage] = useState("es");

  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleCreateCompany = async () => {
    setErrorMessage("");

    const cleanCompanyName = companyName.trim();
    const cleanSector = sector.trim();
    const cleanDescription = description.trim();
    const cleanTone = tone.trim() || "profesional y cercano";
    const cleanLanguage = language.trim() || "es";

    if (!cleanCompanyName) {
      setErrorMessage("El nombre de la empresa es obligatorio.");
      return;
    }

    if (!cleanSector) {
      setErrorMessage("El sector de la empresa es obligatorio.");
      return;
    }

    setIsCreating(true);

    const { data, error } = await supabase.rpc(
      "create_company_for_current_user",
      {
        company_name: cleanCompanyName,
        company_sector: cleanSector,
        company_description: cleanDescription || null,
        company_tone: cleanTone,
        company_language: cleanLanguage,
      }
    );

    setIsCreating(false);

    if (error) {
      setErrorMessage(
        `No se pudo crear la empresa: ${
          error.message || "sin detalle del error"
        }`
      );
      return;
    }

    const createdCompany = Array.isArray(data)
      ? ((data[0] ?? null) as CreatedCompanyRow | null)
      : ((data ?? null) as CreatedCompanyRow | null);

    if (!createdCompany) {
      setErrorMessage(
        "La empresa se creó, pero no se pudo recuperar la información creada."
      );
      return;
    }

    onCompanyCreated(createdCompany);
  };

  return (
    <div className="min-h-screen bg-[#F7F9FA] px-4 py-8 text-slate-900">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/80 lg:grid-cols-[0.9fr_1.1fr]">
          <aside className="bg-[#0F4C5C] p-8 text-white md:p-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
              <Building2 size={24} />
            </div>

            <h1 className="mt-6 text-2xl font-bold tracking-tight md:text-3xl">
              Configura tu empresa en COPPE
            </h1>

            <p className="mt-4 text-sm leading-6 text-white/80">
              Esta información se usará para configurar el espacio de trabajo de tu
              empresa y adaptar el asistente a tu actividad.
            </p>

            <div className="mt-8 rounded-2xl border border-white/15 bg-white/10 p-4 text-sm leading-6 text-white/80">
            <div className="mb-2 flex items-center gap-2 font-semibold text-white">
              <Sparkles size={16} />
                Espacio de trabajo privado
            </div>
            Después de crear la empresa, COPPE preparará tu espacio de trabajo y
            entrarás directamente al panel principal.
            </div>

            {userEmail ? (
              <p className="mt-8 text-xs text-white/70">
                Sesión iniciada como:{" "}
                <span className="font-semibold text-white">{userEmail}</span>
              </p>
            ) : null}

            <button
              type="button"
              onClick={onSignOut}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              <LogOut size={15} />
              Cerrar sesión
            </button>
          </aside>

          <main className="p-6 md:p-10">
            <div>
              <h2 className="text-xl font-bold text-slate-950">
                Datos básicos de empresa
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Podrás modificarlos más adelante desde Configuración.
              </p>
            </div>

            <div className="mt-6 space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                Nombre de empresa
                <input
                  value={companyName}
                  onChange={(event) => {
                    setCompanyName(event.target.value);
                    setErrorMessage("");
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                  placeholder="Ej. Hotel Costa Azul"
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Sector
                <input
                  value={sector}
                  onChange={(event) => {
                    setSector(event.target.value);
                    setErrorMessage("");
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                  placeholder="Ej. Alojamiento turístico, clínica, inmobiliaria..."
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Descripción
                <textarea
                  value={description}
                  onChange={(event) => {
                    setDescription(event.target.value);
                    setErrorMessage("");
                  }}
                  className="mt-1 min-h-[100px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                  placeholder="Describe brevemente qué hace la empresa y qué tipo de consultas recibe."
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  Tono del asistente
                  <select
                    value={tone}
                    onChange={(event) => {
                      setTone(event.target.value);
                      setErrorMessage("");
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                  >
                    <option value="profesional y cercano">
                      Profesional y cercano
                    </option>
                    <option value="formal">Formal</option>
                    <option value="directo">Directo</option>
                    <option value="amable y detallado">Amable y detallado</option>
                  </select>
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Idioma principal
                  <select
                    value={language}
                    onChange={(event) => {
                      setLanguage(event.target.value);
                      setErrorMessage("");
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                  >
                    <option value="es">Español</option>
                    <option value="en">Inglés</option>
                  </select>
                </label>
              </div>
            </div>

            {errorMessage ? (
              <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-2">
              <Button onClick={handleCreateCompany} disabled={isCreating}>
                <Building2 size={16} />
                {isCreating ? "Creando empresa..." : "Crear empresa"}
              </Button>

              <Button
                variant="ghost"
                onClick={onSignOut}
                disabled={isCreating}
              >
                Cancelar
              </Button>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}