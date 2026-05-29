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
import {
  buildIntent,
  buildMissingInformation,
  buildRecommendedAction,
  buildSubject,
  buildSuggestedResponse,
  buildSummary,
  detectLanguage,
  inferCategory,
  inferPriority,
} from "../lib/inquiryAnalysis";
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