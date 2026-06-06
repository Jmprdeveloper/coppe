"use client";

import { useEffect, useMemo, useState } from "react";

import {
  companySectorOptions,
  normalizeCompanySector,
} from "../lib/companyOptions";
import { canManageCompanySettings } from "../lib/companyPermissions";
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

type PublicIntakeSettingsRow = {
  public_intake_token: string | null;
  public_intake_enabled: boolean | null;
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

function createPublicIntakeToken() {
  return crypto.randomUUID();
}

export function SettingsPage({ onCompanyUpdated }: SettingsPageProps = {}) {
  const supabase = useMemo(() => createClient(), []);

  const [currentCompany, setCurrentCompany] = useState<CurrentCompany | null>(
    null
  );

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [sector, setSector] = useState("");
  const [description, setDescription] = useState("");
  const [tone, setTone] = useState<ToneOption>("profesional y cercano");
  const [language, setLanguage] = useState<LanguageOption>("es");

  const [publicIntakeToken, setPublicIntakeToken] = useState("");
  const [publicIntakeEnabled, setPublicIntakeEnabled] = useState(false);
  const [publicFormOrigin, setPublicFormOrigin] = useState("");
  const [isUpdatingPublicIntake, setIsUpdatingPublicIntake] = useState(false);
  const [publicIntakeMessage, setPublicIntakeMessage] = useState("");
  const [publicIntakeErrorMessage, setPublicIntakeErrorMessage] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [copyErrorMessage, setCopyErrorMessage] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const canEditCompanySettings = canManageCompanySettings(currentCompany);

  useEffect(() => {
    setPublicFormOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    async function loadCompanySettings() {
      setIsLoading(true);
      setCurrentCompany(null);
      setErrorMessage("");
      setMessage("");
      setPublicIntakeMessage("");
      setPublicIntakeErrorMessage("");
      setCopyMessage("");
      setCopyErrorMessage("");

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

      const { data: publicIntakeSettings, error: publicIntakeSettingsError } =
        await supabase
          .from("companies")
          .select("public_intake_token, public_intake_enabled")
          .eq("id", data.id)
          .maybeSingle<PublicIntakeSettingsRow>();

      if (publicIntakeSettingsError) {
        setErrorMessage(
          `No se pudo cargar la configuración del formulario público: ${
            publicIntakeSettingsError.message || "sin detalle del error"
          }`
        );
        setIsLoading(false);
        return;
      }

      setCurrentCompany(data);
      setCompanyId(data.id);
      setName(data.name ?? "");
      setSector(normalizeCompanySector(data.sector));
      setDescription(data.description ?? "");
      setTone(normalizeTone(data.tone));
      setLanguage(normalizeLanguage(data.language));
      setPublicIntakeToken(publicIntakeSettings?.public_intake_token ?? "");
      setPublicIntakeEnabled(
        Boolean(publicIntakeSettings?.public_intake_enabled)
      );
      setIsLoading(false);
    }

    loadCompanySettings();
  }, [supabase]);

  const publicIntakeUrl =
    publicFormOrigin && publicIntakeToken
      ? `${publicFormOrigin}/contacto/${publicIntakeToken}`
      : "";

  const handleCopyPublicIntakeUrl = async () => {
    setCopyMessage("");
    setCopyErrorMessage("");
    setPublicIntakeMessage("");
    setPublicIntakeErrorMessage("");

    if (!publicIntakeUrl) {
      setCopyErrorMessage("No hay ningún enlace público disponible.");
      return;
    }

    try {
      await navigator.clipboard.writeText(publicIntakeUrl);
      setCopyMessage("Enlace copiado correctamente.");
    } catch {
      setCopyErrorMessage(
        "No se pudo copiar el enlace. Puedes seleccionarlo y copiarlo manualmente."
      );
    }
  };

  const handleTogglePublicIntakeEnabled = async () => {
    setPublicIntakeMessage("");
    setPublicIntakeErrorMessage("");
    setCopyMessage("");
    setCopyErrorMessage("");

    if (!canEditCompanySettings) {
      setPublicIntakeErrorMessage(
        "Solo un usuario owner puede modificar el formulario web público."
      );
      return;
    }

    if (!companyId) {
      setPublicIntakeErrorMessage(
        "No se puede actualizar el formulario porque no hay empresa cargada."
      );
      return;
    }

    const nextEnabled = !publicIntakeEnabled;

    if (
      !nextEnabled &&
      !window.confirm(
        "¿Seguro que quieres desactivar el formulario web público? El enlace dejará de estar disponible para nuevos mensajes."
      )
    ) {
      return;
    }

    setIsUpdatingPublicIntake(true);

    const { data, error } = await supabase
      .from("companies")
      .update({
        public_intake_enabled: nextEnabled,
      })
      .eq("id", companyId)
      .select("public_intake_token, public_intake_enabled")
      .single<PublicIntakeSettingsRow>();

    setIsUpdatingPublicIntake(false);

    if (error || !data) {
      setPublicIntakeErrorMessage(
        `No se pudo actualizar el formulario público: ${
          error?.message || "sin detalle del error"
        }`
      );
      return;
    }

    setPublicIntakeToken(data.public_intake_token ?? publicIntakeToken);
    setPublicIntakeEnabled(Boolean(data.public_intake_enabled));
    setPublicIntakeMessage(
      nextEnabled
        ? "Formulario web público activado correctamente."
        : "Formulario web público desactivado correctamente."
    );
  };

  const handleRegeneratePublicIntakeToken = async () => {
    setPublicIntakeMessage("");
    setPublicIntakeErrorMessage("");
    setCopyMessage("");
    setCopyErrorMessage("");

    if (!canEditCompanySettings) {
      setPublicIntakeErrorMessage(
        "Solo un usuario owner puede regenerar el enlace del formulario web público."
      );
      return;
    }

    if (!companyId) {
      setPublicIntakeErrorMessage(
        "No se puede regenerar el enlace porque no hay empresa cargada."
      );
      return;
    }

    if (
      !window.confirm(
        "¿Seguro que quieres regenerar el enlace público? El enlace anterior dejará de funcionar."
      )
    ) {
      return;
    }

    const nextToken = createPublicIntakeToken();

    setIsUpdatingPublicIntake(true);

    const { data, error } = await supabase
      .from("companies")
      .update({
        public_intake_token: nextToken,
      })
      .eq("id", companyId)
      .select("public_intake_token, public_intake_enabled")
      .single<PublicIntakeSettingsRow>();

    setIsUpdatingPublicIntake(false);

    if (error || !data?.public_intake_token) {
      setPublicIntakeErrorMessage(
        `No se pudo regenerar el enlace público: ${
          error?.message || "sin detalle del error"
        }`
      );
      return;
    }

    setPublicIntakeToken(data.public_intake_token);
    setPublicIntakeEnabled(Boolean(data.public_intake_enabled));
    setPublicIntakeMessage(
      "Enlace público regenerado correctamente. El enlace anterior ya no funcionará."
    );
  };

  const handleSave = async () => {
    setErrorMessage("");
    setMessage("");
    setPublicIntakeMessage("");
    setPublicIntakeErrorMessage("");
    setCopyMessage("");
    setCopyErrorMessage("");

    if (!canEditCompanySettings) {
      setErrorMessage(
        "Solo un usuario owner puede modificar la configuración de empresa."
      );
      return;
    }

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

    const nextCurrentCompany: CurrentCompany = {
      ...updatedCompany,
      userRole: currentCompany?.userRole,
    };

    setCurrentCompany(nextCurrentCompany);
    setName(nextCurrentCompany.name ?? "");
    setSector(normalizeCompanySector(nextCurrentCompany.sector));
    setDescription(nextCurrentCompany.description ?? "");
    setTone(normalizeTone(nextCurrentCompany.tone));
    setLanguage(normalizeLanguage(nextCurrentCompany.language));

    onCompanyUpdated?.(nextCurrentCompany);
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
              Estos datos ayudan a COPPE a contextualizar los mensajes, casos y
              respuestas de la empresa, y a preparar respuestas más adecuadas
              para tu actividad.
            </p>

            {!canEditCompanySettings ? (
              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
                Tu usuario puede consultar esta configuración, pero solo un
                usuario owner puede modificarla.
              </div>
            ) : null}

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                Nombre de empresa
                <input
                  value={name}
                  disabled={!canEditCompanySettings}
                  onChange={(event) => {
                    setName(event.target.value);
                    setMessage("");
                    setErrorMessage("");
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                  placeholder="Introduce el nombre de la empresa"
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Sector
                <select
                  value={sector}
                  disabled={!canEditCompanySettings}
                  onChange={(event) => {
                    setSector(event.target.value);
                    setMessage("");
                    setErrorMessage("");
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
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
                  disabled={!canEditCompanySettings}
                  onChange={(event) => {
                    setDescription(event.target.value);
                    setMessage("");
                    setErrorMessage("");
                  }}
                  className="mt-1 min-h-[120px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                  placeholder="Describe brevemente qué hace la empresa y qué tipo de mensajes o casos recibe de sus clientes."
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
              disabled={isSaving || isLoading || !canEditCompanySettings}
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
                    disabled={!canEditCompanySettings}
                    onChange={(event) => {
                      setTone(normalizeTone(event.target.value));
                      setMessage("");
                      setErrorMessage("");
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
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
                    disabled={!canEditCompanySettings}
                    onChange={(event) => {
                      setLanguage(normalizeLanguage(event.target.value));
                      setMessage("");
                      setErrorMessage("");
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                  >
                    <option value="es">Español</option>
                    <option value="en">Inglés</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-950">
                Formulario web público
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Comparte este enlace para recibir mensajes desde un formulario
                público. Los mensajes crearán casos automáticamente con el canal
                Formulario web.
              </p>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Estado
                </div>

                <div className="mt-1 font-medium text-slate-800">
                  {publicIntakeEnabled ? "Activo" : "Desactivado"}
                </div>
              </div>

              <label className="mt-4 block text-sm font-medium text-slate-700">
                Enlace público
                <input
                  value={publicIntakeUrl || "Enlace no disponible"}
                  readOnly
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none"
                />
              </label>

              {publicIntakeErrorMessage ? (
                <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {publicIntakeErrorMessage}
                </div>
              ) : null}

              {publicIntakeMessage ? (
                <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {publicIntakeMessage}
                </div>
              ) : null}

              {copyErrorMessage ? (
                <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {copyErrorMessage}
                </div>
              ) : null}

              {copyMessage ? (
                <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {copyMessage}
                </div>
              ) : null}

              <div className="mt-4 space-y-2">
                <Button
                  className="w-full"
                  onClick={handleCopyPublicIntakeUrl}
                  disabled={!publicIntakeUrl || isUpdatingPublicIntake}
                >
                  Copiar enlace
                </Button>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    className="w-full"
                    variant={publicIntakeEnabled ? "secondary" : "primary"}
                    onClick={handleTogglePublicIntakeEnabled}
                    disabled={
                      isUpdatingPublicIntake ||
                      !publicIntakeToken ||
                      !canEditCompanySettings
                    }
                  >
                    {isUpdatingPublicIntake
                      ? "Actualizando..."
                      : publicIntakeEnabled
                        ? "Desactivar"
                        : "Activar"}
                  </Button>

                  <Button
                    className="w-full"
                    variant="ghost"
                    onClick={handleRegeneratePublicIntakeToken}
                    disabled={
                      isUpdatingPublicIntake ||
                      !companyId ||
                      !canEditCompanySettings
                    }
                  >
                    Regenerar enlace
                  </Button>
                </div>
              </div>

              {!publicIntakeEnabled ? (
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  El enlace existe, pero no aceptará nuevos mensajes mientras el
                  formulario esté desactivado.
                </p>
              ) : null}

              <p className="mt-3 text-xs leading-5 text-slate-500">
                Si regeneras el enlace, el enlace anterior dejará de funcionar
                y tendrás que compartir el nuevo.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm leading-6 text-slate-600 shadow-sm">
              <h3 className="font-bold text-slate-950">
                Cómo se aplican estos ajustes
              </h3>

              <p className="mt-2">
                La información de empresa se usa para contextualizar nuevos
                casos, recomendaciones internas y borradores de respuesta.
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