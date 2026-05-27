import type { ElementType } from "react";
import { Building2 } from "lucide-react";

import { classNames } from "../lib/utils";

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
        onClick={onSignOut}
        className="flex h-16 w-full items-center gap-3 border-b border-slate-200 px-6 text-left transition hover:bg-slate-50"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#0F4C5C] text-white">
          <Building2 size={18} />
        </div>

        <div>
          <div className="text-lg font-bold tracking-tight text-slate-950">
            COPPE
          </div>
          <div className="text-xs text-slate-500">Cerrar sesión</div>
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

      <div className="mx-4 mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="text-sm font-semibold text-emerald-900">
          Espacio activo
        </div>
        <p className="mt-1 text-xs leading-5 text-emerald-700">
          Clientes, consultas, notas y seguimientos conectados a Supabase.
        </p>
      </div>
    </aside>
  );
}