import { Sparkles } from "lucide-react";
import type { Inquiry } from "../types";

type AIBlockProps = {
  inquiry: Inquiry;
};

function AIField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[#D2E4E8] bg-white/75 px-4 py-3 shadow-sm shadow-[#0F4C5C]/5">
      <div className="text-xs font-semibold uppercase tracking-wide text-[#315F69]">
        {label}
      </div>

      <div className="mt-1 text-sm leading-6 text-[#153F48]">{children}</div>
    </div>
  );
}

export function AIBlock({ inquiry }: AIBlockProps) {
  return (
    <section className="rounded-2xl border border-[#8FB8C2] bg-gradient-to-br from-[#C9E2E7] via-[#E2F0F3] to-[#F7FBFC] p-5 shadow-md shadow-[#0F4C5C]/10">
      <div className="mb-4 flex items-center gap-2 text-[#073540]">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#B8D1D8] bg-white shadow-sm shadow-[#0F4C5C]/10">
          <Sparkles size={18} />
        </span>

        <div>
          <h3 className="font-bold">Asistente COPPE</h3>
          <p className="mt-0.5 text-xs font-medium text-[#456C75]">
            Lectura asistida del caso y próximos pasos sugeridos.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <AIField label="Resumen">
          {inquiry.aiSummary || "Sin resumen disponible."}
        </AIField>

        <AIField label="Acción recomendada">
          {inquiry.recommendedAction || "Sin acción recomendada."}
        </AIField>

        <AIField label="Intención detectada">
          {inquiry.aiIntent || "Sin intención detectada."}
        </AIField>

        <AIField label="Información faltante">
          {inquiry.missingInformation.length ? (
            <ul className="list-inside list-disc">
              {inquiry.missingInformation.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            "No se detecta información crítica faltante."
          )}
        </AIField>
      </div>
    </section>
  );
}