import { Plus } from "lucide-react";

import { mockFollowUps } from "../data/mockData";
import { Button } from "./Button";
import { FollowUpCard } from "./FollowUpCard";
import { PageHeader } from "./PageHeader";

type FollowUpsProps = {
  openInquiry: (id: string) => void;
};

export function FollowUps({ openInquiry }: FollowUpsProps) {
  const overdue = mockFollowUps.filter(
    (followUp) => followUp.urgency === "overdue"
  );

  const today = mockFollowUps.filter(
    (followUp) => followUp.urgency === "today"
  );

  return (
    <div>
      <PageHeader
        title="Seguimientos"
        description="Tareas pendientes para no olvidar consultas importantes."
        action={
          <Button>
            <Plus size={16} /> Crear seguimiento
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <section>
          <h2 className="mb-3 text-lg font-bold text-slate-950">Vencidos</h2>

          <div className="space-y-3">
            {overdue.map((followUp) => (
              <FollowUpCard
                key={followUp.id}
                followUp={followUp}
                onOpen={openInquiry}
              />
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-slate-950">Hoy</h2>

          <div className="space-y-3">
            {today.map((followUp) => (
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