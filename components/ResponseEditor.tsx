"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "./Button";
import type { Inquiry } from "../types";

type ResponseEditorProps = {
  inquiry: Inquiry;
};

export function ResponseEditor({ inquiry }: ResponseEditorProps) {
  const [text, setText] = useState(inquiry.suggestedResponse);

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
        onChange={(e) => setText(e.target.value)}
        className="min-h-[150px] w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-800 outline-none transition focus:border-[#0F4C5C] focus:bg-white"
      />

      <div className="mt-4 flex flex-wrap gap-2">
        <Button>
          <Copy size={16} /> Copiar respuesta
        </Button>

        <Button variant="secondary">Guardar cambios</Button>
      </div>
    </div>
  );
}