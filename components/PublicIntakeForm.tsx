"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Building2, CheckCircle2, MessageCircle, Send } from "lucide-react";

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
  conversationToken?: string;
  messages?: PublicChatMessage[];
  message?: string;
  error?: string;
};

type PublicChatMessage = {
  id: string;
  direction: string;
  author_type: string;
  body: string;
  created_at: string;
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

  const [sentChatMessage, setSentChatMessage] = useState("");
  const [conversationToken, setConversationToken] = useState("");
  const [chatMessages, setChatMessages] = useState<PublicChatMessage[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const isChatWeb = sourceChannel === "Chat web";
  const chatStorageKey = `coppe:public-chat:${publicIntakeToken}`;
  const successFallback = isChatWeb
    ? "Consulta recibida correctamente. La empresa revisará tu mensaje."
    : "Mensaje recibido correctamente. La empresa revisará tu solicitud.";

  const resetFeedback = () => {
    setSuccessMessage("");
    setErrorMessage("");
    setSentChatMessage("");
  };

  useEffect(() => {
    if (!isChatWeb) {
      return;
    }

    const storedToken = window.sessionStorage.getItem(chatStorageKey);

    if (storedToken) {
      queueMicrotask(() => {
        setConversationToken(storedToken);
      });
    }
  }, [chatStorageKey, isChatWeb]);

  useEffect(() => {
    if (!isChatWeb || !conversationToken) {
      return;
    }

    let active = true;

    const refreshMessages = async () => {
      try {
        const response = await fetch(
          `/api/public-chat?conversationToken=${encodeURIComponent(
            conversationToken
          )}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );
        const payload = (await response
          .json()
          .catch(() => null)) as PublicIntakeResponse | null;

        if (!active) {
          return;
        }

        if (response.status === 404) {
          window.sessionStorage.removeItem(chatStorageKey);
          setConversationToken("");
          setChatMessages([]);
          setErrorMessage(
            "La conversación ha caducado. Inicia una nueva consulta."
          );
          return;
        }

        if (response.ok && payload?.messages) {
          setChatMessages(payload.messages);
        }
      } catch {
        // Polling failures are transient; the next refresh will try again.
      }
    };

    refreshMessages();
    const intervalId = window.setInterval(refreshMessages, 5000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [chatStorageKey, conversationToken, isChatWeb]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSuccessMessage("");
    setErrorMessage("");

    const cleanCustomerName = customerName.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();
    const cleanMessage = message.trim();
    const cleanCompanyWebsite = companyWebsite.trim();
    const isExistingChatMessage = isChatWeb && Boolean(conversationToken);

    if (cleanCompanyWebsite) {
      setCustomerName("");
      setEmail("");
      setPhone("");
      setMessage("");
      setCompanyWebsite("");
      setSentChatMessage(cleanMessage);
      setSuccessMessage(successFallback);
      return;
    }

    if (!isExistingChatMessage && !cleanCustomerName) {
      setErrorMessage("Introduce tu nombre.");
      return;
    }

    if (
      !isExistingChatMessage &&
      cleanCustomerName.length > MAX_CUSTOMER_NAME_LENGTH
    ) {
      setErrorMessage(
        `El nombre no puede superar los ${MAX_CUSTOMER_NAME_LENGTH} caracteres.`
      );
      return;
    }

    if (!isExistingChatMessage && !cleanEmail && !cleanPhone) {
      setErrorMessage("Introduce al menos un email o un teléfono.");
      return;
    }

    if (!isExistingChatMessage && cleanEmail.length > MAX_EMAIL_LENGTH) {
      setErrorMessage(
        `El email no puede superar los ${MAX_EMAIL_LENGTH} caracteres.`
      );
      return;
    }

    if (!isExistingChatMessage && cleanPhone.length > MAX_PHONE_LENGTH) {
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
      const response = await fetch(
        isExistingChatMessage ? "/api/public-chat" : "/api/public-intake",
        {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(
          isExistingChatMessage
            ? {
                conversationToken,
                message: cleanMessage,
                companyWebsite: cleanCompanyWebsite,
              }
            : {
                publicIntakeToken,
                customerName: cleanCustomerName,
                email: cleanEmail,
                phone: cleanPhone,
                message: cleanMessage,
                companyWebsite: cleanCompanyWebsite,
                sourceChannel,
              }
        ),
      }
      );

      const payload = (await response.json()) as PublicIntakeResponse;

      if (!response.ok || !payload.ok) {
        setErrorMessage(
          payload.error ||
            "No se pudo enviar el mensaje. Inténtalo de nuevo en unos segundos."
        );
        return;
      }

      setSentChatMessage(cleanMessage);
      if (!isExistingChatMessage) {
        setCustomerName("");
        setEmail("");
        setPhone("");
      }
      setMessage("");
      setCompanyWebsite("");
      if (payload.conversationToken) {
        setConversationToken(payload.conversationToken);
        window.sessionStorage.setItem(
          chatStorageKey,
          payload.conversationToken
        );
      }
      if (payload.messages) {
        setChatMessages(payload.messages);
      }
      setSuccessMessage(payload.message || successFallback);
    } catch {
      setErrorMessage(
        "No se pudo conectar con COPPE. Revisa tu conexión e inténtalo de nuevo."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isChatWeb) {
    const draftMessage = message.trim();
    const visibleChatMessage =
      chatMessages.length === 0 ? sentChatMessage || draftMessage : "";
    const isDraftBubble = Boolean(draftMessage) && !sentChatMessage;

    return (
      <div className="min-h-screen bg-[#EEF4F5] px-4 py-8 text-slate-900">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-2xl items-center justify-center">
          <div className="w-full overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl shadow-slate-300/70">
            <div className="bg-[#0F4C5C] px-6 py-5 text-white">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15">
                  <MessageCircle size={22} />
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-white/65">
                    Chat web
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                  </div>

                  <h1 className="truncate text-xl font-bold tracking-tight md:text-2xl">
                    {companyName}
                  </h1>
                </div>
              </div>

              <p className="mt-3 text-sm leading-6 text-white/80">
                Envía tu consulta y la empresa la recibirá directamente en su
                espacio de trabajo.
              </p>
            </div>

            <div className="bg-slate-50 px-5 py-5 md:px-6">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0F4C5C] text-white">
                    <MessageCircle size={16} />
                  </div>

                  <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-sm leading-6 text-slate-700 shadow-sm ring-1 ring-slate-200">
                    Hola, cuéntanos qué necesitas. La empresa recibirá tu
                    mensaje y podrá revisarlo desde COPPE.
                  </div>
                </div>

                {chatMessages.map((chatMessage) => {
                  const isCompanyMessage =
                    chatMessage.direction === "outbound" ||
                    chatMessage.author_type === "company";

                  return isCompanyMessage ? (
                    <div key={chatMessage.id} className="flex items-start gap-3">
                      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0F4C5C] text-white">
                        <MessageCircle size={16} />
                      </div>
                      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-sm leading-6 text-slate-700 shadow-sm ring-1 ring-slate-200">
                        {chatMessage.body}
                      </div>
                    </div>
                  ) : (
                    <div key={chatMessage.id} className="flex justify-end">
                      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-[#0F4C5C] px-4 py-3 text-sm leading-6 text-white shadow-sm">
                        {chatMessage.body}
                      </div>
                    </div>
                  );
                })}

                {visibleChatMessage ? (
                  <div className="flex justify-end">
                    <div
                      className={[
                        "max-w-[85%] rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-6 shadow-sm",
                        isDraftBubble
                          ? "border border-[#0F4C5C]/20 bg-[#0F4C5C]/10 text-[#0F4C5C]"
                          : "bg-[#0F4C5C] text-white",
                      ].join(" ")}
                    >
                      {isDraftBubble ? (
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0F4C5C]/60">
                          Vista previa
                        </div>
                      ) : null}
                      {visibleChatMessage}
                    </div>
                  </div>
                ) : null}

                {successMessage && sentChatMessage && chatMessages.length === 0 ? (
                  <div className="flex items-start gap-3">
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                      <CheckCircle2 size={16} />
                    </div>

                    <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-sm leading-6 text-slate-700 shadow-sm ring-1 ring-emerald-200">
                      {successMessage}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <form className="space-y-4 p-5 md:p-6" onSubmit={handleSubmit}>
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

              {!conversationToken ? (
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700 md:col-span-2">
                  Nombre
                  <input
                    value={customerName}
                    onChange={(event) => {
                      setCustomerName(event.target.value);
                      resetFeedback();
                    }}
                    maxLength={MAX_CUSTOMER_NAME_LENGTH}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-[#0F4C5C] focus:bg-white"
                    placeholder="Introduce tu nombre"
                  />
                </label>

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
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-[#0F4C5C] focus:bg-white"
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
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-[#0F4C5C] focus:bg-white"
                    placeholder="Introduce tu teléfono"
                  />
                </label>
              </div>
              ) : null}

              <label className="block text-sm font-medium text-slate-700">
                Mensaje
                <textarea
                  value={message}
                  onChange={(event) => {
                    setMessage(event.target.value);
                    resetFeedback();
                  }}
                  maxLength={MAX_MESSAGE_LENGTH}
                  className="mt-1 min-h-[130px] w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none transition focus:border-[#0F4C5C] focus:bg-white"
                  placeholder="Escribe aquí tu consulta"
                />
              </label>

              <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-emerald-600" />
                  {conversationToken
                    ? "Este mensaje se añadirá a la conversación."
                    : "La empresa recibirá este mensaje como caso."}
                </div>

                <div>
                  {message.length}/{MAX_MESSAGE_LENGTH}
                </div>
              </div>

              {errorMessage ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {errorMessage}
                </div>
              ) : null}

              <Button className="w-full" type="submit" disabled={isSubmitting}>
                <Send size={16} />
                {isSubmitting
                  ? "Enviando mensaje..."
                  : conversationToken
                    ? "Enviar mensaje"
                    : "Iniciar conversación"}
              </Button>

              <p className="text-center text-xs leading-5 text-slate-400">
                Este chat está gestionado mediante COPPE.
              </p>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F9FA] px-4 py-8 text-slate-900">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center justify-center">
        <div className="w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/80">
          <div className="bg-[#0F4C5C] px-6 py-7 text-white md:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15">
                <Building2 size={22} />
              </div>

              <div>
                <div className="text-sm font-medium text-white/75">
                  Formulario de contacto
                </div>
                <h1 className="text-xl font-bold tracking-tight md:text-2xl">
                  {companyName}
                </h1>
              </div>
            </div>

            <p className="mt-4 text-sm leading-6 text-white/80">
              Envía tu mensaje y la empresa lo recibirá en su espacio de trabajo
              de COPPE.
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
                placeholder="Escribe aquí tu mensaje"
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
              {isSubmitting ? "Enviando mensaje..." : "Enviar mensaje"}
            </Button>

            <p className="text-center text-xs leading-5 text-slate-400">
              Este formulario está gestionado mediante COPPE.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
