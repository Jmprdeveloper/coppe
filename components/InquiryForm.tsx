"use client";

import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";

import { createClient } from "../lib/supabase/client";

import { Button } from "./Button";
import { PageHeader } from "./PageHeader";

type InquiryFormProps = {
  setActiveView: (view: string) => void;
  openInquiry: (id: string) => void;
};

type CompanyRow = {
  id: string;
  name: string;
};

type CustomerRow = {
  id: string;
};

type CreatedInquiryRow = {
  id: string;
};

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function detectLanguage(message: string) {
  const normalizedMessage = normalizeSearchText(message);

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
    "reservation",
  ];

  const hasEnglishSignals = englishSignals.some((signal) =>
    normalizedMessage.includes(signal)
  );

  return hasEnglishSignals ? "en" : "es";
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

function buildSummary(customerName: string, message: string, category: string) {
  const cleanMessage = message.trim();

  if (category === "cancellation") {
    return `${customerName} solicita cancelar o modificar una reserva.`;
  }

  if (category === "booking") {
    return `${customerName} realiza una consulta relacionada con reserva, disponibilidad o estancia.`;
  }

  if (category === "complaint") {
    return `${customerName} comunica una incidencia o queja que requiere revisión.`;
  }

  if (category === "quote_request") {
    return `${customerName} solicita información de precio o presupuesto.`;
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

function buildMissingInformation(category: string) {
  if (category === "booking") {
    return ["fechas exactas", "número de personas"];
  }

  if (category === "cancellation") {
    return ["número de reserva", "nombre completo de la reserva"];
  }

  if (category === "quote_request") {
    return ["servicio solicitado", "fecha aproximada"];
  }

  return [];
}

function buildRecommendedAction(category: string) {
  const actions: Record<string, string> = {
    cancellation:
      "Responder cuanto antes solicitando los datos necesarios para localizar la reserva.",
    booking:
      "Pedir los datos que falten y revisar disponibilidad antes de confirmar.",
    complaint:
      "Revisar la incidencia internamente y responder con una solución clara.",
    quote_request:
      "Solicitar los detalles necesarios para preparar una propuesta o presupuesto.",
    appointment_request:
      "Confirmar disponibilidad de agenda antes de proponer una hora concreta.",
    general_info:
      "Responder con la información solicitada o pedir aclaración si falta contexto.",
  };

  return actions[category] ?? "Revisar la consulta y responder al cliente.";
}

function buildSuggestedResponse(
  customerName: string,
  companyName: string,
  category: string,
  language: string
) {
  if (language === "en") {
    if (category === "cancellation") {
      return `Hi ${customerName}, thank you for contacting ${companyName}. To help with the cancellation, could you please send us your booking reference or the full name used for the reservation? We will review it as soon as possible.`;
    }

    if (category === "booking") {
      return `Hi ${customerName}, thank you for contacting ${companyName}. To check availability, could you please confirm the exact dates and number of guests? We will review the options and get back to you shortly.`;
    }

    if (category === "complaint") {
      return `Hi ${customerName}, we are sorry to hear about this. We have received your message and will review it internally so we can give you a clear response as soon as possible.`;
    }

    return `Hi ${customerName}, thank you for contacting ${companyName}. We have received your message and will review it shortly so we can give you a clear answer.`;
  }

  if (category === "cancellation") {
    return `Hola ${customerName}, gracias por contactar con ${companyName}. Para poder ayudarte con la cancelación, ¿podrías indicarnos el número de reserva o el nombre completo con el que se realizó? Lo revisaremos lo antes posible.`;
  }

  if (category === "booking") {
    return `Hola ${customerName}, gracias por contactar con ${companyName}. Para poder revisar disponibilidad, ¿podrías indicarnos las fechas exactas y el número de personas? Te responderemos lo antes posible.`;
  }

  if (category === "complaint") {
    return `Hola ${customerName}, sentimos lo ocurrido. Hemos recibido tu mensaje y vamos a revisarlo internamente para darte una respuesta clara lo antes posible.`;
  }

  return `Hola ${customerName}, gracias por contactar con ${companyName}. Hemos recibido tu consulta y la revisaremos para darte una respuesta clara lo antes posible.`;
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

  const handleSubmit = async () => {
    setErrorMessage("");
    setSuccessMessage("");

    const cleanName = customerName.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();
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

    setIsSubmitting(true);

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, name")
      .limit(1)
      .maybeSingle<CompanyRow>();

    if (companyError || !company) {
      setIsSubmitting(false);
      setErrorMessage(
        `No se pudo localizar la empresa del usuario: ${
          companyError?.message || "no hay empresa asociada"
        }`
      );
      return;
    }

    let customerId: string | null = null;

    if (cleanEmail) {
      const { data: existingCustomer, error: existingCustomerError } =
        await supabase
          .from("customers")
          .select("id")
          .eq("company_id", company.id)
          .eq("email", cleanEmail)
          .limit(1)
          .maybeSingle<CustomerRow>();

      if (existingCustomerError) {
        setIsSubmitting(false);
        setErrorMessage(
          `No se pudo comprobar si el cliente ya existía: ${
            existingCustomerError.message || "sin detalle del error"
          }`
        );
        return;
      }

      customerId = existingCustomer?.id ?? null;
    }

    if (!customerId) {
      const { data: existingCustomerByName, error: existingCustomerByNameError } =
        await supabase
          .from("customers")
          .select("id")
          .eq("company_id", company.id)
          .eq("name", cleanName)
          .limit(1)
          .maybeSingle<CustomerRow>();

      if (existingCustomerByNameError) {
        setIsSubmitting(false);
        setErrorMessage(
          `No se pudo comprobar el cliente por nombre: ${
            existingCustomerByNameError.message || "sin detalle del error"
          }`
        );
        return;
      }

      customerId = existingCustomerByName?.id ?? null;
    }

    if (customerId) {
      const { error: updateCustomerError } = await supabase
        .from("customers")
        .update({
          name: cleanName,
          email: cleanEmail || null,
          phone: cleanPhone || null,
          language: detectLanguage(cleanMessage),
          status: "active",
          last_interaction_at: new Date().toISOString(),
        })
        .eq("id", customerId);

      if (updateCustomerError) {
        setIsSubmitting(false);
        setErrorMessage(
          `No se pudo actualizar el cliente: ${
            updateCustomerError.message || "sin detalle del error"
          }`
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
          phone: cleanPhone || null,
          language: detectLanguage(cleanMessage),
          status: "active",
          last_interaction_at: new Date().toISOString(),
        })
        .select("id")
        .single<CustomerRow>();

      if (createCustomerError || !newCustomer) {
        setIsSubmitting(false);
        setErrorMessage(
          `No se pudo crear el cliente: ${
            createCustomerError?.message || "sin detalle del error"
          }`
        );
        return;
      }

      customerId = newCustomer.id;
    }

    const category = inferCategory(cleanMessage);
    const priority = inferPriority(category, cleanMessage);
    const language = detectLanguage(cleanMessage);
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
        ai_summary: buildSummary(cleanName, cleanMessage, category),
        ai_intent: buildIntent(category),
        ai_category: category,
        ai_priority: priority,
        ai_language: language,
        sentiment: "neutral",
        missing_information: buildMissingInformation(category),
        recommended_action: buildRecommendedAction(category),
        suggested_response: buildSuggestedResponse(
          cleanName,
          company.name,
          category,
          language
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

            <Button
              className="mt-5"
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              <Sparkles size={16} />
              {isSubmitting ? "Creando consulta..." : "Crear consulta"}
            </Button>
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

              <Button
                variant="ghost"
                onClick={() => {
                  setCreatedInquiryId(null);
                  setSuccessMessage("");
                  setErrorMessage("");
                  setCustomerName("");
                  setEmail("");
                  setPhone("");
                  setSourceChannel("");
                  setMessage("");
                }}
              >
                Crear otra consulta
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}