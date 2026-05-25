import { Sparkles } from "lucide-react";
import type { Inquiry } from "../types";

type AIBlockProps = {
  inquiry: Inquiry;
};

export function AIBlock({ inquiry }: AIBlockProps) {
  return (
    <div className="rounded-2xl border border-[#B9DCE4] bg-[#E6F3F6] p-5">
      <div className="mb-4 flex items-center gap-2 text-[#0F4C5C]">
        <Sparkles size={18} />
        <h3 className="font-bold">Asistente COPPE</h3>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-[#0F4C5C]/70">
            Resumen
          </div>
          <p className="mt-1 text-sm leading-6 text-slate-800">
            {inquiry.aiSummary}
          </p>
        </div>

        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-[#0F4C5C]/70">
            Acción recomendada
          </div>
          <p className="mt-1 text-sm leading-6 text-slate-800">
            {inquiry.recommendedAction}
          </p>
        </div>

        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-[#0F4C5C]/70">
            Intención detectada
          </div>
          <p className="mt-1 text-sm leading-6 text-slate-800">
            {inquiry.aiIntent}
          </p>
        </div>

        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-[#0F4C5C]/70">
            Información faltante
          </div>

          {inquiry.missingInformation.length ? (
            <ul className="mt-1 list-inside list-disc text-sm leading-6 text-slate-800">
              {inquiry.missingInformation.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-slate-800">
              No se detecta información crítica faltante.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}