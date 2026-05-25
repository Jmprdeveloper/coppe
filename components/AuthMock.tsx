"use client";

import { Building2 } from "lucide-react";
import { Button } from "./Button";

type AuthMockProps = {
  type: "login" | "register";
  setActiveView: (view: string) => void;
};

export function AuthMock({ type, setActiveView }: AuthMockProps) {
  const register = type === "register";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F9FA] px-6 py-10">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/70">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#0F4C5C] text-white">
            <Building2 size={19} />
          </div>

          <div>
            <div className="font-bold text-slate-950">COPPE</div>
            <div className="text-xs text-slate-500">
              {register ? "Crear cuenta" : "Iniciar sesión"}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {register ? (
            <label className="block text-sm font-medium text-slate-700">
              Nombre completo
              <input className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:border-[#0F4C5C]" />
            </label>
          ) : null}

          <label className="block text-sm font-medium text-slate-700">
            Email
            <input className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:border-[#0F4C5C]" />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Contraseña
            <input
              type="password"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:border-[#0F4C5C]"
            />
          </label>

          {register ? (
            <>
              <label className="block text-sm font-medium text-slate-700">
                Empresa
                <input
                  defaultValue="Hotel Costa Azul"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:border-[#0F4C5C]"
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Sector
                <select className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:border-[#0F4C5C]">
                  <option>Hotel / alojamiento turístico</option>
                  <option>Inmobiliaria</option>
                  <option>Clínica</option>
                </select>
              </label>
            </>
          ) : null}
        </div>

        <Button
          className="mt-6 w-full"
          onClick={() => setActiveView("dashboard")}
        >
          {register ? "Crear cuenta" : "Entrar"}
        </Button>

        <button
          className="mt-4 w-full text-sm font-semibold text-[#0F4C5C] hover:underline"
          onClick={() => setActiveView(register ? "login" : "register")}
        >
          {register ? "Ya tengo cuenta" : "Crear cuenta nueva"}
        </button>

        <button
          className="mt-3 w-full text-sm text-slate-500 hover:text-slate-700"
          onClick={() => setActiveView("landing")}
        >
          Volver al inicio
        </button>
      </div>
    </div>
  );
}