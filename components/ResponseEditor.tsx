"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy } from "lucide-react";

import { createClient } from "../lib/supabase/client";
import type { Inquiry } from "../types";

import { Button } from "./Button";

type ResponseEditorProps = {
  inquiry: Inquiry;
  canMarkAsReplied?: boolean;
  isMarkingAsReplied?: boolean;
  onMarkAsReplied?: () => Promise<boolean>;
};

export function ResponseEditor({
  inquiry,
  canMarkAsReplied = false,
  isMarkingAsReplied = false,
  onMarkAsReplied,
}: ResponseEditorProps) {
  const supabase = useMemo(() => createClient(), []);

  const [text, setText] = useState(inquiry.suggestedResponse);
  const [isSaving, setIsSaving] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [isFinishingResponse, setIsFinishingResponse] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    setText(inquiry.suggestedResponse);
    setSuccessMessage("");
    setErrorMessage("");
  }, [inquiry.id, inquiry.suggestedResponse]);

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
      setSuccessMessage("Respuesta copiada al portapapeles.");
    } catch {
      setErrorMessage(
        "No se pudo copiar la respuesta. Selecciona el texto y cópialo manualmente."
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
      setErrorMessage("La respuesta sugerida no puede quedar vacía.");
      return;
    }

    setIsSaving(true);

    try {
      await saveResponseText(cleanText);
      setSuccessMessage("Respuesta guardada correctamente.");
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
      setErrorMessage("La respuesta sugerida no puede quedar vacía.");
      return;
    }

    if (!onMarkAsReplied) {
      setErrorMessage("No se pudo marcar la consulta como respondida.");
      return;
    }

    setIsFinishingResponse(true);

    try {
      await saveResponseText(cleanText);
      await copyResponseText(cleanText);

      const wasMarkedAsReplied = await onMarkAsReplied();

      if (!wasMarkedAsReplied) {
        setErrorMessage(
          "La respuesta se guardó y se copió, pero no se pudo marcar la consulta como respondida."
        );
        return;
      }

      setSuccessMessage(
        "Respuesta guardada, copiada y consulta marcada como respondida."
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

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-slate-950">Respuesta sugerida</h3>

          <p className="text-xs text-slate-500">
            Edita o copia el texto antes de enviarlo al cliente.
          </p>
        </div>

        <span className="rounded-full bg-[#E6F3F6] px-2.5 py-1 text-xs font-medium text-[#0F4C5C]">
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
        className="min-h-[150px] w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-800 outline-none transition focus:border-[#0F4C5C] focus:bg-white"
      />

      {errorMessage ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMessage}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          onClick={handleCopy}
          disabled={isCopying || isFinishingResponse}
        >
          <Copy size={16} />
          {isCopying ? "Copiando..." : "Copiar respuesta"}
        </Button>

        <Button
          variant="secondary"
          onClick={handleSave}
          disabled={isSaving || isFinishingResponse}
        >
          {isSaving ? "Guardando..." : "Guardar cambios"}
        </Button>

        {canMarkAsReplied ? (
          <Button
            variant="secondary"
            onClick={handleFinishResponse}
            disabled={
              isSaving ||
              isCopying ||
              isFinishingResponse ||
              isMarkingAsReplied
            }
          >
            <CheckCircle2 size={16} />
            {isFinishingResponse || isMarkingAsReplied
              ? "Finalizando..."
              : "Guardar, copiar y marcar respondida"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}