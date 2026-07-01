"use client";

import {
  CalendarClock,
  Inbox,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { Button } from "./Button";
import { CoppeBrandMark } from "./CoppeBrandMark";
import { PriorityBadge } from "./PriorityBadge";

type Feature = {
  icon: LucideIcon;
  title: string;
  text: string;
};

const features: Feature[] = [
  {
    icon: Inbox,
    title: "Centraliza mensajes de clientes",
    text: "Convierte mensajes recibidos en casos claros para que nada quede perdido.",
  },
  {
    icon: Sparkles,
    title: "IA útil",
    text: "Resume, clasifica y prepara borradores de respuesta sin quitarte el control.",
  },
  {
    icon: CalendarClock,
    title: "Seguimientos claros",
    text: "Crea recordatorios para no olvidar casos, clientes o tareas pendientes.",
  },
];

type LandingProps = {
  setActiveView: (view: string) => void;
};

export function Landing({ setActiveView }: LandingProps) {
  return (
    <div className="min-h-screen bg-[#F7F9FA]">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
          <CoppeBrandMark size={42} priority />

          <div className="text-xl font-bold tracking-tight text-slate-950">
            COPPE
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => setActiveView("login")}>
            Iniciar sesión
          </Button>

          <Button onClick={() => setActiveView("register")}>Crear cuenta</Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12 md:py-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_520px]">
          <section>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#B9DCE4] bg-[#E6F3F6] px-3 py-1 text-sm font-semibold text-[#0F4C5C]">
              <Sparkles size={15} /> IA práctica para pequeñas empresas
            </div>

            <h1 className="mt-6 max-w-3xl text-4xl font-bold tracking-tight text-slate-950 md:text-6xl">
              Organiza mensajes de clientes, prepara respuestas con IA y no
              pierdas oportunidades.
            </h1>

            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              COPPE convierte mensajes de clientes en casos organizados, resume
              el contexto con IA y ayuda a pequeñas empresas a gestionar
              seguimientos sin complicaciones.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button onClick={() => setActiveView("register")}>
                <Sparkles size={16} /> Empezar con COPPE
              </Button>

              <Button variant="secondary" onClick={() => setActiveView("login")}>
                Ya tengo cuenta
              </Button>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-200/70">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-950">Caso nuevo</div>

                  <div className="text-xs text-slate-500">
                    Analizado por COPPE
                  </div>
                </div>

                <PriorityBadge priority="high" />
              </div>

              <div className="rounded-2xl bg-white p-4">
                <div className="text-sm font-semibold text-slate-950">
                  Juan Pérez
                </div>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Necesito cambiar la cita que tenía prevista para mañana por un
                  problema familiar...
                </p>
              </div>

              <div className="mt-3 rounded-2xl border border-[#B9DCE4] bg-[#E6F3F6] p-4">
                <div className="flex items-center gap-2 font-bold text-[#0F4C5C]">
                  <Sparkles size={16} /> Asistente COPPE
                </div>

                <p className="mt-2 text-sm leading-6 text-slate-700">
                  Cliente solicita cambiar una cita prevista para mañana.
                  Requiere respuesta prioritaria.
                </p>
              </div>
            </div>
          </section>
        </div>

        <div className="mt-16 grid gap-4 md:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;

            return (
              <div
                key={feature.title}
                className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#E6F3F6] text-[#0F4C5C]">
                  <Icon size={19} />
                </div>

                <h3 className="font-bold text-slate-950">{feature.title}</h3>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {feature.text}
                </p>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
