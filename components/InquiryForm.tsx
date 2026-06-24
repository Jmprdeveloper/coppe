"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles, X } from "lucide-react";

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

type InquiryFormProps = {
  setActiveView: (view: string) => void;
  openInquiry: (id: string) => void;
  onClose: () => void;
};

type CustomerRow = {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
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

export function InquiryForm({
  setActiveView,
  openInquiry,
  onClose,
}: InquiryFormProps) {
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

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmitting) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSubmitting, onClose]);

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

    if (!customerId) {
      setIsSubmitting(false);
      setErrorMessage("No se pudo resolver el cliente antes de crear el caso.");
      return;
    }

    const { data: createdInquiryIdFromRpc, error: createInquiryError } =
      await supabase.rpc("create_inquiry_with_initial_message", {
        p_company_id: company.id,
        p_customer_id: customerId,
        p_customer_name: cleanName,
        p_source_channel: cleanSourceChannel,
        p_subject: inquiryAnalysis.subject,
        p_original_message: cleanMessage,
        p_ai_summary: inquiryAnalysis.summary,
        p_ai_intent: inquiryAnalysis.intent,
        p_ai_category: inquiryAnalysis.category,
        p_ai_priority: inquiryAnalysis.priority,
        p_ai_language: inquiryAnalysis.language,
        p_sentiment: inquiryAnalysis.sentiment,
        p_missing_information: inquiryAnalysis.missingInformation,
        p_recommended_action: inquiryAnalysis.recommendedAction,
        p_suggested_response: inquiryAnalysis.suggestedResponse,
        p_status: "new",
        p_message_direction: "inbound",
        p_message_author_type: "customer",
      });

    if (createInquiryError || !createdInquiryIdFromRpc) {
      setIsSubmitting(false);
      setErrorMessage(
        `No se pudo crear el caso con su mensaje inicial: ${
          createInquiryError?.message || "sin detalle del error"
        }`
      );
      return;
    }

    const createdInquiryId = String(createdInquiryIdFromRpc);

    setIsSubmitting(false);
    setCreatedInquiryId(createdInquiryId);
    setSuccessMessage("Caso creado correctamente.");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#062E36]/45 px-4 py-8 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="inquiry-form-title"
        className="w-full max-w-3xl overflow-hidden rounded-3xl border border-[#B8D1D8] bg-white shadow-2xl shadow-[#062E36]/25"
      >
        <div className="border-b border-[#E5F0F2] px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <span className="inline-flex rounded-full border border-[#B8D1D8] bg-[#F2FAFB] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#0F4C5C]">
                {createdInquiryId ? "Caso registrado" : "Nuevo caso"}
              </span>

              <h1
                id="inquiry-form-title"
                className="mt-3 text-xl font-bold text-[#062E36]"
              >
                {createdInquiryId ? "Caso creado" : "Registrar mensaje"}
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#526D74]">
                {createdInquiryId
                  ? "COPPE ha registrado el mensaje y ha generado la primera clasificación del caso."
                  : "Registra un mensaje recibido de un cliente para que COPPE lo convierta en un caso de atención."}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl p-2 text-[#6B858C] transition hover:bg-[#F2FAFB] hover:text-[#0F4C5C] disabled:cursor-not-allowed disabled:opacity-50"
              title="Cancelar"
              aria-label="Cerrar formulario"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="px-6 py-5">
          {!createdInquiryId ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm font-medium text-[#315F69]">
                  Nombre
                  <input
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-sm text-[#153F48] outline-none transition placeholder:text-[#8AA5AC] focus:border-[#0F4C5C] focus:bg-white focus:ring-2 focus:ring-[#0F4C5C]/10"
                    placeholder="Nombre del cliente"
                  />
                </label>

                <label className="text-sm font-medium text-[#315F69]">
                  Email
                  <input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-sm text-[#153F48] outline-none transition placeholder:text-[#8AA5AC] focus:border-[#0F4C5C] focus:bg-white focus:ring-2 focus:ring-[#0F4C5C]/10"
                    placeholder="cliente@email.com"
                  />
                </label>

                <label className="text-sm font-medium text-[#315F69]">
                  Teléfono
                  <input
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-sm text-[#153F48] outline-none transition placeholder:text-[#8AA5AC] focus:border-[#0F4C5C] focus:bg-white focus:ring-2 focus:ring-[#0F4C5C]/10"
                    placeholder="+34 600 000 000"
                  />
                </label>

                <label className="text-sm font-medium text-[#315F69]">
                  Canal
                  <select
                    value={sourceChannel}
                    onChange={(event) => setSourceChannel(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-sm text-[#153F48] outline-none transition focus:border-[#0F4C5C] focus:bg-white focus:ring-2 focus:ring-[#0F4C5C]/10"
                  >
                    {sourceChannelOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-medium text-[#315F69] md:col-span-2">
                  Mensaje
                  <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    maxLength={MAX_ANALYSIS_MESSAGE_LENGTH}
                    className="mt-1 min-h-[150px] w-full rounded-xl border border-[#D2E4E8] bg-[#F7FBFC] px-3 py-2 text-sm text-[#153F48] outline-none transition placeholder:text-[#8AA5AC] focus:border-[#0F4C5C] focus:bg-white focus:ring-2 focus:ring-[#0F4C5C]/10"
                    placeholder="Pega aquí el mensaje recibido del cliente..."
                  />

                  <p className="mt-1 text-right text-xs text-[#6B858C]">
                    {message.length}/{MAX_ANALYSIS_MESSAGE_LENGTH} caracteres
                  </p>
                </label>
              </div>

              {errorMessage ? (
                <div className="mt-5 rounded-2xl border border-[#B8D1D8] bg-[#F2FAFB] px-4 py-3 text-sm text-[#083640]">
                  {errorMessage}
                </div>
              ) : null}
            </>
          ) : (
            <div className="py-6 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#B8D1D8] bg-[#F2FAFB] text-[#0F4C5C] shadow-sm shadow-[#062E36]/10">
                <Sparkles />
              </div>

              <h2 className="mt-4 text-xl font-bold text-[#062E36]">
                Caso creado correctamente
              </h2>

              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#526D74]">
                {successMessage ||
                  "COPPE ha registrado el mensaje, ha creado el caso y ha generado una clasificación inicial."}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-[#E5F0F2] bg-[#F7FBFC] px-6 py-4 sm:flex-row sm:items-center sm:justify-end">
          {!createdInquiryId ? (
            <>
              <Button
                variant="secondary"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>

              <Button
                variant="secondary"
                onClick={resetForm}
                disabled={isSubmitting}
              >
                Limpiar formulario
              </Button>

              <Button onClick={handleSubmit} disabled={isSubmitting}>
                <Sparkles size={16} />
                {isSubmitting ? "Registrando mensaje..." : "Registrar mensaje"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={resetForm}>
                Registrar otro mensaje
              </Button>

              <Button
                variant="secondary"
                onClick={() => setActiveView("dashboard")}
              >
                Ir al dashboard
              </Button>

              <Button onClick={() => openInquiry(createdInquiryId)}>
                Ver caso analizado
              </Button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
