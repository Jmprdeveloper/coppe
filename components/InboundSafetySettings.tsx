"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  CheckCircle2,
  RotateCcw,
  ShieldCheck,
  ShieldX,
} from "lucide-react";

import {
  canManageCompanySettings,
} from "../lib/companyPermissions";
import { getCurrentCompany, type CurrentCompany } from "../lib/currentCompany";
import { createClient } from "../lib/supabase/client";
import { classNames } from "../lib/utils";

import { AutoDismissAlert } from "./AutoDismissAlert";
import { Button } from "./Button";
import { SectionCard } from "./SectionCard";

type AutomationSettings = {
  auto_acknowledgement_enabled: boolean;
  auto_acknowledgement_message: string | null;
  inbound_filter_enabled: boolean;
};

type QuarantineRow = {
  id: string;
  source_channel: string;
  sender_name: string | null;
  sender_email: string | null;
  sender_phone: string | null;
  sender_key: string | null;
  subject: string | null;
  body: string;
  classification: string;
  score: number;
  reasons: string[];
  status: string;
  review_error: string | null;
  created_at: string;
};

const DEFAULT_ACKNOWLEDGEMENT =
  "Hola, gracias por contactar con {empresa}. Hemos recibido tu mensaje correctamente y nuestro equipo lo revisará lo antes posible.";

function classificationLabel(value: string) {
  if (value === "commercial_solicitation") return "Oferta comercial";
  if (value === "automated") return "Mensaje automático";
  if (value === "rate_limited") return "Volumen anómalo";
  if (value === "blocked_sender") return "Remitente bloqueado";
  return "Spam probable";
}

function classificationTone(value: string) {
  if (value === "blocked_sender") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (value === "commercial_solicitation") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Fecha no disponible";

  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function InboundSafetySettings() {
  const supabase = useMemo(() => createClient(), []);
  const [company, setCompany] = useState<CurrentCompany | null>(null);
  const [autoAcknowledgementEnabled, setAutoAcknowledgementEnabled] =
    useState(true);
  const [acknowledgementMessage, setAcknowledgementMessage] = useState(
    DEFAULT_ACKNOWLEDGEMENT,
  );
  const [filterEnabled, setFilterEnabled] = useState(true);
  const [quarantine, setQuarantine] = useState<QuarantineRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const loadData = useCallback(async () => {
    setIsLoading(true);
    const { data: currentCompany, error: companyError } =
      await getCurrentCompany(supabase);

    if (companyError || !currentCompany) {
      setErrorMessage(
        companyError?.message || "No se pudo cargar la empresa actual.",
      );
      setIsLoading(false);
      return;
    }

    setCompany(currentCompany);
    const [settingsResponse, quarantineResponse] = await Promise.all([
      supabase
        .from("companies")
        .select(
          "auto_acknowledgement_enabled, auto_acknowledgement_message, inbound_filter_enabled",
        )
        .eq("id", currentCompany.id)
        .single<AutomationSettings>(),
      supabase
        .from("inbound_message_quarantine")
        .select(
          "id, source_channel, sender_name, sender_email, sender_phone, sender_key, subject, body, classification, score, reasons, status, review_error, created_at",
        )
        .eq("company_id", currentCompany.id)
        .eq("status", "quarantined")
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    if (settingsResponse.error) {
      setErrorMessage(settingsResponse.error.message);
    } else if (settingsResponse.data) {
      setAutoAcknowledgementEnabled(
        settingsResponse.data.auto_acknowledgement_enabled,
      );
      setAcknowledgementMessage(
        settingsResponse.data.auto_acknowledgement_message ||
          DEFAULT_ACKNOWLEDGEMENT,
      );
      setFilterEnabled(settingsResponse.data.inbound_filter_enabled);
    }

    if (quarantineResponse.error) {
      setErrorMessage(quarantineResponse.error.message);
    } else {
      setQuarantine((quarantineResponse.data ?? []) as QuarantineRow[]);
    }

    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadData]);

  const canEdit = canManageCompanySettings(company);

  const handleSave = async () => {
    if (!company || !canEdit) return;

    const cleanMessage = acknowledgementMessage.trim();

    if (!cleanMessage || cleanMessage.length > 1200) {
      setErrorMessage("El mensaje debe contener entre 1 y 1.200 caracteres.");
      return;
    }

    setIsSaving(true);
    setMessage("");
    setErrorMessage("");
    const { error } = await supabase
      .from("companies")
      .update({
        auto_acknowledgement_enabled: autoAcknowledgementEnabled,
        auto_acknowledgement_message: cleanMessage,
        inbound_filter_enabled: filterEnabled,
      })
      .eq("id", company.id);
    setIsSaving(false);

    if (error) {
      setErrorMessage(error.message || "No se pudieron guardar los ajustes.");
      return;
    }

    const { error: auditError } = await supabase.rpc("create_audit_log", {
      target_company_id: company.id,
      audit_action: "update_inbound_automation_settings",
      audit_entity_type: "company",
      audit_entity_id: company.id,
      audit_metadata: {
        auto_acknowledgement_enabled: autoAcknowledgementEnabled,
        inbound_filter_enabled: filterEnabled,
        acknowledgement_message_length: cleanMessage.length,
      },
    });

    if (auditError) {
      console.error(
        "Inbound automation settings saved, but audit log failed:",
        auditError,
      );
      setMessage(
        "Ajustes guardados, pero no se pudo registrar la auditoría.",
      );
      return;
    }

    setMessage("Automatizaciones de entrada guardadas.");
  };

  const handleQuarantineAction = async (
    row: QuarantineRow,
    action: "release" | "discard" | "block",
  ) => {
    setUpdatingId(row.id);
    setErrorMessage("");
    setMessage("");

    try {
      const response = await fetch(`/api/inbound-quarantine/${row.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json()) as {
        error?: string;
        inquiryId?: string;
      };

      if (!response.ok) {
        setErrorMessage(payload.error || "No se pudo revisar el mensaje.");
        return;
      }

      setQuarantine((current) =>
        current.filter((candidate) => candidate.id !== row.id),
      );
      setMessage(
        action === "release"
          ? "Mensaje recuperado: se ha creado un caso y enviado el acuse si el canal está disponible."
          : action === "block"
            ? "Mensaje descartado y remitente bloqueado."
            : "Mensaje descartado.",
      );
    } catch {
      setErrorMessage("No se pudo conectar con COPPE.");
    } finally {
      setUpdatingId("");
    }
  };

  return (
    <div className="space-y-5">
      <SectionCard
        title="Recepción inteligente"
        description="Acuse de cortesía, alertas y protección frente a entradas no deseadas."
        tone="appointment"
      >
        {isLoading ? (
          <p className="text-sm text-slate-500">Cargando ajustes...</p>
        ) : (
          <div className="space-y-4">
            <label className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <span>
                <span className="block text-sm font-semibold text-slate-800">
                  Acuse automático en el primer mensaje
                </span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  Solo se envía una vez y nunca a mensajes en cuarentena.
                </span>
              </span>
              <input
                type="checkbox"
                checked={autoAcknowledgementEnabled}
                disabled={!canEdit}
                onChange={(event) =>
                  setAutoAcknowledgementEnabled(event.target.checked)
                }
                className="mt-1 h-5 w-5 accent-[#0F4C5C]"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Mensaje de cortesía
              <textarea
                value={acknowledgementMessage}
                disabled={!canEdit || !autoAcknowledgementEnabled}
                maxLength={1200}
                onChange={(event) =>
                  setAcknowledgementMessage(event.target.value)
                }
                className="mt-1 min-h-28 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 outline-none focus:border-[#0F4C5C] focus:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              />
              <span className="mt-1 block text-xs text-slate-500">
                Usa {"{empresa}"} para insertar el nombre automáticamente.{" "}
                {acknowledgementMessage.length}/1200
              </span>
            </label>

            <label className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <span>
                <span className="block text-sm font-semibold text-slate-800">
                  Cuarentena antispam
                </span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  Aísla publicidad, automatismos, bloqueados y ráfagas sin
                  perder el original.
                </span>
              </span>
              <input
                type="checkbox"
                checked={filterEnabled}
                disabled={!canEdit}
                onChange={(event) => setFilterEnabled(event.target.checked)}
                className="mt-1 h-5 w-5 accent-[#0F4C5C]"
              />
            </label>

            <Button
              className="w-full"
              onClick={handleSave}
              disabled={!canEdit || isSaving}
            >
              <ShieldCheck size={16} />
              {isSaving ? "Guardando..." : "Guardar recepción inteligente"}
            </Button>
          </div>
        )}

        {errorMessage ? (
          <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {errorMessage}
          </p>
        ) : null}
        <AutoDismissAlert
          className="mt-3"
          message={message}
          onDismiss={() => setMessage("")}
        />
      </SectionCard>

      <SectionCard
        title="Cuarentena de entrada"
        description="Revisa falsos positivos sin contaminar clientes, casos ni respuestas."
        tone="warning"
        action={
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
            {quarantine.length} pendientes
          </span>
        }
      >
        {!isLoading && quarantine.length === 0 ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            <div className="flex items-center gap-2 font-semibold">
              <CheckCircle2 size={16} />
              No hay mensajes pendientes de revisión
            </div>
          </div>
        ) : null}

        <div className="space-y-3">
          {quarantine.map((row) => {
            const sender =
              row.sender_name ||
              row.sender_email ||
              row.sender_phone ||
              "Remitente no identificado";
            const isUpdating = updatingId === row.id;

            return (
              <article
                key={row.id}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-slate-900">
                      {sender}
                    </h3>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {row.source_channel} · {formatDate(row.created_at)}
                    </p>
                  </div>
                  <span
                    className={classNames(
                      "rounded-full border px-2 py-1 text-[10px] font-bold",
                      classificationTone(row.classification),
                    )}
                  >
                    {classificationLabel(row.classification)} · {row.score}%
                  </span>
                </div>

                {row.subject ? (
                  <div className="mt-3 text-xs font-semibold text-slate-700">
                    {row.subject}
                  </div>
                ) : null}
                <p className="mt-2 line-clamp-4 whitespace-pre-line text-xs leading-5 text-slate-600">
                  {row.body}
                </p>
                {row.reasons.length > 0 ? (
                  <p className="mt-2 text-[11px] leading-5 text-slate-500">
                    Motivo: {row.reasons.join(" · ")}
                  </p>
                ) : null}
                {row.review_error ? (
                  <p className="mt-2 text-xs text-red-700">{row.review_error}</p>
                ) : null}

                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <Button
                    variant="secondary"
                    disabled={isUpdating}
                    onClick={() =>
                      void handleQuarantineAction(row, "release")
                    }
                  >
                    <RotateCcw size={15} />
                    Recuperar
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={isUpdating}
                    onClick={() =>
                      void handleQuarantineAction(row, "discard")
                    }
                  >
                    <Archive size={15} />
                    Descartar
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={isUpdating || !row.sender_key}
                    onClick={() => void handleQuarantineAction(row, "block")}
                  >
                    <ShieldX size={15} />
                    Bloquear
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}
