"use client";

import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";

import { getCurrentCompany, type CurrentCompany } from "../lib/currentCompany";
import {
  getCustomerDatabaseErrorMessage,
  isValidEmail,
  isValidPhone,
  normalizePhoneForComparison,
} from "../lib/customerValidation";
import { normalizeSearchText } from "../lib/searchUtils";
import { createClient } from "../lib/supabase/client";

import { Button } from "./Button";
import { PageHeader } from "./PageHeader";

type InquiryFormProps = {
  setActiveView: (view: string) => void;
  openInquiry: (id: string) => void;
};

type CustomerRow = {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
};

type CreatedInquiryRow = {
  id: string;
};

type MessageLanguage = "es" | "en";

type ResponseTone =
  | "profesional y cercano"
  | "formal"
  | "directo"
  | "amable y detallado";

type CompanyContext = {
  name: string;
  sector: string;
  description: string;
  tone: ResponseTone;
  language: MessageLanguage;
};

function normalizeCompanyLanguage(
  value: string | null | undefined
): MessageLanguage {
  const normalizedValue = normalizeSearchText(value);

  if (
    normalizedValue === "en" ||
    normalizedValue === "english" ||
    normalizedValue === "ingles" ||
    normalizedValue === "inglés"
  ) {
    return "en";
  }

  return "es";
}

function normalizeResponseTone(
  value: string | null | undefined
): ResponseTone {
  const normalizedValue = normalizeSearchText(value);

  if (normalizedValue === "formal") {
    return "formal";
  }

  if (normalizedValue === "directo") {
    return "directo";
  }

  if (
    normalizedValue === "amable y detallado" ||
    normalizedValue === "amable detallado"
  ) {
    return "amable y detallado";
  }

  return "profesional y cercano";
}

function buildCompanyContext(company: CurrentCompany): CompanyContext {
  return {
    name: company.name?.trim() || "la empresa",
    sector: company.sector?.trim() || "servicios profesionales",
    description: company.description?.trim() || "",
    tone: normalizeResponseTone(company.tone),
    language: normalizeCompanyLanguage(company.language),
  };
}

function includesSignal(normalizedMessage: string, signal: string) {
  if (signal.length <= 3) {
    return new RegExp(`\\b${signal}\\b`).test(normalizedMessage);
  }

  return normalizedMessage.includes(signal);
}

function detectLanguage(
  message: string,
  fallbackLanguage: string | null | undefined = "es"
): MessageLanguage {
  const normalizedMessage = normalizeSearchText(message);
  const normalizedFallbackLanguage = normalizeCompanyLanguage(fallbackLanguage);

  const englishSignals = [
    "hello",
    "hi",
    "booking",
    "check in",
    "check-in",
    "parking",
    "available",
    "availability",
    "flight",
    "arrive",
    "arrival",
    "reservation",
    "guest",
    "guests",
    "room",
    "price",
    "quote",
    "appointment",
    "cancel",
    "cancellation",
    "complaint",
    "problem",
    "thank you",
    "thanks",
  ];

  const spanishSignals = [
    "hola",
    "buenos dias",
    "buenas tardes",
    "buenas noches",
    "reserva",
    "disponibilidad",
    "habitacion",
    "habitación",
    "aparcamiento",
    "parking",
    "llegada",
    "vuelo",
    "huesped",
    "huespedes",
    "huésped",
    "huéspedes",
    "persona",
    "personas",
    "precio",
    "presupuesto",
    "cita",
    "cancelar",
    "cancelacion",
    "cancelación",
    "queja",
    "reclamacion",
    "reclamación",
    "problema",
    "gracias",
  ];

  const englishSignalCount = englishSignals.filter((signal) =>
    includesSignal(normalizedMessage, signal)
  ).length;

  const spanishSignalCount = spanishSignals.filter((signal) =>
    includesSignal(normalizedMessage, signal)
  ).length;

  if (englishSignalCount > spanishSignalCount) {
    return "en";
  }

  if (spanishSignalCount > englishSignalCount) {
    return "es";
  }

  return normalizedFallbackLanguage;
}

function inferCategory(message: string) {
  const normalizedMessage = normalizeSearchText(message);

  if (
    normalizedMessage.includes("cancel") ||
    normalizedMessage.includes("cancelar") ||
    normalizedMessage.includes("cancelacion")
  ) {
    return "cancellation";
  }

  if (
    normalizedMessage.includes("queja") ||
    normalizedMessage.includes("reclamacion") ||
    normalizedMessage.includes("complaint") ||
    normalizedMessage.includes("problema")
  ) {
    return "complaint";
  }

  if (
    normalizedMessage.includes("presupuesto") ||
    normalizedMessage.includes("precio") ||
    normalizedMessage.includes("quote") ||
    normalizedMessage.includes("budget")
  ) {
    return "quote_request";
  }

  if (
    normalizedMessage.includes("cita") ||
    normalizedMessage.includes("appointment")
  ) {
    return "appointment_request";
  }

  if (
    normalizedMessage.includes("reserva") ||
    normalizedMessage.includes("habitacion") ||
    normalizedMessage.includes("habitación") ||
    normalizedMessage.includes("booking") ||
    normalizedMessage.includes("availability") ||
    normalizedMessage.includes("disponibilidad") ||
    normalizedMessage.includes("check in") ||
    normalizedMessage.includes("check-in")
  ) {
    return "booking";
  }

  return "general_info";
}

function inferPriority(category: string, message: string) {
  const normalizedMessage = normalizeSearchText(message);

  if (
    category === "cancellation" ||
    category === "complaint" ||
    normalizedMessage.includes("urgente") ||
    normalizedMessage.includes("urgent") ||
    normalizedMessage.includes("mañana") ||
    normalizedMessage.includes("tomorrow")
  ) {
    return "high";
  }

  return "medium";
}

function buildSummary(
  customerName: string,
  message: string,
  category: string,
  company: CurrentCompany
) {
  const cleanMessage = message.trim();
  const companyContext = buildCompanyContext(company);
  const sectorContext = companyContext.sector
    ? ` en el sector ${companyContext.sector}`
    : "";

  if (category === "cancellation") {
    return `${customerName} solicita cancelar o modificar una reserva${sectorContext}.`;
  }

  if (category === "booking") {
    return `${customerName} realiza una consulta relacionada con reserva, disponibilidad o estancia${sectorContext}.`;
  }

  if (category === "complaint") {
    return `${customerName} comunica una incidencia o queja que requiere revisión por parte de ${companyContext.name}.`;
  }

  if (category === "quote_request") {
    return `${customerName} solicita información de precio o presupuesto para un servicio de ${companyContext.name}.`;
  }

  if (category === "appointment_request") {
    return `${customerName} solicita una cita o confirmación de disponibilidad de agenda con ${companyContext.name}.`;
  }

  if (companyContext.description) {
    return `${customerName} realiza una consulta para ${companyContext.name}, empresa de ${companyContext.sector}. Mensaje: ${
      cleanMessage.length <= 140 ? cleanMessage : `${cleanMessage.slice(0, 137)}...`
    }`;
  }

  if (cleanMessage.length <= 180) {
    return cleanMessage;
  }

  return `${cleanMessage.slice(0, 177)}...`;
}

function buildIntent(category: string) {
  const intents: Record<string, string> = {
    cancellation: "Gestionar cancelación o modificación de reserva",
    booking: "Consultar disponibilidad o información de reserva",
    complaint: "Comunicar incidencia o queja",
    quote_request: "Solicitar precio o presupuesto",
    appointment_request: "Solicitar cita",
    general_info: "Solicitar información general",
  };

  return intents[category] ?? "Solicitar información";
}

function hasDateSignal(normalizedMessage: string) {
  const dateSignals = [
    "hoy",
    "mañana",
    "manana",
    "pasado",
    "semana",
    "finde",
    "fin de semana",
    "lunes",
    "martes",
    "miercoles",
    "miércoles",
    "jueves",
    "viernes",
    "sabado",
    "sábado",
    "domingo",
    "today",
    "tomorrow",
    "weekend",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];

  return (
    dateSignals.some((signal) => normalizedMessage.includes(signal)) ||
    /\b\d{1,2}[/-]\d{1,2}/.test(normalizedMessage)
  );
}

function hasPeopleSignal(normalizedMessage: string) {
  return (
    normalizedMessage.includes("persona") ||
    normalizedMessage.includes("personas") ||
    normalizedMessage.includes("huesped") ||
    normalizedMessage.includes("huespedes") ||
    normalizedMessage.includes("huésped") ||
    normalizedMessage.includes("huéspedes") ||
    normalizedMessage.includes("guest") ||
    normalizedMessage.includes("guests") ||
    normalizedMessage.includes("people") ||
    normalizedMessage.includes("pax") ||
    /\b\d+\s*(persona|personas|huesped|huespedes|guest|guests|people|pax)\b/.test(
      normalizedMessage
    )
  );
}

function hasReservationReference(normalizedMessage: string) {
  return (
    normalizedMessage.includes("numero de reserva") ||
    normalizedMessage.includes("número de reserva") ||
    normalizedMessage.includes("referencia") ||
    normalizedMessage.includes("localizador") ||
    normalizedMessage.includes("booking reference") ||
    normalizedMessage.includes("reservation number")
  );
}

function buildMissingInformation(category: string, originalMessage: string) {
  const normalizedMessage = normalizeSearchText(originalMessage);

  if (category === "booking") {
    const missingInformation: string[] = [];

    if (!hasDateSignal(normalizedMessage)) {
      missingInformation.push("fechas exactas");
    }

    if (!hasPeopleSignal(normalizedMessage)) {
      missingInformation.push("número de personas");
    }

    return missingInformation;
  }

  if (category === "cancellation") {
    if (hasReservationReference(normalizedMessage)) {
      return [];
    }

    return ["número de reserva", "nombre completo de la reserva"];
  }

  if (category === "quote_request") {
    return ["servicio solicitado", "fecha aproximada"];
  }

  return [];
}

function buildRecommendedAction(
  category: string,
  originalMessage: string,
  company: CurrentCompany
) {
  const normalizedMessage = normalizeSearchText(originalMessage);
  const companyContext = buildCompanyContext(company);

  if (category === "cancellation") {
    if (hasReservationReference(normalizedMessage)) {
      return `Revisar la reserva indicada en ${companyContext.name} y responder al cliente con los siguientes pasos.`;
    }

    return "Solicitar el número de reserva o el nombre completo de la reserva antes de gestionar la cancelación.";
  }

  if (category === "booking") {
    const missingInformation = buildMissingInformation(category, originalMessage);

    if (missingInformation.length === 0) {
      return `Revisar disponibilidad según la operativa de ${companyContext.name} y responder al cliente con una confirmación o alternativa.`;
    }

    return "Solicitar los datos que faltan y revisar disponibilidad antes de confirmar.";
  }

  if (category === "complaint") {
    return `Revisar la incidencia internamente teniendo en cuenta el servicio de ${companyContext.sector} y responder con una solución clara.`;
  }

  if (category === "quote_request") {
    if (companyContext.description) {
      return `Revisar la solicitud según los servicios descritos por la empresa y pedir cualquier dato necesario antes de preparar una propuesta o presupuesto.`;
    }

    return "Revisar la solicitud y pedir cualquier dato necesario antes de preparar una propuesta o presupuesto.";
  }

  if (category === "appointment_request") {
    return "Confirmar disponibilidad de agenda antes de proponer una hora concreta.";
  }

  if (category === "general_info") {
    return `Responder con información coherente con la actividad de ${companyContext.name} o pedir aclaración si falta contexto.`;
  }

  return "Revisar la consulta y responder al cliente.";
}

function formatList(items: string[], language: MessageLanguage) {
  if (items.length === 0) {
    return "";
  }

  if (items.length === 1) {
    return items[0];
  }

  const separator = language === "en" ? " and " : " y ";

  return `${items.slice(0, -1).join(", ")}${separator}${
    items[items.length - 1]
  }`;
}

function getSpanishGreeting(customerName: string, tone: ResponseTone) {
  if (tone === "formal") {
    return `Estimado/a ${customerName}`;
  }

  if (tone === "directo") {
    return `Hola ${customerName}`;
  }

  return `Hola ${customerName}`;
}

function getEnglishGreeting(customerName: string, tone: ResponseTone) {
  if (tone === "formal") {
    return `Dear ${customerName}`;
  }

  if (tone === "directo") {
    return `Hi ${customerName}`;
  }

  return `Hi ${customerName}`;
}

function buildSpanishResponse(
  customerName: string,
  company: CurrentCompany,
  category: string,
  originalMessage: string
) {
  const companyContext = buildCompanyContext(company);
  const normalizedMessage = normalizeSearchText(originalMessage);

  const greeting = getSpanishGreeting(customerName, companyContext.tone);
  const hasDates = hasDateSignal(normalizedMessage);
  const hasPeople = hasPeopleSignal(normalizedMessage);
  const hasReservationData = hasReservationReference(normalizedMessage);

  const companyDescriptionContext = companyContext.description
    ? ` Tendremos en cuenta la información de nuestra empresa para darte una respuesta adecuada.`
    : "";

  if (category === "cancellation") {
    if (hasReservationData) {
      if (companyContext.tone === "directo") {
        return `${greeting}, gracias por contactar con ${companyContext.name}. Hemos recibido tu solicitud de cancelación y revisaremos los datos de la reserva. Te responderemos con los siguientes pasos.`;
      }

      return `${greeting}, gracias por contactar con ${companyContext.name}. Hemos recibido tu solicitud de cancelación y revisaremos los datos de la reserva que nos has enviado. Te responderemos lo antes posible con los siguientes pasos.`;
    }

    return `${greeting}, gracias por contactar con ${companyContext.name}. Para poder ayudarte con la cancelación, ¿podrías indicarnos el número de reserva o el nombre completo con el que se realizó? Lo revisaremos lo antes posible.`;
  }

  if (category === "booking") {
    const missingDetails: string[] = [];

    if (!hasDates) {
      missingDetails.push("las fechas exactas");
    }

    if (!hasPeople) {
      missingDetails.push("el número de personas");
    }

    if (missingDetails.length > 0) {
      return `${greeting}, gracias por contactar con ${companyContext.name}. Para poder revisar disponibilidad, ¿podrías indicarnos ${formatList(
        missingDetails,
        "es"
      )}? Te responderemos lo antes posible.`;
    }

    return `${greeting}, gracias por contactar con ${companyContext.name}. Hemos recibido tu solicitud de disponibilidad y vamos a revisar la información que nos has enviado. Te responderemos lo antes posible con una respuesta clara.`;
  }

  if (category === "complaint") {
    if (companyContext.tone === "formal") {
      return `${greeting}, sentimos lo ocurrido. Gracias por informar a ${companyContext.name}. Hemos recibido tu mensaje y lo revisaremos internamente para ofrecerte una respuesta clara lo antes posible.`;
    }

    return `${greeting}, sentimos lo ocurrido. Gracias por informar a ${companyContext.name}. Hemos recibido tu mensaje y vamos a revisarlo internamente para darte una respuesta clara lo antes posible.`;
  }

  if (category === "quote_request") {
    if (companyContext.tone === "directo") {
      return `${greeting}, gracias por contactar con ${companyContext.name}. Hemos recibido tu solicitud y revisaremos los detalles para darte una respuesta clara.`;
    }

    return `${greeting}, gracias por contactar con ${companyContext.name}. Hemos recibido tu solicitud y vamos a revisar los detalles para poder darte una respuesta clara.${companyDescriptionContext} Si necesitamos algún dato adicional, te lo indicaremos lo antes posible.`;
  }

  if (category === "appointment_request") {
    return `${greeting}, gracias por contactar con ${companyContext.name}. Hemos recibido tu solicitud de cita y revisaremos la disponibilidad de agenda antes de confirmarte la mejor opción.`;
  }

  if (companyContext.tone === "amable y detallado") {
    return `${greeting}, gracias por contactar con ${companyContext.name}. Hemos recibido tu consulta y la revisaremos con detalle para darte una respuesta clara y adaptada a lo que necesitas.`;
  }

  if (companyContext.tone === "directo") {
    return `${greeting}, gracias por contactar con ${companyContext.name}. Hemos recibido tu consulta y la revisaremos para responderte cuanto antes.`;
  }

  return `${greeting}, gracias por contactar con ${companyContext.name}. Hemos recibido tu consulta y la revisaremos para darte una respuesta clara lo antes posible.`;
}

function buildEnglishResponse(
  customerName: string,
  company: CurrentCompany,
  category: string,
  originalMessage: string
) {
  const companyContext = buildCompanyContext(company);
  const normalizedMessage = normalizeSearchText(originalMessage);

  const greeting = getEnglishGreeting(customerName, companyContext.tone);
  const hasDates = hasDateSignal(normalizedMessage);
  const hasPeople = hasPeopleSignal(normalizedMessage);
  const hasReservationData = hasReservationReference(normalizedMessage);

  const companyDescriptionContext = companyContext.description
    ? " We will take our company information into account so we can give you an appropriate answer."
    : "";

  if (category === "cancellation") {
    if (hasReservationData) {
      if (companyContext.tone === "directo") {
        return `${greeting}, thank you for contacting ${companyContext.name}. We have received your cancellation request and will review the booking details. We will get back to you with the next steps.`;
      }

      return `${greeting}, thank you for contacting ${companyContext.name}. We have received your cancellation request and will review the booking details you have sent us. We will get back to you as soon as possible with the next steps.`;
    }

    return `${greeting}, thank you for contacting ${companyContext.name}. To help with the cancellation, could you please send us your booking reference or the full name used for the reservation? We will review it as soon as possible.`;
  }

  if (category === "booking") {
    const missingDetails: string[] = [];

    if (!hasDates) {
      missingDetails.push("the exact dates");
    }

    if (!hasPeople) {
      missingDetails.push("the number of guests");
    }

    if (missingDetails.length > 0) {
      return `${greeting}, thank you for contacting ${companyContext.name}. To check availability, could you please confirm ${formatList(
        missingDetails,
        "en"
      )}? We will review the options and get back to you shortly.`;
    }

    return `${greeting}, thank you for contacting ${companyContext.name}. We have received your availability request and will review the information you have sent us. We will get back to you shortly with a clear answer.`;
  }

  if (category === "complaint") {
    if (companyContext.tone === "formal") {
      return `${greeting}, we are sorry to hear about this. Thank you for letting ${companyContext.name} know. We have received your message and will review it internally so we can provide a clear response as soon as possible.`;
    }

    return `${greeting}, we are sorry to hear about this. Thank you for letting ${companyContext.name} know. We have received your message and will review it internally so we can give you a clear response as soon as possible.`;
  }

  if (category === "quote_request") {
    if (companyContext.tone === "directo") {
      return `${greeting}, thank you for contacting ${companyContext.name}. We have received your request and will review the details so we can give you a clear answer.`;
    }

    return `${greeting}, thank you for contacting ${companyContext.name}. We have received your request and will review the details so we can prepare a clear response.${companyDescriptionContext} If we need any additional information, we will let you know shortly.`;
  }

  if (category === "appointment_request") {
    return `${greeting}, thank you for contacting ${companyContext.name}. We have received your appointment request and will check our availability before confirming the best option for you.`;
  }

  if (companyContext.tone === "amable y detallado") {
    return `${greeting}, thank you for contacting ${companyContext.name}. We have received your message and will review it carefully so we can give you a clear answer adapted to your request.`;
  }

  if (companyContext.tone === "directo") {
    return `${greeting}, thank you for contacting ${companyContext.name}. We have received your message and will review it so we can reply shortly.`;
  }

  return `${greeting}, thank you for contacting ${companyContext.name}. We have received your message and will review it shortly so we can give you a clear answer.`;
}

function buildSuggestedResponse(
  customerName: string,
  company: CurrentCompany,
  category: string,
  language: MessageLanguage,
  originalMessage: string
) {
  if (language === "en") {
    return buildEnglishResponse(customerName, company, category, originalMessage);
  }

  return buildSpanishResponse(customerName, company, category, originalMessage);
}

function buildSubject(message: string, fallbackCategory: string) {
  const cleanMessage = message.trim();

  if (cleanMessage.length > 0) {
    const firstLine = cleanMessage.split("\n")[0].trim();

    if (firstLine.length <= 70) {
      return firstLine;
    }

    return `${firstLine.slice(0, 67)}...`;
  }

  const subjects: Record<string, string> = {
    cancellation: "Solicitud de cancelación",
    booking: "Consulta de reserva",
    complaint: "Incidencia de cliente",
    quote_request: "Solicitud de presupuesto",
    appointment_request: "Solicitud de cita",
    general_info: "Consulta general",
  };

  return subjects[fallbackCategory] ?? "Nueva consulta";
}

export function InquiryForm({ setActiveView, openInquiry }: InquiryFormProps) {
  const supabase = useMemo(() => createClient(), []);

  const [customerName, setCustomerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [sourceChannel, setSourceChannel] = useState("");
  const [message, setMessage] = useState("");

  const [createdInquiryId, setCreatedInquiryId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const resetForm = () => {
    setCreatedInquiryId(null);
    setSuccessMessage("");
    setErrorMessage("");
    setCustomerName("");
    setEmail("");
    setPhone("");
    setSourceChannel("");
    setMessage("");
  };

  const handleSubmit = async () => {
    setErrorMessage("");
    setSuccessMessage("");

    const cleanName = customerName.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();
    const normalizedPhone = normalizePhoneForComparison(cleanPhone);
    const cleanSourceChannel = sourceChannel.trim() || "form";
    const cleanMessage = message.trim();

    if (!cleanName) {
      setErrorMessage("El nombre del cliente es obligatorio.");
      return;
    }

    if (!cleanMessage) {
      setErrorMessage("El mensaje de la consulta es obligatorio.");
      return;
    }

    if (cleanEmail && !isValidEmail(cleanEmail)) {
      setErrorMessage("Introduce un email válido.");
      return;
    }

    if (cleanPhone && !isValidPhone(cleanPhone)) {
      setErrorMessage("Introduce un teléfono válido.");
      return;
    }

    if (!cleanEmail && !cleanPhone) {
      setErrorMessage("Introduce al menos un email o un teléfono de contacto.");
      return;
    }

    setIsSubmitting(true);

    const { data: company, error: companyError } =
      await getCurrentCompany(supabase);

    if (companyError || !company) {
      setIsSubmitting(false);
      setErrorMessage(
        `No se pudo localizar la empresa del usuario: ${
          companyError?.message || "no hay empresa asociada"
        }`
      );
      return;
    }

    const language = detectLanguage(cleanMessage, company.language);

    let customerId: string | null = null;
    let customerByEmail: CustomerRow | null = null;
    let customerByPhone: CustomerRow | null = null;

    if (cleanEmail) {
      const { data: existingCustomer, error: existingCustomerError } =
        await supabase
          .from("customers")
          .select("id, name, email, phone")
          .eq("company_id", company.id)
          .eq("email", cleanEmail)
          .limit(1)
          .maybeSingle<CustomerRow>();

      if (existingCustomerError) {
        setIsSubmitting(false);
        setErrorMessage(
          `No se pudo comprobar si el cliente ya existía por email: ${
            existingCustomerError.message || "sin detalle del error"
          }`
        );
        return;
      }

      customerByEmail = existingCustomer ?? null;
    }

    if (normalizedPhone) {
      const { data: customersWithPhone, error: customersWithPhoneError } =
        await supabase
          .from("customers")
          .select("id, name, email, phone")
          .eq("company_id", company.id)
          .not("phone", "is", null);

      if (customersWithPhoneError) {
        setIsSubmitting(false);
        setErrorMessage(
          `No se pudo comprobar si el cliente ya existía por teléfono: ${
            customersWithPhoneError.message || "sin detalle del error"
          }`
        );
        return;
      }

      const matchingCustomersByPhone =
        customersWithPhone?.filter(
          (customer) =>
            normalizePhoneForComparison(customer.phone ?? "") ===
            normalizedPhone
        ) ?? [];

      if (matchingCustomersByPhone.length > 1) {
        setIsSubmitting(false);
        setErrorMessage(
          "Ya existen varios clientes con ese mismo teléfono. Revisa la ficha de clientes antes de crear una nueva consulta."
        );
        return;
      }

      customerByPhone = matchingCustomersByPhone[0] ?? null;
    }

    if (
      customerByEmail &&
      customerByPhone &&
      customerByEmail.id !== customerByPhone.id
    ) {
      setIsSubmitting(false);
      setErrorMessage(
        "El email y el teléfono introducidos pertenecen a clientes distintos. Revisa los datos antes de crear la consulta."
      );
      return;
    }

    customerId = customerByEmail?.id ?? customerByPhone?.id ?? null;

    if (customerId) {
      const customerUpdate: {
        email?: string;
        phone?: string;
        language: string;
        status: string;
        last_interaction_at: string;
      } = {
        language,
        status: "active",
        last_interaction_at: new Date().toISOString(),
      };

      if (cleanEmail) {
        customerUpdate.email = cleanEmail;
      }

      if (normalizedPhone) {
        customerUpdate.phone = normalizedPhone;
      }

      const { error: updateCustomerError } = await supabase
        .from("customers")
        .update(customerUpdate)
        .eq("id", customerId);

      if (updateCustomerError) {
        setIsSubmitting(false);
        setErrorMessage(
          `No se pudo actualizar el cliente: ${getCustomerDatabaseErrorMessage(
            updateCustomerError.message
          )}`
        );
        return;
      }
    } else {
      const { data: newCustomer, error: createCustomerError } = await supabase
        .from("customers")
        .insert({
          company_id: company.id,
          name: cleanName,
          email: cleanEmail || null,
          phone: normalizedPhone || null,
          language,
          status: "active",
          last_interaction_at: new Date().toISOString(),
        })
        .select("id")
        .single<CustomerRow>();

      if (createCustomerError || !newCustomer) {
        setIsSubmitting(false);
        setErrorMessage(
          `No se pudo crear el cliente: ${getCustomerDatabaseErrorMessage(
            createCustomerError?.message ?? ""
          )}`
        );
        return;
      }

      customerId = newCustomer.id;
    }

    const category = inferCategory(cleanMessage);
    const priority = inferPriority(category, cleanMessage);
    const subject = buildSubject(cleanMessage, category);

    const { data: createdInquiry, error: createInquiryError } = await supabase
      .from("inquiries")
      .insert({
        company_id: company.id,
        customer_id: customerId,
        customer_name: cleanName,
        source_channel: cleanSourceChannel,
        subject,
        original_message: cleanMessage,
        ai_summary: buildSummary(cleanName, cleanMessage, category, company),
        ai_intent: buildIntent(category),
        ai_category: category,
        ai_priority: priority,
        ai_language: language,
        sentiment: "neutral",
        missing_information: buildMissingInformation(category, cleanMessage),
        recommended_action: buildRecommendedAction(
          category,
          cleanMessage,
          company
        ),
        suggested_response: buildSuggestedResponse(
          cleanName,
          company,
          category,
          language,
          cleanMessage
        ),
        status: "new",
      })
      .select("id")
      .single<CreatedInquiryRow>();

    setIsSubmitting(false);

    if (createInquiryError || !createdInquiry) {
      setErrorMessage(
        `No se pudo crear la consulta: ${
          createInquiryError?.message || "sin detalle del error"
        }`
      );
      return;
    }

    setCreatedInquiryId(createdInquiry.id);
    setSuccessMessage("Consulta creada correctamente.");
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Nueva consulta"
        description="Registra una consulta recibida desde una web, formulario o canal externo."
      />

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        {!createdInquiryId ? (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                Nombre
                <input
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                  placeholder="Nombre del cliente"
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Email
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                  placeholder="cliente@email.com"
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Teléfono
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                  placeholder="+34 600 000 000"
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Canal
                <input
                  value={sourceChannel}
                  onChange={(event) => setSourceChannel(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                  placeholder="Formulario web, email, WhatsApp..."
                />
              </label>

              <label className="text-sm font-medium text-slate-700 md:col-span-2">
                Mensaje
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  className="mt-1 min-h-[140px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                  placeholder="Pega aquí el mensaje recibido del cliente..."
                />
              </label>
            </div>

            {errorMessage ? (
              <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                <Sparkles size={16} />
                {isSubmitting ? "Creando consulta..." : "Crear consulta"}
              </Button>

              <Button
                variant="secondary"
                onClick={resetForm}
                disabled={isSubmitting}
              >
                Limpiar formulario
              </Button>
            </div>
          </>
        ) : (
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-[#E6F3F6] text-[#0F4C5C]">
              <Sparkles />
            </div>

            <h2 className="mt-4 text-xl font-bold text-slate-950">
              Consulta creada
            </h2>

            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
              {successMessage ||
                "COPPE ha registrado la consulta y ha generado una clasificación inicial."}
            </p>

            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button onClick={() => openInquiry(createdInquiryId)}>
                Ver consulta analizada
              </Button>

              <Button
                variant="secondary"
                onClick={() => setActiveView("dashboard")}
              >
                Ir al dashboard
              </Button>

              <Button variant="ghost" onClick={resetForm}>
                Crear otra consulta
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}