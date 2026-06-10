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
import { TeamSettingsCard } from "./TeamSettingsCard";

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
  public_chat_enabled: boolean | null;
};

type InboundWhatsAppChannelSettingsRow = {
  id: string;
  phone_number_id: string;
  display_phone_number: string | null;
  enabled: boolean;
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

type ChannelStatus = "active" | "inactive" | "not_configured";

function getChannelStatusLabel(status: ChannelStatus) {
  if (status === "active") {
    return "Activo";
  }

  if (status === "inactive") {
    return "Desactivado";
  }

  return "No configurado";
}

function getChannelStatusClassName(status: ChannelStatus) {
  if (status === "active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "inactive") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-600";
}

function ChannelStatusPill({ status }: { status: ChannelStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${getChannelStatusClassName(
        status
      )}`}
    >
      {getChannelStatusLabel(status)}
    </span>
  );
}

type ChannelAccent = "form" | "chat" | "whatsapp";

type ChannelOverviewCardProps = {
  title: string;
  description: string;
  status: ChannelStatus;
  detail: string;
  detailLabel: string;
  accent: ChannelAccent;
  shortCode: string;
};

function getChannelAccentClassName(accent: ChannelAccent) {
  if (accent === "form") {
    return {
      card: "border-cyan-200 bg-cyan-50/50 shadow-cyan-100/60",
      bar: "bg-cyan-600",
      icon: "bg-cyan-700 text-white",
      detail: "border-cyan-100 bg-white text-cyan-950",
    };
  }

  if (accent === "chat") {
    return {
      card: "border-violet-200 bg-violet-50/50 shadow-violet-100/60",
      bar: "bg-violet-600",
      icon: "bg-violet-700 text-white",
      detail: "border-violet-100 bg-white text-violet-950",
    };
  }

  return {
    card: "border-emerald-200 bg-emerald-50/50 shadow-emerald-100/60",
    bar: "bg-emerald-600",
    icon: "bg-emerald-700 text-white",
    detail: "border-emerald-100 bg-white text-emerald-950",
  };
}

function ChannelOverviewCard({
  title,
  description,
  status,
  detail,
  detailLabel,
  accent,
  shortCode,
}: ChannelOverviewCardProps) {
  const accentClassName = getChannelAccentClassName(accent);

  return (
    <article
      className={`overflow-hidden rounded-3xl border shadow-md ${accentClassName.card}`}
    >
      <div className={`h-2 ${accentClassName.bar}`} />

      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xs font-black tracking-wide ${accentClassName.icon}`}
            >
              {shortCode}
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-950">{title}</h3>
              <p className="mt-1 text-sm leading-5 text-slate-600">
                {description}
              </p>
            </div>
          </div>

          <ChannelStatusPill status={status} />
        </div>

        <div
          className={`mt-5 rounded-2xl border px-4 py-3 ${accentClassName.detail}`}
        >
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
            {detailLabel}
          </div>

          <div className="mt-1 break-all text-xs font-semibold leading-5">
            {detail}
          </div>
        </div>
      </div>
    </article>
  );
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
  const [publicChatEnabled, setPublicChatEnabled] = useState(false);
  const [publicFormOrigin, setPublicFormOrigin] = useState("");
  const [isUpdatingPublicIntake, setIsUpdatingPublicIntake] = useState(false);
  const [isUpdatingPublicChat, setIsUpdatingPublicChat] = useState(false);
  const [publicIntakeMessage, setPublicIntakeMessage] = useState("");
  const [publicIntakeErrorMessage, setPublicIntakeErrorMessage] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [copyErrorMessage, setCopyErrorMessage] = useState("");
  const [publicChatCopyMessage, setPublicChatCopyMessage] = useState("");
  const [publicChatCopyErrorMessage, setPublicChatCopyErrorMessage] =
    useState("");

  const [whatsAppChannelId, setWhatsAppChannelId] = useState("");
  const [whatsAppPhoneNumberId, setWhatsAppPhoneNumberId] = useState("");
  const [whatsAppDisplayPhoneNumber, setWhatsAppDisplayPhoneNumber] =
    useState("");
  const [whatsAppEnabled, setWhatsAppEnabled] = useState(false);
  const [isSavingWhatsAppChannel, setIsSavingWhatsAppChannel] = useState(false);
  const [whatsAppMessage, setWhatsAppMessage] = useState("");
  const [whatsAppErrorMessage, setWhatsAppErrorMessage] = useState("");
  const [whatsAppCopyMessage, setWhatsAppCopyMessage] = useState("");
  const [whatsAppCopyErrorMessage, setWhatsAppCopyErrorMessage] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const canEditCompanySettings = canManageCompanySettings(currentCompany);
  const isUpdatingPublicChannels =
    isUpdatingPublicIntake || isUpdatingPublicChat;

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
      setPublicChatCopyMessage("");
      setPublicChatCopyErrorMessage("");
      setWhatsAppMessage("");
      setWhatsAppErrorMessage("");
      setWhatsAppCopyMessage("");
      setWhatsAppCopyErrorMessage("");
      setWhatsAppChannelId("");
      setWhatsAppPhoneNumberId("");
      setWhatsAppDisplayPhoneNumber("");
      setWhatsAppEnabled(false);
      setPublicChatEnabled(false);

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
          .select(
            "public_intake_token, public_intake_enabled, public_chat_enabled"
          )
          .eq("id", data.id)
          .maybeSingle<PublicIntakeSettingsRow>();

      if (publicIntakeSettingsError) {
        setErrorMessage(
          `No se pudo cargar la configuración de los canales públicos: ${
            publicIntakeSettingsError.message || "sin detalle del error"
          }`
        );
        setIsLoading(false);
        return;
      }

      const { data: whatsAppChannelSettings, error: whatsAppChannelError } =
        await supabase
          .from("inbound_whatsapp_channels")
          .select("id, phone_number_id, display_phone_number, enabled")
          .eq("company_id", data.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle<InboundWhatsAppChannelSettingsRow>();

      if (whatsAppChannelError) {
        setErrorMessage(
          `No se pudo cargar la configuración de WhatsApp: ${
            whatsAppChannelError.message || "sin detalle del error"
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
      setPublicChatEnabled(Boolean(publicIntakeSettings?.public_chat_enabled));
      setWhatsAppChannelId(whatsAppChannelSettings?.id ?? "");
      setWhatsAppPhoneNumberId(
        whatsAppChannelSettings?.phone_number_id ?? ""
      );
      setWhatsAppDisplayPhoneNumber(
        whatsAppChannelSettings?.display_phone_number ?? ""
      );
      setWhatsAppEnabled(Boolean(whatsAppChannelSettings?.enabled));
      setIsLoading(false);
    }

    loadCompanySettings();
  }, [supabase]);

  const publicIntakeUrl =
    publicFormOrigin && publicIntakeToken
      ? `${publicFormOrigin}/contacto/${publicIntakeToken}`
      : "";

  const publicChatUrl =
    publicFormOrigin && publicIntakeToken
      ? `${publicFormOrigin}/chat/${publicIntakeToken}`
      : "";

  const whatsAppWebhookUrl = publicFormOrigin
    ? `${publicFormOrigin}/api/inbound-whatsapp`
    : "";



  const publicIntakeChannelStatus: ChannelStatus = publicIntakeEnabled
    ? "active"
    : "inactive";

  const publicChatChannelStatus: ChannelStatus = publicChatEnabled
    ? "active"
    : "inactive";

  const whatsAppChannelStatus: ChannelStatus = whatsAppPhoneNumberId
    ? whatsAppEnabled
      ? "active"
      : "inactive"
    : "not_configured";

  const activeChannelCount = [
    publicIntakeChannelStatus,
    publicChatChannelStatus,
    whatsAppChannelStatus,
  ].filter((channelStatus) => channelStatus === "active").length;

  const handleCopyPublicIntakeUrl = async () => {
    setCopyMessage("");
    setCopyErrorMessage("");
    setPublicChatCopyMessage("");
    setPublicChatCopyErrorMessage("");
    setPublicIntakeMessage("");
    setPublicIntakeErrorMessage("");

    if (!publicIntakeUrl) {
      setCopyErrorMessage("No hay ningún enlace del formulario disponible.");
      return;
    }

    try {
      await navigator.clipboard.writeText(publicIntakeUrl);
      setCopyMessage("Enlace del formulario copiado correctamente.");
    } catch {
      setCopyErrorMessage(
        "No se pudo copiar el enlace. Puedes seleccionarlo y copiarlo manualmente."
      );
    }
  };

  const handleCopyPublicChatUrl = async () => {
    setPublicChatCopyMessage("");
    setPublicChatCopyErrorMessage("");
    setCopyMessage("");
    setCopyErrorMessage("");
    setPublicIntakeMessage("");
    setPublicIntakeErrorMessage("");

    if (!publicChatUrl) {
      setPublicChatCopyErrorMessage("No hay ningún enlace de chat disponible.");
      return;
    }

    try {
      await navigator.clipboard.writeText(publicChatUrl);
      setPublicChatCopyMessage("Enlace del chat copiado correctamente.");
    } catch {
      setPublicChatCopyErrorMessage(
        "No se pudo copiar el enlace. Puedes seleccionarlo y copiarlo manualmente."
      );
    }
  };

  const handleCopyWhatsAppWebhookUrl = async () => {
    setWhatsAppCopyMessage("");
    setWhatsAppCopyErrorMessage("");
    setWhatsAppMessage("");
    setWhatsAppErrorMessage("");

    if (!whatsAppWebhookUrl) {
      setWhatsAppCopyErrorMessage("No hay una URL de webhook disponible.");
      return;
    }

    try {
      await navigator.clipboard.writeText(whatsAppWebhookUrl);
      setWhatsAppCopyMessage("URL del webhook copiada correctamente.");
    } catch {
      setWhatsAppCopyErrorMessage(
        "No se pudo copiar la URL. Puedes seleccionarla y copiarla manualmente."
      );
    }
  };

  const handleTogglePublicIntakeEnabled = async () => {
    setPublicIntakeMessage("");
    setPublicIntakeErrorMessage("");
    setCopyMessage("");
    setCopyErrorMessage("");
    setPublicChatCopyMessage("");
    setPublicChatCopyErrorMessage("");

    if (!canEditCompanySettings) {
      setPublicIntakeErrorMessage(
        "Solo un usuario owner puede modificar el formulario web público."
      );
      return;
    }

    if (!companyId) {
      setPublicIntakeErrorMessage(
        "No se puede actualizar el formulario web porque no hay empresa cargada."
      );
      return;
    }

    const nextEnabled = !publicIntakeEnabled;

    if (
      !nextEnabled &&
      !window.confirm(
        "¿Seguro que quieres desactivar el formulario web público? El enlace del formulario dejará de aceptar nuevos mensajes."
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
      .select(
        "public_intake_token, public_intake_enabled, public_chat_enabled"
      )
      .single<PublicIntakeSettingsRow>();

    setIsUpdatingPublicIntake(false);

    if (error || !data) {
      setPublicIntakeErrorMessage(
        `No se pudo actualizar el formulario web: ${
          error?.message || "sin detalle del error"
        }`
      );
      return;
    }

    setPublicIntakeToken(data.public_intake_token ?? publicIntakeToken);
    setPublicIntakeEnabled(Boolean(data.public_intake_enabled));
    setPublicChatEnabled(Boolean(data.public_chat_enabled));
    setPublicIntakeMessage(
      nextEnabled
        ? "Formulario web activado correctamente."
        : "Formulario web desactivado correctamente."
    );
  };

  const handleTogglePublicChatEnabled = async () => {
    setPublicIntakeMessage("");
    setPublicIntakeErrorMessage("");
    setCopyMessage("");
    setCopyErrorMessage("");
    setPublicChatCopyMessage("");
    setPublicChatCopyErrorMessage("");

    if (!canEditCompanySettings) {
      setPublicIntakeErrorMessage(
        "Solo un usuario owner puede modificar el chat web público."
      );
      return;
    }

    if (!companyId) {
      setPublicIntakeErrorMessage(
        "No se puede actualizar el chat web porque no hay empresa cargada."
      );
      return;
    }

    const nextEnabled = !publicChatEnabled;

    if (
      !nextEnabled &&
      !window.confirm(
        "¿Seguro que quieres desactivar el chat web público? El enlace del chat dejará de aceptar nuevos mensajes."
      )
    ) {
      return;
    }

    setIsUpdatingPublicChat(true);

    const { data, error } = await supabase
      .from("companies")
      .update({
        public_chat_enabled: nextEnabled,
      })
      .eq("id", companyId)
      .select(
        "public_intake_token, public_intake_enabled, public_chat_enabled"
      )
      .single<PublicIntakeSettingsRow>();

    setIsUpdatingPublicChat(false);

    if (error || !data) {
      setPublicIntakeErrorMessage(
        `No se pudo actualizar el chat web: ${
          error?.message || "sin detalle del error"
        }`
      );
      return;
    }

    setPublicIntakeToken(data.public_intake_token ?? publicIntakeToken);
    setPublicIntakeEnabled(Boolean(data.public_intake_enabled));
    setPublicChatEnabled(Boolean(data.public_chat_enabled));
    setPublicIntakeMessage(
      nextEnabled
        ? "Chat web activado correctamente."
        : "Chat web desactivado correctamente."
    );
  };

  const handleToggleWhatsAppEnabled = async () => {
    setWhatsAppMessage("");
    setWhatsAppErrorMessage("");
    setWhatsAppCopyMessage("");
    setWhatsAppCopyErrorMessage("");

    if (!canEditCompanySettings) {
      setWhatsAppErrorMessage(
        "Solo un usuario owner puede activar o desactivar el canal WhatsApp."
      );
      return;
    }

    if (!companyId) {
      setWhatsAppErrorMessage(
        "No se puede actualizar WhatsApp porque no hay empresa cargada."
      );
      return;
    }

    const cleanPhoneNumberId = whatsAppPhoneNumberId.trim();
    const cleanDisplayPhoneNumber = whatsAppDisplayPhoneNumber.trim();

    if (!cleanPhoneNumberId) {
      setWhatsAppErrorMessage(
        "Introduce el Phone number ID de Meta antes de activar WhatsApp."
      );
      return;
    }

    if (cleanPhoneNumberId.length > 120) {
      setWhatsAppErrorMessage(
        "El Phone number ID no puede superar los 120 caracteres."
      );
      return;
    }

    if (cleanDisplayPhoneNumber.length > 40) {
      setWhatsAppErrorMessage(
        "El número visible no puede superar los 40 caracteres."
      );
      return;
    }

    const nextEnabled = !whatsAppEnabled;

    if (
      !nextEnabled &&
      !window.confirm(
        "¿Seguro que quieres desactivar WhatsApp? COPPE rechazará nuevos mensajes entrantes para este número."
      )
    ) {
      return;
    }

    setIsSavingWhatsAppChannel(true);

    const query = whatsAppChannelId
      ? supabase
          .from("inbound_whatsapp_channels")
          .update({
            phone_number_id: cleanPhoneNumberId,
            display_phone_number: cleanDisplayPhoneNumber || null,
            enabled: nextEnabled,
          })
          .eq("id", whatsAppChannelId)
          .select("id, phone_number_id, display_phone_number, enabled")
          .single<InboundWhatsAppChannelSettingsRow>()
      : supabase
          .from("inbound_whatsapp_channels")
          .insert({
            company_id: companyId,
            phone_number_id: cleanPhoneNumberId,
            display_phone_number: cleanDisplayPhoneNumber || null,
            provider: "meta",
            enabled: nextEnabled,
          })
          .select("id, phone_number_id, display_phone_number, enabled")
          .single<InboundWhatsAppChannelSettingsRow>();

    const { data, error } = await query;

    setIsSavingWhatsAppChannel(false);

    if (error || !data) {
      setWhatsAppErrorMessage(
        `No se pudo actualizar WhatsApp: ${
          error?.message || "sin detalle del error"
        }`
      );
      return;
    }

    setWhatsAppChannelId(data.id);
    setWhatsAppPhoneNumberId(data.phone_number_id);
    setWhatsAppDisplayPhoneNumber(data.display_phone_number ?? "");
    setWhatsAppEnabled(Boolean(data.enabled));
    setWhatsAppMessage(
      nextEnabled
        ? "Canal WhatsApp activado correctamente."
        : "Canal WhatsApp desactivado correctamente."
    );
  };

  const handleRegeneratePublicIntakeToken = async () => {
    setPublicIntakeMessage("");
    setPublicIntakeErrorMessage("");
    setCopyMessage("");
    setCopyErrorMessage("");
    setPublicChatCopyMessage("");
    setPublicChatCopyErrorMessage("");

    if (!canEditCompanySettings) {
      setPublicIntakeErrorMessage(
        "Solo un usuario owner puede regenerar los enlaces públicos."
      );
      return;
    }

    if (!companyId) {
      setPublicIntakeErrorMessage(
        "No se pueden regenerar los enlaces porque no hay empresa cargada."
      );
      return;
    }

    if (
      !window.confirm(
        "¿Seguro que quieres regenerar los enlaces públicos? Los enlaces anteriores del formulario y del chat dejarán de funcionar."
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
      .select(
        "public_intake_token, public_intake_enabled, public_chat_enabled"
      )
      .single<PublicIntakeSettingsRow>();

    setIsUpdatingPublicIntake(false);

    if (error || !data?.public_intake_token) {
      setPublicIntakeErrorMessage(
        `No se pudieron regenerar los enlaces públicos: ${
          error?.message || "sin detalle del error"
        }`
      );
      return;
    }

    setPublicIntakeToken(data.public_intake_token);
    setPublicIntakeEnabled(Boolean(data.public_intake_enabled));
    setPublicChatEnabled(Boolean(data.public_chat_enabled));
    setPublicIntakeMessage(
      "Enlaces públicos regenerados correctamente. Los enlaces anteriores ya no funcionarán."
    );
  };

  const handleSaveWhatsAppChannel = async () => {
    setWhatsAppMessage("");
    setWhatsAppErrorMessage("");
    setWhatsAppCopyMessage("");
    setWhatsAppCopyErrorMessage("");

    if (!canEditCompanySettings) {
      setWhatsAppErrorMessage(
        "Solo un usuario owner puede modificar el canal WhatsApp."
      );
      return;
    }

    if (!companyId) {
      setWhatsAppErrorMessage(
        "No se puede guardar WhatsApp porque no hay empresa cargada."
      );
      return;
    }

    const cleanPhoneNumberId = whatsAppPhoneNumberId.trim();
    const cleanDisplayPhoneNumber = whatsAppDisplayPhoneNumber.trim();

    if (!cleanPhoneNumberId) {
      setWhatsAppErrorMessage(
        "Introduce el Phone number ID de Meta para activar el canal WhatsApp."
      );
      return;
    }

    if (cleanPhoneNumberId.length > 120) {
      setWhatsAppErrorMessage(
        "El Phone number ID no puede superar los 120 caracteres."
      );
      return;
    }

    if (cleanDisplayPhoneNumber.length > 40) {
      setWhatsAppErrorMessage(
        "El número visible no puede superar los 40 caracteres."
      );
      return;
    }

    setIsSavingWhatsAppChannel(true);

    const query = whatsAppChannelId
      ? supabase
          .from("inbound_whatsapp_channels")
          .update({
            phone_number_id: cleanPhoneNumberId,
            display_phone_number: cleanDisplayPhoneNumber || null,
            enabled: whatsAppEnabled,
          })
          .eq("id", whatsAppChannelId)
          .select("id, phone_number_id, display_phone_number, enabled")
          .single<InboundWhatsAppChannelSettingsRow>()
      : supabase
          .from("inbound_whatsapp_channels")
          .insert({
            company_id: companyId,
            phone_number_id: cleanPhoneNumberId,
            display_phone_number: cleanDisplayPhoneNumber || null,
            provider: "meta",
            enabled: whatsAppEnabled,
          })
          .select("id, phone_number_id, display_phone_number, enabled")
          .single<InboundWhatsAppChannelSettingsRow>();

    const { data, error } = await query;

    setIsSavingWhatsAppChannel(false);

    if (error || !data) {
      setWhatsAppErrorMessage(
        `No se pudo guardar la configuración de WhatsApp: ${
          error?.message || "sin detalle del error"
        }`
      );
      return;
    }

    setWhatsAppChannelId(data.id);
    setWhatsAppPhoneNumberId(data.phone_number_id);
    setWhatsAppDisplayPhoneNumber(data.display_phone_number ?? "");
    setWhatsAppEnabled(Boolean(data.enabled));
    setWhatsAppMessage("Configuración de WhatsApp guardada correctamente.");
  };

  const handleSave = async () => {
    setErrorMessage("");
    setMessage("");
    setPublicIntakeMessage("");
    setPublicIntakeErrorMessage("");
    setCopyMessage("");
    setCopyErrorMessage("");
    setPublicChatCopyMessage("");
    setPublicChatCopyErrorMessage("");
    setWhatsAppMessage("");
    setWhatsAppErrorMessage("");
    setWhatsAppCopyMessage("");
    setWhatsAppCopyErrorMessage("");

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
        description="Administra los datos de empresa, equipo, canales de entrada y preferencias del asistente."
      />

      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          Cargando configuración de empresa...
        </div>
      ) : (
        <div className="space-y-5">
          <section className="rounded-3xl border border-slate-300 bg-white p-6 shadow-sm">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">
                    Estado de canales
                  </h2>

                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                    Vista rápida de los canales de entrada conectados a COPPE.
                    Cada tarjeta usa un color propio para que puedas distinguir
                    rápidamente qué canal estás revisando.
                  </p>
                </div>

                <div className="rounded-2xl border border-[#0F4C5C]/20 bg-white px-5 py-4 text-sm shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Canales activos
                  </div>

                  <div className="mt-1 text-3xl font-black text-[#0F4C5C]">
                    {activeChannelCount}/3
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <ChannelOverviewCard
                title="Formulario web"
                description="Recibe solicitudes estructuradas desde una página de contacto pública."
                status={publicIntakeChannelStatus}
                detail={publicIntakeUrl || "Enlace no disponible"}
                detailLabel="Enlace público"
                accent="form"
                shortCode="FW"
              />

              <ChannelOverviewCard
                title="Chat web"
                description="Capta consultas con una experiencia visual tipo conversación."
                status={publicChatChannelStatus}
                detail={publicChatUrl || "Enlace no disponible"}
                detailLabel="Enlace público"
                accent="chat"
                shortCode="CW"
              />

              <ChannelOverviewCard
                title="WhatsApp"
                description="Entrada automática desde WhatsApp Business Cloud API."
                status={whatsAppChannelStatus}
                detail={
                  whatsAppPhoneNumberId
                    ? `Phone number ID: ${whatsAppPhoneNumberId}`
                    : "Añade el Phone number ID para activar este canal"
                }
                detailLabel="Configuración"
                accent="whatsapp"
                shortCode="WA"
              />
            </div>
          </section>

          <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
            <div className="space-y-5">
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
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">
                    Canales de entrada
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Gestiona desde un mismo bloque los enlaces públicos y el
                    canal WhatsApp. Todos los canales usan el mismo patrón:
                    estado, configuración y acciones.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Activos
                  </div>
                  <div className="mt-1 font-bold text-slate-950">
                    {activeChannelCount}/3
                  </div>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Formulario web
                      </div>
                      <h3 className="mt-1 font-semibold text-slate-950">
                        Solicitudes estructuradas desde una página pública
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        Útil para webs de empresa, landing pages o enlaces de
                        contacto donde el cliente deja sus datos y mensaje.
                      </p>
                    </div>

                    <ChannelStatusPill status={publicIntakeChannelStatus} />
                  </div>

                  <label className="mt-4 block text-sm font-medium text-slate-700">
                    Enlace público
                    <input
                      value={publicIntakeUrl || "Enlace no disponible"}
                      readOnly
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
                    />
                  </label>

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

                  {!publicIntakeEnabled ? (
                    <p className="mt-3 text-xs leading-5 text-slate-500">
                      El enlace existe, pero no aceptará nuevos mensajes mientras
                      el formulario web esté desactivado.
                    </p>
                  ) : null}

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <Button
                      className="w-full sm:w-auto"
                      variant="secondary"
                      onClick={handleCopyPublicIntakeUrl}
                      disabled={!publicIntakeUrl || isUpdatingPublicChannels}
                    >
                      Copiar enlace
                    </Button>

                    <Button
                      className="w-full sm:w-auto"
                      variant={publicIntakeEnabled ? "secondary" : "primary"}
                      onClick={handleTogglePublicIntakeEnabled}
                      disabled={
                        isUpdatingPublicChannels ||
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
                  </div>
                </article>

                <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Chat web
                      </div>
                      <h3 className="mt-1 font-semibold text-slate-950">
                        Experiencia tipo chat para captar consultas web
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        Canal visual pensado para recibir mensajes desde una
                        página pública o futuras integraciones embebidas.
                      </p>
                    </div>

                    <ChannelStatusPill status={publicChatChannelStatus} />
                  </div>

                  <label className="mt-4 block text-sm font-medium text-slate-700">
                    Enlace público
                    <input
                      value={publicChatUrl || "Enlace no disponible"}
                      readOnly
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
                    />
                  </label>

                  {publicChatCopyErrorMessage ? (
                    <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {publicChatCopyErrorMessage}
                    </div>
                  ) : null}

                  {publicChatCopyMessage ? (
                    <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                      {publicChatCopyMessage}
                    </div>
                  ) : null}

                  {!publicChatEnabled ? (
                    <p className="mt-3 text-xs leading-5 text-slate-500">
                      El enlace existe, pero no aceptará nuevos mensajes mientras
                      el chat web esté desactivado.
                    </p>
                  ) : null}

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <Button
                      className="w-full sm:w-auto"
                      variant="secondary"
                      onClick={handleCopyPublicChatUrl}
                      disabled={!publicChatUrl || isUpdatingPublicChannels}
                    >
                      Copiar enlace
                    </Button>

                    <Button
                      className="w-full sm:w-auto"
                      variant={publicChatEnabled ? "secondary" : "primary"}
                      onClick={handleTogglePublicChatEnabled}
                      disabled={
                        isUpdatingPublicChannels ||
                        !publicIntakeToken ||
                        !canEditCompanySettings
                      }
                    >
                      {isUpdatingPublicChat
                        ? "Actualizando..."
                        : publicChatEnabled
                          ? "Desactivar"
                          : "Activar"}
                    </Button>
                  </div>
                </article>

                <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        WhatsApp
                      </div>
                      <h3 className="mt-1 font-semibold text-slate-950">
                        Entrada automática desde WhatsApp Business Cloud API
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        Los mensajes entrantes de Meta crearán casos con el canal
                        WhatsApp. La activación usa el mismo patrón que el resto
                        de canales.
                      </p>
                    </div>

                    <ChannelStatusPill status={whatsAppChannelStatus} />
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <label className="block text-sm font-medium text-slate-700 md:col-span-2">
                      URL del webhook
                      <input
                        value={whatsAppWebhookUrl || "URL no disponible"}
                        readOnly
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
                      />
                    </label>

                    <label className="block text-sm font-medium text-slate-700">
                      Phone number ID de Meta
                      <input
                        value={whatsAppPhoneNumberId}
                        disabled={!canEditCompanySettings}
                        onChange={(event) => {
                          setWhatsAppPhoneNumberId(event.target.value);
                          setWhatsAppMessage("");
                          setWhatsAppErrorMessage("");
                        }}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0F4C5C] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                        placeholder="Ej. 123456789012345"
                      />
                    </label>

                    <label className="block text-sm font-medium text-slate-700">
                      Número visible
                      <input
                        value={whatsAppDisplayPhoneNumber}
                        disabled={!canEditCompanySettings}
                        onChange={(event) => {
                          setWhatsAppDisplayPhoneNumber(event.target.value);
                          setWhatsAppMessage("");
                          setWhatsAppErrorMessage("");
                        }}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0F4C5C] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                        placeholder="Ej. +34 600 000 000"
                      />
                    </label>
                  </div>

                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    El token de verificación de Meta debe coincidir con
                    WHATSAPP_WEBHOOK_VERIFY_TOKEN. El envío de respuestas por
                    WhatsApp queda para una fase posterior.
                  </p>

                  {whatsAppErrorMessage ? (
                    <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {whatsAppErrorMessage}
                    </div>
                  ) : null}

                  {whatsAppMessage ? (
                    <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                      {whatsAppMessage}
                    </div>
                  ) : null}

                  {whatsAppCopyErrorMessage ? (
                    <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {whatsAppCopyErrorMessage}
                    </div>
                  ) : null}

                  {whatsAppCopyMessage ? (
                    <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                      {whatsAppCopyMessage}
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <Button
                      className="w-full sm:w-auto"
                      variant="secondary"
                      onClick={handleCopyWhatsAppWebhookUrl}
                      disabled={!whatsAppWebhookUrl}
                    >
                      Copiar URL webhook
                    </Button>

                    <Button
                      className="w-full sm:w-auto"
                      variant="secondary"
                      onClick={handleSaveWhatsAppChannel}
                      disabled={isSavingWhatsAppChannel || !canEditCompanySettings}
                    >
                      {isSavingWhatsAppChannel
                        ? "Guardando..."
                        : "Guardar configuración"}
                    </Button>

                    <Button
                      className="w-full sm:w-auto"
                      variant={whatsAppEnabled ? "secondary" : "primary"}
                      onClick={handleToggleWhatsAppEnabled}
                      disabled={isSavingWhatsAppChannel || !canEditCompanySettings}
                    >
                      {isSavingWhatsAppChannel
                        ? "Actualizando..."
                        : whatsAppEnabled
                          ? "Desactivar"
                          : "Activar"}
                    </Button>
                  </div>
                </article>
              </div>

              {publicIntakeErrorMessage ? (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {publicIntakeErrorMessage}
                </div>
              ) : null}

              {publicIntakeMessage ? (
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {publicIntakeMessage}
                </div>
              ) : null}

              <div className="mt-5 border-t border-slate-200 pt-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs leading-5 text-slate-500">
                    Si regeneras los enlaces, tanto el enlace del formulario
                    como el enlace del chat cambiarán. Los estados de cada canal
                    se mantendrán.
                  </p>

                  <Button
                    className="w-full sm:w-auto"
                    variant="ghost"
                    onClick={handleRegeneratePublicIntakeToken}
                    disabled={
                      isUpdatingPublicChannels ||
                      !companyId ||
                      !canEditCompanySettings
                    }
                  >
                    Regenerar enlaces públicos
                  </Button>
                </div>
              </div>
            </div>
            </div>

            <aside className="space-y-5">
              <TeamSettingsCard />

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
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}
