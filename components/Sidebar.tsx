import type { ElementType } from "react";
import { LogOut } from "lucide-react";

import { classNames } from "../lib/utils";
import { CoppeBrandMark } from "./CoppeBrandMark";

type NavigationItem = {
  key: string;
  label: string;
  icon: ElementType;
};

type SidebarProps = {
  activeView: string;
  setActiveView: (view: string) => void;
  navigation: NavigationItem[];
  onSignOut: () => void;
};

export function Sidebar({
  activeView,
  setActiveView,
  navigation,
  onSignOut,
}: SidebarProps) {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:block">
      <button
        type="button"
        onClick={() => setActiveView("dashboard")}
        className="flex h-16 w-full items-center gap-3 border-b border-slate-200 px-6 text-left transition hover:bg-slate-50"
      >
        <CoppeBrandMark size={38} priority />

        <div>
          <div className="text-lg font-bold tracking-tight text-slate-950">
            COPPE
          </div>
          <div className="text-xs text-slate-500">Ir al dashboard</div>
        </div>
      </button>

      <nav className="space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const Icon = item.icon;
          const active = activeView === item.key;

          return (
            <button
              key={item.key}
              onClick={() => setActiveView(item.key)}
              className={classNames(
                "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                active
                  ? "bg-[#E6F3F6] text-[#0F4C5C]"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
              )}
            >
              <Icon size={18} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="mx-4 mt-4 rounded-2xl border border-[#B8D1D8] bg-[#F2FAFB] p-4">
        <div className="text-sm font-semibold text-[#083640]">
          Espacio activo
        </div>

        <p className="mt-1 text-xs leading-5 text-[#315F69]">
          Clientes, casos, mensajes, notas y seguimientos centralizados en tu
          espacio de trabajo.
        </p>
      </div>

      <div className="mx-4 mt-4">
        <button
          type="button"
          onClick={onSignOut}
          className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
        >
          <LogOut size={16} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
