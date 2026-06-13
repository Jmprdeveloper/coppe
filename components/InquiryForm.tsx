"use client";

import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";

import { getCurrentCompany } from "../lib/currentCompany";
import {
  getCustomerDatabaseErrorMessage,
  isValidEmail,
  isValidPhone,
  normalizePhoneForComparison,
} from "../lib/customerValidation";
import { type AnalyzeInquiryResponse } from "../lib/inquiryAnalysisApi";
import { MAX_ANALYSIS_MESSAGE_LENGTH } from "../lib/inquiryAnalysisLimits";
import { createClient } from "../lib/supabase/client";
import { sourceChannelOptions } from "../lib/sourceChannels";

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
      : "No se pudo analizar el mensaje antes de guardarlo.";

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

export function InquiryForm({ setActiveView, openInquiry }: InquiryFormProps) {
  const supabase = useMemo(() => createClient(), []);

  const [customerName, setCustomerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [sourceChannel, setSourceChannel] = useState("Email");
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
    setSourceChannel("Email");
    setMessage("");
  };

  const handleSubmit = async () => {
    setErrorMessage("");
    setSuccessMessage("");

    const cleanName = customerName.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();
    const normalizedPhone = normalizePhoneForComparison(cleanPhone);
    const cleanSourceChannel = sourceChannel.trim() || "Email";
    const cleanMessage = message.trim();

    if (!cleanName) {
      setErrorMessage("El nombre del cliente es obligatorio.");
      return;
    }

    if (!cleanMessage) {
      setErrorMessage("El mensaje recibido es obligatorio.");
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

    const {
      analysis: inquiryAnalysis,
      errorMessage: analysisErrorMessage,
    } = await requestInquiryAnalysis(cleanName, cleanMessage);

    if (!inquiryAnalysis) {
      setIsSubmitting(false);
      setErrorMessage(analysisErrorMessage);
      return;
    }

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
          "Ya existen varios clientes con ese mismo teléfono. Revisa la ficha de clientes antes de registrar un nuevo caso."
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
        "El email y el teléfono introducidos pertenecen a clientes distintos. Revisa los datos antes de registrar el caso."
      );
      return;
    }

    customerId = customerByEmail?.id ?? customerByPhone?.id ?? null;

    if (customerId) {
      const customerUpdate: {
        language: string;
        status: string;
        last_interaction_at: string;
      } = {
        language: inquiryAnalysis.language,
        status: "active",
        last_interaction_at: new Date().toISOString(),
      };

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
          language: inquiryAnalysis.language,
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

    const { data: createdInquiry, error: createInquiryError } = await supabase
      .from("inquiries")
      .insert({
        company_id: company.id,
        customer_id: customerId,
        customer_name: cleanName,
        source_channel: cleanSourceChannel,
        subject: inquiryAnalysis.subject,
        original_message: cleanMessage,
        ai_summary: inquiryAnalysis.summary,
        ai_intent: inquiryAnalysis.intent,
        ai_category: inquiryAnalysis.category,
        ai_priority: inquiryAnalysis.priority,
        ai_language: inquiryAnalysis.language,
        sentiment: inquiryAnalysis.sentiment,
        missing_information: inquiryAnalysis.missingInformation,
        recommended_action: inquiryAnalysis.recommendedAction,
        suggested_response: inquiryAnalysis.suggestedResponse,
        status: "new",
      })
      .select("id")
      .single<CreatedInquiryRow>();

    if (createInquiryError || !createdInquiry) {
      setIsSubmitting(false);
      setErrorMessage(
        `No se pudo crear el caso: ${
          createInquiryError?.message || "sin detalle del error"
        }`
      );
      return;
    }

    const { error: createInitialMessageError } = await supabase
      .from("inquiry_messages")
      .insert({
        company_id: company.id,
        inquiry_id: createdInquiry.id,
        customer_id: customerId,
        direction: "inbound",
        author_type: "customer",
        body: cleanMessage,
        source_channel: cleanSourceChannel,
      });

    setIsSubmitting(false);
    setCreatedInquiryId(createdInquiry.id);

    if (createInitialMessageError) {
      setSuccessMessage(
        `Caso creado, pero no se pudo guardar el mensaje inicial en el historial del caso: ${
          createInitialMessageError.message || "sin detalle del error"
        }`
      );
      return;
    }

    setSuccessMessage("Caso creado correctamente.");
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Registrar mensaje"
        description="Registra un mensaje recibido de un cliente para que COPPE lo convierta en un caso de atención."
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
                <select
                  value={sourceChannel}
                  onChange={(event) => setSourceChannel(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                >
                  {sourceChannelOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-medium text-slate-700 md:col-span-2">
                Mensaje
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  maxLength={MAX_ANALYSIS_MESSAGE_LENGTH}
                  className="mt-1 min-h-[140px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                  placeholder="Pega aquí el mensaje recibido del cliente..."
                />

                <p className="mt-1 text-right text-xs text-slate-500">
                  {message.length}/{MAX_ANALYSIS_MESSAGE_LENGTH} caracteres
                </p>
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
                {isSubmitting ? "Registrando mensaje..." : "Registrar mensaje"}
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
              Caso creado
            </h2>

            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
              {successMessage ||
                "COPPE ha registrado el mensaje, ha creado el caso y ha generado una clasificación inicial."}
            </p>

            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button onClick={() => openInquiry(createdInquiryId)}>
                Ver caso analizado
              </Button>

              <Button
                variant="secondary"
                onClick={() => setActiveView("dashboard")}
              >
                Ir al dashboard
              </Button>

              <Button variant="ghost" onClick={resetForm}>
                Registrar otro mensaje
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}