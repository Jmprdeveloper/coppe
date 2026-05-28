"use client";

import { useEffect, useMemo, useState } from "react";

import { getCurrentCompany } from "../lib/currentCompany";
import { createClient } from "../lib/supabase/client";

import { Button } from "./Button";
import { PageHeader } from "./PageHeader";
import { SupabaseConnectionTest } from "./SupabaseConnectionTest";

export function SettingsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [sector, setSector] = useState("");
  const [description, setDescription] = useState("");
  const [tone, setTone] = useState("Profesional");
  const [language, setLanguage] = useState("Español");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadCompanySettings() {
      setIsLoading(true);
      setErrorMessage("");
      setMessage("");

      const { data, error } = await getCurrentCompany(supabase);

      if (error) {
        setErrorMessage(
          `No se pudo cargar la empresa desde Supabase: ${
            error.message || "sin detalle del error"
          }`
        );
        setIsLoading(false);
        return;
      }

      if (!data) {
        setErrorMessage("No hay ninguna empresa asociada a este usuario.");
        setIsLoading(false);
        return;
      }

      setCompanyId(data.id);
      setName(data.name ?? "");
      setSector(data.sector ?? "");
      setDescription(data.description ?? "");
      setTone(data.tone ?? "Profesional");
      setLanguage(data.language ?? "Español");
      setIsLoading(false);
    }

    loadCompanySettings();
  }, [supabase]);

  const handleSave = async () => {
    setErrorMessage("");
    setMessage("");

    if (!companyId) {
      setErrorMessage("No se puede guardar porque no hay empresa cargada.");
      return;
    }

    const cleanName = name.trim();
    const cleanSector = sector.trim();
    const cleanDescription = description.trim();

    if (!cleanName) {
      setErrorMessage("El nombre de la empresa no puede estar vacío.");
      return;
    }

    if (!cleanSector) {
      setErrorMessage("El sector no puede estar vacío.");
      return;
    }

    setIsSaving(true);

    const { error } = await supabase
      .from("companies")
      .update({
        name: cleanName,
        sector: cleanSector,
        description: cleanDescription,
        tone,
        language,
      })
      .eq("id", companyId);

    setIsSaving(false);

    if (error) {
      setErrorMessage(
        `No se pudieron guardar los cambios: ${
          error.message || "sin detalle del error"
        }`
      );
      return;
    }

    setMessage("Cambios guardados correctamente.");
  };

  return (
    <div>
      <PageHeader
        title="Configuración"
        description="Ajustes básicos de empresa y comportamiento del asistente COPPE."
      />

      <SupabaseConnectionTest />

      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          Cargando configuración de empresa...
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">
              Información de empresa
            </h2>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                Nombre de empresa
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Sector
                <input
                  value={sector}
                  onChange={(event) => setSector(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                />
              </label>

              <label className="text-sm font-medium text-slate-700 md:col-span-2">
                Descripción
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="mt-1 min-h-[120px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                />
              </label>
            </div>

            {errorMessage ? (
              <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </div>
            ) : null}

            {message ? (
              <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {message}
              </div>
            ) : null}

            <Button className="mt-5" onClick={handleSave}>
              {isSaving ? "Guardando..." : "Guardar cambios"}
            </Button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">
              Preferencias IA
            </h2>

            <div className="mt-5 space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                Tono
                <select
                  value={tone}
                  onChange={(event) => setTone(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                >
                  <option>Profesional</option>
                  <option>Cercano</option>
                  <option>Breve</option>
                  <option>Comercial</option>
                </select>
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Idioma
                <select
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                >
                  <option>Español</option>
                  <option>Inglés</option>
                </select>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}