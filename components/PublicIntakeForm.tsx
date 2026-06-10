"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Building2, MessageCircle, Send } from "lucide-react";

import { Button } from "./Button";

type PublicSourceChannel = "Formulario web" | "Chat web";

type PublicIntakeFormProps = {
  publicIntakeToken: string;
  companyName: string;
  sourceChannel?: PublicSourceChannel;
};

type PublicIntakeResponse = {
  ok?: boolean;
  inquiryId?: string;
  message?: string;
  error?: string;
};

const MAX_CUSTOMER_NAME_LENGTH = 120;
const MAX_EMAIL_LENGTH = 254;
const MAX_PHONE_LENGTH = 40;
const MAX_MESSAGE_LENGTH = 6000;

export function PublicIntakeForm({
  publicIntakeToken,
  companyName,
  sourceChannel = "Formulario web",
}: PublicIntakeFormProps) {
  const [customerName, setCustomerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const isChatWeb = sourceChannel === "Chat web";
  const HeaderIcon = isChatWeb ? MessageCircle : Building2;

  const pageTitle = isChatWeb ? "Chat web" : "Formulario de contacto";
  const headerDescription = isChatWeb
    ? "Escribe tu mensaje y la empresa lo recibirá como un caso de Chat web en COPPE."
    : "Envía tu mensaje y la empresa lo recibirá en su espacio de trabajo de COPPE.";
  const messagePlaceholder = isChatWeb
    ? "Escribe aquí tu consulta"
    : "Escribe aquí tu mensaje";
  const submitText = isChatWeb ? "Enviar consulta" : "Enviar mensaje";
  const submittingText = isChatWeb
    ? "Enviando consulta..."
    : "Enviando mensaje...";
  const successFallback = isChatWeb
    ? "Consulta recibida correctamente. La empresa revisará tu mensaje."
    : "Mensaje recibido correctamente. La empresa revisará tu solicitud.";
  const footerText = isChatWeb
    ? "Este chat está gestionado mediante COPPE."
    : "Este formulario está gestionado mediante COPPE.";

  const resetFeedback = () => {
    setSuccessMessage("");
    setErrorMessage("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetFeedback();

    const cleanCustomerName = customerName.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();
    const cleanMessage = message.trim();
    const cleanCompanyWebsite = companyWebsite.trim();

    if (cleanCompanyWebsite) {
      setCustomerName("");
      setEmail("");
      setPhone("");
      setMessage("");
      setCompanyWebsite("");
      setSuccessMessage(successFallback);
      return;
    }

    if (!cleanCustomerName) {
      setErrorMessage("Introduce tu nombre.");
      return;
    }

    if (cleanCustomerName.length > MAX_CUSTOMER_NAME_LENGTH) {
      setErrorMessage(
        `El nombre no puede superar los ${MAX_CUSTOMER_NAME_LENGTH} caracteres.`
      );
      return;
    }

    if (!cleanEmail && !cleanPhone) {
      setErrorMessage("Introduce al menos un email o un teléfono.");
      return;
    }

    if (cleanEmail.length > MAX_EMAIL_LENGTH) {
      setErrorMessage(
        `El email no puede superar los ${MAX_EMAIL_LENGTH} caracteres.`
      );
      return;
    }

    if (cleanPhone.length > MAX_PHONE_LENGTH) {
      setErrorMessage(
        `El teléfono no puede superar los ${MAX_PHONE_LENGTH} caracteres.`
      );
      return;
    }

    if (!cleanMessage) {
      setErrorMessage("Escribe el mensaje antes de enviarlo.");
      return;
    }

    if (cleanMessage.length > MAX_MESSAGE_LENGTH) {
      setErrorMessage(
        `El mensaje no puede superar los ${MAX_MESSAGE_LENGTH} caracteres.`
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/public-intake", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          publicIntakeToken,
          customerName: cleanCustomerName,
          email: cleanEmail,
          phone: cleanPhone,
          message: cleanMessage,
          companyWebsite: cleanCompanyWebsite,
          sourceChannel,
        }),
      });

      const payload = (await response.json()) as PublicIntakeResponse;

      if (!response.ok || !payload.ok) {
        setErrorMessage(
          payload.error ||
            "No se pudo enviar el mensaje. Inténtalo de nuevo en unos segundos."
        );
        return;
      }

      setCustomerName("");
      setEmail("");
      setPhone("");
      setMessage("");
      setCompanyWebsite("");
      setSuccessMessage(payload.message || successFallback);
    } catch {
      setErrorMessage(
        "No se pudo conectar con COPPE. Revisa tu conexión e inténtalo de nuevo."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F9FA] px-4 py-8 text-slate-900">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center justify-center">
        <div className="w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/80">
          <div className="bg-[#0F4C5C] px-6 py-7 text-white md:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15">
                <HeaderIcon size={22} />
              </div>

              <div>
                <div className="text-sm font-medium text-white/75">
                  {pageTitle}
                </div>
                <h1 className="text-xl font-bold tracking-tight md:text-2xl">
                  {companyName}
                </h1>
              </div>
            </div>

            <p className="mt-4 text-sm leading-6 text-white/80">
              {headerDescription}
            </p>
          </div>

          <form className="space-y-5 p-6 md:p-8" onSubmit={handleSubmit}>
            <div aria-hidden="true" className="hidden">
              <label>
                Web de empresa
                <input
                  type="text"
                  value={companyWebsite}
                  onChange={(event) => setCompanyWebsite(event.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                  name="companyWebsite"
                />
              </label>
            </div>

            <label className="block text-sm font-medium text-slate-700">
              Nombre
              <input
                value={customerName}
                onChange={(event) => {
                  setCustomerName(event.target.value);
                  resetFeedback();
                }}
                maxLength={MAX_CUSTOMER_NAME_LENGTH}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                placeholder="Introduce tu nombre"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    resetFeedback();
                  }}
                  maxLength={MAX_EMAIL_LENGTH}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                  placeholder="Introduce tu email"
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Teléfono
                <input
                  type="tel"
                  value={phone}
                  onChange={(event) => {
                    setPhone(event.target.value);
                    resetFeedback();
                  }}
                  maxLength={MAX_PHONE_LENGTH}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                  placeholder="Introduce tu teléfono"
                />
              </label>
            </div>

            <label className="block text-sm font-medium text-slate-700">
              Mensaje
              <textarea
                value={message}
                onChange={(event) => {
                  setMessage(event.target.value);
                  resetFeedback();
                }}
                maxLength={MAX_MESSAGE_LENGTH}
                className="mt-1 min-h-[150px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                placeholder={messagePlaceholder}
              />
            </label>

            <div className="text-right text-xs text-slate-500">
              {message.length}/{MAX_MESSAGE_LENGTH} caracteres
            </div>

            {errorMessage ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </div>
            ) : null}

            {successMessage ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {successMessage}
              </div>
            ) : null}

            <Button className="w-full" type="submit" disabled={isSubmitting}>
              <Send size={16} />
              {isSubmitting ? submittingText : submitText}
            </Button>

            <p className="text-center text-xs leading-5 text-slate-400">
              {footerText}
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}