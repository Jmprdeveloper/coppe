"use client";

import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  Building2,
  FileText,
  MessageCircle,
  MessageSquareText,
  RadioTower,
} from "lucide-react";

import {
  companySectorOptions,
  normalizeCompanySector,
} from "../lib/companyOptions";
import { canManageCompanySettings } from "../lib/companyPermissions";
import { getCurrentCompany, type CurrentCompany } from "../lib/currentCompany";
import { createClient } from "../lib/supabase/client";
import { Button } from "./Button";
import { MetricCard } from "./MetricCard";
import { PageHeader } from "./PageHeader";
import { SectionCard } from "./SectionCard";
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

type ChannelStatus = "active" | "inactive" | "not_configured";

type ChannelSettingsCardProps = {
  title: string;
  description: string;
  status: ChannelStatus;
  children: ReactNode;
  actions?: ReactNode;
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

function ChannelSettingsCard({
  title,
  description,
  status,
  children,
  actions,
}: ChannelSettingsCardProps) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/50">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-bold text-slate-950">{title}</h3>

          <p className="mt-1 text-sm leading-6 text-slate-500">
            {description}
          </p>
        </div>

        <ChannelStatusPill status={status} />
      </div>

      <div className="mt-4">{children}</div>

      {actions ? (
        <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
          {actions}
        </div>
      ) : null}
    </article>
  );
}

function MetricCardsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="h-[116px] animate-pulse rounded-2xl border border-slate-200 bg-slate-100/80 shadow-sm shadow-slate-200/60"
        />
      ))}
    </div>
  );
}


function subscribeToPublicFormOriginChanges() {
  return () => undefined;
}

function getPublicFormOriginSnapshot() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.location.origin;
}

function getPublicFormOriginServerSnapshot() {
  return "";
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
  const publicFormOrigin = useSyncExternalStore(
    subscribeToPublicFormOriginChanges,
    getPublicFormOriginSnapshot,
    getPublicFormOriginServerSnapshot
  );

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
        <div className="space-y-5">
          <MetricCardsSkeleton />

          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
            Cargando configuración de empresa...
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              title="Empresa"
              value={name || "Sin nombre"}
              caption={sector || "Sector no indicado"}
              icon={Building2}
              tone="brand"
            />

            <MetricCard
              title="Canales activos"
              value={`${activeChannelCount}/3`}
              caption="Formulario, chat y WhatsApp"
              icon={RadioTower}
              tone="info"
            />

            <MetricCard
              title="Formulario web"
              value={getChannelStatusLabel(publicIntakeChannelStatus)}
              caption="Página pública de contacto"
              icon={FileText}
              tone="warning"
            />

            <MetricCard
              title="Chat web"
              value={getChannelStatusLabel(publicChatChannelStatus)}
              caption="Experiencia tipo conversación"
              icon={MessageSquareText}
              tone="neutral"
            />

            <MetricCard
              title="WhatsApp"
              value={getChannelStatusLabel(whatsAppChannelStatus)}
              caption={
                whatsAppPhoneNumberId
                  ? "Business Cloud API"
                  : "Pendiente de configurar"
              }
              icon={MessageCircle}
              tone="success"
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
            <div className="space-y-5">
              <SectionCard
                title="Información de empresa"
                description="Estos datos ayudan a COPPE a contextualizar los mensajes, casos y respuestas de la empresa."
              >
                {!canEditCompanySettings ? (
                  <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
                    Tu usuario puede consultar esta configuración, pero solo un
                    usuario owner puede modificarla.
                  </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2">
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
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-[#0F4C5C] focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
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
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-[#0F4C5C] focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
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
                      className="mt-1 min-h-[120px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-[#0F4C5C] focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
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
              </SectionCard>

              <SectionCard
                title="Canales de entrada"
                description="Gestiona los enlaces públicos y el canal WhatsApp. Las tarjetas son blancas; el estado se muestra en badges y acciones."
                action={
                  <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-700">
                    Activos: {activeChannelCount}/3
                  </div>
                }
              >
                <div className="space-y-4">
                  <ChannelSettingsCard
                    title="Formulario web"
                    description="Recibe solicitudes estructuradas desde una página de contacto pública."
                    status={publicIntakeChannelStatus}
                    actions={
                      <>
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
                      </>
                    }
                  >
                    <label className="block text-sm font-medium text-slate-700">
                      Enlace público
                      <input
                        value={publicIntakeUrl || "Enlace no disponible"}
                        readOnly
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none"
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
                        El enlace existe, pero no aceptará nuevos mensajes
                        mientras el formulario web esté desactivado.
                      </p>
                    ) : null}
                  </ChannelSettingsCard>

                  <ChannelSettingsCard
                    title="Chat web"
                    description="Capta consultas desde una experiencia visual tipo conversación."
                    status={publicChatChannelStatus}
                    actions={
                      <>
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
                      </>
                    }
                  >
                    <label className="block text-sm font-medium text-slate-700">
                      Enlace público
                      <input
                        value={publicChatUrl || "Enlace no disponible"}
                        readOnly
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none"
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
                        El enlace existe, pero no aceptará nuevos mensajes
                        mientras el chat web esté desactivado.
                      </p>
                    ) : null}
                  </ChannelSettingsCard>

                  <ChannelSettingsCard
                    title="WhatsApp"
                    description="Entrada automática desde WhatsApp Business Cloud API."
                    status={whatsAppChannelStatus}
                    actions={
                      <>
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
                          disabled={
                            isSavingWhatsAppChannel || !canEditCompanySettings
                          }
                        >
                          {isSavingWhatsAppChannel
                            ? "Guardando..."
                            : "Guardar configuración"}
                        </Button>

                        <Button
                          className="w-full sm:w-auto"
                          variant={whatsAppEnabled ? "secondary" : "primary"}
                          onClick={handleToggleWhatsAppEnabled}
                          disabled={
                            isSavingWhatsAppChannel || !canEditCompanySettings
                          }
                        >
                          {isSavingWhatsAppChannel
                            ? "Actualizando..."
                            : whatsAppEnabled
                              ? "Desactivar"
                              : "Activar"}
                        </Button>
                      </>
                    }
                  >
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="block text-sm font-medium text-slate-700 md:col-span-2">
                        URL del webhook
                        <input
                          value={whatsAppWebhookUrl || "URL no disponible"}
                          readOnly
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none"
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
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-[#0F4C5C] focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
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
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-[#0F4C5C] focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                          placeholder="Ej. +34 600 000 000"
                        />
                      </label>
                    </div>

                    <p className="mt-3 text-xs leading-5 text-slate-500">
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
                  </ChannelSettingsCard>
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
                      como el enlace del chat cambiarán. Los estados de cada
                      canal se mantendrán.
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
              </SectionCard>
            </div>

            <aside className="space-y-5">
              <TeamSettingsCard />

              <SectionCard
                title="Preferencias del asistente"
                description="Define el tono y el idioma principal que COPPE usará como base al preparar respuestas."
              >
                <div className="space-y-4">
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
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-[#0F4C5C] focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
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
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-[#0F4C5C] focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                    >
                      <option value="es">Español</option>
                      <option value="en">Inglés</option>
                    </select>
                  </label>
                </div>
              </SectionCard>

              <SectionCard title="Cómo se aplican estos ajustes">
                <div className="space-y-3 text-sm leading-6 text-slate-600">
                  <p>
                    La información de empresa se usa para contextualizar nuevos
                    casos, recomendaciones internas y borradores de respuesta.
                  </p>

                  <p>
                    Puedes modificar estos datos cuando cambie tu actividad,
                    servicio, estilo de comunicación o idioma principal.
                  </p>
                </div>
              </SectionCard>
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}
