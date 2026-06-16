"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Sparkles, XCircle } from "lucide-react";

import {
  compareAppointmentsByScheduledAt,
  getAppointmentStatusLabel,
  mapAppointmentRowToAppointment,
  type AppointmentRow,
} from "../lib/appointmentUtils";
import {
  formatFollowUpDueAt,
  normalizeFollowUpStatus,
  resolveFollowUpUrgency,
} from "../lib/followUpUtils";
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
import { CategoryBadge } from "./CategoryBadge";
import { FollowUpCard } from "./FollowUpCard";
import { PriorityBadge } from "./PriorityBadge";
import { ResponseEditor } from "./ResponseEditor";
import { StatusBadge } from "./StatusBadge";

type InquiryDetailProps = {
  inquiryId: string;
  setActiveView: (view: string) => void;
};

type InquiryDetailRow = InquiryRow & {
  company_id: string;
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
  created_at: string;
};

type InquiryMessageRow = {
  id: string;
  direction: string;
  author_type: string;
  body: string;
  source_channel: string | null;
  created_at: string;
};

type OutboundMessageForInquiryRow = {
  inquiry_message_id: string | null;
  body: string | null;
};

type SendEmailResponseNextStatus = "replied" | "waiting_customer";

type SendEmailResponseApiResponse = {
  ok?: boolean;
  error?: string;
  warning?: string;
  providerMessageId?: string;
  inquiryMessage?: InquiryMessageRow;
  nextStatus?: SendEmailResponseNextStatus;
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

function getMessageDirectionLabel(direction: string, wasSentByEmail = false) {
  if (direction === "inbound") {
    return "Recibido";
  }

  if (direction === "outbound" && wasSentByEmail) {
    return "Email enviado";
  }

  if (direction === "outbound") {
    return "Respuesta registrada";
  }

  return "Mensaje";
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

function getDefaultFollowUpDateTimeLocal() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
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
  const [editingAppointmentId, setEditingAppointmentId] = useState<
    string | null
  >(null);
  const [editAppointmentTitle, setEditAppointmentTitle] = useState("");
  const [editAppointmentScheduledAt, setEditAppointmentScheduledAt] =
    useState("");
  const [editAppointmentNotes, setEditAppointmentNotes] = useState("");

  const [followUpTitle, setFollowUpTitle] = useState("");
  const [followUpDueAt, setFollowUpDueAt] = useState(
    getDefaultFollowUpDateTimeLocal()
  );
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
  const [appointmentMessage, setAppointmentMessage] = useState("");
  const [appointmentErrorMessage, setAppointmentErrorMessage] = useState("");
  const [followUpCreateMessage, setFollowUpCreateMessage] = useState("");
  const [followUpCreateErrorMessage, setFollowUpCreateErrorMessage] =
    useState("");
  const [followUpActionMessage, setFollowUpActionMessage] = useState("");
  const [followUpActionErrorMessage, setFollowUpActionErrorMessage] =
    useState("");

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
      setAppointmentMessage("");
      setAppointmentErrorMessage("");
      setFollowUpCreateMessage("");
      setFollowUpCreateErrorMessage("");
      setFollowUpActionMessage("");
      setFollowUpActionErrorMessage("");
      setInquiry(null);
      setRawInquiry(null);
      setCustomer(null);
      setNotes([]);
      setInquiryMessages([]);
      setSentEmailMessageIds([]);
      setSentEmailResponseBodies([]);
      setFollowUps([]);
      setAppointments([]);
      setInboundReceivedDetails(null);
      setNote("");
      setAdditionalCustomerInfo("");
      setAdditionalCustomerSourceChannel("");
      setAppointmentTitle("");
      setAppointmentScheduledAt("");
      setAppointmentNotes("");
      setEditingAppointmentId(null);
      setEditAppointmentTitle("");
      setEditAppointmentScheduledAt("");
      setEditAppointmentNotes("");
      setFollowUpTitle("");
      setFollowUpDueAt(getDefaultFollowUpDateTimeLocal());
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
      setAppointmentTitle("");
      setAppointmentScheduledAt("");
      setAppointmentNotes("");
      setEditingAppointmentId(null);
      setEditAppointmentTitle("");
      setEditAppointmentScheduledAt("");
      setEditAppointmentNotes("");
      setFollowUpTitle(`Revisar caso de ${inquiryData.customer_name}`);
      setFollowUpDueAt(getDefaultFollowUpDateTimeLocal());

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
          .select("id, direction, author_type, body, source_channel, created_at")
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
          .select("inquiry_message_id, body")
          .eq("inquiry_id", inquiryData.id)
          .eq("channel", "email")
          .eq("status", "sent")
          .not("inquiry_message_id", "is", null);

      if (!outboundMessagesError) {
        const sentEmailRows =
          (outboundMessagesData ?? []) as OutboundMessageForInquiryRow[];

        const sentMessageIds = sentEmailRows
          .map((outboundMessage) => outboundMessage.inquiry_message_id)
          .filter((messageId): messageId is string => Boolean(messageId));

        const sentResponseBodies = sentEmailRows
          .map((outboundMessage) => outboundMessage.body?.trim() || "")
          .filter(Boolean);

        setSentEmailMessageIds(sentMessageIds);
        setSentEmailResponseBodies(sentResponseBodies);
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
              "title",
              "scheduled_at",
              "duration_minutes",
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
        .select("id, body, created_at")
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
  }, [inquiryId, supabase]);

  const handleUpdateStatus = async (
    newStatus: InquiryStatus
  ): Promise<boolean> => {
    if (!inquiry) {
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
      .from("inquiries")
      .update({
        status: newStatus,
      })
      .eq("id", inquiry.id);

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

    if (newStatus === "pending") {
      setStatusMessage("Caso reabierto correctamente.");
      return true;
    }

    if (newStatus === "waiting_customer") {
      setStatusMessage("Caso marcado como esperando al cliente.");
      return true;
    }

    if (newStatus === "replied") {
      setStatusMessage("Respuesta registrada y caso marcado como respondido.");
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
    responseText: string
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
        .select("id, direction, author_type, body, source_channel, created_at")
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
    responseText: string
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
        .select("id, direction, author_type, body, source_channel, created_at")
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
    nextStatus: SendEmailResponseNextStatus
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
      .select("id, body, created_at")
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

    setNotes((currentNotes) => [data, ...currentNotes]);
    setNote("");
    setNoteMessage("Nota interna guardada correctamente.");
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
      .select("id, direction, author_type, body, source_channel, created_at")
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

    setRawInquiry(updatedInquiry);
    setInquiry(mapInquiryRowToInquiry(updatedInquiry));
    setInquiryMessages((currentMessages) => [
      ...currentMessages,
      createdMessage,
    ]);
    setAdditionalCustomerInfo("");
    setAdditionalCustomerSourceChannel("");
    setReanalysisMessage(
      "Caso reanalizado correctamente con el nuevo mensaje del cliente."
    );
  };

  const handleCreateAppointment = async () => {
    setAppointmentMessage("");
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

    const { data, error } = await supabase
      .from("appointments")
      .insert({
        company_id: rawInquiry.company_id,
        inquiry_id: rawInquiry.id,
        customer_id: rawInquiry.customer_id,
        title: cleanAppointmentTitle,
        scheduled_at: scheduledDate.toISOString(),
        status: "proposed",
        notes: appointmentNotes.trim() || null,
      })
      .select(
        [
          "id",
          "inquiry_id",
          "customer_id",
          "title",
          "scheduled_at",
          "duration_minutes",
          "status",
          "notes",
          "created_at",
          "updated_at",
        ].join(", ")
      )
      .single<AppointmentRow>();

    setIsCreatingAppointment(false);

    if (error || !data) {
      setAppointmentErrorMessage(
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

    setAppointmentTitle("");
    setAppointmentScheduledAt("");
    setAppointmentNotes("");
    setAppointmentMessage("Cita creada como pendiente de confirmar.");
  };

  const handleUpdateAppointmentStatus = async (
    appointmentId: string,
    status: AppointmentStatus
  ) => {
    setAppointmentMessage("");
    setAppointmentErrorMessage("");
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
          "title",
          "scheduled_at",
          "duration_minutes",
          "status",
          "notes",
          "created_at",
          "updated_at",
        ].join(", ")
      )
      .single<AppointmentRow>();

    setUpdatingAppointmentId(null);

    if (error || !data) {
      setAppointmentErrorMessage(
        `No se pudo actualizar la cita: ${
          error?.message || "sin detalle del error"
        }`
      );
      return;
    }

    const mappedAppointment = mapAppointmentRowToAppointment(data);

    setAppointments((currentAppointments) =>
      currentAppointments
        .map((appointment) =>
          appointment.id === appointmentId ? mappedAppointment : appointment
        )
        .sort(compareAppointmentsByScheduledAt)
    );

    setAppointmentMessage("Estado de la cita actualizado.");
  };

  const handleOpenEditAppointmentForm = (appointment: Appointment) => {
    setAppointmentMessage("");
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
    setAppointmentMessage("");
    setAppointmentErrorMessage("");

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
          "title",
          "scheduled_at",
          "duration_minutes",
          "status",
          "notes",
          "created_at",
          "updated_at",
        ].join(", ")
      )
      .single<AppointmentRow>();

    setIsSavingAppointmentEdit(false);

    if (error || !data) {
      setAppointmentErrorMessage(
        `No se pudo actualizar la cita: ${
          error?.message || "sin detalle del error"
        }`
      );
      return;
    }

    const mappedAppointment = mapAppointmentRowToAppointment(data);

    setAppointments((currentAppointments) =>
      currentAppointments
        .map((appointment) =>
          appointment.id === editingAppointment.id
            ? mappedAppointment
            : appointment
        )
        .sort(compareAppointmentsByScheduledAt)
    );

    setEditingAppointmentId(null);
    setEditAppointmentTitle("");
    setEditAppointmentScheduledAt("");
    setEditAppointmentNotes("");
    setAppointmentMessage("Cita actualizada correctamente.");
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

    setFollowUps((currentFollowUps) => [
      mapFollowUpRowToFollowUp(data),
      ...currentFollowUps,
    ]);

    setShowCreateFollowUpForm(false);
    setFollowUpCreateMessage("Seguimiento creado correctamente.");
  };

  const handleOpenCreateFollowUpForm = () => {
    setFollowUpCreateMessage("");
    setFollowUpCreateErrorMessage("");
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

    setFollowUps((currentFollowUps) =>
      currentFollowUps.map((followUp) =>
        followUp.id === editingFollowUp.id ? mappedFollowUp : followUp
      )
    );

    setEditingFollowUpId(null);
    setEditFollowUpTitle("");
    setEditFollowUpDueAt(getDefaultFollowUpDateTimeLocal());
    setFollowUpActionMessage("Seguimiento actualizado correctamente.");
  };

  const handleUpdateFollowUpStatus = async (
    followUpId: string,
    status: "pending" | "completed" | "cancelled"
  ) => {
    setFollowUpActionMessage("");
    setFollowUpActionErrorMessage("");
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

    setFollowUps((currentFollowUps) =>
      currentFollowUps.map((followUp) =>
        followUp.id === followUpId ? mappedUpdatedFollowUp : followUp
      )
    );

    if (status === "pending") {
      setFollowUpActionMessage("Seguimiento reabierto correctamente.");
      return;
    }

    setFollowUpActionMessage(
      status === "completed"
        ? "Seguimiento completado correctamente."
        : "Seguimiento cancelado correctamente."
    );
  };

  if (isLoading) {
    return (
      <div>
        <button
          onClick={() => setActiveView("inquiries")}
          className="mb-3 text-sm font-semibold text-[#0F4C5C] hover:underline"
        >
          ← Volver a casos
        </button>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          Cargando caso...
        </div>
      </div>
    );
  }

  if (errorMessage || !inquiry) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <XCircle className="mx-auto text-slate-400" />

        <h2 className="mt-3 font-bold text-slate-950">Caso no encontrado</h2>

        <p className="mt-2 text-sm text-slate-500">
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
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <button
            onClick={() => setActiveView("inquiries")}
            className="mb-3 text-sm font-semibold text-[#0F4C5C] hover:underline"
          >
            ← Volver a casos
          </button>

          <h1 className="text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">
            Caso de {inquiry.customerName}
          </h1>

          <div className="mt-2 text-sm font-medium text-slate-600">
            {inquiry.subject}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <PriorityBadge priority={inquiry.aiPriority} />
            <CategoryBadge category={inquiry.aiCategory} />
            <StatusBadge status={inquiryStatus} />

            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
              {inquiry.createdAt}
            </span>
          </div>

          {statusErrorMessage ? (
            <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {statusErrorMessage}
            </div>
          ) : null}

          {statusMessage ? (
            <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {statusMessage}
            </div>
          ) : null}
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
                variant="ghost"
                onClick={() => handleUpdateStatus("discarded")}
                disabled={isUpdatingStatus}
              >
                Descartar caso
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <main className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">
              Mensajes del caso
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Historial de mensajes recibidos o registrados dentro de este caso.
            </p>

            <div className="mt-4 space-y-3">
              {inquiryMessages.length > 0 ? (
                inquiryMessages.map((message) => (
                  <article
                    key={message.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {getMessageAuthorLabel(message.author_type)} ·{" "}
                        {getMessageDirectionLabel(
                          message.direction,
                          sentEmailMessageIds.includes(message.id)
                        )}
                      </div>

                      <div className="text-xs text-slate-500">
                        {formatDateTime(message.created_at)}
                      </div>
                    </div>

                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                      {message.body}
                    </p>

                    {message.source_channel ? (
                      <div className="mt-3 text-xs text-slate-500">
                        Canal: {formatSourceChannel(message.source_channel)}
                      </div>
                    ) : null}
                  </article>
                ))
              ) : (
                <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Cliente · Recibido
                  </div>

                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                    {inquiry.originalMessage}
                  </p>
                </article>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">
              Nuevo mensaje del cliente
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Usa este bloque cuando el cliente aporte datos nuevos sobre este
              mismo caso. COPPE guardará el nuevo mensaje y reanalizará el
              contexto completo sin crear un caso nuevo.
            </p>

            <label className="mt-5 block text-sm font-medium text-slate-700">
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
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
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
              className="mt-4 min-h-[120px] w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-[#0F4C5C]"
              placeholder="Pega aquí el nuevo mensaje recibido del cliente..."
            />

            <p className="mt-1 text-right text-xs text-slate-500">
              {additionalCustomerInfo.length}/{MAX_ANALYSIS_MESSAGE_LENGTH} caracteres
            </p>

            {reanalysisErrorMessage ? (
              <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {reanalysisErrorMessage}
              </div>
            ) : null}

            {reanalysisMessage ? (
              <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {reanalysisMessage}
              </div>
            ) : null}

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
          </div>

          <AIBlock inquiry={inquiry} />

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
          />
        </main>

        <aside className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-slate-950">Cliente</h3>

            <p className="mt-2 font-semibold text-slate-900">
              {customer?.name || inquiry.customerName}
            </p>

            <p className="text-sm text-slate-500">
              {customer?.email || "Sin email"}
            </p>

            <p className="text-sm text-slate-500">
              {customer?.phone || "Sin teléfono"}
            </p>
          </div>

          {inboundReceivedDetails ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
              <h3 className="font-bold text-amber-950">
                Datos recibidos de {inboundReceivedDetails.sourceChannel}
              </h3>

              <p className="mt-2 text-sm leading-6 text-amber-900">
                Este mensaje se ha asociado al cliente existente mostrado arriba
                porque coincidía un dato de contacto, pero el mensaje llegó
                desde {inboundReceivedDetails.sourceChannel} con estos datos:
              </p>

              <div className="mt-4 space-y-2 text-sm">
                {inboundReceivedDetails.customerName ? (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                      Nombre recibido
                    </div>
                    <div className="mt-0.5 text-amber-950">
                      {inboundReceivedDetails.customerName}
                    </div>
                  </div>
                ) : null}

                {inboundReceivedDetails.email ? (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                      Email recibido
                    </div>
                    <div className="mt-0.5 text-amber-950">
                      {inboundReceivedDetails.email}
                    </div>
                  </div>
                ) : null}

                {inboundReceivedDetails.phone ? (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                      Teléfono recibido
                    </div>
                    <div className="mt-0.5 text-amber-950">
                      {inboundReceivedDetails.phone}
                    </div>
                  </div>
                ) : null}
              </div>

              <p className="mt-4 text-xs leading-5 text-amber-800">
                Revisa si conviene actualizar el cliente, mantenerlo como está
                o crear un cliente separado manualmente.
              </p>
            </div>
          ) : null}

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-slate-950">Cita interna</h3>

            {canCreateAppointment ? (
              <>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Registra una fecha y hora interna para este caso. COPPE no
                  confirma la cita automáticamente al cliente.
                </p>

                <div className="mt-4 space-y-3">
                  <label className="block text-sm font-medium text-slate-700">
                    Título
                    <input
                      value={appointmentTitle}
                      onChange={(event) =>
                        setAppointmentTitle(event.target.value)
                      }
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                      placeholder="Escribe el título de la cita"
                    />
                  </label>

                  <label className="block text-sm font-medium text-slate-700">
                    Fecha y hora
                    <input
                      type="datetime-local"
                      value={appointmentScheduledAt}
                      onChange={(event) =>
                        setAppointmentScheduledAt(event.target.value)
                      }
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                    />
                  </label>

                  <label className="block text-sm font-medium text-slate-700">
                    Notas
                    <textarea
                      value={appointmentNotes}
                      onChange={(event) =>
                        setAppointmentNotes(event.target.value)
                      }
                      className="mt-1 min-h-[90px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                      placeholder="Añade detalles relevantes para preparar la cita..."
                    />
                  </label>
                </div>

                {appointmentErrorMessage ? (
                  <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {appointmentErrorMessage}
                  </div>
                ) : null}

                {appointmentMessage ? (
                  <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {appointmentMessage}
                  </div>
                ) : null}

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
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Este caso está finalizado. Para crear una cita, primero reabre
                el caso.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-slate-950">Citas del caso</h3>

            {appointments.length === 0 ? (
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Todavía no hay citas asociadas a este caso.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {activeAppointments.length > 0 ? (
                  <section>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Activas
                    </h4>

                    <div className="space-y-3">
                      {activeAppointments.map((appointment) => (
                        <article
                          key={appointment.id}
                          className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                        >
                          {editingAppointment?.id === appointment.id ? (
                            <>
                              <h4 className="text-sm font-bold text-slate-950">
                                Editar cita interna
                              </h4>

                              <p className="mt-1 text-xs leading-5 text-slate-500">
                                Actualiza el título, la fecha/hora o las notas
                                internas de esta cita.
                              </p>

                              <div className="mt-4 space-y-3">
                                <label className="block text-sm font-medium text-slate-700">
                                  Título
                                  <input
                                    value={editAppointmentTitle}
                                    onChange={(event) =>
                                      setEditAppointmentTitle(event.target.value)
                                    }
                                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                                  />
                                </label>

                                <label className="block text-sm font-medium text-slate-700">
                                  Fecha y hora
                                  <input
                                    type="datetime-local"
                                    value={editAppointmentScheduledAt}
                                    onChange={(event) =>
                                      setEditAppointmentScheduledAt(
                                        event.target.value
                                      )
                                    }
                                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                                  />
                                </label>

                                <label className="block text-sm font-medium text-slate-700">
                                  Notas
                                  <textarea
                                    value={editAppointmentNotes}
                                    onChange={(event) =>
                                      setEditAppointmentNotes(event.target.value)
                                    }
                                    className="mt-1 min-h-[90px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                                    placeholder="Añade detalles relevantes para preparar la cita..."
                                  />
                                </label>
                              </div>

                              <div className="mt-4 flex flex-wrap gap-2">
                                <Button
                                  onClick={handleSaveAppointmentEdit}
                                  disabled={isSavingAppointmentEdit}
                                >
                                  {isSavingAppointmentEdit
                                    ? "Guardando cambios..."
                                    : "Guardar cambios"}
                                </Button>

                                <Button
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
                              <div className="text-sm font-semibold text-slate-950">
                                {appointment.title}
                              </div>

                              <p className="mt-1 text-xs text-slate-500">
                                {appointment.scheduledAt} ·{" "}
                                {getAppointmentStatusLabel(
                                  appointment.status
                                )}
                              </p>

                              {appointment.notes ? (
                                <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">
                                  {appointment.notes}
                                </p>
                              ) : null}

                              <div className="mt-3 flex flex-wrap gap-2">
                                <Button
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
                                      variant="secondary"
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
                                      Marcar como confirmada internamente
                                    </Button>

                                    <Button
                                      variant="ghost"
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
                                      variant="secondary"
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
                                      variant="ghost"
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
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Historial
                    </h4>

                    <div className="space-y-3">
                      {historyAppointments.map((appointment) => (
                        <article
                          key={appointment.id}
                          className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                        >
                          <div className="text-sm font-semibold text-slate-950">
                            {appointment.title}
                          </div>

                          <p className="mt-1 text-xs text-slate-500">
                            {appointment.scheduledAt} ·{" "}
                            {getAppointmentStatusLabel(appointment.status)}
                          </p>

                          {appointment.notes ? (
                            <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">
                              {appointment.notes}
                            </p>
                          ) : null}

                          <Button
                            variant="secondary"
                            className="mt-3"
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
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-slate-950">
              {pendingFollowUps.length > 0
                ? "Crear otro seguimiento"
                : "Crear seguimiento"}
            </h3>

            {canCreateFollowUp ? (
              shouldShowCreateFollowUpForm ? (
                <>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Crea una nueva tarea para volver a revisar este caso en una
                    fecha concreta.
                  </p>

                  {pendingFollowUps.length > 0 ? (
                    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      Ya existe un seguimiento pendiente para este caso. Crea
                      otro solo si necesitas un recordatorio adicional.
                    </div>
                  ) : null}

                  <div className="mt-4 space-y-3">
                    <label className="block text-sm font-medium text-slate-700">
                      Título
                      <input
                        value={followUpTitle}
                        onChange={(event) =>
                          setFollowUpTitle(event.target.value)
                        }
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                      />
                    </label>

                    <label className="block text-sm font-medium text-slate-700">
                      Fecha y hora
                      <input
                        type="datetime-local"
                        value={followUpDueAt}
                        onChange={(event) =>
                          setFollowUpDueAt(event.target.value)
                        }
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                      />
                    </label>
                  </div>

                  {followUpCreateErrorMessage ? (
                    <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {followUpCreateErrorMessage}
                    </div>
                  ) : null}

                  {followUpCreateMessage ? (
                    <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                      {followUpCreateMessage}
                    </div>
                  ) : null}

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
                  <p className="mt-2 text-sm leading-6 text-slate-600">
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
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Este caso está finalizado. Para crear un seguimiento, primero
                  reabre el caso.
                </p>

                {followUpCreateErrorMessage ? (
                  <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {followUpCreateErrorMessage}
                  </div>
                ) : null}

                {followUpCreateMessage ? (
                  <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {followUpCreateMessage}
                  </div>
                ) : null}
              </>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-slate-950">
              Seguimientos del caso
            </h3>

            {followUpActionErrorMessage ? (
              <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {followUpActionErrorMessage}
              </div>
            ) : null}

            {followUpActionMessage ? (
              <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {followUpActionMessage}
              </div>
            ) : null}

            {editingFollowUp ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h4 className="text-sm font-bold text-slate-950">
                  Editar seguimiento
                </h4>

                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Actualiza el título o la fecha de este seguimiento.
                </p>

                <div className="mt-4 space-y-3">
                  <label className="block text-sm font-medium text-slate-700">
                    Título
                    <input
                      value={editFollowUpTitle}
                      onChange={(event) =>
                        setEditFollowUpTitle(event.target.value)
                      }
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                    />
                  </label>

                  <label className="block text-sm font-medium text-slate-700">
                    Fecha y hora
                    <input
                      type="datetime-local"
                      value={editFollowUpDueAt}
                      onChange={(event) =>
                        setEditFollowUpDueAt(event.target.value)
                      }
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
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
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Todavía no hay seguimientos asociados a este caso.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {pendingFollowUps.length > 0 ? (
                  <section>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
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
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
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
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-slate-950">Nota interna</h3>

            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="mt-3 min-h-[120px] w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-[#0F4C5C]"
              placeholder="Añadir nota interna..."
            />

            {noteErrorMessage ? (
              <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {noteErrorMessage}
              </div>
            ) : null}

            {noteMessage ? (
              <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {noteMessage}
              </div>
            ) : null}

            <Button
              variant="secondary"
              className="mt-3 w-full"
              onClick={handleSaveNote}
              disabled={isSavingNote}
            >
              {isSavingNote ? "Guardando nota..." : "Guardar nota"}
            </Button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-slate-950">Notas del caso</h3>

            {notes.length === 0 ? (
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Todavía no hay notas internas para este caso.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {notes.map((internalNote) => (
                  <article
                    key={internalNote.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      {internalNote.body}
                    </p>

                    <div className="mt-3 text-xs text-slate-500">
                      {formatDateTime(internalNote.created_at)}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}





