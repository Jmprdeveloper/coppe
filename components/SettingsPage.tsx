import { mockCompany } from "../data/mockData";
import { Button } from "./Button";
import { PageHeader } from "./PageHeader";

export function SettingsPage() {
  return (
    <div>
      <PageHeader
        title="Configuración"
        description="Ajustes básicos de empresa y comportamiento del asistente COPPE."
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">
            Información de empresa
          </h2>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Nombre de empresa
              <input
                defaultValue={mockCompany.name}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Sector
              <input
                defaultValue={mockCompany.sector}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
              />
            </label>

            <label className="text-sm font-medium text-slate-700 md:col-span-2">
              Descripción
              <textarea
                defaultValue={mockCompany.description}
                className="mt-1 min-h-[120px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
              />
            </label>
          </div>

          <Button className="mt-5">Guardar cambios</Button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">
            Preferencias IA
          </h2>

          <div className="mt-5 space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Tono
              <select
                defaultValue={mockCompany.tone}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
              >
                <option>Profesional</option>
                <option>Cercano</option>
                <option>Breve</option>
                <option>Comercial</option>
              </select>
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Idioma
              <select
                defaultValue={mockCompany.language}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
              >
                <option>Español</option>
                <option>Inglés</option>
              </select>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}