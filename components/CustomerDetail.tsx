import { mockCustomers, mockInquiries } from "../data/mockData";
import { Button } from "./Button";
import { InquiryCard } from "./InquiryCard";
import { PageHeader } from "./PageHeader";
import { StatusBadge } from "./StatusBadge";

type CustomerDetailProps = {
  customerId: string;
  setActiveView: (view: string) => void;
  openInquiry: (id: string) => void;
};

export function CustomerDetail({
  customerId,
  setActiveView,
  openInquiry,
}: CustomerDetailProps) {
  const customer =
    mockCustomers.find((customer) => customer.id === customerId) ||
    mockCustomers[0];

  const inquiries = mockInquiries.filter(
    (inquiry) => inquiry.customerId === customer.id
  );

  return (
    <div>
      <button
        onClick={() => setActiveView("customers")}
        className="mb-3 text-sm font-semibold text-[#0F4C5C] hover:underline"
      >
        ← Volver a clientes
      </button>

      <PageHeader
        title={customer.name}
        description={`${customer.email} · ${customer.phone}`}
      />

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <aside className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-slate-950">Datos del cliente</h3>

            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Estado</span>
                <StatusBadge status={customer.status} />
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Idioma</span>
                <span className="font-medium text-slate-800">
                  {customer.language}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Última interacción</span>
                <span className="font-medium text-slate-800">
                  {customer.lastInteraction}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-slate-950">Nota rápida</h3>

            <textarea
              className="mt-3 min-h-[110px] w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-[#0F4C5C]"
              placeholder="Añadir nota sobre este cliente..."
            />

            <Button variant="secondary" className="mt-3 w-full">
              Guardar nota
            </Button>
          </div>
        </aside>

        <main>
          <h2 className="mb-3 text-lg font-bold text-slate-950">
            Historial de consultas
          </h2>

          <div className="space-y-3">
            {inquiries.map((inquiry) => (
              <InquiryCard
                key={inquiry.id}
                inquiry={inquiry}
                onOpen={openInquiry}
              />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}