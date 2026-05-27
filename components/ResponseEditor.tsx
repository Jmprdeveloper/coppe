"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy } from "lucide-react";

import { createClient } from "../lib/supabase/client";
import type { Inquiry } from "../types";

import { Button } from "./Button";

type ResponseEditorProps = {
  inquiry: Inquiry;
};

export function ResponseEditor({ inquiry }: ResponseEditorProps) {
  const supabase = useMemo(() => createClient(), []);

  const [text, setText] = useState(inquiry.suggestedResponse);
  const [isSaving, setIsSaving] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    setText(inquiry.suggestedResponse);
    setSuccessMessage("");
    setErrorMessage("");
  }, [inquiry.id, inquiry.suggestedResponse]);

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
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(cleanText);
      } else {
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
      }

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

    const { error } = await supabase
      .from("inquiries")
      .update({
        suggested_response: cleanText,
      })
      .eq("id", inquiry.id);

    setIsSaving(false);

    if (error) {
      setErrorMessage(
        `No se pudieron guardar los cambios: ${
          error.message || "sin detalle del error"
        }`
      );
      return;
    }

    setText(cleanText);
    setSuccessMessage("Respuesta guardada correctamente.");
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
        <Button onClick={handleCopy} disabled={isCopying}>
          <Copy size={16} />
          {isCopying ? "Copiando..." : "Copiar respuesta"}
        </Button>

        <Button variant="secondary" onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Guardando..." : "Guardar cambios"}
        </Button>
      </div>
    </div>
  );
}