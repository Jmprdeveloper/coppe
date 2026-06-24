"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, UserPlus, UsersRound, XCircle } from "lucide-react";

import {
  canCancelCompanyInvitations,
  canCreateCompanyInvitations,
  canManageTeam,
} from "../lib/companyPermissions";
import { getCurrentCompany, type CurrentCompany } from "../lib/currentCompany";
import { createClient } from "../lib/supabase/client";

import { AutoDismissAlert } from "./AutoDismissAlert";
import { Button } from "./Button";

type TeamMemberRow = {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  created_at: string;
};

type CompanyInvitationRow = {
  id: string;
  company_id: string;
  email: string;
  role: string;
  status: string;
  token: string;
  expires_at: string;
  created_at: string;
};

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Fecha no disponible";
  }

  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getRoleLabel(role: string) {
  if (role === "owner") {
    return "Owner";
  }

  if (role === "member") {
    return "Miembro";
  }

  return role || "Sin rol";
}

function getInvitationStatusLabel(status: string) {
  if (status === "pending") {
    return "Pendiente";
  }

  if (status === "accepted") {
    return "Aceptada";
  }

  if (status === "cancelled") {
    return "Cancelada";
  }

  if (status === "expired") {
    return "Caducada";
  }

  return "Sin estado";
}

function getInvitationErrorMessage(message: string) {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("invitation email is required")) {
    return "Introduce el email de la persona invitada.";
  }

  if (normalizedMessage.includes("invitation email is not valid")) {
    return "El email de la invitación no tiene un formato válido.";
  }

  if (normalizedMessage.includes("already a pending invitation")) {
    return "Ya existe una invitación pendiente para este email.";
  }

  if (normalizedMessage.includes("only company owners")) {
    return "Solo un usuario owner puede gestionar invitaciones.";
  }

  return message || "No se pudo completar la acción.";
}

export function TeamSettingsCard() {
  const supabase = useMemo(() => createClient(), []);

  const [company, setCompany] = useState<CurrentCompany | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMemberRow[]>([]);
  const [invitations, setInvitations] = useState<CompanyInvitationRow[]>([]);

  const [inviteEmail, setInviteEmail] = useState("");
  const [createdInvitation, setCreatedInvitation] =
    useState<CompanyInvitationRow | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingInvitation, setIsCreatingInvitation] = useState(false);
  const [updatingInvitationId, setUpdatingInvitationId] = useState("");

  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [copyErrorMessage, setCopyErrorMessage] = useState("");

  const canManageCurrentTeam = canManageTeam(company);
  const canCreateInvitations = canCreateCompanyInvitations(company);
  const canCancelInvitations = canCancelCompanyInvitations(company);

  const loadTeamData = async () => {
    setIsLoading(true);
    setMessage("");
    setErrorMessage("");
    setCopyMessage("");
    setCopyErrorMessage("");

    const { data: currentCompany, error: companyError } =
      await getCurrentCompany(supabase);

    if (companyError) {
      setCompany(null);
      setTeamMembers([]);
      setInvitations([]);
      setErrorMessage(
        `No se pudo cargar el equipo: ${
          companyError.message || "sin detalle del error"
        }`
      );
      setIsLoading(false);
      return;
    }

    if (!currentCompany) {
      setCompany(null);
      setTeamMembers([]);
      setInvitations([]);
      setErrorMessage("No hay ninguna empresa asociada a este usuario.");
      setIsLoading(false);
      return;
    }

    setCompany(currentCompany);

    const { data: members, error: membersError } = await supabase.rpc(
      "get_company_team_members",
      {
        target_company_id: currentCompany.id,
      }
    );

    if (membersError) {
      setTeamMembers([]);
      setErrorMessage(
        `No se pudo cargar la lista de miembros: ${
          membersError.message || "sin detalle del error"
        }`
      );
      setIsLoading(false);
      return;
    }

    setTeamMembers((members ?? []) as TeamMemberRow[]);

    if (!canManageTeam(currentCompany)) {
      setInvitations([]);
      setIsLoading(false);
      return;
    }

    const { data: companyInvitations, error: invitationsError } = await supabase
      .from("company_invitations")
      .select("id, company_id, email, role, status, token, expires_at, created_at")
      .eq("company_id", currentCompany.id)
      .order("created_at", { ascending: false });

    if (invitationsError) {
      setInvitations([]);
      setErrorMessage(
        `No se pudieron cargar las invitaciones: ${
          invitationsError.message || "sin detalle del error"
        }`
      );
      setIsLoading(false);
      return;
    }

    setInvitations((companyInvitations ?? []) as CompanyInvitationRow[]);
    setIsLoading(false);
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadTeamData();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const getInvitationUrl = (token: string) =>
    `${window.location.origin}/invitacion/${token}`;

  const handleCreateInvitation = async () => {
    setMessage("");
    setErrorMessage("");
    setCopyMessage("");
    setCopyErrorMessage("");
    setCreatedInvitation(null);

    if (!company) {
      setErrorMessage("No se puede crear la invitación porque no hay empresa cargada.");
      return;
    }

    if (!canCreateInvitations) {
      setErrorMessage("Solo un usuario owner puede crear invitaciones.");
      return;
    }

    const cleanEmail = inviteEmail.trim().toLowerCase();

    if (!cleanEmail) {
      setErrorMessage("Introduce el email de la persona invitada.");
      return;
    }

    setIsCreatingInvitation(true);

    const { data, error } = await supabase
      .rpc("create_company_invitation", {
        target_company_id: company.id,
        invite_email: cleanEmail,
      })
      .maybeSingle<CompanyInvitationRow>();

    setIsCreatingInvitation(false);

    if (error || !data) {
      setErrorMessage(
        getInvitationErrorMessage(
          error?.message || "No se pudo crear la invitación."
        )
      );
      return;
    }

    setInviteEmail("");
    await loadTeamData();
    setCreatedInvitation(data);
    setMessage("Invitación creada correctamente.");
  };

  const handleCancelInvitation = async (invitationId: string) => {
    setMessage("");
    setErrorMessage("");
    setCopyMessage("");
    setCopyErrorMessage("");
    setCreatedInvitation(null);

    if (!canCancelInvitations) {
      setErrorMessage("Solo un usuario owner puede cancelar invitaciones.");
      return;
    }

    if (
      !window.confirm(
        "¿Seguro que quieres cancelar esta invitación? El enlace dejará de poder usarse."
      )
    ) {
      return;
    }

    setUpdatingInvitationId(invitationId);

    const { error } = await supabase
      .rpc("cancel_company_invitation", {
        invitation_id: invitationId,
      })
      .maybeSingle<CompanyInvitationRow>();

    setUpdatingInvitationId("");

    if (error) {
      setErrorMessage(getInvitationErrorMessage(error.message));
      return;
    }

    await loadTeamData();
    setMessage("Invitación cancelada correctamente.");
  };

  const handleCopyInvitationUrl = async (token: string) => {
    setCopyMessage("");
    setCopyErrorMessage("");

    try {
      await navigator.clipboard.writeText(getInvitationUrl(token));
      setCopyMessage("Enlace de invitación copiado correctamente.");
    } catch {
      setCopyErrorMessage(
        "No se pudo copiar el enlace. Puedes abrirlo y copiarlo manualmente."
      );
    }
  };

  return (
    <div className="min-w-0 max-w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#E6F3F6] text-[#0F4C5C]">
          <UsersRound size={19} />
        </div>

        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-950">Equipo</h2>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            Consulta los usuarios que forman parte de la empresa y gestiona
            invitaciones para nuevos miembros.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Cargando equipo...
        </div>
      ) : null}

      {!isLoading && !canManageCurrentTeam ? (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
          Puedes consultar los miembros de la empresa, pero solo un usuario
          owner puede crear o cancelar invitaciones.
        </div>
      ) : null}

      {!isLoading ? (
        <div className="mt-5 space-y-3">
          {teamMembers.length > 0 ? (
            teamMembers.map((member) => (
              <div
                key={member.user_id}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="break-words font-semibold text-slate-900">
                      {member.full_name || member.email}
                    </div>

                    {member.full_name ? (
                      <div className="mt-1 break-all text-slate-500">
                        {member.email}
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                    {getRoleLabel(member.role)}
                  </div>
                </div>

                <div className="mt-2 text-xs text-slate-500">
                  Miembro desde {formatDateTime(member.created_at)}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Todavía no hay miembros registrados.
            </div>
          )}
        </div>
      ) : null}

      {!isLoading && canManageCurrentTeam ? (
        <div className="mt-6 border-t border-slate-200 pt-5">
          <h3 className="font-semibold text-slate-950">Invitar miembro</h3>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            Crea una invitación para que otra persona se una a esta empresa
            como miembro.
          </p>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              value={inviteEmail}
              onChange={(event) => {
                setInviteEmail(event.target.value);
                setMessage("");
                setErrorMessage("");
              }}
              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
              placeholder="Introduce el email de la persona invitada"
            />

            <Button
              onClick={handleCreateInvitation}
              disabled={isCreatingInvitation}
            >
              <UserPlus size={16} />
              {isCreatingInvitation ? "Creando..." : "Crear invitación"}
            </Button>
          </div>
        </div>
      ) : null}

      <AutoDismissAlert
        className="mt-4"
        message={errorMessage}
        variant="error"
        onDismiss={() => setErrorMessage("")}
      />

      <AutoDismissAlert
        className="mt-4"
        message={message}
        onDismiss={() => setMessage("")}
      />

      <AutoDismissAlert
        className="mt-4"
        message={copyErrorMessage}
        variant="error"
        onDismiss={() => setCopyErrorMessage("")}
      />

      <AutoDismissAlert
        className="mt-4"
        message={copyMessage}
        onDismiss={() => setCopyMessage("")}
      />

      {createdInvitation ? (
        <div className="mt-4 min-w-0 rounded-2xl border border-[#B8D1D8] bg-[#F2FAFB] px-4 py-3 text-sm text-[#083640]">
          <div className="font-semibold">Enlace de invitación creado</div>

          <input
            readOnly
            value={getInvitationUrl(createdInvitation.token)}
            className="mt-2 min-w-0 w-full max-w-full rounded-xl border border-[#B8D1D8] bg-white px-3 py-2 text-xs text-[#062E36] outline-none"
          />

          <Button
            className="mt-3 w-full"
            variant="secondary"
            onClick={() => handleCopyInvitationUrl(createdInvitation.token)}
          >
            <Copy size={16} />
            Copiar enlace
          </Button>
        </div>
      ) : null}

      {!isLoading && canManageCurrentTeam ? (
        <div className="mt-6 border-t border-slate-200 pt-5">
          <h3 className="font-semibold text-slate-950">Invitaciones</h3>

          <div className="mt-3 space-y-3">
            {invitations.length > 0 ? (
              invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="break-all font-semibold text-slate-900">
                        {invitation.email}
                      </div>

                      <div className="mt-1 break-words text-xs text-slate-500">
                        {getRoleLabel(invitation.role)} ·{" "}
                        {getInvitationStatusLabel(invitation.status)} · caduca{" "}
                        {formatDateTime(invitation.expires_at)}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="ghost"
                        onClick={() => handleCopyInvitationUrl(invitation.token)}
                      >
                        <Copy size={15} />
                        Copiar enlace
                      </Button>

                      {invitation.status === "pending" ? (
                        <Button
                          variant="ghost"
                          onClick={() => handleCancelInvitation(invitation.id)}
                          disabled={updatingInvitationId === invitation.id}
                        >
                          <XCircle size={15} />
                          {updatingInvitationId === invitation.id
                            ? "Cancelando..."
                            : "Cancelar"}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Todavía no hay invitaciones.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
