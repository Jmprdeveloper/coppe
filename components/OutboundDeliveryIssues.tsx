"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

import { Button } from "./Button";

export type OutboundDeliveryIssue = {
  id: string;
  channel: "email" | "whatsapp";
  body: string;
  toAddress: string;
  providerMessageId: string;
  errorMessage: string;
  createdAt: string;
};

type OutboundDeliveryIssuesProps = {
  issues: OutboundDeliveryIssue[];
  onResolved: () => void;
};

type ReconcileOutboundResponse = {
  ok?: boolean;
  error?: string;
};

function getChannelLabel(channel: OutboundDeliveryIssue["channel"]) {
  return channel === "whatsapp" ? "WhatsApp" : "email";
}

function formatAttemptDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "fecha desconocida";
  }

  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function OutboundDeliveryIssues({
  issues,
  onResolved,
}: OutboundDeliveryIssuesProps) {
  const [providerIds, setProviderIds] = useState<Record<string, string>>({});
  const [processingId, setProcessingId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  if (issues.length === 0) {
    return null;
  }

  const reconcile = async (
    issue: OutboundDeliveryIssue,
    resolution: "confirmed_sent" | "confirmed_not_sent"
  ) => {
    setErrorMessage("");

    const providerMessageId =
      (providerIds[issue.id] ?? issue.providerMessageId).trim();

    if (resolution === "confirmed_sent" && !providerMessageId) {
      setErrorMessage(
        "Introduce el identificador que muestra el proveedor antes de confirmar la entrega."
      );
      return;
    }

    const confirmationMessage =
      resolution === "confirmed_sent"
        ? `¿Has comprobado en ${getChannelLabel(issue.channel)} que este mensaje fue entregado? Se añadirá al historial del caso.`
        : `¿Has comprobado que este mensaje no fue entregado? El intento quedará cerrado y podrás enviarlo de nuevo.`;

    if (!window.confirm(confirmationMessage)) {
      return;
    }

    setProcessingId(issue.id);

    try {
      const response = await fetch("/api/inquiries/reconcile-outbound", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outboundMessageId: issue.id,
          resolution,
          providerMessageId:
            resolution === "confirmed_sent" ? providerMessageId : undefined,
        }),
      });
      const payload = (await response
        .json()
        .catch(() => null)) as ReconcileOutboundResponse | null;

      if (!response.ok || !payload?.ok) {
        setErrorMessage(
          payload?.error || "No se pudo reconciliar el intento de envío."
        );
        return;
      }

      onResolved();
    } catch {
      setErrorMessage(
        "No se pudo conectar con COPPE para reconciliar el intento."
      );
    } finally {
      setProcessingId("");
    }
  };

  return (
    <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 shadow-sm shadow-amber-900/10">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 shrink-0 text-amber-700" size={20} />

        <div>
          <h3 className="font-bold text-amber-950">
            Entrega pendiente de confirmar
          </h3>
          <p className="mt-1 text-sm leading-6 text-amber-900">
            El proveedor pudo haber recibido estos envíos, pero COPPE no obtuvo
            una confirmación fiable. Comprueba el panel del proveedor antes de
            volver a enviar.
          </p>
        </div>
      </div>

      {errorMessage ? (
        <div className="mt-4 rounded-xl border border-amber-400 bg-white px-4 py-3 text-sm text-amber-950">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-4 space-y-4">
        {issues.map((issue) => {
          const isProcessing = processingId === issue.id;

          return (
            <article
              key={issue.id}
              className="rounded-2xl border border-amber-200 bg-white p-4"
            >
              <div className="text-xs font-bold uppercase tracking-wide text-amber-800">
                {getChannelLabel(issue.channel)} ·{" "}
                {formatAttemptDate(issue.createdAt)}
              </div>

              <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-[#153F48]">
                {issue.body}
              </p>

              <p className="mt-2 text-xs text-[#456C75]">
                Destino: {issue.toAddress || "no disponible"}
              </p>

              {issue.errorMessage ? (
                <p className="mt-1 text-xs text-amber-900">
                  Motivo: {issue.errorMessage}
                </p>
              ) : null}

              <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-[#315F69]">
                ID mostrado por el proveedor
                <input
                  value={providerIds[issue.id] ?? issue.providerMessageId}
                  onChange={(event) => {
                    setProviderIds((current) => ({
                      ...current,
                      [issue.id]: event.target.value,
                    }));
                    setErrorMessage("");
                  }}
                  maxLength={500}
                  placeholder={
                    issue.channel === "whatsapp"
                      ? "wamid..."
                      : "Identificador de Resend"
                  }
                  className="mt-2 w-full rounded-xl border border-[#B8D1D8] bg-[#F7FBFC] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[#153F48] outline-none focus:border-[#0F4C5C] focus:bg-white"
                />
              </label>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  onClick={() => reconcile(issue, "confirmed_sent")}
                  disabled={Boolean(processingId)}
                >
                  <CheckCircle2 size={16} />
                  {isProcessing
                    ? "Comprobando..."
                    : "Confirmar que fue entregado"}
                </Button>

                <Button
                  variant="secondary"
                  onClick={() => reconcile(issue, "confirmed_not_sent")}
                  disabled={Boolean(processingId)}
                >
                  <XCircle size={16} />
                  Confirmar que no se entregó
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
