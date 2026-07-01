"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  XCircle,
} from "lucide-react";

import {
  compareAppointmentsByScheduledAt,
  getAppointmentStatusLabel,
  mapAppointmentRowToAppointment,
  type AppointmentRow,
} from "../lib/appointmentUtils";
import {
  addDaysToDateKey,
  formatAppointmentTimeRange,
  formatDateKey,
  getAvailableAppointmentSlots,
  getAppointmentConflictMessage,
  getAppointmentInterval,
  getTodayDateKey,
} from "../lib/appointmentScheduling";
import {
  formatFollowUpDueAt,
  normalizeFollowUpStatus,
  resolveFollowUpUrgency,
} from "../lib/followUpUtils";
import { getCategoryLabel } from "../lib/inquiryCategories";
import { type AnalyzeInquiryResponse } from "../lib/inquiryAnalysisApi";
import { MAX_ANALYSIS_MESSAGE_LENGTH } from "../lib/inquiryAnalysisLimits";
import {
  formatDateTime,
  mapInquiryRowToInquiry,
  normalizeInquiryStatus,
  type InquiryRow,
} from "../lib/inquiryUtils";
import {
  formatSourceChannel,
  normalizeSourceChannelValue,
  sourceChannelOptions,
} from "../lib/sourceChannels";
import { createClient } from "../lib/supabase/client";
import type {
  Appointment,
  AppointmentStatus,
  FollowUp,
  Inquiry,
  InquiryStatus,
} from "../types";

import { AIBlock } from "./AIBlock";
import { Button } from "./Button";
import { FollowUpCard } from "./FollowUpCard";
import {
  OutboundDeliveryIssues,
  type OutboundDeliveryIssue,
} from "./OutboundDeliveryIssues";
import { ResponseEditor } from "./ResponseEditor";
import { SectionCard } from "./SectionCard";

type InquiryDetailProps = {
  inquiryId: string;
  setActiveView: (view: string) => void;
};

type InquiryDetailRow = InquiryRow & {
  company_id: string;
  assigned_to: string | null;
};

type InquiryTeamMember = {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
};

type InquiryAssignmentResult = {
  inquiry_id: string;
  assigned_to: string | null;
  assigned_at: string | null;
  assigned_by: string | null;
};

type CustomerRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

type InternalNoteRow = {
  id: string;
  body: string;
  created_by: string | null;
  created_at: string;
};

type InquiryMessageRow = {
  id: string;
  direction: string;
  author_type: string;
  body: string;
  source_channel: string | null;
  created_by: string | null;
  created_at: string;
};

type OutboundMessageForInquiryRow = {
  id: string;
  channel: string;
  status: string;
  inquiry_message_id: string | null;
  body: string | null;
  to_address: string | null;
  provider_message_id: string | null;
  error_message: string | null;
  created_at: string;
};

type SendCaseResponseNextStatus = "replied" | "waiting_customer";

type SendEmailResponseApiResponse = {
  ok?: boolean;
  error?: string;
  warning?: string;
  providerMessageId?: string;
  inquiryMessage?: InquiryMessageRow;
  nextStatus?: SendCaseResponseNextStatus;
};

type SendWhatsAppResponseApiResponse = {
  ok?: boolean;
  error?: string;
  warning?: string;
  providerMessageId?: string;
  inquiryMessage?: InquiryMessageRow;
  nextStatus?: SendCaseResponseNextStatus;
};

type InboundEventForInquiryRow = {
  id: string;
  raw_payload: Record<string, unknown> | null;
};

type InboundReceivedDetails = {
  sourceChannel: string;
  customerName: string;
  email: string;
  phone: string;
};

type FollowUpRow = {
  id: string;
  title: string;
  due_at: string | null;
  status: string;
  urgency: string | null;
  inquiry_id: string | null;
  created_at: string;
  customer: {
    name: string | null;
  } | null;
};

type InquiryAnalysisRequestResult =
  | {
      analysis: NonNullable<AnalyzeInquiryResponse["analysis"]>;
      errorMessage: "";
    }
  | {
      analysis: null;
      errorMessage: string;
    };

const SUCCESS_MESSAGE_VISIBLE_MS = 4200;
const SUCCESS_MESSAGE_FADE_MS = 300;

const successMessageFadeOutStyle = `
@keyframes coppeSuccessMessageFadeOut {
  from {
    opacity: 1;
    transform: translateY(0);
  }

  to {
    opacity: 0;
    transform: translateY(-2px);
  }
}
`;

type AutoDismissSuccessMessageProps = {
  message: string;
  onDismiss: (value: string) => void;
};

function AutoDismissSuccessMessage({
  message,
  onDismiss,
}: AutoDismissSuccessMessageProps) {
  useEffect(() => {
    if (!message) {
      return;
    }

    const clearTimer = window.setTimeout(() => {
      onDismiss("");
    }, SUCCESS_MESSAGE_VISIBLE_MS + SUCCESS_MESSAGE_FADE_MS);

    return () => {
      window.clearTimeout(clearTimer);
    };
  }, [message, onDismiss]);

  if (!message) {
    return null;
  }

  return (
    <>
      <style>{successMessageFadeOutStyle}</style>
      <div
        className="mt-3 rounded-2xl border border-[#B8D1D8] bg-[#F2FAFB] px-4 py-3 text-sm text-[#0F4C5C]"
        style={{
          animation: `coppeSuccessMessageFadeOut ${SUCCESS_MESSAGE_FADE_MS}ms ease-in ${SUCCESS_MESSAGE_VISIBLE_MS}ms forwards`,
        }}
      >
        {message}
      </div>
    </>
  );
}

async function requestInquiryAnalysis(
  customerName: string,
  message: string
): Promise<InquiryAnalysisRequestResult> {
  let analysisResponse: Response;

  try {
    analysisResponse = await fetch("/api/inquiries/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customerName,
        message,
      }),
    });
  } catch {
    return {
      analysis: null,
      errorMessage:
        "No se pudo conectar con el servicio de análisis. Inténtalo de nuevo en unos segundos.",
    };
  }

  let analysisPayload: AnalyzeInquiryResponse | null = null;

  try {
    analysisPayload = (await analysisResponse.json()) as AnalyzeInquiryResponse;
  } catch {
    analysisPayload = null;
  }

  const analysisErrorMessage =
    typeof analysisPayload?.error === "string" && analysisPayload.error.trim()
      ? analysisPayload.error.trim()
      : "No se pudo reanalizar el caso.";

  if (!analysisResponse.ok || !analysisPayload?.analysis) {
    return {
      analysis: null,
      errorMessage: analysisErrorMessage,
    };
  }

  return {
    analysis: analysisPayload.analysis,
    errorMessage: "",
  };
}

function getMessageAuthorLabel(authorType: string) {
  if (authorType === "customer") {
    return "Cliente";
  }

  if (authorType === "company") {
    return "Empresa";
  }

  if (authorType === "ai") {
    return "COPPE";
  }

  return "Mensaje";
}

function getMessageDirectionLabel(
  direction: string,
  wasSentByEmail = false,
  wasSentByWhatsApp = false
) {
  if (direction === "inbound") {
    return "Recibido";
  }

  if (direction === "outbound" && wasSentByEmail) {
    return "Email enviado";
  }

  if (direction === "outbound" && wasSentByWhatsApp) {
    return "WhatsApp enviado";
  }

  if (direction === "outbound") {
    return "Respuesta registrada";
  }

  return "Mensaje";
}

function formatPriorityLabel(priority: string | null | undefined) {
  if (priority === "high") {
    return "Alta";
  }

  if (priority === "medium") {
    return "Media";
  }

  if (priority === "low") {
    return "Baja";
  }

  return "Sin prioridad";
}

function formatStatusLabel(status: InquiryStatus) {
  if (status === "new") {
    return "Nuevo";
  }

  if (status === "pending") {
    return "En seguimiento";
  }

  if (status === "waiting_customer") {
    return "Esperando al cliente";
  }

  if (status === "replied") {
    return "Respondido";
  }

  if (status === "closed") {
    return "Cerrado";
  }

  if (status === "discarded") {
    return "Descartado";
  }

  return "Estado no indicado";
}

function TealBadge({ children }: { children: string }) {
  return (
    <span className="rounded-full border border-[#B8D1D8] bg-white px-2.5 py-1 text-xs font-semibold text-[#315F69] shadow-sm shadow-[#0F4C5C]/5">
      {children}
    </span>
  );
}

function getRawPayloadStringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeComparableText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function normalizeComparablePhone(value: string | null | undefined) {
  const digits = (value ?? "").replace(/\D/g, "");

  if (digits.startsWith("0034") && digits.length > 9) {
    return digits.slice(4);
  }

  if (digits.startsWith("34") && digits.length > 9) {
    return digits.slice(2);
  }

  return digits;
}

function buildInboundReceivedDetails(
  inboundEvent: InboundEventForInquiryRow | null,
  linkedCustomer: CustomerRow | null,
  inquiryData: InquiryDetailRow
): InboundReceivedDetails | null {
  const rawPayload = inboundEvent?.raw_payload ?? null;

  if (!rawPayload) {
    return null;
  }

  const receivedSourceChannel = formatSourceChannel(inquiryData.source_channel);
  const receivedCustomerName = getRawPayloadStringValue(rawPayload.customerName);
  const receivedEmail = getRawPayloadStringValue(rawPayload.email).toLowerCase();
  const receivedPhone =
    getRawPayloadStringValue(rawPayload.phone) ||
    getRawPayloadStringValue(rawPayload.fromPhone);

  if (!receivedCustomerName && !receivedEmail && !receivedPhone) {
    return null;
  }

  const linkedCustomerName = linkedCustomer?.name || inquiryData.customer_name;
  const linkedCustomerEmail = linkedCustomer?.email ?? "";
  const linkedCustomerPhone = linkedCustomer?.phone ?? "";

  const hasDifferentName =
    Boolean(receivedCustomerName && linkedCustomerName) &&
    normalizeComparableText(receivedCustomerName) !==
      normalizeComparableText(linkedCustomerName);

  const hasDifferentEmail =
    Boolean(receivedEmail && linkedCustomerEmail) &&
    normalizeComparableText(receivedEmail) !==
      normalizeComparableText(linkedCustomerEmail);

  const hasDifferentPhone =
    Boolean(receivedPhone && linkedCustomerPhone) &&
    normalizeComparablePhone(receivedPhone) !==
      normalizeComparablePhone(linkedCustomerPhone);

  if (!hasDifferentName && !hasDifferentEmail && !hasDifferentPhone) {
    return null;
  }

  return {
    sourceChannel: receivedSourceChannel,
    customerName: receivedCustomerName,
    email: receivedEmail,
    phone: receivedPhone,
  };
}

function buildInquiryContextFromMessages(
  messages: InquiryMessageRow[],
  fallbackMessage: string,
  additionalInfo: string
) {
  const contextMessages =
    messages.length > 0
      ? messages
      : [
          {
            id: "fallback-original-message",
            direction: "inbound",
            author_type: "customer",
            body: fallbackMessage,
            source_channel: null,
            created_at: new Date().toISOString(),
          },
        ];

  return [
    ...contextMessages.map((message) => {
      return `${getMessageAuthorLabel(message.author_type)}:\n${message.body.trim()}`;
    }),
    `Cliente:\n${additionalInfo.trim()}`,
  ].join("\n\n");
}

function mapFollowUpRowToFollowUp(row: FollowUpRow): FollowUp {
  const status = normalizeFollowUpStatus(row.status);
  const urgency = resolveFollowUpUrgency(row.due_at, status, row.urgency);

  return {
    id: row.id,
    title: row.title,
    customerName: row.customer?.name || "Cliente no indicado",
    inquiryId: row.inquiry_id ?? "",
    dueAt: formatFollowUpDueAt(row.due_at, urgency),
    dueAtIso: row.due_at,
    status,
    urgency,
  };
}

function getFollowUpStatusAuditAction(
  previousStatus: FollowUp["status"],
  nextStatus: FollowUp["status"]
) {
  if (nextStatus === "pending" && previousStatus !== "pending") {
    return "reopen_follow_up";
  }

  if (nextStatus === "completed") {
    return "complete_follow_up";
  }

  if (nextStatus === "cancelled") {
    return "cancel_follow_up";
  }

  return "update_follow_up_status";
}

function getAppointmentStatusAuditAction(
  previousStatus: AppointmentStatus | null | undefined,
  nextStatus: AppointmentStatus
) {
  if (nextStatus === "confirmed") {
    return "confirm_appointment";
  }

  if (nextStatus === "completed") {
    return "complete_appointment";
  }

  if (nextStatus === "cancelled") {
    return "cancel_appointment";
  }

  if (nextStatus === "proposed" && previousStatus !== "proposed") {
    return "reopen_appointment";
  }

  return "update_appointment";
}

function getDefaultFollowUpDateTimeLocal() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function getDefaultFollowUpTitle(customerName: string) {
  const cleanCustomerName = customerName.trim();

  if (!cleanCustomerName) {
    return "Revisar caso";
  }

  return `Revisar caso de ${cleanCustomerName}`;
}

function getDefaultAppointmentTitle(customerName: string) {
  const cleanCustomerName = customerName.trim();

  if (!cleanCustomerName) {
    return "Cita para caso";
  }

  return `Cita para caso de ${cleanCustomerName}`;
}

function formatDateTimeLocalFromIso(value: string | null) {
  if (!value) {
    return getDefaultFollowUpDateTimeLocal();
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return getDefaultFollowUpDateTimeLocal();
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function InquiryDetail({
  inquiryId,
  setActiveView,
}: InquiryDetailProps) {
  const supabase = useMemo(() => createClient(), []);
  const appointmentTimeZone = useMemo(
    () =>
      Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Madrid",
    []
  );

  const [inquiry, setInquiry] = useState<Inquiry | null>(null);
  const [rawInquiry, setRawInquiry] = useState<InquiryDetailRow | null>(null);
  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [notes, setNotes] = useState<InternalNoteRow[]>([]);
  const [inquiryMessages, setInquiryMessages] = useState<InquiryMessageRow[]>(
    []
  );
  const [sentEmailMessageIds, setSentEmailMessageIds] = useState<string[]>([]);
  const [sentEmailResponseBodies, setSentEmailResponseBodies] = useState<
    string[]
  >([]);
  const [sentWhatsAppMessageIds, setSentWhatsAppMessageIds] = useState<
    string[]
  >([]);
  const [sentWhatsAppResponseBodies, setSentWhatsAppResponseBodies] = useState<
    string[]
  >([]);
  const [outboundDeliveryIssues, setOutboundDeliveryIssues] = useState<
    OutboundDeliveryIssue[]
  >([]);
  const [teamMembers, setTeamMembers] = useState<InquiryTeamMember[]>([]);
  const [assignedTo, setAssignedTo] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [inboundReceivedDetails, setInboundReceivedDetails] =
    useState<InboundReceivedDetails | null>(null);

  const [note, setNote] = useState("");
  const [additionalCustomerInfo, setAdditionalCustomerInfo] = useState("");
  const [
    additionalCustomerSourceChannel,
    setAdditionalCustomerSourceChannel,
  ] = useState("");

  const [appointmentTitle, setAppointmentTitle] = useState("");
  const [appointmentScheduledAt, setAppointmentScheduledAt] = useState("");
  const [appointmentNotes, setAppointmentNotes] = useState("");
  const [appointmentAssignedTo, setAppointmentAssignedTo] = useState("");
  const [appointmentDurationMinutes, setAppointmentDurationMinutes] =
    useState(60);
  const [appointmentAvailabilityDate, setAppointmentAvailabilityDate] =
    useState(() => getTodayDateKey(appointmentTimeZone));
  const [availabilityAppointments, setAvailabilityAppointments] = useState<
    Appointment[]
  >([]);
  const [
    isLoadingAppointmentAvailability,
    setIsLoadingAppointmentAvailability,
  ] = useState(false);
  const [appointmentAvailabilityError, setAppointmentAvailabilityError] =
    useState("");
  const [appointmentAvailabilityVersion, setAppointmentAvailabilityVersion] =
    useState(0);
  const relevantAvailabilityAppointments = useMemo(
    () =>
      appointmentAssignedTo
        ? availabilityAppointments.filter(
            (appointment) =>
              !appointment.assignedTo ||
              appointment.assignedTo === appointmentAssignedTo
          )
        : [],
    [appointmentAssignedTo, availabilityAppointments]
  );
  const availableAppointmentSlots = useMemo(() => {
    if (!appointmentAssignedTo || !appointmentAvailabilityDate) {
      return [];
    }

    const dayStartsAt = new Date(
      `${appointmentAvailabilityDate}T00:00:00`
    ).getTime();

    return getAvailableAppointmentSlots({
      dayStartsAtMs: dayStartsAt,
      durationMinutes: appointmentDurationMinutes,
      appointments: relevantAvailabilityAppointments.map((appointment) => ({
        scheduledAtIso: appointment.scheduledAtIso,
        durationMinutes: appointment.durationMinutes,
        bufferBeforeMinutes: appointment.bufferBeforeMinutes,
        bufferAfterMinutes: appointment.bufferAfterMinutes,
      })),
    });
  }, [
    appointmentAssignedTo,
    appointmentAvailabilityDate,
    appointmentDurationMinutes,
    relevantAvailabilityAppointments,
  ]);
  const [editingAppointmentId, setEditingAppointmentId] = useState<
    string | null
  >(null);
  const [editAppointmentTitle, setEditAppointmentTitle] = useState("");
  const [editAppointmentScheduledAt, setEditAppointmentScheduledAt] =
    useState("");
  const [editAppointmentNotes, setEditAppointmentNotes] = useState("");

  const [followUpTitle, setFollowUpTitle] = useState("");
  const [followUpDueAt, setFollowUpDueAt] = useState("");
  const [showCreateFollowUpForm, setShowCreateFollowUpForm] = useState(false);
  const [editingFollowUpId, setEditingFollowUpId] = useState<string | null>(
    null
  );
  const [editFollowUpTitle, setEditFollowUpTitle] = useState("");
  const [editFollowUpDueAt, setEditFollowUpDueAt] = useState(
    getDefaultFollowUpDateTimeLocal()
  );

  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isReanalyzingInquiry, setIsReanalyzingInquiry] = useState(false);
  const [isCreatingAppointment, setIsCreatingAppointment] = useState(false);
  const [isSavingAppointmentEdit, setIsSavingAppointmentEdit] = useState(false);
  const [isCreatingFollowUp, setIsCreatingFollowUp] = useState(false);
  const [isSavingFollowUpEdit, setIsSavingFollowUpEdit] = useState(false);
  const [isUpdatingAssignment, setIsUpdatingAssignment] = useState(false);
  const [updatingFollowUpId, setUpdatingFollowUpId] = useState<string | null>(
    null
  );
  const [updatingAppointmentId, setUpdatingAppointmentId] = useState<
    string | null
  >(null);

  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [statusErrorMessage, setStatusErrorMessage] = useState("");
  const [noteMessage, setNoteMessage] = useState("");
  const [noteErrorMessage, setNoteErrorMessage] = useState("");
  const [reanalysisMessage, setReanalysisMessage] = useState("");
  const [reanalysisErrorMessage, setReanalysisErrorMessage] = useState("");
  const [appointmentCreateMessage, setAppointmentCreateMessage] = useState("");
  const [appointmentActionMessage, setAppointmentActionMessage] = useState("");
  const [appointmentErrorMessage, setAppointmentErrorMessage] = useState("");
  const [followUpCreateMessage, setFollowUpCreateMessage] = useState("");
  const [followUpCreateErrorMessage, setFollowUpCreateErrorMessage] =
    useState("");
  const [followUpActionMessage, setFollowUpActionMessage] = useState("");
  const [followUpActionErrorMessage, setFollowUpActionErrorMessage] =
    useState("");
  const [assignmentMessage, setAssignmentMessage] = useState("");
  const [assignmentErrorMessage, setAssignmentErrorMessage] = useState("");

  useEffect(() => {
    async function loadInquiry() {
      setIsLoading(true);
      setErrorMessage("");
      setStatusMessage("");
      setStatusErrorMessage("");
      setNoteMessage("");
      setNoteErrorMessage("");
      setReanalysisMessage("");
      setReanalysisErrorMessage("");
      setAppointmentCreateMessage("");
      setAppointmentActionMessage("");
      setAppointmentErrorMessage("");
      setFollowUpCreateMessage("");
      setFollowUpCreateErrorMessage("");
      setFollowUpActionMessage("");
      setFollowUpActionErrorMessage("");
      setAssignmentMessage("");
      setAssignmentErrorMessage("");
      setInquiry(null);
      setRawInquiry(null);
      setCustomer(null);
      setNotes([]);
      setInquiryMessages([]);
      setSentEmailMessageIds([]);
      setSentEmailResponseBodies([]);
      setSentWhatsAppMessageIds([]);
      setSentWhatsAppResponseBodies([]);
      setOutboundDeliveryIssues([]);
      setTeamMembers([]);
      setAssignedTo("");
      setFollowUps([]);
      setAppointments([]);
      setInboundReceivedDetails(null);
      setNote("");
      setAdditionalCustomerInfo("");
      setAdditionalCustomerSourceChannel("");
      setAppointmentTitle("");
      setAppointmentScheduledAt("");
      setAppointmentNotes("");
      setAppointmentAssignedTo("");
      setAppointmentDurationMinutes(60);
      setAppointmentAvailabilityDate(getTodayDateKey(appointmentTimeZone));
      setAvailabilityAppointments([]);
      setAppointmentAvailabilityError("");
      setEditingAppointmentId(null);
      setEditAppointmentTitle("");
      setEditAppointmentScheduledAt("");
      setEditAppointmentNotes("");
      setFollowUpTitle("");
      setFollowUpDueAt("");
      setShowCreateFollowUpForm(false);
      setEditingFollowUpId(null);
      setEditFollowUpTitle("");
      setEditFollowUpDueAt(getDefaultFollowUpDateTimeLocal());

      const { data: inquiryData, error: inquiryError } = await supabase
        .from("inquiries")
        .select(
          [
            "id",
            "company_id",
            "customer_id",
            "customer_name",
            "source_channel",
            "subject",
            "original_message",
            "ai_summary",
            "ai_intent",
            "ai_category",
            "ai_priority",
            "ai_language",
            "sentiment",
            "missing_information",
            "recommended_action",
            "suggested_response",
            "status",
            "assigned_to",
            "created_at",
          ].join(", ")
        )
        .eq("id", inquiryId)
        .maybeSingle<InquiryDetailRow>();

      if (inquiryError) {
        setErrorMessage(
          `No se pudo cargar el caso: ${
            inquiryError.message || "sin detalle del error"
          }`
        );
        setIsLoading(false);
        return;
      }

      if (!inquiryData) {
        setErrorMessage(
          "No se encontró este caso o no pertenece a tu empresa."
        );
        setIsLoading(false);
        return;
      }

      setInquiry(mapInquiryRowToInquiry(inquiryData));
      setRawInquiry(inquiryData);
      setAssignedTo(inquiryData.assigned_to ?? "");
      setAppointmentTitle(getDefaultAppointmentTitle(inquiryData.customer_name));
      setAppointmentScheduledAt("");
      setAppointmentNotes("");
      setEditingAppointmentId(null);
      setEditAppointmentTitle("");
      setEditAppointmentScheduledAt("");
      setEditAppointmentNotes("");
      setFollowUpTitle(getDefaultFollowUpTitle(inquiryData.customer_name));
      setFollowUpDueAt("");

      const [
        { data: teamMembersData, error: teamMembersError },
        {
          data: { user: currentUser },
        },
      ] = await Promise.all([
        supabase.rpc("get_company_team_members", {
          target_company_id: inquiryData.company_id,
        }),
        supabase.auth.getUser(),
      ]);

      if (teamMembersError) {
        setAssignmentErrorMessage(
          `No se pudo cargar el equipo: ${
            teamMembersError.message || "sin detalle del error"
          }`
        );
      } else {
        const loadedTeamMembers = (teamMembersData ??
          []) as InquiryTeamMember[];
        const defaultAppointmentAssignee =
          loadedTeamMembers.find(
            (member) => member.user_id === inquiryData.assigned_to
          )?.user_id ??
          loadedTeamMembers.find(
            (member) => member.user_id === currentUser?.id
          )?.user_id ??
          loadedTeamMembers[0]?.user_id ??
          "";

        setTeamMembers(loadedTeamMembers);
        setAppointmentAssignedTo(defaultAppointmentAssignee);
      }

      let loadedCustomer: CustomerRow | null = null;

      if (inquiryData.customer_id) {
        const { data: customerData, error: customerError } = await supabase
          .from("customers")
          .select("id, name, email, phone")
          .eq("id", inquiryData.customer_id)
          .maybeSingle<CustomerRow>();

        if (!customerError && customerData) {
          loadedCustomer = customerData;
          setCustomer(customerData);
        }
      }

      const { data: inboundEventData, error: inboundEventError } =
        await supabase
          .from("inbound_events")
          .select("id, raw_payload")
          .eq("inquiry_id", inquiryData.id)
          .in("source_channel", ["Formulario web", "WhatsApp"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle<InboundEventForInquiryRow>();

      if (!inboundEventError && inboundEventData) {
        setInboundReceivedDetails(
          buildInboundReceivedDetails(
            inboundEventData,
            loadedCustomer,
            inquiryData
          )
        );
      }

      const { data: inquiryMessagesData, error: inquiryMessagesError } =
        await supabase
          .from("inquiry_messages")
          .select(
            "id, direction, author_type, body, source_channel, created_by, created_at"
          )
          .eq("inquiry_id", inquiryData.id)
          .order("created_at", { ascending: true });

      if (inquiryMessagesError) {
        setErrorMessage(
          `Se cargó el caso, pero no se pudieron cargar sus mensajes: ${
            inquiryMessagesError.message || "sin detalle del error"
          }`
        );
        setIsLoading(false);
        return;
      }

      const { data: outboundMessagesData, error: outboundMessagesError } =
        await supabase
          .from("outbound_messages")
          .select(
            "id, channel, status, inquiry_message_id, body, to_address, provider_message_id, error_message, created_at"
          )
          .eq("inquiry_id", inquiryData.id)
          .in("channel", ["email", "whatsapp"])
          .in("status", ["sent", "unknown"])
          .order("created_at", { ascending: false });

      if (!outboundMessagesError) {
        const outboundRows =
          (outboundMessagesData ?? []) as OutboundMessageForInquiryRow[];
        const sentOutboundRows = outboundRows.filter(
          (outboundMessage) =>
            outboundMessage.status === "sent" &&
            Boolean(outboundMessage.inquiry_message_id)
        );

        const sentEmailRows = sentOutboundRows.filter(
          (outboundMessage) => outboundMessage.channel === "email"
        );
        const sentWhatsAppRows = sentOutboundRows.filter(
          (outboundMessage) => outboundMessage.channel === "whatsapp"
        );

        const sentEmailMessageIds = sentEmailRows
          .map((outboundMessage) => outboundMessage.inquiry_message_id)
          .filter((messageId): messageId is string => Boolean(messageId));

        const sentEmailResponseBodies = sentEmailRows
          .map((outboundMessage) => outboundMessage.body?.trim() || "")
          .filter(Boolean);

        const sentWhatsAppMessageIds = sentWhatsAppRows
          .map((outboundMessage) => outboundMessage.inquiry_message_id)
          .filter((messageId): messageId is string => Boolean(messageId));

        const sentWhatsAppResponseBodies = sentWhatsAppRows
          .map((outboundMessage) => outboundMessage.body?.trim() || "")
          .filter(Boolean);

        setSentEmailMessageIds(sentEmailMessageIds);
        setSentEmailResponseBodies(sentEmailResponseBodies);
        setSentWhatsAppMessageIds(sentWhatsAppMessageIds);
        setSentWhatsAppResponseBodies(sentWhatsAppResponseBodies);
        setOutboundDeliveryIssues(
          outboundRows
            .filter(
              (
                outboundMessage
              ): outboundMessage is OutboundMessageForInquiryRow & {
                channel: "email" | "whatsapp";
              } =>
                outboundMessage.status === "unknown" &&
                (outboundMessage.channel === "email" ||
                  outboundMessage.channel === "whatsapp")
            )
            .map((outboundMessage) => ({
              id: outboundMessage.id,
              channel: outboundMessage.channel,
              body: outboundMessage.body?.trim() || "",
              toAddress: outboundMessage.to_address?.trim() || "",
              providerMessageId:
                outboundMessage.provider_message_id?.trim() || "",
              errorMessage: outboundMessage.error_message?.trim() || "",
              createdAt: outboundMessage.created_at,
            }))
        );
      }

      const { data: followUpsData, error: followUpsError } = await supabase
        .from("follow_ups")
        .select(
          [
            "id",
            "title",
            "due_at",
            "status",
            "urgency",
            "inquiry_id",
            "created_at",
            "customer:customers(name)",
          ].join(", ")
        )
        .eq("inquiry_id", inquiryData.id)
        .order("due_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (followUpsError) {
        setErrorMessage(
          `Se cargó el caso, pero no se pudieron cargar sus seguimientos: ${
            followUpsError.message || "sin detalle del error"
          }`
        );
        setIsLoading(false);
        return;
      }

      const { data: appointmentsData, error: appointmentsError } =
        await supabase
          .from("appointments")
          .select(
            [
              "id",
              "inquiry_id",
              "customer_id",
              "assigned_to",
              "title",
              "scheduled_at",
              "duration_minutes",
              "timezone",
              "location",
              "buffer_before_minutes",
              "buffer_after_minutes",
              "status",
              "notes",
              "created_at",
              "updated_at",
            ].join(", ")
          )
          .eq("inquiry_id", inquiryData.id)
          .order("scheduled_at", { ascending: true });

      if (appointmentsError) {
        setErrorMessage(
          `Se cargó el caso, pero no se pudieron cargar sus citas: ${
            appointmentsError.message || "sin detalle del error"
          }`
        );
        setIsLoading(false);
        return;
      }

      const { data: notesData, error: notesError } = await supabase
        .from("internal_notes")
        .select("id, body, created_by, created_at")
        .eq("inquiry_id", inquiryData.id)
        .order("created_at", { ascending: false });

      if (notesError) {
        setErrorMessage(
          `Se cargó el caso, pero no se pudieron cargar sus notas: ${
            notesError.message || "sin detalle del error"
          }`
        );
        setIsLoading(false);
        return;
      }

      setInquiryMessages((inquiryMessagesData ?? []) as InquiryMessageRow[]);
      setFollowUps(
        ((followUpsData ?? []) as unknown as FollowUpRow[]).map(
          mapFollowUpRowToFollowUp
        )
      );
      setAppointments(
        ((appointmentsData ?? []) as unknown as AppointmentRow[])
          .map(mapAppointmentRowToAppointment)
          .sort(compareAppointmentsByScheduledAt)
      );
      setNotes((notesData ?? []) as InternalNoteRow[]);
      setIsLoading(false);
    }

    loadInquiry();
  }, [appointmentTimeZone, inquiryId, reloadVersion, supabase]);

  useEffect(() => {
    let isCancelled = false;

    async function loadAppointmentAvailability() {
      if (!rawInquiry || !appointmentAvailabilityDate) {
        setAvailabilityAppointments([]);
        return;
      }

      const dayStartsAt = new Date(
        `${appointmentAvailabilityDate}T00:00:00`
      );

      if (Number.isNaN(dayStartsAt.getTime())) {
        setAvailabilityAppointments([]);
        setAppointmentAvailabilityError(
          "No se pudo interpretar el día seleccionado."
        );
        return;
      }

      const dayEndsAt = new Date(dayStartsAt);
      dayEndsAt.setDate(dayEndsAt.getDate() + 1);
      const protectedRangeStartsAt = new Date(
        dayStartsAt.getTime() - 12 * 60 * 60 * 1000
      );

      setIsLoadingAppointmentAvailability(true);
      setAppointmentAvailabilityError("");

      const { data, error } = await supabase
        .from("appointments")
        .select(
          [
            "id",
            "inquiry_id",
            "customer_id",
            "assigned_to",
            "title",
            "scheduled_at",
            "duration_minutes",
            "timezone",
            "location",
            "buffer_before_minutes",
            "buffer_after_minutes",
            "status",
            "notes",
            "created_at",
            "updated_at",
          ].join(", ")
        )
        .eq("company_id", rawInquiry.company_id)
        .in("status", ["proposed", "confirmed"])
        .gte("scheduled_at", protectedRangeStartsAt.toISOString())
        .lt("scheduled_at", dayEndsAt.toISOString())
        .order("scheduled_at", { ascending: true });

      if (isCancelled) {
        return;
      }

      setIsLoadingAppointmentAvailability(false);

      if (error) {
        setAvailabilityAppointments([]);
        setAppointmentAvailabilityError(
          `No se pudo consultar la agenda: ${
            error.message || "sin detalle del error"
          }`
        );
        return;
      }

      const dayStartsAtMs = dayStartsAt.getTime();
      const dayEndsAtMs = dayEndsAt.getTime();

      setAvailabilityAppointments(
        ((data ?? []) as unknown as AppointmentRow[])
          .map(mapAppointmentRowToAppointment)
          .filter((appointment) => {
            const interval = getAppointmentInterval({
              scheduledAtIso: appointment.scheduledAtIso,
              durationMinutes: appointment.durationMinutes,
              bufferBeforeMinutes: appointment.bufferBeforeMinutes,
              bufferAfterMinutes: appointment.bufferAfterMinutes,
            });

            return Boolean(
              interval &&
                interval.protectedStartsAtMs < dayEndsAtMs &&
                interval.protectedEndsAtMs > dayStartsAtMs
            );
          })
          .sort(compareAppointmentsByScheduledAt)
      );
    }

    void loadAppointmentAvailability();

    return () => {
      isCancelled = true;
    };
  }, [
    appointmentAvailabilityDate,
    appointmentAvailabilityVersion,
    rawInquiry,
    supabase,
  ]);

  const handleAssignInquiry = async (nextAssignedTo: string) => {
    if (!rawInquiry || isUpdatingAssignment) {
      return;
    }

    const previousAssignedTo = assignedTo;

    setAssignedTo(nextAssignedTo);
    setAssignmentMessage("");
    setAssignmentErrorMessage("");
    setIsUpdatingAssignment(true);

    const { data, error } = await supabase
      .rpc("assign_inquiry", {
        p_inquiry_id: rawInquiry.id,
        p_assigned_to: nextAssignedTo || null,
      })
      .single<InquiryAssignmentResult>();

    setIsUpdatingAssignment(false);

    if (error || !data) {
      setAssignedTo(previousAssignedTo);
      setAssignmentErrorMessage(
        `No se pudo cambiar el responsable: ${
          error?.message || "sin detalle del error"
        }`
      );
      return;
    }

    setAssignedTo(data.assigned_to ?? "");
    setRawInquiry((currentInquiry) =>
      currentInquiry
        ? {
            ...currentInquiry,
            assigned_to: data.assigned_to,
          }
        : currentInquiry
    );
    setAssignmentMessage(
      data.assigned_to
        ? "Responsable actualizado correctamente."
        : "El caso ha quedado sin responsable."
    );
  };

  const getTeamMemberName = (userId: string | null) => {
    if (!userId) {
      return "";
    }

    const teamMember = teamMembers.find(
      (candidate) => candidate.user_id === userId
    );

    return (
      teamMember?.full_name.trim() ||
      teamMember?.email.trim() ||
      ""
    );
  };

  const getInquiryMessageAuthorLabel = (message: InquiryMessageRow) => {
    if (message.author_type !== "company") {
      return getMessageAuthorLabel(message.author_type);
    }

    return getTeamMemberName(message.created_by) || "Empresa";
  };

  const handleUpdateStatus = async (
    newStatus: InquiryStatus
  ): Promise<boolean> => {
    if (!inquiry || !rawInquiry) {
      return false;
    }

    setStatusMessage("");
    setStatusErrorMessage("");

    if (
      newStatus === "discarded" &&
      !window.confirm(
        "¿Seguro que quieres descartar este caso? No se eliminará del historial, pero dejará de tratarse como pendiente."
      )
    ) {
      return false;
    }

    if (
      newStatus === "pending" &&
      (inquiry.status === "replied" ||
        inquiry.status === "closed" ||
        inquiry.status === "discarded") &&
      !window.confirm(
        "¿Seguro que quieres reabrir este caso? Volverá a tratarse como pendiente."
      )
    ) {
      return false;
    }

    setIsUpdatingStatus(true);

    const { error } = await supabase
      .rpc("update_inquiry_status", {
        p_inquiry_id: inquiry.id,
        p_next_status: newStatus,
      })
      .single();

    setIsUpdatingStatus(false);

    if (error) {
      setStatusErrorMessage(
        `No se pudo actualizar el estado: ${
          error.message || "sin detalle del error"
        }`
      );
      return false;
    }

    setInquiry({
      ...inquiry,
      status: newStatus,
    });

    setRawInquiry({
      ...rawInquiry,
      status: newStatus,
    });

    if (newStatus === "pending") {
      setStatusMessage("Caso reabierto correctamente.");
      return true;
    }

    if (newStatus === "waiting_customer") {
      setStatusMessage(
        "Caso marcado como esperando al cliente."
      );
      return true;
    }

    if (newStatus === "replied") {
      setStatusMessage(
        "Respuesta registrada y caso marcado como respondido."
      );
      return true;
    }

    if (newStatus === "closed") {
      setStatusMessage("Caso cerrado correctamente.");
      return true;
    }

    if (newStatus === "discarded") {
      setStatusMessage("Caso descartado correctamente.");
      return true;
    }

    setStatusMessage("Estado actualizado correctamente.");
    return true;
  };

  const handleMarkAsRepliedWithResponse = async (
    responseText: string,
    requestId?: string
  ): Promise<boolean> => {
    setStatusMessage("");
    setStatusErrorMessage("");

    if (!rawInquiry || !inquiry) {
      setStatusErrorMessage(
        "No se puede registrar la respuesta porque no hay caso cargado."
      );
      return false;
    }

    const cleanResponseText = responseText.trim();

    if (!cleanResponseText) {
      setStatusErrorMessage("La respuesta no puede quedar vacía.");
      return false;
    }

    if (rawInquiry.source_channel === "Chat web") {
      if (!requestId) {
        setStatusErrorMessage(
          "No se pudo generar el identificador de la respuesta del chat."
        );
        return false;
      }

      setIsUpdatingStatus(true);

      const { data, error } = await supabase
        .rpc("send_public_chat_response", {
          p_inquiry_id: rawInquiry.id,
          p_body: cleanResponseText,
          p_next_status: "replied",
          p_client_request_id: requestId,
        })
        .single<InquiryMessageRow>();

      setIsUpdatingStatus(false);

      if (error || !data) {
        setStatusErrorMessage(
          `No se pudo publicar la respuesta en el chat: ${
            error?.message || "sin detalle del error"
          }`
        );
        return false;
      }

      setInquiryMessages((currentMessages) =>
        currentMessages.some((message) => message.id === data.id)
          ? currentMessages
          : [...currentMessages, data]
      );
      setInquiry({ ...inquiry, status: "replied" });
      setRawInquiry({ ...rawInquiry, status: "replied" });
      return true;
    }

    const existingResponseMessage = inquiryMessages.find((message) => {
      return (
        message.direction === "outbound" &&
        message.author_type === "company" &&
        message.body.trim() === cleanResponseText
      );
    });

    let createdResponseMessage: InquiryMessageRow | null = null;

    if (!existingResponseMessage) {
      const { data, error } = await supabase
        .from("inquiry_messages")
        .insert({
          company_id: rawInquiry.company_id,
          inquiry_id: rawInquiry.id,
          customer_id: rawInquiry.customer_id,
          direction: "outbound",
          author_type: "company",
          body: cleanResponseText,
          source_channel: rawInquiry.source_channel,
        })
        .select(
          "id, direction, author_type, body, source_channel, created_by, created_at"
        )
        .single<InquiryMessageRow>();

      if (error || !data) {
        setStatusErrorMessage(
          `No se pudo guardar la respuesta en el historial del caso: ${
            error?.message || "sin detalle del error"
          }`
        );
        return false;
      }

      createdResponseMessage = data;

      const { error: auditLogError } = await supabase.rpc("create_audit_log", {
        target_company_id: rawInquiry.company_id,
        audit_action: "create_inquiry_message",
        audit_entity_type: "inquiry_message",
        audit_entity_id: data.id,
        audit_metadata: {
          inquiry_id: rawInquiry.id,
          customer_id: rawInquiry.customer_id,
          direction: "outbound",
          author_type: "company",
          source_channel: rawInquiry.source_channel,
          body_length: cleanResponseText.length,
          response_flow: "mark_as_replied",
          source: "inquiry_detail",
        },
      });

      if (auditLogError) {
        console.error(
          "Inquiry response message created, but could not create audit log:",
          auditLogError
        );
      }
    }

    const wasMarkedAsReplied = await handleUpdateStatus("replied");

    if (createdResponseMessage) {
      setInquiryMessages((currentMessages) => [
        ...currentMessages,
        createdResponseMessage,
      ]);
    }

    return wasMarkedAsReplied;
  };

  const handleMarkAsWaitingCustomerWithResponse = async (
    responseText: string,
    requestId?: string
  ): Promise<boolean> => {
    setStatusMessage("");
    setStatusErrorMessage("");

    if (!rawInquiry || !inquiry) {
      setStatusErrorMessage(
        "No se puede registrar la respuesta porque no hay caso cargado."
      );
      return false;
    }

    const cleanResponseText = responseText.trim();

    if (!cleanResponseText) {
      setStatusErrorMessage("La respuesta no puede quedar vacía.");
      return false;
    }

    if (rawInquiry.source_channel === "Chat web") {
      if (!requestId) {
        setStatusErrorMessage(
          "No se pudo generar el identificador de la respuesta del chat."
        );
        return false;
      }

      setIsUpdatingStatus(true);

      const { data, error } = await supabase
        .rpc("send_public_chat_response", {
          p_inquiry_id: rawInquiry.id,
          p_body: cleanResponseText,
          p_next_status: "waiting_customer",
          p_client_request_id: requestId,
        })
        .single<InquiryMessageRow>();

      setIsUpdatingStatus(false);

      if (error || !data) {
        setStatusErrorMessage(
          `No se pudo publicar la respuesta en el chat: ${
            error?.message || "sin detalle del error"
          }`
        );
        return false;
      }

      setInquiryMessages((currentMessages) =>
        currentMessages.some((message) => message.id === data.id)
          ? currentMessages
          : [...currentMessages, data]
      );
      setInquiry({ ...inquiry, status: "waiting_customer" });
      setRawInquiry({ ...rawInquiry, status: "waiting_customer" });
      return true;
    }

    const existingResponseMessage = inquiryMessages.find((message) => {
      return (
        message.direction === "outbound" &&
        message.author_type === "company" &&
        message.body.trim() === cleanResponseText
      );
    });

    let createdResponseMessage: InquiryMessageRow | null = null;

    if (!existingResponseMessage) {
      const { data, error } = await supabase
        .from("inquiry_messages")
        .insert({
          company_id: rawInquiry.company_id,
          inquiry_id: rawInquiry.id,
          customer_id: rawInquiry.customer_id,
          direction: "outbound",
          author_type: "company",
          body: cleanResponseText,
          source_channel: rawInquiry.source_channel,
        })
        .select(
          "id, direction, author_type, body, source_channel, created_by, created_at"
        )
        .single<InquiryMessageRow>();

      if (error || !data) {
        setStatusErrorMessage(
          `No se pudo guardar la respuesta en el historial del caso: ${
            error?.message || "sin detalle del error"
          }`
        );
        return false;
      }

      createdResponseMessage = data;

      const { error: auditLogError } = await supabase.rpc("create_audit_log", {
        target_company_id: rawInquiry.company_id,
        audit_action: "create_inquiry_message",
        audit_entity_type: "inquiry_message",
        audit_entity_id: data.id,
        audit_metadata: {
          inquiry_id: rawInquiry.id,
          customer_id: rawInquiry.customer_id,
          direction: "outbound",
          author_type: "company",
          source_channel: rawInquiry.source_channel,
          body_length: cleanResponseText.length,
          response_flow: "mark_as_waiting_customer",
          source: "inquiry_detail",
        },
      });

      if (auditLogError) {
        console.error(
          "Inquiry response message created, but could not create audit log:",
          auditLogError
        );
      }
    }

    const wasMarkedAsWaitingCustomer = await handleUpdateStatus(
      "waiting_customer"
    );

    if (createdResponseMessage) {
      setInquiryMessages((currentMessages) => [
        ...currentMessages,
        createdResponseMessage,
      ]);
    }

    return wasMarkedAsWaitingCustomer;
  };

  const handleSendEmailResponse = async (
    responseText: string,
    nextStatus: SendCaseResponseNextStatus,
    requestId: string
  ): Promise<boolean> => {
    setStatusMessage("");
    setStatusErrorMessage("");

    if (!inquiry) {
      setStatusErrorMessage(
        "No se puede enviar la respuesta porque no hay caso cargado."
      );
      return false;
    }

    const cleanResponseText = responseText.trim();

    if (!cleanResponseText) {
      setStatusErrorMessage("La respuesta no puede quedar vacía.");
      return false;
    }

    setIsUpdatingStatus(true);

    let sendResponse: Response;

    try {
      sendResponse = await fetch("/api/inquiries/send-email-response", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inquiryId: inquiry.id,
          responseText: cleanResponseText,
          nextStatus,
          requestId,
        }),
      });
    } catch {
      setIsUpdatingStatus(false);
      setStatusErrorMessage(
        "No se pudo conectar con el servicio de envío de email. Inténtalo de nuevo en unos segundos."
      );
      return false;
    }

    let payload: SendEmailResponseApiResponse | null = null;

    try {
      payload = (await sendResponse.json()) as SendEmailResponseApiResponse;
    } catch {
      payload = null;
    }

    setIsUpdatingStatus(false);

    if (!sendResponse.ok || !payload?.ok) {
      setStatusErrorMessage(
        payload?.error ||
          "No se pudo enviar el email desde COPPE. Revisa el canal de email de la empresa."
      );
      return false;
    }

    if (payload.inquiryMessage) {
      setInquiryMessages((currentMessages) => {
        const alreadyExists = currentMessages.some(
          (message) => message.id === payload?.inquiryMessage?.id
        );

        if (alreadyExists || !payload?.inquiryMessage) {
          return currentMessages;
        }

        return [...currentMessages, payload.inquiryMessage];
      });

      setSentEmailMessageIds((currentIds) => {
        const sentEmailMessageId = payload?.inquiryMessage?.id;

        if (!sentEmailMessageId || currentIds.includes(sentEmailMessageId)) {
          return currentIds;
        }

        return [...currentIds, sentEmailMessageId];
      });

      setSentEmailResponseBodies((currentBodies) => {
        if (currentBodies.includes(cleanResponseText)) {
          return currentBodies;
        }

        return [...currentBodies, cleanResponseText];
      });
    }

    setInquiry({
      ...inquiry,
      status: nextStatus,
      suggestedResponse: cleanResponseText,
    });

    setRawInquiry((currentRawInquiry) =>
      currentRawInquiry
        ? {
            ...currentRawInquiry,
            status: nextStatus,
            suggested_response: cleanResponseText,
          }
        : currentRawInquiry
    );

    const successMessage =
      nextStatus === "waiting_customer"
        ? "Email enviado y caso marcado como esperando al cliente."
        : "Email enviado y caso marcado como respondido.";

    setStatusMessage(
      payload.warning ? `${successMessage} ${payload.warning}` : successMessage
    );

    return true;
  };

  const handleSendWhatsAppResponse = async (
    responseText: string,
    nextStatus: SendCaseResponseNextStatus,
    requestId: string
  ): Promise<boolean> => {
    setStatusMessage("");
    setStatusErrorMessage("");

    if (!inquiry) {
      setStatusErrorMessage(
        "No se puede enviar la respuesta porque no hay caso cargado."
      );
      return false;
    }

    const cleanResponseText = responseText.trim();

    if (!cleanResponseText) {
      setStatusErrorMessage("La respuesta no puede quedar vacía.");
      return false;
    }

    setIsUpdatingStatus(true);

    let sendResponse: Response;

    try {
      sendResponse = await fetch("/api/inquiries/send-whatsapp-response", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inquiryId: inquiry.id,
          responseText: cleanResponseText,
          nextStatus,
          requestId,
        }),
      });
    } catch {
      setIsUpdatingStatus(false);
      setStatusErrorMessage(
        "No se pudo conectar con el servicio de envío de WhatsApp. Inténtalo de nuevo en unos segundos."
      );
      return false;
    }

    let payload: SendWhatsAppResponseApiResponse | null = null;

    try {
      payload = (await sendResponse.json()) as SendWhatsAppResponseApiResponse;
    } catch {
      payload = null;
    }

    setIsUpdatingStatus(false);

    if (!sendResponse.ok || !payload?.ok) {
      setStatusErrorMessage(
        payload?.error ||
          "No se pudo enviar el WhatsApp desde COPPE. Revisa el canal de WhatsApp de la empresa."
      );
      return false;
    }

    if (payload.inquiryMessage) {
      setInquiryMessages((currentMessages) => {
        const alreadyExists = currentMessages.some(
          (message) => message.id === payload?.inquiryMessage?.id
        );

        if (alreadyExists || !payload?.inquiryMessage) {
          return currentMessages;
        }

        return [...currentMessages, payload.inquiryMessage];
      });

      setSentWhatsAppMessageIds((currentIds) => {
        const sentWhatsAppMessageId = payload?.inquiryMessage?.id;

        if (!sentWhatsAppMessageId || currentIds.includes(sentWhatsAppMessageId)) {
          return currentIds;
        }

        return [...currentIds, sentWhatsAppMessageId];
      });

      setSentWhatsAppResponseBodies((currentBodies) => {
        if (currentBodies.includes(cleanResponseText)) {
          return currentBodies;
        }

        return [...currentBodies, cleanResponseText];
      });
    }

    setInquiry({
      ...inquiry,
      status: nextStatus,
      suggestedResponse: cleanResponseText,
    });

    setRawInquiry((currentRawInquiry) =>
      currentRawInquiry
        ? {
            ...currentRawInquiry,
            status: nextStatus,
            suggested_response: cleanResponseText,
          }
        : currentRawInquiry
    );

    const successMessage =
      nextStatus === "waiting_customer"
        ? "WhatsApp enviado y caso marcado como esperando al cliente."
        : "WhatsApp enviado y caso marcado como respondido.";

    setStatusMessage(
      payload.warning ? `${successMessage} ${payload.warning}` : successMessage
    );

    return true;
  };

  const handleSaveNote = async () => {
    setNoteMessage("");
    setNoteErrorMessage("");

    if (!rawInquiry) {
      setNoteErrorMessage(
        "No se puede guardar la nota porque no hay caso cargado."
      );
      return;
    }

    const cleanNote = note.trim();

    if (!cleanNote) {
      setNoteErrorMessage("Escribe una nota antes de guardarla.");
      return;
    }

    setIsSavingNote(true);

    const { data, error } = await supabase
      .from("internal_notes")
      .insert({
        company_id: rawInquiry.company_id,
        customer_id: rawInquiry.customer_id,
        inquiry_id: rawInquiry.id,
        body: cleanNote,
      })
      .select("id, body, created_by, created_at")
      .single<InternalNoteRow>();

    setIsSavingNote(false);

    if (error) {
      setNoteErrorMessage(
        `No se pudo guardar la nota: ${
          error.message || "sin detalle del error"
        }`
      );
      return;
    }

    let auditWarningMessage = "";

    const { error: auditLogError } = await supabase.rpc("create_audit_log", {
      target_company_id: rawInquiry.company_id,
      audit_action: "create_internal_note",
      audit_entity_type: "internal_note",
      audit_entity_id: data.id,
      audit_metadata: {
        inquiry_id: rawInquiry.id,
        customer_id: rawInquiry.customer_id,
        body_length: cleanNote.length,
        source: "inquiry_detail",
      },
    });

    if (auditLogError) {
      console.error(
        "Internal note created, but could not create audit log:",
        auditLogError
      );

      auditWarningMessage =
        " Advertencia: no se pudo registrar la auditoría de la nota.";
    }

    setNotes((currentNotes) => [data, ...currentNotes]);
    setNote("");
    setNoteMessage(`Nota interna guardada correctamente.${auditWarningMessage}`);
  };

  const handleReanalyzeInquiry = async () => {
    setReanalysisMessage("");
    setReanalysisErrorMessage("");

    if (!rawInquiry || !inquiry) {
      setReanalysisErrorMessage(
        "No se puede reanalizar porque no hay caso cargado."
      );
      return;
    }

    const cleanAdditionalInfo = additionalCustomerInfo.trim();

    if (!cleanAdditionalInfo) {
      setReanalysisErrorMessage(
        "Pega el nuevo mensaje recibido del cliente antes de reanalizar."
      );
      return;
    }

    const cleanAdditionalSourceChannel = normalizeSourceChannelValue(
      additionalCustomerSourceChannel || rawInquiry.source_channel
    );

    const updatedCaseContext = buildInquiryContextFromMessages(
      inquiryMessages,
      inquiry.originalMessage,
      cleanAdditionalInfo
    );

    if (updatedCaseContext.length > MAX_ANALYSIS_MESSAGE_LENGTH) {
      setReanalysisErrorMessage(
        `El contexto completo del caso no puede superar los ${MAX_ANALYSIS_MESSAGE_LENGTH} caracteres. Resume la información adicional antes de reanalizar.`
      );
      return;
    }

    setIsReanalyzingInquiry(true);

    const {
      analysis,
      errorMessage: analysisErrorMessage,
    } = await requestInquiryAnalysis(inquiry.customerName, updatedCaseContext);

    if (!analysis) {
      setIsReanalyzingInquiry(false);
      setReanalysisErrorMessage(analysisErrorMessage);
      return;
    }

    const { data: createdMessage, error: createMessageError } = await supabase
      .from("inquiry_messages")
      .insert({
        company_id: rawInquiry.company_id,
        inquiry_id: rawInquiry.id,
        customer_id: rawInquiry.customer_id,
        direction: "inbound",
        author_type: "customer",
        body: cleanAdditionalInfo,
        source_channel: cleanAdditionalSourceChannel,
      })
      .select(
        "id, direction, author_type, body, source_channel, created_by, created_at"
      )
      .single<InquiryMessageRow>();

    if (createMessageError || !createdMessage) {
      setIsReanalyzingInquiry(false);
      setReanalysisErrorMessage(
        `No se pudo guardar el nuevo mensaje del cliente: ${
          createMessageError?.message || "sin detalle del error"
        }`
      );
      return;
    }

    let messageAuditWarningMessage = "";

    const { error: messageAuditLogError } = await supabase.rpc(
      "create_audit_log",
      {
        target_company_id: rawInquiry.company_id,
        audit_action: "create_inquiry_message",
        audit_entity_type: "inquiry_message",
        audit_entity_id: createdMessage.id,
        audit_metadata: {
          inquiry_id: rawInquiry.id,
          customer_id: rawInquiry.customer_id,
          direction: "inbound",
          author_type: "customer",
          source_channel: cleanAdditionalSourceChannel,
          body_length: cleanAdditionalInfo.length,
          reanalysis_requested: true,
          source: "inquiry_detail",
        },
      }
    );

    if (messageAuditLogError) {
      console.error(
        "Customer message created, but could not create audit log:",
        messageAuditLogError
      );

      messageAuditWarningMessage =
        " Advertencia: no se pudo registrar la auditoría del nuevo mensaje.";
    }

    const currentStatus = normalizeInquiryStatus(inquiry.status);

    const nextStatus =
      currentStatus === "new" || currentStatus === "pending"
        ? currentStatus
        : "pending";

    const { data: updatedInquiry, error } = await supabase
      .from("inquiries")
      .update({
        subject: analysis.subject,
        ai_summary: analysis.summary,
        ai_intent: analysis.intent,
        ai_category: analysis.category,
        ai_priority: analysis.priority,
        ai_language: analysis.language,
        sentiment: analysis.sentiment,
        missing_information: analysis.missingInformation,
        recommended_action: analysis.recommendedAction,
        suggested_response: analysis.suggestedResponse,
        status: nextStatus,
      })
      .eq("id", rawInquiry.id)
      .select(
        [
          "id",
          "company_id",
          "customer_id",
          "customer_name",
          "source_channel",
          "subject",
          "original_message",
          "ai_summary",
          "ai_intent",
          "ai_category",
          "ai_priority",
          "ai_language",
          "sentiment",
          "missing_information",
          "recommended_action",
          "suggested_response",
          "status",
          "created_at",
        ].join(", ")
      )
      .single<InquiryDetailRow>();

    setIsReanalyzingInquiry(false);

    if (error || !updatedInquiry) {
      setReanalysisErrorMessage(
        `No se pudo guardar el nuevo análisis: ${
          error?.message || "sin detalle del error"
        }`
      );
      return;
    }

    let reanalysisAuditWarningMessage = messageAuditWarningMessage;

    const { error: reanalysisAuditLogError } = await supabase.rpc(
      "create_audit_log",
      {
        target_company_id: rawInquiry.company_id,
        audit_action: "reanalyze_inquiry",
        audit_entity_type: "inquiry",
        audit_entity_id: rawInquiry.id,
        audit_metadata: {
          inquiry_id: rawInquiry.id,
          customer_id: rawInquiry.customer_id,
          inquiry_message_id: createdMessage.id,
          previous_status: currentStatus,
          next_status: normalizeInquiryStatus(updatedInquiry.status),
          previous_ai_category: rawInquiry.ai_category,
          next_ai_category: updatedInquiry.ai_category,
          previous_ai_priority: rawInquiry.ai_priority,
          next_ai_priority: updatedInquiry.ai_priority,
          previous_subject_length: (rawInquiry.subject ?? "").length,
          next_subject_length: (updatedInquiry.subject ?? "").length,
          additional_message_length: cleanAdditionalInfo.length,
          source_channel: cleanAdditionalSourceChannel,
          source: "inquiry_detail",
        },
      }
    );

    if (reanalysisAuditLogError) {
      console.error(
        "Inquiry reanalyzed, but could not create audit log:",
        reanalysisAuditLogError
      );

      reanalysisAuditWarningMessage +=
        " Advertencia: no se pudo registrar la auditoría del reanálisis.";
    }

    setRawInquiry(updatedInquiry);
    setInquiry(mapInquiryRowToInquiry(updatedInquiry));
    setInquiryMessages((currentMessages) => [
      ...currentMessages,
      createdMessage,
    ]);
    setAdditionalCustomerInfo("");
    setAdditionalCustomerSourceChannel("");
    setReanalysisMessage(
      `Caso reanalizado correctamente con el nuevo mensaje del cliente.${reanalysisAuditWarningMessage}`
    );
  };

  const handleAppointmentAvailabilityDateChange = (nextDate: string) => {
    setAppointmentAvailabilityDate(nextDate);
    setAppointmentErrorMessage("");

    if (
      appointmentScheduledAt &&
      appointmentScheduledAt.slice(0, 10) !== nextDate
    ) {
      setAppointmentScheduledAt("");
    }
  };

  const handleSelectAvailableAppointmentSlot = (startsAtMs: number) => {
    setAppointmentScheduledAt(
      formatDateTimeLocalFromIso(new Date(startsAtMs).toISOString())
    );
    setAppointmentErrorMessage("");
  };

  const handleCreateAppointment = async () => {
    setAppointmentCreateMessage("");
    setAppointmentActionMessage("");
    setAppointmentErrorMessage("");

    if (!rawInquiry || !inquiry) {
      setAppointmentErrorMessage(
        "No se puede crear la cita porque no hay caso cargado."
      );
      return;
    }

    const cleanAppointmentTitle = appointmentTitle.trim();

    if (!cleanAppointmentTitle) {
      setAppointmentErrorMessage("El título de la cita es obligatorio.");
      return;
    }

    if (!appointmentScheduledAt) {
      setAppointmentErrorMessage("La fecha y hora de la cita son obligatorias.");
      return;
    }

    if (!appointmentAssignedTo) {
      setAppointmentErrorMessage(
        "Selecciona a la persona responsable de atender la cita."
      );
      return;
    }

    const scheduledDate = new Date(appointmentScheduledAt);

    if (Number.isNaN(scheduledDate.getTime())) {
      setAppointmentErrorMessage("La fecha indicada no es válida.");
      return;
    }

    if (scheduledDate.getTime() < Date.now() - 60 * 1000) {
      setAppointmentErrorMessage(
        "No puedes crear una cita en una fecha pasada."
      );
      return;
    }

    setIsCreatingAppointment(true);

    const scheduledAtIso = scheduledDate.toISOString();
    const { data: conflicts, error: availabilityError } = await supabase.rpc(
      "check_appointment_availability",
      {
        p_company_id: rawInquiry.company_id,
        p_scheduled_at: scheduledAtIso,
        p_duration_minutes: appointmentDurationMinutes,
        p_assigned_to: appointmentAssignedTo,
        p_buffer_before_minutes: 0,
        p_buffer_after_minutes: 0,
        p_exclude_appointment_id: null,
      }
    );

    if (availabilityError) {
      setIsCreatingAppointment(false);
      setAppointmentErrorMessage(
        `No se pudo comprobar la disponibilidad: ${
          availabilityError.message || "sin detalle del error"
        }`
      );
      return;
    }

    if (Array.isArray(conflicts) && conflicts.length > 0) {
      setIsCreatingAppointment(false);
      setAppointmentErrorMessage(
        "Ese profesional ya tiene una cita o un tiempo protegido en ese intervalo. Elige uno de los huecos libres u otro responsable."
      );
      setAppointmentAvailabilityVersion((current) => current + 1);
      return;
    }

    const { data, error } = await supabase
      .from("appointments")
      .insert({
        company_id: rawInquiry.company_id,
        inquiry_id: rawInquiry.id,
        customer_id: rawInquiry.customer_id,
        assigned_to: appointmentAssignedTo,
        title: cleanAppointmentTitle,
        scheduled_at: scheduledAtIso,
        duration_minutes: appointmentDurationMinutes,
        timezone: appointmentTimeZone,
        buffer_before_minutes: 0,
        buffer_after_minutes: 0,
        status: "proposed",
        notes: appointmentNotes.trim() || null,
      })
      .select(
        [
          "id",
          "inquiry_id",
          "customer_id",
          "assigned_to",
          "title",
          "scheduled_at",
          "duration_minutes",
          "timezone",
          "location",
          "buffer_before_minutes",
          "buffer_after_minutes",
          "status",
          "notes",
          "created_at",
          "updated_at",
        ].join(", ")
      )
      .single<AppointmentRow>();

    setIsCreatingAppointment(false);

    if (error || !data) {
      const conflictMessage = getAppointmentConflictMessage(error);

      if (conflictMessage) {
        setAppointmentAvailabilityVersion((current) => current + 1);
      }

      setAppointmentErrorMessage(
        conflictMessage ||
          `No se pudo crear la cita: ${
            error?.message || "sin detalle del error"
          }`
      );
      return;
    }

    const mappedAppointment = mapAppointmentRowToAppointment(data);

    setAppointments((currentAppointments) =>
      [...currentAppointments, mappedAppointment].sort(
        compareAppointmentsByScheduledAt
      )
    );

    let auditWarningMessage = "";

    const { error: auditLogError } = await supabase.rpc("create_audit_log", {
      target_company_id: rawInquiry.company_id,
      audit_action: "create_appointment",
      audit_entity_type: "appointment",
      audit_entity_id: data.id,
      audit_metadata: {
        inquiry_id: rawInquiry.id,
        customer_id: rawInquiry.customer_id,
        scheduled_at: data.scheduled_at,
        assigned_to: data.assigned_to,
        duration_minutes: data.duration_minutes,
        next_status: mappedAppointment.status,
        title_length: cleanAppointmentTitle.length,
        notes_length: (appointmentNotes.trim() || "").length,
        source: "inquiry_detail",
      },
    });

    if (auditLogError) {
      console.error(
        "Appointment created, but could not create audit log:",
        auditLogError
      );

      auditWarningMessage =
        " Advertencia: no se pudo registrar la auditoría de la cita.";
    }

    setAppointmentTitle(getDefaultAppointmentTitle(inquiry.customerName));
    setAppointmentScheduledAt("");
    setAppointmentNotes("");
    setAppointmentAvailabilityVersion((current) => current + 1);
    setAppointmentCreateMessage(
      `Cita creada como pendiente de confirmar.${auditWarningMessage}`
    );
  };

  const handleUpdateAppointmentStatus = async (
    appointmentId: string,
    status: AppointmentStatus
  ) => {
    setAppointmentCreateMessage("");
    setAppointmentActionMessage("");
    setAppointmentErrorMessage("");

    if (!rawInquiry) {
      setAppointmentErrorMessage(
        "No se puede actualizar la cita porque no hay caso cargado."
      );
      return;
    }

    const currentAppointment = appointments.find(
      (appointment) => appointment.id === appointmentId
    );

    if (!currentAppointment) {
      setAppointmentErrorMessage(
        "No se puede actualizar la cita porque no se encontró en pantalla."
      );
      return;
    }

    const previousStatus = currentAppointment.status;

    setUpdatingAppointmentId(appointmentId);

    const { data, error } = await supabase
      .from("appointments")
      .update({ status })
      .eq("id", appointmentId)
      .select(
        [
          "id",
          "inquiry_id",
          "customer_id",
          "assigned_to",
          "title",
          "scheduled_at",
          "duration_minutes",
          "timezone",
          "location",
          "buffer_before_minutes",
          "buffer_after_minutes",
          "status",
          "notes",
          "created_at",
          "updated_at",
        ].join(", ")
      )
      .single<AppointmentRow>();

    setUpdatingAppointmentId(null);

    if (error || !data) {
      const conflictMessage = getAppointmentConflictMessage(error);

      setAppointmentErrorMessage(
        conflictMessage ||
          `No se pudo actualizar la cita: ${
            error?.message || "sin detalle del error"
          }`
      );
      return;
    }

    const mappedAppointment = mapAppointmentRowToAppointment(data);

    let auditWarningMessage = "";

    if (previousStatus !== mappedAppointment.status) {
      const { error: auditLogError } = await supabase.rpc("create_audit_log", {
        target_company_id: rawInquiry.company_id,
        audit_action: getAppointmentStatusAuditAction(
          previousStatus,
          mappedAppointment.status
        ),
        audit_entity_type: "appointment",
        audit_entity_id: appointmentId,
        audit_metadata: {
          inquiry_id: rawInquiry.id,
          customer_id: rawInquiry.customer_id,
          scheduled_at: data.scheduled_at,
          previous_status: previousStatus,
          next_status: mappedAppointment.status,
          source: "inquiry_detail",
        },
      });

      if (auditLogError) {
        console.error(
          "Appointment status updated, but could not create audit log:",
          auditLogError
        );

        auditWarningMessage =
          " Advertencia: no se pudo registrar la auditoría de la cita.";
      }
    }

    setAppointments((currentAppointments) =>
      currentAppointments
        .map((appointment) =>
          appointment.id === appointmentId ? mappedAppointment : appointment
        )
        .sort(compareAppointmentsByScheduledAt)
    );
    setAppointmentAvailabilityVersion((current) => current + 1);

    setAppointmentActionMessage(
      `Estado de la cita actualizado.${auditWarningMessage}`
    );
  };

  const handleOpenEditAppointmentForm = (appointment: Appointment) => {
    setAppointmentCreateMessage("");
    setAppointmentActionMessage("");
    setAppointmentErrorMessage("");
    setEditingAppointmentId(appointment.id);
    setEditAppointmentTitle(appointment.title);
    setEditAppointmentScheduledAt(
      formatDateTimeLocalFromIso(appointment.scheduledAtIso)
    );
    setEditAppointmentNotes(appointment.notes);
  };

  const handleCancelEditAppointment = () => {
    setEditingAppointmentId(null);
    setEditAppointmentTitle("");
    setEditAppointmentScheduledAt("");
    setEditAppointmentNotes("");
    setAppointmentErrorMessage("");
  };

  const handleSaveAppointmentEdit = async () => {
    setAppointmentCreateMessage("");
    setAppointmentActionMessage("");
    setAppointmentErrorMessage("");

    if (!rawInquiry) {
      setAppointmentErrorMessage(
        "No se puede editar la cita porque no hay caso cargado."
      );
      return;
    }

    const editingAppointment = appointments.find(
      (appointment) => appointment.id === editingAppointmentId
    );

    if (!editingAppointment) {
      setAppointmentErrorMessage(
        "No se puede editar la cita porque no se encontró en pantalla."
      );
      return;
    }

    const cleanEditAppointmentTitle = editAppointmentTitle.trim();

    if (!cleanEditAppointmentTitle) {
      setAppointmentErrorMessage("El título de la cita es obligatorio.");
      return;
    }

    if (!editAppointmentScheduledAt) {
      setAppointmentErrorMessage(
        "La fecha y hora de la cita son obligatorias."
      );
      return;
    }

    const scheduledDate = new Date(editAppointmentScheduledAt);

    if (Number.isNaN(scheduledDate.getTime())) {
      setAppointmentErrorMessage("La fecha indicada no es válida.");
      return;
    }

    if (scheduledDate.getTime() < Date.now() - 60 * 1000) {
      setAppointmentErrorMessage(
        "No puedes guardar una cita en una fecha pasada."
      );
      return;
    }

    setIsSavingAppointmentEdit(true);

    const { data, error } = await supabase
      .from("appointments")
      .update({
        title: cleanEditAppointmentTitle,
        scheduled_at: scheduledDate.toISOString(),
        notes: editAppointmentNotes.trim() || null,
      })
      .eq("id", editingAppointment.id)
      .select(
        [
          "id",
          "inquiry_id",
          "customer_id",
          "assigned_to",
          "title",
          "scheduled_at",
          "duration_minutes",
          "timezone",
          "location",
          "buffer_before_minutes",
          "buffer_after_minutes",
          "status",
          "notes",
          "created_at",
          "updated_at",
        ].join(", ")
      )
      .single<AppointmentRow>();

    setIsSavingAppointmentEdit(false);

    if (error || !data) {
      const conflictMessage = getAppointmentConflictMessage(error);

      setAppointmentErrorMessage(
        conflictMessage ||
          `No se pudo actualizar la cita: ${
            error?.message || "sin detalle del error"
          }`
      );
      return;
    }

    const mappedAppointment = mapAppointmentRowToAppointment(data);
    const changedFields: string[] = [];

    if (editingAppointment.title !== mappedAppointment.title) {
      changedFields.push("title");
    }

    if (editingAppointment.scheduledAtIso !== mappedAppointment.scheduledAtIso) {
      changedFields.push("scheduled_at");
    }

    if (editingAppointment.notes !== mappedAppointment.notes) {
      changedFields.push("notes");
    }

    let auditWarningMessage = "";

    const { error: auditLogError } = await supabase.rpc("create_audit_log", {
      target_company_id: rawInquiry.company_id,
      audit_action: "update_appointment",
      audit_entity_type: "appointment",
      audit_entity_id: editingAppointment.id,
      audit_metadata: {
        inquiry_id: rawInquiry.id,
        customer_id: rawInquiry.customer_id,
        scheduled_at: data.scheduled_at,
        previous_status: editingAppointment.status,
        next_status: mappedAppointment.status,
        changed_fields: changedFields,
        title_length: cleanEditAppointmentTitle.length,
        notes_changed: editingAppointment.notes !== mappedAppointment.notes,
        notes_length: (editAppointmentNotes.trim() || "").length,
        source: "inquiry_detail",
      },
    });

    if (auditLogError) {
      console.error(
        "Appointment updated, but could not create audit log:",
        auditLogError
      );

      auditWarningMessage =
        " Advertencia: no se pudo registrar la auditoría de la cita.";
    }

    setAppointments((currentAppointments) =>
      currentAppointments
        .map((appointment) =>
          appointment.id === editingAppointment.id
            ? mappedAppointment
            : appointment
        )
        .sort(compareAppointmentsByScheduledAt)
    );
    setAppointmentAvailabilityVersion((current) => current + 1);

    setEditingAppointmentId(null);
    setEditAppointmentTitle("");
    setEditAppointmentScheduledAt("");
    setEditAppointmentNotes("");
    setAppointmentActionMessage(
      `Cita actualizada correctamente.${auditWarningMessage}`
    );
  };

  const handleCreateFollowUp = async () => {
    setFollowUpCreateMessage("");
    setFollowUpCreateErrorMessage("");

    if (!rawInquiry || !inquiry) {
      setFollowUpCreateErrorMessage(
        "No se puede crear el seguimiento porque no hay caso cargado."
      );
      return;
    }

    const currentStatus = normalizeInquiryStatus(inquiry.status);

    if (
      currentStatus !== "new" &&
      currentStatus !== "pending" &&
      currentStatus !== "waiting_customer"
    ) {
      setFollowUpCreateErrorMessage(
        "No se puede crear un seguimiento sobre un caso finalizado. Reabre el caso primero."
      );
      return;
    }

    const cleanFollowUpTitle = followUpTitle.trim();

    if (!cleanFollowUpTitle) {
      setFollowUpCreateErrorMessage("El título del seguimiento es obligatorio.");
      return;
    }

    if (!followUpDueAt) {
      setFollowUpCreateErrorMessage(
        "La fecha y hora del seguimiento son obligatorias."
      );
      return;
    }

    const dueDate = new Date(followUpDueAt);

    if (Number.isNaN(dueDate.getTime())) {
      setFollowUpCreateErrorMessage("La fecha indicada no es válida.");
      return;
    }

    const dueAt = dueDate.toISOString();

    const currentPendingFollowUps = followUps.filter(
      (followUp) => followUp.status === "pending"
    );

    if (
      currentPendingFollowUps.length > 0 &&
      !window.confirm(
        currentPendingFollowUps.length === 1
          ? "Este caso ya tiene un seguimiento pendiente. ¿Quieres crear otro seguimiento de todos modos?"
          : `Este caso ya tiene ${currentPendingFollowUps.length} seguimientos pendientes. ¿Quieres crear otro seguimiento de todos modos?`
      )
    ) {
      return;
    }

    setIsCreatingFollowUp(true);

    const { data, error } = await supabase
      .from("follow_ups")
      .insert({
        company_id: rawInquiry.company_id,
        customer_id: rawInquiry.customer_id,
        inquiry_id: rawInquiry.id,
        title: cleanFollowUpTitle,
        due_at: dueAt,
        status: "pending",
        urgency: resolveFollowUpUrgency(dueAt, "pending", null),
      })
      .select(
        [
          "id",
          "title",
          "due_at",
          "status",
          "urgency",
          "inquiry_id",
          "created_at",
          "customer:customers(name)",
        ].join(", ")
      )
      .single<FollowUpRow>();

    setIsCreatingFollowUp(false);

    if (error || !data) {
      setFollowUpCreateErrorMessage(
        `No se pudo crear el seguimiento: ${
          error?.message || "sin detalle del error"
        }`
      );
      return;
    }

    let auditWarningMessage = "";

    const { error: auditLogError } = await supabase.rpc("create_audit_log", {
      target_company_id: rawInquiry.company_id,
      audit_action: "create_follow_up",
      audit_entity_type: "follow_up",
      audit_entity_id: data.id,
      audit_metadata: {
        inquiry_id: rawInquiry.id,
        customer_id: rawInquiry.customer_id,
        status: "pending",
        due_at: dueAt,
        title_length: cleanFollowUpTitle.length,
        source: "inquiry_detail",
      },
    });

    if (auditLogError) {
      console.error(
        "Follow-up created, but could not create audit log:",
        auditLogError
      );

      auditWarningMessage =
        " Advertencia: no se pudo registrar la auditoría del seguimiento.";
    }

    setFollowUps((currentFollowUps) => [
      mapFollowUpRowToFollowUp(data),
      ...currentFollowUps,
    ]);

    setFollowUpTitle(getDefaultFollowUpTitle(inquiry.customerName));
    setFollowUpDueAt("");
    setShowCreateFollowUpForm(false);
    setFollowUpCreateMessage(
      `Seguimiento creado correctamente.${auditWarningMessage}`
    );
  };

  const handleOpenCreateFollowUpForm = () => {
    setFollowUpCreateMessage("");
    setFollowUpCreateErrorMessage("");

    if (inquiry) {
      setFollowUpTitle(getDefaultFollowUpTitle(inquiry.customerName));
    }

    setFollowUpDueAt("");
    setShowCreateFollowUpForm(true);
  };

  const handleCancelCreateFollowUpForm = () => {
    setShowCreateFollowUpForm(false);
    setFollowUpCreateErrorMessage("");
  };

  const handleOpenEditFollowUpForm = (followUp: FollowUp) => {
    setFollowUpActionMessage("");
    setFollowUpActionErrorMessage("");
    setEditingFollowUpId(followUp.id);
    setEditFollowUpTitle(followUp.title);
    setEditFollowUpDueAt(formatDateTimeLocalFromIso(followUp.dueAtIso));
  };

  const handleCancelEditFollowUp = () => {
    setEditingFollowUpId(null);
    setEditFollowUpTitle("");
    setEditFollowUpDueAt(getDefaultFollowUpDateTimeLocal());
    setFollowUpActionErrorMessage("");
  };

  const handleSaveFollowUpEdit = async () => {
    setFollowUpActionMessage("");
    setFollowUpActionErrorMessage("");

    if (!rawInquiry) {
      setFollowUpActionErrorMessage(
        "No se puede editar el seguimiento porque no hay caso cargado."
      );
      return;
    }

    const editingFollowUp = followUps.find(
      (followUp) => followUp.id === editingFollowUpId
    );

    if (!editingFollowUp) {
      setFollowUpActionErrorMessage(
        "No se puede editar el seguimiento porque no se encontró en pantalla."
      );
      return;
    }

    const cleanEditFollowUpTitle = editFollowUpTitle.trim();

    if (!cleanEditFollowUpTitle) {
      setFollowUpActionErrorMessage("El título del seguimiento es obligatorio.");
      return;
    }

    if (!editFollowUpDueAt) {
      setFollowUpActionErrorMessage(
        "La fecha y hora del seguimiento son obligatorias."
      );
      return;
    }

    const dueDate = new Date(editFollowUpDueAt);

    if (Number.isNaN(dueDate.getTime())) {
      setFollowUpActionErrorMessage("La fecha indicada no es válida.");
      return;
    }

    const dueAt = dueDate.toISOString();

    setIsSavingFollowUpEdit(true);

    const { data, error } = await supabase
      .from("follow_ups")
      .update({
        title: cleanEditFollowUpTitle,
        due_at: dueAt,
        urgency: resolveFollowUpUrgency(dueAt, editingFollowUp.status, null),
      })
      .eq("id", editingFollowUp.id)
      .select(
        [
          "id",
          "title",
          "due_at",
          "status",
          "urgency",
          "inquiry_id",
          "created_at",
          "customer:customers(name)",
        ].join(", ")
      )
      .single<FollowUpRow>();

    setIsSavingFollowUpEdit(false);

    if (error || !data) {
      setFollowUpActionErrorMessage(
        `No se pudo actualizar el seguimiento: ${
          error?.message || "sin detalle del error"
        }`
      );
      return;
    }

    const mappedFollowUp = mapFollowUpRowToFollowUp(data);
    const previousDueAt = editingFollowUp.dueAtIso ?? null;
    const nextDueAt = data.due_at ?? null;
    const titleChanged = editingFollowUp.title.trim() !== cleanEditFollowUpTitle;
    const dueAtChanged = previousDueAt !== nextDueAt;
    let auditWarningMessage = "";

    const { error: auditLogError } = await supabase.rpc("create_audit_log", {
      target_company_id: rawInquiry.company_id,
      audit_action: "update_follow_up",
      audit_entity_type: "follow_up",
      audit_entity_id: editingFollowUp.id,
      audit_metadata: {
        inquiry_id: rawInquiry.id,
        customer_id: rawInquiry.customer_id,
        status: editingFollowUp.status,
        previous_due_at: previousDueAt,
        next_due_at: nextDueAt,
        title_changed: titleChanged,
        due_at_changed: dueAtChanged,
        previous_title_length: editingFollowUp.title.trim().length,
        next_title_length: cleanEditFollowUpTitle.length,
        source: "inquiry_detail",
      },
    });

    if (auditLogError) {
      console.error(
        "Follow-up updated, but could not create audit log:",
        auditLogError
      );

      auditWarningMessage =
        " Advertencia: no se pudo registrar la auditoría del seguimiento.";
    }

    setFollowUps((currentFollowUps) =>
      currentFollowUps.map((followUp) =>
        followUp.id === editingFollowUp.id ? mappedFollowUp : followUp
      )
    );

    setEditingFollowUpId(null);
    setEditFollowUpTitle("");
    setEditFollowUpDueAt(getDefaultFollowUpDateTimeLocal());
    setFollowUpActionMessage(
      `Seguimiento actualizado correctamente.${auditWarningMessage}`
    );
  };

  const handleUpdateFollowUpStatus = async (
    followUpId: string,
    status: "pending" | "completed" | "cancelled"
  ) => {
    setFollowUpActionMessage("");
    setFollowUpActionErrorMessage("");

    if (!rawInquiry) {
      setFollowUpActionErrorMessage(
        "No se puede actualizar el seguimiento porque no hay caso cargado."
      );
      return;
    }

    const currentFollowUp = followUps.find(
      (followUp) => followUp.id === followUpId
    );

    if (!currentFollowUp) {
      setFollowUpActionErrorMessage(
        "No se puede actualizar el seguimiento porque no se encontró en pantalla."
      );
      return;
    }

    const previousStatus = currentFollowUp.status;

    setUpdatingFollowUpId(followUpId);

    const { data: updatedFollowUp, error } = await supabase
      .from("follow_ups")
      .update({ status })
      .eq("id", followUpId)
      .select(
        [
          "id",
          "title",
          "due_at",
          "status",
          "urgency",
          "inquiry_id",
          "created_at",
          "customer:customers(name)",
        ].join(", ")
      )
      .single<FollowUpRow>();

    setUpdatingFollowUpId(null);

    if (error || !updatedFollowUp) {
      setFollowUpActionErrorMessage(
        `No se pudo actualizar el seguimiento: ${
          error?.message || "sin detalle del error"
        }`
      );
      return;
    }

    const mappedUpdatedFollowUp = mapFollowUpRowToFollowUp(updatedFollowUp);
    let auditWarningMessage = "";

    if (previousStatus !== mappedUpdatedFollowUp.status) {
      const { error: auditLogError } = await supabase.rpc("create_audit_log", {
        target_company_id: rawInquiry.company_id,
        audit_action: getFollowUpStatusAuditAction(
          previousStatus,
          mappedUpdatedFollowUp.status
        ),
        audit_entity_type: "follow_up",
        audit_entity_id: followUpId,
        audit_metadata: {
          inquiry_id: rawInquiry.id,
          customer_id: rawInquiry.customer_id,
          previous_status: previousStatus,
          next_status: mappedUpdatedFollowUp.status,
          due_at: updatedFollowUp.due_at ?? null,
          source: "inquiry_detail",
        },
      });

      if (auditLogError) {
        console.error(
          "Follow-up status updated, but could not create audit log:",
          auditLogError
        );

        auditWarningMessage =
          " Advertencia: no se pudo registrar la auditoría del seguimiento.";
      }
    }

    setFollowUps((currentFollowUps) =>
      currentFollowUps.map((followUp) =>
        followUp.id === followUpId ? mappedUpdatedFollowUp : followUp
      )
    );

    if (mappedUpdatedFollowUp.status !== "pending" && inquiry) {
      setFollowUpTitle(getDefaultFollowUpTitle(inquiry.customerName));
      setFollowUpDueAt("");
      setShowCreateFollowUpForm(false);
    }

    if (mappedUpdatedFollowUp.status === "pending") {
      setFollowUpActionMessage(
        `Seguimiento reabierto correctamente.${auditWarningMessage}`
      );
      return;
    }

    setFollowUpActionMessage(
      mappedUpdatedFollowUp.status === "completed"
        ? `Seguimiento completado correctamente.${auditWarningMessage}`
        : `Seguimiento cancelado correctamente.${auditWarningMessage}`
    );
  };

  if (isLoading) {
    return (
      <div>
        <Button
          variant="secondary"
          onClick={() => setActiveView("inquiries")}
          className="mb-4"
        >
          <ChevronLeft size={16} />
          Volver a casos
        </Button>

        <div className="rounded-2xl border border-[#B8D1D8] bg-white p-6 text-sm font-medium text-[#456C75] shadow-md shadow-[#0F4C5C]/10">
          Cargando caso...
        </div>
      </div>
    );
  }

  if (errorMessage || !inquiry) {
    return (
      <div className="rounded-2xl border border-[#B8D1D8] bg-white p-8 text-center shadow-md shadow-[#0F4C5C]/10">
        <XCircle className="mx-auto text-[#8AA5AC]" />

        <h2 className="mt-3 font-bold text-[#073540]">Caso no encontrado</h2>

        <p className="mt-2 text-sm text-[#6B858C]">
          {errorMessage || "No se pudo cargar este caso."}
        </p>

        <Button className="mt-4" onClick={() => setActiveView("inquiries")}>
          Volver a casos
        </Button>
      </div>
    );
  }

  const inquiryStatus = normalizeInquiryStatus(inquiry.status);

  const canReopenInquiry =
    inquiryStatus === "replied" ||
    inquiryStatus === "closed" ||
    inquiryStatus === "discarded";

  const canUseFinalActions =
    inquiryStatus === "new" ||
    inquiryStatus === "pending" ||
    inquiryStatus === "waiting_customer";

  const canSendEmailResponse =
    canUseFinalActions && Boolean(customer?.email?.trim());

  const canSendWhatsAppResponse =
    canUseFinalActions && Boolean(customer?.phone?.trim());

  const canCreateFollowUp =
    inquiryStatus === "new" ||
    inquiryStatus === "pending" ||
    inquiryStatus === "waiting_customer";

  const canCreateAppointment = canCreateFollowUp;

  const activeAppointments = appointments.filter(
    (appointment) =>
      appointment.status === "proposed" || appointment.status === "confirmed"
  );

  const historyAppointments = appointments.filter(
    (appointment) =>
      appointment.status === "completed" || appointment.status === "cancelled"
  );

  const pendingFollowUps = followUps.filter(
    (followUp) => followUp.status === "pending"
  );

  const shouldShowCreateFollowUpForm =
    pendingFollowUps.length === 0 || showCreateFollowUpForm;

  const historyFollowUps = followUps.filter(
    (followUp) =>
      followUp.status === "completed" || followUp.status === "cancelled"
  );

  const editingFollowUp = followUps.find(
    (followUp) => followUp.id === editingFollowUpId
  );

  const editingAppointment = appointments.find(
    (appointment) => appointment.id === editingAppointmentId
  );

  return (
    <div>
      <section className="mb-6 overflow-hidden rounded-2xl border border-[#8FB8C2] bg-white shadow-md shadow-[#0F4C5C]/10">
        <div className="border-b border-[#8FB8C2] bg-gradient-to-r from-[#C9E2E7] via-[#E2F0F3] to-[#F7FBFC] px-5 py-4">
          <Button
            variant="secondary"
            onClick={() => setActiveView("inquiries")}
            className="mb-4"
          >
            <ChevronLeft size={16} />
            Volver a casos
          </Button>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-[#073540] md:text-3xl">
                Caso de {inquiry.customerName}
              </h1>

              <div className="mt-2 text-sm font-medium text-[#315F69]">
                {inquiry.subject}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <TealBadge>{formatPriorityLabel(inquiry.aiPriority)}</TealBadge>
                <TealBadge>{getCategoryLabel(inquiry.aiCategory)}</TealBadge>
                <TealBadge>{formatStatusLabel(inquiryStatus)}</TealBadge>

                <span className="rounded-full border border-[#B8D1D8] bg-white px-2.5 py-1 text-xs font-semibold text-[#315F69] shadow-sm">
                  {inquiry.createdAt}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {canReopenInquiry ? (
                <Button
                  variant="secondary"
                  onClick={() => handleUpdateStatus("pending")}
                  disabled={isUpdatingStatus}
                >
                  Reabrir caso
                </Button>
              ) : null}

              {canUseFinalActions ? (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => handleUpdateStatus("closed")}
                    disabled={isUpdatingStatus}
                  >
                    Cerrar
                  </Button>

                  <Button
                    variant="danger"
                    onClick={() => handleUpdateStatus("discarded")}
                    disabled={isUpdatingStatus}
                  >
                    Descartar caso
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {(statusErrorMessage || statusMessage) ? (
          <div className="px-5 pb-5">
            {statusErrorMessage ? (
              <div className="mt-4 rounded-2xl border border-[#6D9BA7] bg-[#F2FAFB] px-4 py-3 text-sm text-[#083640]">
                {statusErrorMessage}
              </div>
            ) : null}

            <AutoDismissSuccessMessage
              message={statusMessage}
              onDismiss={setStatusMessage}
            />
          </div>
        ) : null}
      </section>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <main className="space-y-5">
          <SectionCard
            title="Mensajes del caso"
            description="Historial de mensajes recibidos o registrados dentro de este caso."
            tone="info"
          >
            <div className="space-y-3">
              {inquiryMessages.length > 0 ? (
                inquiryMessages.map((message) => (
                  <article
                    key={message.id}
                    className="rounded-2xl border border-[#D2E4E8] bg-[#F7FBFC] p-4 shadow-sm shadow-[#0F4C5C]/5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-[#6B858C]">
                        {getInquiryMessageAuthorLabel(message)} ·{" "}
                        {getMessageDirectionLabel(
                          message.direction,
                          sentEmailMessageIds.includes(message.id),
                          sentWhatsAppMessageIds.includes(message.id)
                        )}
                      </div>

                      <div className="text-xs text-[#6B858C]">
                        {formatDateTime(message.created_at)}
                      </div>
                    </div>

                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#153F48]">
                      {message.body}
                    </p>

                    {message.source_channel ? (
                      <div className="mt-3 text-xs text-[#6B858C]">
                        Canal: {formatSourceChannel(message.source_channel)}
                      </div>
                    ) : null}
                  </article>
                ))
              ) : (
                <article className="rounded-2xl border border-[#D2E4E8] bg-[#F7FBFC] p-4 shadow-sm shadow-[#0F4C5C]/5">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[#6B858C]">
                    Cliente · Recibido
                  </div>

                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#153F48]">
                    {inquiry.originalMessage}
                  </p>
                </article>
              )}
            </div>
          </SectionCard>

          <SectionCard
            title="Nuevo mensaje del cliente"
            description="Usa este bloque cuando el cliente aporte datos nuevos sobre este mismo caso. COPPE guardará el nuevo mensaje y reanalizará el contexto completo sin crear un caso nuevo."
            tone="customer"
          >
            <label className="block text-sm font-medium text-[#315F69]">
              Canal del nuevo mensaje
              <select
                value={normalizeSourceChannelValue(
                  additionalCustomerSourceChannel || rawInquiry?.source_channel
                )}
                onChange={(event) => {
                  setAdditionalCustomerSourceChannel(event.target.value);
                  setReanalysisMessage("");
                  setReanalysisErrorMessage("");
                }}
                className="mt-1 w-full rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-sm text-[#153F48] outline-none focus:border-[#0F4C5C] focus:bg-white"
              >
                {sourceChannelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <textarea
              value={additionalCustomerInfo}
              onChange={(event) => {
                setAdditionalCustomerInfo(event.target.value);
                setReanalysisMessage("");
                setReanalysisErrorMessage("");
              }}
              maxLength={MAX_ANALYSIS_MESSAGE_LENGTH}
              className="mt-4 min-h-[120px] w-full rounded-2xl border border-[#D2E4E8] bg-[#F7FBFC] p-3 text-sm text-[#153F48] outline-none focus:border-[#0F4C5C] focus:bg-white"
              placeholder="Pega aquí el nuevo mensaje recibido del cliente..."
            />

            <p className="mt-1 text-right text-xs text-[#6B858C]">
              {additionalCustomerInfo.length}/{MAX_ANALYSIS_MESSAGE_LENGTH} caracteres
            </p>

            {reanalysisErrorMessage ? (
              <div className="mt-3 rounded-2xl border border-[#6D9BA7] bg-[#F2FAFB] px-4 py-3 text-sm text-[#083640]">
                {reanalysisErrorMessage}
              </div>
            ) : null}

            <AutoDismissSuccessMessage
              message={reanalysisMessage}
              onDismiss={setReanalysisMessage}
            />

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                onClick={handleReanalyzeInquiry}
                disabled={isReanalyzingInquiry}
              >
                <Sparkles size={16} />
                {isReanalyzingInquiry
                  ? "Reanalizando caso..."
                  : "Guardar mensaje y reanalizar"}
              </Button>

              <Button
                variant="secondary"
                onClick={() => {
                  setAdditionalCustomerInfo("");
                  setAdditionalCustomerSourceChannel("");
                  setReanalysisMessage("");
                  setReanalysisErrorMessage("");
                }}
                disabled={isReanalyzingInquiry}
              >
                Limpiar
              </Button>
            </div>
          </SectionCard>

          <AIBlock inquiry={inquiry} />

          <OutboundDeliveryIssues
            issues={outboundDeliveryIssues}
            onResolved={() => {
              setReloadVersion((currentVersion) => currentVersion + 1);
            }}
          />

          <ResponseEditor
            inquiry={inquiry}
            canMarkAsReplied={canUseFinalActions}
            isMarkingAsReplied={isUpdatingStatus}
            onMarkAsReplied={handleMarkAsRepliedWithResponse}
            canMarkAsWaitingCustomer={canUseFinalActions}
            onMarkAsWaitingCustomer={handleMarkAsWaitingCustomerWithResponse}
            canSendEmailResponse={canSendEmailResponse}
            isSendingEmailResponse={isUpdatingStatus}
            sentEmailResponseBodies={sentEmailResponseBodies}
            onSendEmailResponse={handleSendEmailResponse}
            canSendWhatsAppResponse={canSendWhatsAppResponse}
            isSendingWhatsAppResponse={isUpdatingStatus}
            sentWhatsAppResponseBodies={sentWhatsAppResponseBodies}
            onSendWhatsAppResponse={handleSendWhatsAppResponse}
          />
        </main>

        <aside className="space-y-5">
          <SectionCard title="Responsable" tone="brand">
            <label className="mt-2 block text-xs font-semibold uppercase tracking-wide text-[#5C7780]">
              Asignar caso
              <select
                value={assignedTo}
                onChange={(event) => {
                  handleAssignInquiry(event.target.value);
                }}
                disabled={isUpdatingAssignment || teamMembers.length === 0}
                className="mt-2 w-full rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-sm font-normal normal-case text-[#153F48] outline-none transition focus:border-[#0F4C5C] focus:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">Sin responsable</option>

                {teamMembers.map((teamMember) => (
                  <option key={teamMember.user_id} value={teamMember.user_id}>
                    {teamMember.full_name.trim() ||
                      teamMember.email ||
                      "Miembro del equipo"}
                    {teamMember.role === "owner" ? " · Propietario" : ""}
                  </option>
                ))}
              </select>
            </label>

            {isUpdatingAssignment ? (
              <p className="mt-3 text-xs text-[#456C75]">
                Actualizando responsable...
              </p>
            ) : null}

            {assignmentErrorMessage ? (
              <p className="mt-3 text-xs leading-5 text-red-700">
                {assignmentErrorMessage}
              </p>
            ) : null}

            {assignmentMessage ? (
              <p className="mt-3 text-xs leading-5 text-emerald-700">
                {assignmentMessage}
              </p>
            ) : null}
          </SectionCard>

          <SectionCard title="Cliente" tone="customer">
            <p className="mt-2 font-semibold text-[#153F48]">
              {customer?.name || inquiry.customerName}
            </p>

            <p className="text-sm text-[#6B858C]">
              {customer?.email || "Sin email"}
            </p>

            <p className="text-sm text-[#6B858C]">
              {customer?.phone || "Sin teléfono"}
            </p>
          </SectionCard>

          {inboundReceivedDetails ? (
            <SectionCard
              title={`Datos recibidos de ${inboundReceivedDetails.sourceChannel}`}
              tone="warning"
            >
              <p className="mt-2 text-sm leading-6 text-[#083640]">
                Este mensaje se ha asociado al cliente existente mostrado arriba
                porque coincidía un dato de contacto, pero el mensaje llegó
                desde {inboundReceivedDetails.sourceChannel} con estos datos:
              </p>

              <div className="mt-4 space-y-2 text-sm">
                {inboundReceivedDetails.customerName ? (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-[#315F69]">
                      Nombre recibido
                    </div>
                    <div className="mt-0.5 text-[#073540]">
                      {inboundReceivedDetails.customerName}
                    </div>
                  </div>
                ) : null}

                {inboundReceivedDetails.email ? (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-[#315F69]">
                      Email recibido
                    </div>
                    <div className="mt-0.5 text-[#073540]">
                      {inboundReceivedDetails.email}
                    </div>
                  </div>
                ) : null}

                {inboundReceivedDetails.phone ? (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-[#315F69]">
                      Teléfono recibido
                    </div>
                    <div className="mt-0.5 text-[#073540]">
                      {inboundReceivedDetails.phone}
                    </div>
                  </div>
                ) : null}
              </div>

              <p className="mt-4 text-xs leading-5 text-[#0B3F4C]">
                Revisa si conviene actualizar el cliente, mantenerlo como está
                o crear un cliente separado manualmente.
              </p>
            </SectionCard>
          ) : null}

          <SectionCard title="Crear cita interna" tone="appointment">
            {canCreateAppointment ? (
              <>
                <p className="mt-2 text-sm leading-6 text-[#456C75]">
                  Registra una fecha y hora interna para este caso. COPPE no
                  confirma la cita automáticamente al cliente.
                </p>

                <div className="mt-4 space-y-3">
                  <label className="block text-sm font-medium text-[#315F69]">
                    Título
                    <input
                      value={appointmentTitle}
                      onChange={(event) =>
                        setAppointmentTitle(event.target.value)
                      }
                      className="mt-1 w-full rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-sm text-[#153F48] outline-none focus:border-[#0F4C5C] focus:bg-white"
                      placeholder="Escribe el título de la cita"
                    />
                  </label>

                  <label className="block text-sm font-medium text-[#315F69]">
                    Responsable
                    <select
                      value={appointmentAssignedTo}
                      onChange={(event) => {
                        setAppointmentAssignedTo(event.target.value);
                        setAppointmentErrorMessage("");
                      }}
                      className="mt-1 w-full rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-sm text-[#153F48] outline-none focus:border-[#0F4C5C] focus:bg-white"
                    >
                      <option value="">Selecciona un responsable</option>
                      {teamMembers.map((teamMember) => (
                        <option
                          key={teamMember.user_id}
                          value={teamMember.user_id}
                        >
                          {teamMember.full_name.trim() || teamMember.email}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block text-sm font-medium text-[#315F69]">
                    Duración
                    <select
                      value={appointmentDurationMinutes}
                      onChange={(event) =>
                        setAppointmentDurationMinutes(
                          Number(event.target.value)
                        )
                      }
                      className="mt-1 w-full rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-sm text-[#153F48] outline-none focus:border-[#0F4C5C] focus:bg-white"
                    >
                      {[15, 30, 45, 60, 90, 120, 180].map((minutes) => (
                        <option key={minutes} value={minutes}>
                          {minutes < 60
                            ? `${minutes} minutos`
                            : minutes % 60 === 0
                              ? `${minutes / 60} ${
                                  minutes === 60 ? "hora" : "horas"
                                }`
                              : `${Math.floor(minutes / 60)} h ${
                                  minutes % 60
                                } min`}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="rounded-2xl border border-[#B8D8DE] bg-[#F4FAFB] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleAppointmentAvailabilityDateChange(
                            addDaysToDateKey(appointmentAvailabilityDate, -1)
                          )
                        }
                        className="rounded-lg border border-[#C7DDE2] bg-white p-2 text-[#315F69] transition hover:border-[#0F4C5C] hover:text-[#0F4C5C]"
                        aria-label="Consultar el día anterior"
                      >
                        <ChevronLeft size={16} />
                      </button>

                      <div className="min-w-0 text-center">
                        <div className="text-xs font-bold uppercase tracking-wide text-[#315F69]">
                          Disponibilidad
                        </div>
                        <div className="mt-0.5 truncate text-xs text-[#456C75]">
                          {formatDateKey(appointmentAvailabilityDate)}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          handleAppointmentAvailabilityDateChange(
                            addDaysToDateKey(appointmentAvailabilityDate, 1)
                          )
                        }
                        className="rounded-lg border border-[#C7DDE2] bg-white p-2 text-[#315F69] transition hover:border-[#0F4C5C] hover:text-[#0F4C5C]"
                        aria-label="Consultar el día siguiente"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>

                    <input
                      type="date"
                      value={appointmentAvailabilityDate}
                      min={getTodayDateKey(appointmentTimeZone)}
                      onChange={(event) =>
                        handleAppointmentAvailabilityDateChange(
                          event.target.value
                        )
                      }
                      className="mt-3 w-full rounded-xl border border-[#D2E4E8] bg-white px-3 py-2 text-sm text-[#153F48] outline-none focus:border-[#0F4C5C]"
                      aria-label="Día para consultar disponibilidad"
                    />

                    {!appointmentAssignedTo ? (
                      <p className="mt-3 text-xs leading-5 text-[#456C75]">
                        Selecciona un responsable para consultar su agenda.
                      </p>
                    ) : isLoadingAppointmentAvailability ? (
                      <p className="mt-3 text-xs text-[#456C75]">
                        Consultando agenda...
                      </p>
                    ) : appointmentAvailabilityError ? (
                      <p className="mt-3 text-xs leading-5 text-[#8B2735]">
                        {appointmentAvailabilityError}
                      </p>
                    ) : (
                      <>
                        <div className="mt-3">
                          <div className="text-xs font-semibold text-[#315F69]">
                            Horas ocupadas
                          </div>

                          {relevantAvailabilityAppointments.length === 0 ? (
                            <p className="mt-1 text-xs text-[#52747C]">
                              No hay citas activas para este responsable.
                            </p>
                          ) : (
                            <div className="mt-2 space-y-1.5">
                              {relevantAvailabilityAppointments.map(
                                (appointment) => (
                                  <div
                                    key={appointment.id}
                                    className="rounded-xl border border-[#D4E5E8] bg-white px-3 py-2"
                                  >
                                    <div className="text-xs font-bold text-[#0B3F4C]">
                                      {formatAppointmentTimeRange(
                                        {
                                          scheduledAtIso:
                                            appointment.scheduledAtIso,
                                          durationMinutes:
                                            appointment.durationMinutes,
                                        },
                                        appointment.timezone ||
                                          appointmentTimeZone
                                      )}
                                    </div>
                                    <div className="mt-0.5 truncate text-xs text-[#52747C]">
                                      {appointment.title}
                                    </div>
                                  </div>
                                )
                              )}
                            </div>
                          )}
                        </div>

                        <div className="mt-3 border-t border-[#D4E5E8] pt-3">
                          <div className="text-xs font-semibold text-[#315F69]">
                            Huecos libres orientativos · 09:00–18:00
                          </div>

                          {availableAppointmentSlots.length === 0 ? (
                            <p className="mt-1 text-xs leading-5 text-[#52747C]">
                              No quedan huecos compatibles con esta duración.
                              Prueba otro día, responsable o duración.
                            </p>
                          ) : (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {availableAppointmentSlots.map((slot) => {
                                const slotValue = formatDateTimeLocalFromIso(
                                  new Date(slot.startsAtMs).toISOString()
                                );
                                const isSelected =
                                  appointmentScheduledAt === slotValue;

                                return (
                                  <button
                                    key={slot.startsAtMs}
                                    type="button"
                                    onClick={() =>
                                      handleSelectAvailableAppointmentSlot(
                                        slot.startsAtMs
                                      )
                                    }
                                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                                      isSelected
                                        ? "border-[#0F4C5C] bg-[#0F4C5C] text-white"
                                        : "border-[#B8D8DE] bg-white text-[#0F4C5C] hover:border-[#0F4C5C] hover:bg-[#EAF6F8]"
                                    }`}
                                  >
                                    {new Intl.DateTimeFormat("es-ES", {
                                      timeZone: appointmentTimeZone,
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    }).format(slot.startsAtMs)}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  <label className="block text-sm font-medium text-[#315F69]">
                    Fecha y hora elegida
                    <input
                      type="datetime-local"
                      value={appointmentScheduledAt}
                      onChange={(event) => {
                        setAppointmentScheduledAt(event.target.value);

                        if (event.target.value) {
                          setAppointmentAvailabilityDate(
                            event.target.value.slice(0, 10)
                          );
                        }

                        setAppointmentErrorMessage("");
                      }}
                      min={`${getTodayDateKey(appointmentTimeZone)}T00:00`}
                      className="mt-1 w-full rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-sm text-[#153F48] outline-none focus:border-[#0F4C5C] focus:bg-white"
                    />
                    <span className="mt-1 block text-xs font-normal leading-5 text-[#6B858C]">
                      Puedes elegir un hueco libre o introducir otra hora. COPPE
                      volverá a comprobarla al guardar.
                    </span>
                  </label>

                  <label className="block text-sm font-medium text-[#315F69]">
                    Notas
                    <textarea
                      value={appointmentNotes}
                      onChange={(event) =>
                        setAppointmentNotes(event.target.value)
                      }
                      className="mt-1 min-h-[90px] w-full rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-sm text-[#153F48] outline-none focus:border-[#0F4C5C] focus:bg-white"
                      placeholder="Añade detalles relevantes para preparar la cita..."
                    />
                  </label>
                </div>

                {appointmentErrorMessage ? (
                  <div className="mt-3 rounded-2xl border border-[#6D9BA7] bg-[#F2FAFB] px-4 py-3 text-sm text-[#083640]">
                    {appointmentErrorMessage}
                  </div>
                ) : null}

                <AutoDismissSuccessMessage
                  message={appointmentCreateMessage}
                  onDismiss={setAppointmentCreateMessage}
                />

                <Button
                  className="mt-4 w-full"
                  onClick={handleCreateAppointment}
                  disabled={isCreatingAppointment}
                >
                  <CalendarClock size={16} />
                  {isCreatingAppointment ? "Creando cita..." : "Crear cita"}
                </Button>
              </>
            ) : (
              <p className="mt-2 text-sm leading-6 text-[#456C75]">
                Este caso está finalizado. Para crear una cita, primero reabre
                el caso.
              </p>
            )}
          </SectionCard>

          <SectionCard title="Citas del caso" tone="appointment">
            <AutoDismissSuccessMessage
              message={appointmentActionMessage}
              onDismiss={setAppointmentActionMessage}
            />

            {appointments.length === 0 ? (
              <p className="mt-3 text-sm leading-6 text-[#456C75]">
                Todavía no hay citas asociadas a este caso.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {activeAppointments.length > 0 ? (
                  <section>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6B858C]">
                      Activas
                    </h4>

                    <div className="space-y-3">
                      {activeAppointments.map((appointment) => (
                        <article
                          key={appointment.id}
                          className="relative overflow-hidden rounded-2xl border border-[#A7C9D1] bg-white p-4 pl-5 shadow-sm shadow-[#0F4C5C]/10"
                        >
                          <span
                            aria-hidden="true"
                            className="absolute inset-y-0 left-0 w-1 bg-[#0B3F4C]"
                          />

                          {editingAppointment?.id === appointment.id ? (
                            <>
                              <h4 className="text-sm font-bold text-[#073540]">
                                Editar cita interna
                              </h4>

                              <p className="mt-1 text-xs leading-5 text-[#6B858C]">
                                Actualiza el título, la fecha/hora o las notas
                                internas de esta cita.
                              </p>

                              <div className="mt-4 space-y-3">
                                <label className="block text-sm font-medium text-[#315F69]">
                                  Título
                                  <input
                                    value={editAppointmentTitle}
                                    onChange={(event) =>
                                      setEditAppointmentTitle(event.target.value)
                                    }
                                    className="mt-1 w-full rounded-xl border border-[#B8D1D8] bg-white px-3 py-2 text-sm text-[#153F48] outline-none focus:border-[#0F4C5C]"
                                  />
                                </label>

                                <label className="block text-sm font-medium text-[#315F69]">
                                  Fecha y hora
                                  <input
                                    type="datetime-local"
                                    value={editAppointmentScheduledAt}
                                    onChange={(event) =>
                                      setEditAppointmentScheduledAt(
                                        event.target.value
                                      )
                                    }
                                    className="mt-1 w-full rounded-xl border border-[#B8D1D8] bg-white px-3 py-2 text-sm text-[#153F48] outline-none focus:border-[#0F4C5C]"
                                  />
                                </label>

                                <label className="block text-sm font-medium text-[#315F69]">
                                  Notas
                                  <textarea
                                    value={editAppointmentNotes}
                                    onChange={(event) =>
                                      setEditAppointmentNotes(event.target.value)
                                    }
                                    className="mt-1 min-h-[90px] w-full rounded-xl border border-[#B8D1D8] bg-white px-3 py-2 text-sm text-[#153F48] outline-none focus:border-[#0F4C5C]"
                                    placeholder="Añade detalles relevantes para preparar la cita..."
                                  />
                                </label>
                              </div>

                              <div className="mt-4 grid gap-2">
                                <Button
                                  className="w-full justify-center"
                                  onClick={handleSaveAppointmentEdit}
                                  disabled={isSavingAppointmentEdit}
                                >
                                  {isSavingAppointmentEdit
                                    ? "Guardando cambios..."
                                    : "Guardar cambios"}
                                </Button>

                                <Button
                                  className="w-full justify-center"
                                  variant="secondary"
                                  onClick={handleCancelEditAppointment}
                                  disabled={isSavingAppointmentEdit}
                                >
                                  Cancelar
                                </Button>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="text-sm font-semibold text-[#073540]">
                                {appointment.title}
                              </div>

                              <p className="mt-1 text-xs text-[#6B858C]">
                                {appointment.scheduledAt} ·{" "}
                                {getAppointmentStatusLabel(
                                  appointment.status
                                )}
                              </p>

                              {appointment.notes ? (
                                <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-[#456C75]">
                                  {appointment.notes}
                                </p>
                              ) : null}

                              <div className="mt-3 grid gap-2">
                                <Button
                                  className="w-full justify-center"
                                  variant="secondary"
                                  onClick={() =>
                                    handleOpenEditAppointmentForm(appointment)
                                  }
                                  disabled={
                                    updatingAppointmentId === appointment.id
                                  }
                                >
                                  Editar
                                </Button>

                                {appointment.status === "proposed" ? (
                                  <>
                                    <Button
                                      className="w-full justify-center"
                                      onClick={() =>
                                        handleUpdateAppointmentStatus(
                                          appointment.id,
                                          "confirmed"
                                        )
                                      }
                                      disabled={
                                        updatingAppointmentId === appointment.id
                                      }
                                    >
                                      Confirmar
                                    </Button>

                                    <Button
                                      className="w-full justify-center"
                                      variant="status"
                                      onClick={() =>
                                        handleUpdateAppointmentStatus(
                                          appointment.id,
                                          "cancelled"
                                        )
                                      }
                                      disabled={
                                        updatingAppointmentId === appointment.id
                                      }
                                    >
                                      Cancelar
                                    </Button>
                                  </>
                                ) : null}

                                {appointment.status === "confirmed" ? (
                                  <>
                                    <Button
                                      className="w-full justify-center"
                                      onClick={() =>
                                        handleUpdateAppointmentStatus(
                                          appointment.id,
                                          "completed"
                                        )
                                      }
                                      disabled={
                                        updatingAppointmentId === appointment.id
                                      }
                                    >
                                      Completar
                                    </Button>

                                    <Button
                                      className="w-full justify-center"
                                      variant="status"
                                      onClick={() =>
                                        handleUpdateAppointmentStatus(
                                          appointment.id,
                                          "cancelled"
                                        )
                                      }
                                      disabled={
                                        updatingAppointmentId === appointment.id
                                      }
                                    >
                                      Cancelar
                                    </Button>
                                  </>
                                ) : null}
                              </div>
                            </>
                          )}
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}

                {historyAppointments.length > 0 ? (
                  <section>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6B858C]">
                      Historial
                    </h4>

                    <div className="space-y-3">
                      {historyAppointments.map((appointment) => (
                        <article
                          key={appointment.id}
                          className="relative overflow-hidden rounded-2xl border border-[#B8D1D8] bg-white p-4 pl-5 shadow-sm shadow-[#0F4C5C]/5"
                        >
                          <span
                            aria-hidden="true"
                            className="absolute inset-y-0 left-0 w-1 bg-[#B8D1D8]"
                          />

                          <div className="text-sm font-semibold text-[#073540]">
                            {appointment.title}
                          </div>

                          <p className="mt-1 text-xs text-[#6B858C]">
                            {appointment.scheduledAt} ·{" "}
                            {getAppointmentStatusLabel(appointment.status)}
                          </p>

                          {appointment.notes ? (
                            <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-[#456C75]">
                              {appointment.notes}
                            </p>
                          ) : null}

                          <Button
                            variant="secondary"
                            className="mt-3 w-full justify-center"
                            onClick={() =>
                              handleUpdateAppointmentStatus(
                                appointment.id,
                                "proposed"
                              )
                            }
                            disabled={updatingAppointmentId === appointment.id}
                          >
                            Reabrir como pendiente
                          </Button>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title={
              pendingFollowUps.length > 0
                ? "Crear otro seguimiento"
                : "Crear seguimiento"
            }
            tone="followUp"
          >
            {followUpCreateErrorMessage ? (
              <div className="mt-3 rounded-2xl border border-[#6D9BA7] bg-[#F2FAFB] px-4 py-3 text-sm text-[#083640]">
                {followUpCreateErrorMessage}
              </div>
            ) : null}

            <AutoDismissSuccessMessage
              message={followUpCreateMessage}
              onDismiss={setFollowUpCreateMessage}
            />

            {canCreateFollowUp ? (
              shouldShowCreateFollowUpForm ? (
                <>
                  <p className="mt-2 text-sm leading-6 text-[#456C75]">
                    Crea una nueva tarea para volver a revisar este caso en una
                    fecha concreta.
                  </p>

                  {pendingFollowUps.length > 0 ? (
                    <div className="mt-3 rounded-2xl border border-[#8FB8C2] bg-[#F2FAFB] px-4 py-3 text-sm text-[#0B3F4C]">
                      Ya existe un seguimiento pendiente para este caso. Crea
                      otro solo si necesitas un recordatorio adicional.
                    </div>
                  ) : null}

                  <div className="mt-4 space-y-3">
                    <label className="block text-sm font-medium text-[#315F69]">
                      Título
                      <input
                        value={followUpTitle}
                        onChange={(event) =>
                          setFollowUpTitle(event.target.value)
                        }
                        className="mt-1 w-full rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-sm text-[#153F48] outline-none focus:border-[#0F4C5C] focus:bg-white"
                        placeholder="Escribe el título del seguimiento"
                      />
                    </label>

                    <label className="block text-sm font-medium text-[#315F69]">
                      Fecha y hora
                      <input
                        type="datetime-local"
                        value={followUpDueAt}
                        onChange={(event) =>
                          setFollowUpDueAt(event.target.value)
                        }
                        className="mt-1 w-full rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-sm text-[#153F48] outline-none focus:border-[#0F4C5C] focus:bg-white"
                      />
                    </label>
                  </div>


                  <div
                    className={
                      pendingFollowUps.length > 0
                        ? "mt-4 grid grid-cols-2 gap-2"
                        : "mt-4"
                    }
                  >
                    <Button
                      className="w-full"
                      onClick={handleCreateFollowUp}
                      disabled={isCreatingFollowUp}
                    >
                      <CalendarClock size={16} />
                      {isCreatingFollowUp
                        ? "Creando seguimiento..."
                        : pendingFollowUps.length > 0
                          ? "Guardar otro seguimiento"
                          : "Crear seguimiento"}
                    </Button>

                    {pendingFollowUps.length > 0 ? (
                      <Button
                        variant="secondary"
                        className="w-full"
                        onClick={handleCancelCreateFollowUpForm}
                        disabled={isCreatingFollowUp}
                      >
                        Cancelar
                      </Button>
                    ) : null}
                  </div>
                </>
              ) : (
                <>
                  <p className="mt-2 text-sm leading-6 text-[#456C75]">
                    Este caso ya tiene un seguimiento pendiente. Si necesitas
                    programar otro recordatorio distinto, puedes crear uno
                    adicional.
                  </p>

                  <Button
                    className="mt-4 w-full"
                    onClick={handleOpenCreateFollowUpForm}
                  >
                    <CalendarClock size={16} />
                    Crear otro seguimiento
                  </Button>
                </>
              )
            ) : (
              <>
                <p className="mt-2 text-sm leading-6 text-[#456C75]">
                  Este caso está finalizado. Para crear un seguimiento, primero
                  reabre el caso.
                </p>

              </>
            )}
          </SectionCard>

          <SectionCard title="Seguimientos del caso" tone="followUp">
            {followUpActionErrorMessage ? (
              <div className="mt-3 rounded-2xl border border-[#6D9BA7] bg-[#F2FAFB] px-4 py-3 text-sm text-[#083640]">
                {followUpActionErrorMessage}
              </div>
            ) : null}

            <AutoDismissSuccessMessage
              message={followUpActionMessage}
              onDismiss={setFollowUpActionMessage}
            />

            {editingFollowUp ? (
              <div className="mt-4 rounded-2xl border border-[#B8D1D8] bg-[#F2FAFB] p-4">
                <h4 className="text-sm font-bold text-[#073540]">
                  Editar seguimiento
                </h4>

                <p className="mt-1 text-xs leading-5 text-[#6B858C]">
                  Actualiza el título o la fecha de este seguimiento.
                </p>

                <div className="mt-4 space-y-3">
                  <label className="block text-sm font-medium text-[#315F69]">
                    Título
                    <input
                      value={editFollowUpTitle}
                      onChange={(event) =>
                        setEditFollowUpTitle(event.target.value)
                      }
                      className="mt-1 w-full rounded-xl border border-[#B8D1D8] bg-white px-3 py-2 text-sm text-[#153F48] outline-none focus:border-[#0F4C5C]"
                    />
                  </label>

                  <label className="block text-sm font-medium text-[#315F69]">
                    Fecha y hora
                    <input
                      type="datetime-local"
                      value={editFollowUpDueAt}
                      onChange={(event) =>
                        setEditFollowUpDueAt(event.target.value)
                      }
                      className="mt-1 w-full rounded-xl border border-[#B8D1D8] bg-white px-3 py-2 text-sm text-[#153F48] outline-none focus:border-[#0F4C5C]"
                    />
                  </label>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    onClick={handleSaveFollowUpEdit}
                    disabled={isSavingFollowUpEdit}
                  >
                    {isSavingFollowUpEdit
                      ? "Guardando cambios..."
                      : "Guardar cambios"}
                  </Button>

                  <Button variant="secondary" onClick={handleCancelEditFollowUp}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : null}

            {followUps.length === 0 ? (
              <p className="mt-3 text-sm leading-6 text-[#456C75]">
                Todavía no hay seguimientos asociados a este caso.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {pendingFollowUps.length > 0 ? (
                  <section>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6B858C]">
                      Pendientes
                    </h4>

                    <div className="space-y-3">
                      {pendingFollowUps.map((followUp) => (
                        <FollowUpCard
                          key={followUp.id}
                          followUp={followUp}
                          onEdit={handleOpenEditFollowUpForm}
                          onComplete={(id) =>
                            handleUpdateFollowUpStatus(id, "completed")
                          }
                          onCancel={(id) =>
                            handleUpdateFollowUpStatus(id, "cancelled")
                          }
                          isUpdating={
                            updatingFollowUpId === followUp.id ||
                            (isSavingFollowUpEdit &&
                              editingFollowUpId === followUp.id)
                          }
                        />
                      ))}
                    </div>
                  </section>
                ) : null}

                {historyFollowUps.length > 0 ? (
                  <section>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6B858C]">
                      Historial
                    </h4>

                    <div className="space-y-3">
                      {historyFollowUps.map((followUp) => (
                        <FollowUpCard
                          key={followUp.id}
                          followUp={followUp}
                          onReopen={(id) =>
                            handleUpdateFollowUpStatus(id, "pending")
                          }
                          isUpdating={updatingFollowUpId === followUp.id}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Nota interna" tone="note">
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="min-h-[120px] w-full rounded-2xl border border-[#D2E4E8] bg-[#F7FBFC] p-3 text-sm text-[#153F48] outline-none focus:border-[#0F4C5C] focus:bg-white"
              placeholder="Añadir nota interna..."
            />

            {noteErrorMessage ? (
              <div className="mt-3 rounded-2xl border border-[#6D9BA7] bg-[#F2FAFB] px-4 py-3 text-sm text-[#083640]">
                {noteErrorMessage}
              </div>
            ) : null}

            <AutoDismissSuccessMessage
              message={noteMessage}
              onDismiss={setNoteMessage}
            />

            <Button
              className="mt-3 w-full"
              onClick={handleSaveNote}
              disabled={isSavingNote}
            >
              {isSavingNote ? "Guardando nota..." : "Guardar nota"}
            </Button>
          </SectionCard>

          <SectionCard title="Notas del caso" tone="note">
            {notes.length === 0 ? (
              <p className="mt-3 text-sm leading-6 text-[#456C75]">
                Todavía no hay notas internas para este caso.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {notes.map((internalNote) => (
                  <article
                    key={internalNote.id}
                    className="rounded-2xl border border-[#B8D1D8] bg-[#F7FBFC] p-4 shadow-sm shadow-[#0F4C5C]/5"
                  >
                    <p className="whitespace-pre-wrap text-sm leading-6 text-[#315F69]">
                      {internalNote.body}
                    </p>

                    <div className="mt-3 text-xs text-[#6B858C]">
                      {getTeamMemberName(internalNote.created_by)
                        ? `${getTeamMemberName(internalNote.created_by)} · `
                        : ""}
                      {formatDateTime(internalNote.created_at)}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </SectionCard>
        </aside>
      </div>
    </div>
  );
}





