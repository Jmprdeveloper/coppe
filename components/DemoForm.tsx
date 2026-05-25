"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "./Button";
import { PageHeader } from "./PageHeader";

type DemoFormProps = {
  setActiveView: (view: string) => void;
  openInquiry: (id: string) => void;
};

export function DemoForm({ setActiveView, openInquiry }: DemoFormProps) {
  const [sent, setSent] = useState(false);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Formulario demo"
        description="Simula cómo entraría una consulta desde una web, formulario o canal externo."
      />

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        {!sent ? (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                Nombre
                <input
                  defaultValue="María López"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Email
                <input
                  defaultValue="maria@example.com"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Teléfono
                <input
                  defaultValue="+34 600 000 001"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Canal
                <input
                  defaultValue="Formulario web"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                />
              </label>

              <label className="text-sm font-medium text-slate-700 md:col-span-2">
                Mensaje
                <textarea
                  defaultValue="Hola, quería saber si tenéis habitación doble disponible para el próximo fin de semana para dos personas."
                  className="mt-1 min-h-[140px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                />
              </label>
            </div>

            <Button className="mt-5" onClick={() => setSent(true)}>
              <Sparkles size={16} /> Enviar consulta demo
            </Button>
          </>
        ) : (
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-[#E6F3F6] text-[#0F4C5C]">
              <Sparkles />
            </div>

            <h2 className="mt-4 text-xl font-bold text-slate-950">
              Consulta enviada
            </h2>

            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
              COPPE ha recibido la consulta y la ha analizado con IA. Abre el
              detalle para ver el resumen, prioridad, respuesta sugerida y
              seguimiento.
            </p>

            <div className="mt-5 flex justify-center gap-2">
              <Button onClick={() => openInquiry("i1")}>
                Ver consulta analizada
              </Button>

              <Button
                variant="secondary"
                onClick={() => setActiveView("dashboard")}
              >
                Ir al dashboard
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}