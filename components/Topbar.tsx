import type { ElementType } from "react";
import { Building2, LogOut, Plus, Search, UserRound } from "lucide-react";

import { Button } from "./Button";

type NavigationItem = {
  key: string;
  label: string;
  icon: ElementType;
};

type Company = {
  name: string;
};

type TopbarProps = {
  activeView: string;
  setActiveView: (view: string) => void;
  navigation: NavigationItem[];
  company: Company;
  userEmail: string | null;
  onSignOut: () => void;
};

function getCurrentViewLabel(
  activeView: string,
  navigation: NavigationItem[]
) {
  const navigationLabel = navigation.find(
    (navigationItem) => navigationItem.key === activeView
  )?.label;

  if (navigationLabel) {
    return navigationLabel;
  }

  const detailLabels: Record<string, string> = {
    inquiryDetail: "Detalle de consulta",
    customerDetail: "Detalle de cliente",
    demoForm: "Nueva consulta",
  };

  return detailLabels[activeView] ?? "COPPE";
}

export function Topbar({
  activeView,
  setActiveView,
  navigation,
  company,
  userEmail,
  onSignOut,
}: TopbarProps) {
  const current = getCurrentViewLabel(activeView, navigation);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur md:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSignOut}
          title="Cerrar sesión"
          className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#0F4C5C] text-white lg:hidden"
        >
          <Building2 size={18} />
        </button>

        <div>
          <div className="text-sm font-semibold text-slate-950">
            {company.name}
          </div>
          <div className="text-xs text-slate-500">{current}</div>
        </div>
      </div>

      <div className="hidden w-full max-w-md items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 md:flex">
        <Search size={16} className="text-slate-400" />
        <input
          className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          placeholder="Buscar consultas, clientes o seguimientos..."
        />
      </div>

      <div className="flex items-center gap-2">
        <Button
          onClick={() => setActiveView("demoForm")}
          className="hidden md:inline-flex"
        >
          <Plus size={16} /> Nueva consulta
        </Button>

        {userEmail ? (
          <div className="hidden max-w-[190px] truncate text-right text-xs text-slate-500 xl:block">
            {userEmail}
          </div>
        ) : null}

        <button
          type="button"
          onClick={onSignOut}
          title="Cerrar sesión"
          className="flex h-9 items-center gap-2 rounded-full bg-slate-100 px-3 text-slate-700 transition hover:bg-slate-200 hover:text-slate-950"
        >
          <UserRound size={17} />
          <span className="hidden text-sm font-medium md:inline">Salir</span>
          <LogOut size={15} className="hidden md:block" />
        </button>
      </div>
    </header>
  );
}