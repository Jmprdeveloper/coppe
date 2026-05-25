import {
    CalendarClock,
    ClipboardList,
    Inbox,
    MessageSquareText,
    Plus,
  } from "lucide-react";
  
  import { mockFollowUps, mockInquiries } from "../data/mockData";
  import { Button } from "./Button";
  import { FollowUpCard } from "./FollowUpCard";
  import { InquiryCard } from "./InquiryCard";
  import { PageHeader } from "./PageHeader";
  import { StatCard } from "./StatCard";
  
  type DashboardProps = {
    setActiveView: (view: string) => void;
    openInquiry: (id: string) => void;
  };
  
  export function Dashboard({ setActiveView, openInquiry }: DashboardProps) {
    const newCount = mockInquiries.filter(
      (inquiry) => inquiry.status === "new"
    ).length;
  
    const pendingCount = mockInquiries.filter(
      (inquiry) => inquiry.status === "pending"
    ).length;
  
    const highPriority = mockInquiries.filter(
      (inquiry) => inquiry.aiPriority === "high"
    ).length;
  
    const todayFollowUps = mockFollowUps.filter(
      (followUp) => followUp.urgency === "today"
    ).length;
  
    const priorityItems = [...mockInquiries]
      .sort((a, b) => (a.aiPriority === "high" ? -1 : 1))
      .slice(0, 3);
  
    return (
      <div>
        <PageHeader
          title="Dashboard"
          description="Consulta de un vistazo qué clientes necesitan atención ahora."
          action={
            <Button onClick={() => setActiveView("demoForm")}>
              <Plus size={16} /> Nueva consulta
            </Button>
          }
        />
  
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Nuevas consultas"
            value={newCount}
            icon={Inbox}
            caption="Recibidas sin revisar"
          />
  
          <StatCard
            title="Pendientes"
            value={pendingCount}
            icon={ClipboardList}
            caption="Requieren seguimiento"
          />
  
          <StatCard
            title="Alta prioridad"
            value={highPriority}
            icon={MessageSquareText}
            caption="Atención recomendable"
          />
  
          <StatCard
            title="Seguimientos hoy"
            value={todayFollowUps}
            icon={CalendarClock}
            caption="Tareas previstas"
          />
        </div>
  
        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-950">
                Consultas que necesitan atención
              </h2>
  
              <button
                onClick={() => setActiveView("inquiries")}
                className="text-sm font-semibold text-[#0F4C5C] hover:underline"
              >
                Ver todas
              </button>
            </div>
  
            <div className="space-y-3">
              {priorityItems.map((inquiry) => (
                <InquiryCard
                  key={inquiry.id}
                  inquiry={inquiry}
                  onOpen={openInquiry}
                />
              ))}
            </div>
          </section>
  
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-950">
                Seguimientos próximos
              </h2>
  
              <button
                onClick={() => setActiveView("followups")}
                className="text-sm font-semibold text-[#0F4C5C] hover:underline"
              >
                Ver agenda
              </button>
            </div>
  
            <div className="space-y-3">
              {mockFollowUps.map((followUp) => (
                <FollowUpCard
                  key={followUp.id}
                  followUp={followUp}
                  onOpen={openInquiry}
                />
              ))}
            </div>
          </section>
        </div>
      </div>
    );
  }