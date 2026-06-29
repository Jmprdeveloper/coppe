"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Copy, Send } from "lucide-react";

import { createClient } from "../lib/supabase/client";
import type { Inquiry } from "../types";

import { Button } from "./Button";

type SendCaseResponseNextStatus = "replied" | "waiting_customer";

type ResponseEditorProps = {
  inquiry: Inquiry;
  canMarkAsReplied?: boolean;
  isMarkingAsReplied?: boolean;
  onMarkAsReplied?: (responseText: string) => Promise<boolean>;
  canMarkAsWaitingCustomer?: boolean;
  onMarkAsWaitingCustomer?: (responseText: string) => Promise<boolean>;
  canSendEmailResponse?: boolean;
  isSendingEmailResponse?: boolean;
  sentEmailResponseBodies?: string[];
  onSendEmailResponse?: (
    responseText: string,
    nextStatus: SendCaseResponseNextStatus
  ) => Promise<boolean>;
  canSendWhatsAppResponse?: boolean;
  isSendingWhatsAppResponse?: boolean;
  sentWhatsAppResponseBodies?: string[];
  onSendWhatsAppResponse?: (
    responseText: string,
    nextStatus: SendCaseResponseNextStatus
  ) => Promise<boolean>;
};

function stripLeadingGreetingForDuplicateComparison(value: string) {
  return value
    .replace(/^(hola|hello|hi)\s*[,.:;!\-–—]\s*/u, "")
    .replace(
      /^(hola|hello|hi)\s+[\p{L}\p{M}'’ .-]{1,80}\s*[,.:;!\-–—]\s*/u,
      ""
    )
    .replace(
      /^(estimado\/a|estimado|estimada|dear)\s+[\p{L}\p{M}'’ .-]{1,80}\s*[,.:;!\-–—]\s*/u,
      ""
    )
    .replace(
      /^(buenos dias|buenos días|buenas tardes|buenas noches|good morning|good afternoon|good evening)\s*[,.:;!\-–—]?\s*/u,
      ""
    )
    .trim();
}

function normalizeResponseTextForComparison(value: string) {
  return stripLeadingGreetingForDuplicateComparison(
    value
      .normalize("NFKC")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[.!?¡¿…;:]+$/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
  )
    .replace(/[.!?¡¿…;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function ResponseEditor(props: ResponseEditorProps) {
  return (
    <ResponseEditorContent
      key={`${props.inquiry.id}:${props.inquiry.suggestedResponse}`}
      {...props}
    />
  );
}

function ResponseEditorContent({
  inquiry,
  canMarkAsReplied = false,
  isMarkingAsReplied = false,
  onMarkAsReplied,
  canMarkAsWaitingCustomer = false,
  onMarkAsWaitingCustomer,
  canSendEmailResponse = false,
  isSendingEmailResponse = false,
  sentEmailResponseBodies = [],
  onSendEmailResponse,
  canSendWhatsAppResponse = false,
  isSendingWhatsAppResponse = false,
  sentWhatsAppResponseBodies = [],
  onSendWhatsAppResponse,
}: ResponseEditorProps) {
  const supabase = useMemo(() => createClient(), []);

  const [text, setText] = useState(inquiry.suggestedResponse);
  const [isSaving, setIsSaving] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [isFinishingResponse, setIsFinishingResponse] = useState(false);
  const [isFinishingWaitingCustomer, setIsFinishingWaitingCustomer] =
    useState(false);
  const [isSendingEmailReplied, setIsSendingEmailReplied] = useState(false);
  const [isSendingEmailWaitingCustomer, setIsSendingEmailWaitingCustomer] =
    useState(false);
  const [isSendingWhatsAppReplied, setIsSendingWhatsAppReplied] =
    useState(false);
  const [isSendingWhatsAppWaitingCustomer, setIsSendingWhatsAppWaitingCustomer] =
    useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const isBusy =
    isSaving ||
    isCopying ||
    isFinishingResponse ||
    isFinishingWaitingCustomer ||
    isSendingEmailReplied ||
    isSendingEmailWaitingCustomer ||
    isSendingWhatsAppReplied ||
    isSendingWhatsAppWaitingCustomer ||
    isMarkingAsReplied ||
    isSendingEmailResponse ||
    isSendingWhatsAppResponse;

  const normalizedCurrentText = normalizeResponseTextForComparison(text);

  const hasAlreadySentCurrentTextByEmail =
    normalizedCurrentText.length > 0 &&
    sentEmailResponseBodies.some((sentResponseBody) => {
      return (
        normalizeResponseTextForComparison(sentResponseBody) ===
        normalizedCurrentText
      );
    });

  const hasAlreadySentCurrentTextByWhatsApp =
    normalizedCurrentText.length > 0 &&
    sentWhatsAppResponseBodies.some((sentResponseBody) => {
      return (
        normalizeResponseTextForComparison(sentResponseBody) ===
        normalizedCurrentText
      );
    });

  const canSendAnyDirectResponse =
    canSendEmailResponse || canSendWhatsAppResponse;

  const copyResponseText = async (cleanText: string) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(cleanText);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = cleanText;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";

    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);

    if (!copied) {
      throw new Error("No se pudo copiar el texto.");
    }
  };

  const saveResponseText = async (cleanText: string) => {
    const { error } = await supabase
      .from("inquiries")
      .update({
        suggested_response: cleanText,
      })
      .eq("id", inquiry.id);

    if (error) {
      throw new Error(
        `No se pudieron guardar los cambios: ${
          error.message || "sin detalle del error"
        }`
      );
    }

    setText(cleanText);
  };

  const handleCopy = async () => {
    setSuccessMessage("");
    setErrorMessage("");

    const cleanText = text.trim();

    if (!cleanText) {
      setErrorMessage("No hay texto para copiar.");
      return;
    }

    setIsCopying(true);

    try {
      await copyResponseText(cleanText);
      setSuccessMessage(
        "Borrador copiado al portapapeles para enviarlo manualmente."
      );
    } catch {
      setErrorMessage(
        "No se pudo copiar el borrador. Selecciona el texto y cópialo manualmente."
      );
    } finally {
      setIsCopying(false);
    }
  };

  const handleSave = async () => {
    setSuccessMessage("");
    setErrorMessage("");

    const cleanText = text.trim();

    if (!cleanText) {
      setErrorMessage("El borrador de respuesta no puede quedar vacío.");
      return;
    }

    setIsSaving(true);

    try {
      await saveResponseText(cleanText);
      setSuccessMessage("Borrador guardado correctamente.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudieron guardar los cambios."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleFinishResponse = async () => {
    setSuccessMessage("");
    setErrorMessage("");

    const cleanText = text.trim();

    if (!cleanText) {
      setErrorMessage("El borrador de respuesta no puede quedar vacío.");
      return;
    }

    if (!onMarkAsReplied) {
      setErrorMessage("No se pudo marcar el caso como respondido.");
      return;
    }

    setIsFinishingResponse(true);

    try {
      await saveResponseText(cleanText);
      await copyResponseText(cleanText);

      const wasMarkedAsReplied = await onMarkAsReplied(cleanText);

      if (!wasMarkedAsReplied) {
        setErrorMessage(
          "El borrador se guardó y se copió, pero no se pudo marcar el caso como respondido."
        );
        return;
      }

      setSuccessMessage(
        "Borrador guardado, copiado y registrado como respuesta manual. El caso se marcó como respondido."
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudo completar la respuesta."
      );
    } finally {
      setIsFinishingResponse(false);
    }
  };

  const handleWaitForCustomer = async () => {
    setSuccessMessage("");
    setErrorMessage("");

    const cleanText = text.trim();

    if (!cleanText) {
      setErrorMessage("El borrador de respuesta no puede quedar vacío.");
      return;
    }

    if (!onMarkAsWaitingCustomer) {
      setErrorMessage("No se pudo marcar el caso como esperando al cliente.");
      return;
    }

    setIsFinishingWaitingCustomer(true);

    try {
      await saveResponseText(cleanText);
      await copyResponseText(cleanText);

      const wasMarkedAsWaitingCustomer = await onMarkAsWaitingCustomer(
        cleanText
      );

      if (!wasMarkedAsWaitingCustomer) {
        setErrorMessage(
          "El borrador se guardó y se copió, pero no se pudo marcar el caso como esperando al cliente."
        );
        return;
      }

      setSuccessMessage(
        "Borrador guardado, copiado y registrado como respuesta manual. El caso se marcó como esperando al cliente."
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudo completar la acción."
      );
    } finally {
      setIsFinishingWaitingCustomer(false);
    }
  };

  const handleSendEmailResponse = async (
    nextStatus: SendCaseResponseNextStatus
  ) => {
    setSuccessMessage("");
    setErrorMessage("");

    const cleanText = text.trim();

    if (!cleanText) {
      setErrorMessage("El borrador de respuesta no puede quedar vacío.");
      return;
    }

    if (hasAlreadySentCurrentTextByEmail) {
      setErrorMessage(
        "Este borrador ya fue enviado por email en este caso. Edita el texto si necesitas enviar una nueva respuesta."
      );
      return;
    }

    if (!onSendEmailResponse) {
      setErrorMessage("No se pudo enviar el email desde COPPE.");
      return;
    }

    if (nextStatus === "waiting_customer") {
      setIsSendingEmailWaitingCustomer(true);
    } else {
      setIsSendingEmailReplied(true);
    }

    try {
      await saveResponseText(cleanText);

      const wasSent = await onSendEmailResponse(cleanText, nextStatus);

      if (!wasSent) {
        setErrorMessage("No se pudo enviar el email desde COPPE.");
        return;
      }

      setSuccessMessage(
        nextStatus === "waiting_customer"
          ? "Email enviado y caso marcado como esperando al cliente."
          : "Email enviado y caso marcado como respondido."
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudo enviar el email desde COPPE."
      );
    } finally {
      setIsSendingEmailReplied(false);
      setIsSendingEmailWaitingCustomer(false);
    }
  };

  const handleSendWhatsAppResponse = async (
    nextStatus: SendCaseResponseNextStatus
  ) => {
    setSuccessMessage("");
    setErrorMessage("");

    const cleanText = text.trim();

    if (!cleanText) {
      setErrorMessage("El borrador de respuesta no puede quedar vacío.");
      return;
    }

    if (hasAlreadySentCurrentTextByWhatsApp) {
      setErrorMessage(
        "Este borrador ya fue enviado por WhatsApp en este caso. Edita el texto si necesitas enviar una nueva respuesta."
      );
      return;
    }

    if (!onSendWhatsAppResponse) {
      setErrorMessage("No se pudo enviar el WhatsApp desde COPPE.");
      return;
    }

    if (nextStatus === "waiting_customer") {
      setIsSendingWhatsAppWaitingCustomer(true);
    } else {
      setIsSendingWhatsAppReplied(true);
    }

    try {
      await saveResponseText(cleanText);

      const wasSent = await onSendWhatsAppResponse(cleanText, nextStatus);

      if (!wasSent) {
        setErrorMessage("No se pudo enviar el WhatsApp desde COPPE.");
        return;
      }

      setSuccessMessage(
        nextStatus === "waiting_customer"
          ? "WhatsApp enviado y caso marcado como esperando al cliente."
          : "WhatsApp enviado y caso marcado como respondido."
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudo enviar el WhatsApp desde COPPE."
      );
    } finally {
      setIsSendingWhatsAppReplied(false);
      setIsSendingWhatsAppWaitingCustomer(false);
    }
  };

  return (
    <section className="rounded-2xl border border-[#8FB8C2] bg-white p-5 shadow-md shadow-[#0F4C5C]/10">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-[#073540]">Borrador de respuesta</h3>

          <p className="text-xs leading-5 text-[#456C75]">
            {canSendAnyDirectResponse
              ? "Edita el texto y elige si quieres enviarlo desde COPPE o copiarlo para responder manualmente."
              : "Edita el texto, cópialo y envíalo manualmente por el canal correspondiente. COPPE registrará la respuesta en el historial del caso."}
          </p>
        </div>

        <span className="rounded-full border border-[#B8D1D8] bg-[#F2FAFB] px-2.5 py-1 text-xs font-bold text-[#0F4C5C] shadow-sm shadow-[#0F4C5C]/5">
          IA
        </span>
      </div>

      <textarea
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setSuccessMessage("");
          setErrorMessage("");
        }}
        className="min-h-[150px] w-full rounded-2xl border border-[#D2E4E8] bg-[#F7FBFC] p-4 text-sm leading-6 text-[#153F48] outline-none transition focus:border-[#0F4C5C] focus:bg-white"
      />

      {canSendEmailResponse && hasAlreadySentCurrentTextByEmail ? (
        <div className="mt-4 rounded-2xl border border-[#8FB8C2] bg-[#F2FAFB] px-4 py-3 text-sm text-[#0B3F4C]">
          Este borrador ya fue enviado por email en este caso. Edita el texto
          si necesitas enviar una nueva respuesta.
        </div>
      ) : null}

      {canSendWhatsAppResponse && hasAlreadySentCurrentTextByWhatsApp ? (
        <div className="mt-4 rounded-2xl border border-[#8FB8C2] bg-[#F2FAFB] px-4 py-3 text-sm text-[#0B3F4C]">
          Este borrador ya fue enviado por WhatsApp en este caso. Edita el
          texto si necesitas enviar una nueva respuesta.
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-4 rounded-2xl border border-[#6D9BA7] bg-[#F2FAFB] px-4 py-3 text-sm text-[#083640]">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="mt-4 rounded-2xl border border-[#B8D1D8] bg-[#F2FAFB] px-4 py-3 text-sm text-[#0F4C5C]">
          {successMessage}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {canSendWhatsAppResponse && canMarkAsReplied ? (
          <Button
            onClick={() => handleSendWhatsAppResponse("replied")}
            disabled={isBusy || hasAlreadySentCurrentTextByWhatsApp}
          >
            <Send size={16} />
            {isSendingWhatsAppReplied || isSendingWhatsAppResponse
              ? "Enviando WhatsApp..."
              : "Enviar WhatsApp y marcar respondido"}
          </Button>
        ) : null}

        {canSendWhatsAppResponse && canMarkAsWaitingCustomer ? (
          <Button
            onClick={() => handleSendWhatsAppResponse("waiting_customer")}
            disabled={isBusy || hasAlreadySentCurrentTextByWhatsApp}
          >
            <Send size={16} />
            {isSendingWhatsAppWaitingCustomer || isSendingWhatsAppResponse
              ? "Enviando WhatsApp..."
              : "Enviar WhatsApp y esperar respuesta"}
          </Button>
        ) : null}

        {canSendEmailResponse && canMarkAsReplied ? (
          <Button
            onClick={() => handleSendEmailResponse("replied")}
            disabled={isBusy || hasAlreadySentCurrentTextByEmail}
          >
            <Send size={16} />
            {isSendingEmailReplied || isSendingEmailResponse
              ? "Enviando email..."
              : "Enviar email y marcar respondido"}
          </Button>
        ) : null}

        {canSendEmailResponse && canMarkAsWaitingCustomer ? (
          <Button
            onClick={() => handleSendEmailResponse("waiting_customer")}
            disabled={isBusy || hasAlreadySentCurrentTextByEmail}
          >
            <Send size={16} />
            {isSendingEmailWaitingCustomer || isSendingEmailResponse
              ? "Enviando email..."
              : "Enviar email y esperar respuesta"}
          </Button>
        ) : null}

        <Button variant="secondary" onClick={handleCopy} disabled={isBusy}>
          <Copy size={16} />
          {isCopying ? "Copiando..." : "Copiar borrador"}
        </Button>

        <Button variant="secondary" onClick={handleSave} disabled={isBusy}>
          {isSaving ? "Guardando..." : "Guardar borrador"}
        </Button>

        {canMarkAsWaitingCustomer ? (
          <Button
            variant="secondary"
            onClick={handleWaitForCustomer}
            disabled={isBusy}
          >
            {isFinishingWaitingCustomer || isMarkingAsReplied
              ? "Actualizando..."
              : "Copiar y registrar espera"}
          </Button>
        ) : null}

        {canMarkAsReplied ? (
          <Button
            variant="secondary"
            onClick={handleFinishResponse}
            disabled={isBusy}
          >
            <CheckCircle2 size={16} />
            {isFinishingResponse || isMarkingAsReplied
              ? "Finalizando..."
              : "Copiar y registrar respondido"}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
