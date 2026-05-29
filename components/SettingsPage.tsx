"use client";

import { useEffect, useMemo, useState } from "react";

import {
  companySectorOptions,
  normalizeCompanySector,
} from "../lib/companyOptions";
import { getCurrentCompany, type CurrentCompany } from "../lib/currentCompany";
import { createClient } from "../lib/supabase/client";

import { Button } from "./Button";
import { PageHeader } from "./PageHeader";

type ToneOption =
  | "profesional y cercano"
  | "formal"
  | "directo"
  | "amable y detallado";

type LanguageOption = "es" | "en";

type SettingsPageProps = {
  onCompanyUpdated?: (company: CurrentCompany) => void;
};

function normalizeTone(value: string | null | undefined): ToneOption {
  if (
    value === "profesional y cercano" ||
    value === "formal" ||
    value === "directo" ||
    value === "amable y detallado"
  ) {
    return value;
  }

  return "profesional y cercano";
}

function normalizeLanguage(value: string | null | undefined): LanguageOption {
  if (value === "en") {
    return "en";
  }

  return "es";
}

export function SettingsPage({ onCompanyUpdated }: SettingsPageProps = {}) {
  const supabase = useMemo(() => createClient(), []);

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [sector, setSector] = useState("");
  const [description, setDescription] = useState("");
  const [tone, setTone] = useState<ToneOption>("profesional y cercano");
  const [language, setLanguage] = useState<LanguageOption>("es");

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
          `No se pudo cargar la configuración de empresa: ${
            error.message || "sin detalle del error"
          }`
        );
        setIsLoading(false);
        return;
      }

      if (!data) {
        setErrorMessage(
          "No hay ninguna empresa asociada a este usuario. Cierra sesión y vuelve a entrar para completar la configuración inicial."
        );
        setIsLoading(false);
        return;
      }

      setCompanyId(data.id);
      setName(data.name ?? "");
      setSector(normalizeCompanySector(data.sector));
      setDescription(data.description ?? "");
      setTone(normalizeTone(data.tone));
      setLanguage(normalizeLanguage(data.language));
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
    const cleanSector = normalizeCompanySector(sector);
    const cleanDescription = description.trim();

    if (!cleanName) {
      setErrorMessage("El nombre de la empresa es obligatorio.");
      return;
    }

    if (!cleanSector) {
      setErrorMessage("Selecciona el sector de la empresa.");
      return;
    }

    setIsSaving(true);

    const { data: updatedCompany, error } = await supabase
      .from("companies")
      .update({
        name: cleanName,
        sector: cleanSector,
        description: cleanDescription || null,
        tone,
        language,
      })
      .eq("id", companyId)
      .select("id, name, sector, description, tone, language")
      .single<CurrentCompany>();

    setIsSaving(false);

    if (error || !updatedCompany) {
      setErrorMessage(
        `No se pudieron guardar los cambios: ${
          error?.message || "sin detalle del error"
        }`
      );
      return;
    }

    setName(updatedCompany.name ?? "");
    setSector(normalizeCompanySector(updatedCompany.sector));
    setDescription(updatedCompany.description ?? "");
    setTone(normalizeTone(updatedCompany.tone));
    setLanguage(normalizeLanguage(updatedCompany.language));

    onCompanyUpdated?.(updatedCompany);
    setMessage("Configuración guardada correctamente.");
  };

  return (
    <div>
      <PageHeader
        title="Configuración"
        description="Ajusta los datos de tu empresa y las preferencias del asistente."
      />

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

            <p className="mt-2 text-sm leading-6 text-slate-500">
              Estos datos ayudan a COPPE a contextualizar las consultas y a
              preparar respuestas más adecuadas para tu actividad.
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                Nombre de empresa
                <input
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setMessage("");
                    setErrorMessage("");
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                  placeholder="Ej. Hotel Costa Azul"
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Sector
                <select
                  value={sector}
                  onChange={(event) => {
                    setSector(event.target.value);
                    setMessage("");
                    setErrorMessage("");
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                >
                  <option value="">Selecciona un sector</option>

                  {companySectorOptions.map((companySectorOption) => (
                    <option
                      key={companySectorOption}
                      value={companySectorOption}
                    >
                      {companySectorOption}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-medium text-slate-700 md:col-span-2">
                Descripción
                <textarea
                  value={description}
                  onChange={(event) => {
                    setDescription(event.target.value);
                    setMessage("");
                    setErrorMessage("");
                  }}
                  className="mt-1 min-h-[120px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                  placeholder="Describe brevemente qué hace la empresa y qué tipo de consultas recibe."
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

            <Button
              className="mt-5"
              onClick={handleSave}
              disabled={isSaving || isLoading}
            >
              {isSaving ? "Guardando..." : "Guardar cambios"}
            </Button>
          </div>

          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-950">
                Preferencias del asistente
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Define el tono y el idioma principal que COPPE usará como base
                al preparar respuestas.
              </p>

              <div className="mt-5 space-y-4">
                <label className="block text-sm font-medium text-slate-700">
                  Tono
                  <select
                    value={tone}
                    onChange={(event) => {
                      setTone(normalizeTone(event.target.value));
                      setMessage("");
                      setErrorMessage("");
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                  >
                    <option value="profesional y cercano">
                      Profesional y cercano
                    </option>
                    <option value="formal">Formal</option>
                    <option value="directo">Directo</option>
                    <option value="amable y detallado">
                      Amable y detallado
                    </option>
                  </select>
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Idioma principal
                  <select
                    value={language}
                    onChange={(event) => {
                      setLanguage(normalizeLanguage(event.target.value));
                      setMessage("");
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

            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm leading-6 text-slate-600 shadow-sm">
              <h3 className="font-bold text-slate-950">
                Cómo se aplican estos ajustes
              </h3>

              <p className="mt-2">
                La información de empresa se usa para contextualizar nuevas
                consultas, recomendaciones internas y respuestas sugeridas.
              </p>

              <p className="mt-3">
                Puedes modificar estos datos cuando cambie tu actividad,
                servicio, estilo de comunicación o idioma principal.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}