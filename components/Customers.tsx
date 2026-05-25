import { Plus, Search } from "lucide-react";

import { mockCustomers } from "../data/mockData";
import { Button } from "./Button";
import { PageHeader } from "./PageHeader";
import { StatusBadge } from "./StatusBadge";

type CustomersProps = {
  openCustomer: (id: string) => void;
};

export function Customers({ openCustomer }: CustomersProps) {
  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Lista simple de clientes con su última interacción."
        action={
          <Button>
            <Plus size={16} /> Nuevo cliente
          </Button>
        }
      />

      <div className="mb-4 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
        <Search size={16} className="text-slate-400" />

        <input
          className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          placeholder="Buscar cliente..."
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {mockCustomers.map((customer) => (
          <button
            key={customer.id}
            onClick={() => openCustomer(customer.id)}
            className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-[#0F4C5C]/30 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-950">{customer.name}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {customer.email}
                </p>
                <p className="text-sm text-slate-500">{customer.phone}</p>
              </div>

              <StatusBadge status={customer.status} />
            </div>

            <div className="mt-4 text-xs text-slate-500">
              Última interacción: {customer.lastInteraction}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}