import {
    getCustomerDatabaseErrorMessage,
    normalizePhoneForComparison,
  } from "./customerValidation";
  import {
    claimInboundEvent,
    markInboundEventFailed,
  } from "./inboundEventProcessing";
  import { inferSentiment } from "./inquiryAnalysis";
  import { MAX_ANALYSIS_MESSAGE_LENGTH } from "./inquiryAnalysisLimits";
  import { analyzeInquiryForCompany } from "./inquiryAnalysisService";
  import { createAdminClient } from "./supabase/admin";
  import {
    buildWhatsAppThreadAnalysisContext,
    getWhatsAppThreadCutoffIso,
    normalizeWhatsAppThreadWindowDays,
  } from "./whatsAppThreading";
  
  type WhatsAppWebhookContact = {
    profile?: {
      name?: string;
    };
    wa_id?: string;
  };
  
  type WhatsAppWebhookMessage = {
    id?: string;
    from?: string;
    timestamp?: string;
    type?: string;
    text?: {
      body?: string;
    };
    button?: {
      text?: string;
    };
    interactive?: {
      type?: string;
      button_reply?: {
        id?: string;
        title?: string;
      };
      list_reply?: {
        id?: string;
        title?: string;
        description?: string;
      };
    };
  };
  
  type WhatsAppWebhookChangeValue = {
    messaging_product?: string;
    metadata?: {
      display_phone_number?: string;
      phone_number_id?: string;
    };
    contacts?: WhatsAppWebhookContact[];
    messages?: WhatsAppWebhookMessage[];
    statuses?: unknown[];
  };
  
  type WhatsAppWebhookChange = {
    field?: string;
    value?: WhatsAppWebhookChangeValue;
  };
  
  type WhatsAppWebhookEntry = {
    id?: string;
    changes?: WhatsAppWebhookChange[];
  };
  
  export type WhatsAppWebhookPayload = {
    object?: string;
    entry?: WhatsAppWebhookEntry[];
  };
  
  type InboundWhatsAppChannelRow = {
    id: string;
    company_id: string;
    phone_number_id: string;
    display_phone_number: string | null;
    provider: string | null;
    provider_business_account_id: string | null;
    enabled: boolean;
  };
  
  type InboundWhatsAppCompany = {
    id: string;
    name: string;
    sector: string;
    description: string | null;
    tone: string | null;
    language: string | null;
  };
  
  type InboundWhatsAppAnalysis = Awaited<
    ReturnType<typeof analyzeInquiryForCompany>
  >;
  
  type CustomerRow = {
    id: string;
    company_id: string;
    name: string;
    email: string | null;
    phone: string | null;
    language: string | null;
    status: string;
    last_interaction_at: string | null;
    created_at: string;
  };

  type WhatsAppThreadInquiryRow = {
    id: string;
    company_id: string;
    customer_id: string | null;
    subject: string | null;
    status: string;
    ai_category: string | null;
    ai_priority: string | null;
    ai_language: string | null;
    sentiment: string | null;
    last_message_at: string;
  };

  type WhatsAppThreadMessageRow = {
    direction: string;
    author_type: string;
    body: string;
  };

  type FinalizedWhatsAppMessageRow = {
    inquiry_id: string;
    created_new: boolean;
  };
  
  type NormalizedWhatsAppMessage = {
    phoneNumberId: string;
    displayPhoneNumber: string;
    externalMessageId: string;
    fromPhone: string;
    customerName: string;
    messageType: string;
    textBody: string;
    rawMessage: WhatsAppWebhookMessage;
  };
  
  export type InboundWhatsAppProcessingResult =
    | {
        ok: true;
        status: number;
        processed: number;
        ignored: number;
        duplicates: number;
        inquiryIds: string[];
        message: string;
      }
    | {
        ok: false;
        status: number;
        error: string;
      };
  
  const MAX_PHONE_NUMBER_ID_LENGTH = 120;
  const MAX_EXTERNAL_MESSAGE_ID_LENGTH = 255;
  const MAX_CUSTOMER_NAME_LENGTH = 120;
  
  function getStringValue(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
  }
  
  function buildErrorResult(
    error: string,
    status: number
  ): InboundWhatsAppProcessingResult {
    return {
      ok: false,
      status,
      error,
    };
  }
  
  function normalizeWhatsAppPhone(value: string) {
    const cleanValue = value.trim();
  
    if (!cleanValue) {
      return "";
    }
  
    if (cleanValue.startsWith("+")) {
      return cleanValue;
    }
  
    return `+${cleanValue}`;
  }
  
  function getContactName(
    contacts: WhatsAppWebhookContact[] | undefined,
    fromPhone: string
  ) {
    const matchingContact = (contacts ?? []).find((contact) => {
      return getStringValue(contact.wa_id) === fromPhone.replace(/^\+/, "");
    });
  
    return getStringValue(matchingContact?.profile?.name);
  }
  
  function getMessageText(message: WhatsAppWebhookMessage) {
    const messageType = getStringValue(message.type);
  
    if (messageType === "text") {
      return getStringValue(message.text?.body);
    }
  
    if (messageType === "button") {
      return getStringValue(message.button?.text);
    }
  
    if (messageType === "interactive") {
      const buttonReplyTitle = getStringValue(
        message.interactive?.button_reply?.title
      );
  
      if (buttonReplyTitle) {
        return buttonReplyTitle;
      }
  
      const listReplyTitle = getStringValue(message.interactive?.list_reply?.title);
      const listReplyDescription = getStringValue(
        message.interactive?.list_reply?.description
      );
  
      if (listReplyTitle && listReplyDescription) {
        return `${listReplyTitle}\n${listReplyDescription}`;
      }
  
      return listReplyTitle;
    }
  
    if (messageType) {
      return `Mensaje de WhatsApp recibido de tipo "${messageType}". COPPE todavía no descarga automáticamente este tipo de contenido.`;
    }
  
    return "Mensaje de WhatsApp recibido sin texto disponible.";
  }
  
  function extractIncomingMessages(
    payload: WhatsAppWebhookPayload
  ): NormalizedWhatsAppMessage[] {
    const entries = Array.isArray(payload.entry) ? payload.entry : [];
    const normalizedMessages: NormalizedWhatsAppMessage[] = [];
  
    for (const entry of entries) {
      const changes = Array.isArray(entry.changes) ? entry.changes : [];
  
      for (const change of changes) {
        const value = change.value;
        const messages = Array.isArray(value?.messages) ? value.messages : [];
  
        if (messages.length === 0) {
          continue;
        }
  
        const phoneNumberId = getStringValue(value?.metadata?.phone_number_id);
        const displayPhoneNumber = getStringValue(
          value?.metadata?.display_phone_number
        );
  
        for (const message of messages) {
          const rawFromPhone = getStringValue(message.from);
          const fromPhone = normalizeWhatsAppPhone(rawFromPhone);
          const textBody = getMessageText(message);
          const customerName =
            getContactName(value?.contacts, fromPhone) || fromPhone;
          const messageId = getStringValue(message.id);
          const externalMessageId = messageId ? `whatsapp:${messageId}` : "";
  
          normalizedMessages.push({
            phoneNumberId,
            displayPhoneNumber,
            externalMessageId,
            fromPhone,
            customerName,
            messageType: getStringValue(message.type) || "unknown",
            textBody,
            rawMessage: message,
          });
        }
      }
    }
  
    return normalizedMessages;
  }
  
  function buildFallbackSubject(textBody: string) {
    const firstLine = textBody
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean);
  
    if (!firstLine) {
      return "Nuevo WhatsApp recibido";
    }
  
    if (firstLine.length <= 80) {
      return firstLine;
    }
  
    return `${firstLine.slice(0, 77)}...`;
  }
  
  function buildFallbackAnalysis(
    customerName: string,
    textBody: string,
    company: InboundWhatsAppCompany
  ): InboundWhatsAppAnalysis {
    const language = company.language === "en" ? "en" : "es";
    const sentiment = inferSentiment("general_info", textBody);
  
    return {
      language,
      category: "general_info",
      priority: "medium",
      sentiment,
      summary: `${customerName} ha enviado un mensaje por WhatsApp a ${company.name}.`,
      intent: "Mensaje recibido en el canal de WhatsApp de la empresa.",
      missingInformation: [],
      recommendedAction:
        "Revisar el mensaje recibido por WhatsApp y responder al cliente desde el canal adecuado.",
      suggestedResponse:
        language === "en"
          ? "Hello, thank you for contacting us. We have received your message. A member of our team will contact you as soon as possible."
          : "Hola, gracias por contactarnos. Hemos recibido tu mensaje. Una persona de nuestro equipo se pondrá en contacto contigo lo antes posible.",
      subject: buildFallbackSubject(textBody),
    };
  }
  
  function buildDuplicateResult(
    inquiryId: string | null
  ): InboundWhatsAppProcessingResult {
    return {
      ok: true,
      status: 200,
      processed: 0,
      ignored: 0,
      duplicates: 1,
      inquiryIds: inquiryId ? [inquiryId] : [],
      message: "WhatsApp ya procesado anteriormente.",
    };
  }
  
  async function findInboundWhatsAppChannel(
    supabaseAdmin: ReturnType<typeof createAdminClient>,
    phoneNumberId: string
  ) {
    const { data, error } = await supabaseAdmin
      .from("inbound_whatsapp_channels")
      .select(
        "id, company_id, phone_number_id, display_phone_number, provider, provider_business_account_id, enabled"
      )
      .eq("phone_number_id", phoneNumberId)
      .maybeSingle<InboundWhatsAppChannelRow>();
  
    if (error) {
      throw new Error(
        `No se pudo cargar el canal de WhatsApp entrante: ${
          error.message || "sin detalle del error"
        }`
      );
    }
  
    return data;
  }
  
  async function findInboundCompany(
    supabaseAdmin: ReturnType<typeof createAdminClient>,
    companyId: string
  ) {
    const { data, error } = await supabaseAdmin
      .from("companies")
      .select("id, name, sector, description, tone, language")
      .eq("id", companyId)
      .maybeSingle<InboundWhatsAppCompany>();
  
    if (error) {
      throw new Error(
        `No se pudo cargar la empresa asociada al WhatsApp entrante: ${
          error.message || "sin detalle del error"
        }`
      );
    }
  
    return data;
  }
  
  async function buildFailedResultAfterInboundEvent(
    supabaseAdmin: ReturnType<typeof createAdminClient>,
    inboundEventId: string,
    processingToken: string,
    errorMessage: string,
    status: number,
    ids: {
      customerId?: string | null;
      inquiryId?: string | null;
    } = {}
  ): Promise<InboundWhatsAppProcessingResult> {
    await markInboundEventFailed(
      supabaseAdmin,
      inboundEventId,
      processingToken,
      errorMessage,
      ids
    );
  
    return buildErrorResult(errorMessage, status);
  }
  
  async function findExistingCustomerByPhone(
    supabaseAdmin: ReturnType<typeof createAdminClient>,
    companyId: string,
    fromPhone: string
  ) {
    const normalizedPhone = normalizePhoneForComparison(fromPhone);
  
    const { data, error } = await supabaseAdmin
      .from("customers")
      .select(
        "id, company_id, name, email, phone, language, status, last_interaction_at, created_at"
      )
      .eq("company_id", companyId)
      .not("phone", "is", null);
  
    if (error) {
      throw new Error(
        `No se pudo comprobar si el cliente ya existe por teléfono: ${
          error.message || "sin detalle del error"
        }`
      );
    }
  
    const matchingCustomers =
      ((data ?? []) as CustomerRow[]).filter((customer) => {
        return normalizePhoneForComparison(customer.phone) === normalizedPhone;
      }) ?? [];
  
    if (matchingCustomers.length > 1) {
      throw new Error(
        "Existen varios clientes con el mismo teléfono. Revisa la base de clientes antes de procesar este WhatsApp."
      );
    }
  
    return matchingCustomers[0] ?? null;
  }

  function getWhatsAppThreadWindowDays() {
    return normalizeWhatsAppThreadWindowDays(
      process.env.WHATSAPP_THREAD_WINDOW_DAYS
    );
  }

  async function findRecentWhatsAppInquiry(
    supabaseAdmin: ReturnType<typeof createAdminClient>,
    companyId: string,
    customerId: string,
    threadWindowDays: number
  ) {
    const { data, error } = await supabaseAdmin
      .from("inquiries")
      .select(
        "id, company_id, customer_id, subject, status, ai_category, ai_priority, ai_language, sentiment, last_message_at"
      )
      .eq("company_id", companyId)
      .eq("customer_id", customerId)
      .eq("source_channel", "WhatsApp")
      .in("status", ["new", "pending", "waiting_customer", "replied"])
      .gte(
        "last_message_at",
        getWhatsAppThreadCutoffIso(new Date(), threadWindowDays)
      )
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle<WhatsAppThreadInquiryRow>();

    if (error) {
      throw new Error(
        `No se pudo buscar la conversación activa de WhatsApp: ${
          error.message || "sin detalle del error"
        }`
      );
    }

    return data;
  }

  async function findWhatsAppInquiryMessages(
    supabaseAdmin: ReturnType<typeof createAdminClient>,
    inquiryId: string
  ) {
    const { data, error } = await supabaseAdmin
      .from("inquiry_messages")
      .select("direction, author_type, body")
      .eq("inquiry_id", inquiryId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(
        `No se pudo cargar el historial de WhatsApp: ${
          error.message || "sin detalle del error"
        }`
      );
    }

    return (data ?? []) as WhatsAppThreadMessageRow[];
  }
  
  async function processOneWhatsAppMessage(
    supabaseAdmin: ReturnType<typeof createAdminClient>,
    message: NormalizedWhatsAppMessage
  ): Promise<InboundWhatsAppProcessingResult> {
    if (!message.phoneNumberId) {
      return buildErrorResult(
        "El webhook de WhatsApp no incluye phone_number_id.",
        400
      );
    }
  
    if (message.phoneNumberId.length > MAX_PHONE_NUMBER_ID_LENGTH) {
      return buildErrorResult(
        `El identificador del número de WhatsApp no puede superar los ${MAX_PHONE_NUMBER_ID_LENGTH} caracteres.`,
        400
      );
    }
  
    if (!message.externalMessageId) {
      return buildErrorResult(
        "El webhook de WhatsApp no incluye el identificador del mensaje.",
        400
      );
    }

    if (message.externalMessageId.length > MAX_EXTERNAL_MESSAGE_ID_LENGTH) {
      return buildErrorResult(
        `El identificador externo no puede superar los ${MAX_EXTERNAL_MESSAGE_ID_LENGTH} caracteres.`,
        400
      );
    }
  
    if (!message.fromPhone) {
      return buildErrorResult(
        "El webhook de WhatsApp no incluye el teléfono del remitente.",
        400
      );
    }
  
    if (message.customerName.length > MAX_CUSTOMER_NAME_LENGTH) {
      return buildErrorResult(
        `El nombre del contacto no puede superar los ${MAX_CUSTOMER_NAME_LENGTH} caracteres.`,
        400
      );
    }
  
    if (!message.textBody) {
      return buildErrorResult("El mensaje de WhatsApp está vacío.", 400);
    }
  
    if (message.textBody.length > MAX_ANALYSIS_MESSAGE_LENGTH) {
      return buildErrorResult(
        `El mensaje de WhatsApp no puede superar los ${MAX_ANALYSIS_MESSAGE_LENGTH} caracteres.`,
        400
      );
    }
  
    let inboundWhatsAppChannel: InboundWhatsAppChannelRow | null = null;
  
    try {
      inboundWhatsAppChannel = await findInboundWhatsAppChannel(
        supabaseAdmin,
        message.phoneNumberId
      );
    } catch (error) {
      return buildErrorResult(
        error instanceof Error
          ? error.message
          : "No se pudo cargar el canal de WhatsApp entrante.",
        500
      );
    }
  
    if (!inboundWhatsAppChannel) {
      return buildErrorResult(
        "El número de WhatsApp entrante no está configurado.",
        404
      );
    }
  
    if (!inboundWhatsAppChannel.enabled) {
      return buildErrorResult("El canal de WhatsApp entrante no está activo.", 403);
    }
  
    let company: InboundWhatsAppCompany | null = null;
  
    try {
      company = await findInboundCompany(
        supabaseAdmin,
        inboundWhatsAppChannel.company_id
      );
    } catch (error) {
      return buildErrorResult(
        error instanceof Error
          ? error.message
          : "No se pudo cargar la empresa asociada al WhatsApp entrante.",
        500
      );
    }
  
    if (!company) {
      return buildErrorResult(
        "No se encontró la empresa asociada al WhatsApp entrante.",
        404
      );
    }
  
    let inboundEventId: string;
    let processingToken: string;
  
    try {
      const claim = await claimInboundEvent(supabaseAdmin, {
        companyId: company.id,
        sourceChannel: "WhatsApp",
        externalMessageId: message.externalMessageId,
        rawPayload: {
          phoneNumberId: message.phoneNumberId,
          displayPhoneNumber: message.displayPhoneNumber,
          fromPhone: message.fromPhone,
          customerName: message.customerName,
          messageType: message.messageType,
          textBody: message.textBody,
          sourceChannel: "WhatsApp",
          rawMessage: message.rawMessage,
        },
      });

      if (claim.outcome === "processed") {
        return buildDuplicateResult(claim.inquiryId);
      }

      if (claim.outcome === "in_progress") {
        return buildErrorResult(
          "El mensaje de WhatsApp ya se está procesando.",
          503
        );
      }

      inboundEventId = claim.eventId;
      processingToken = claim.processingToken;
    } catch (error) {
      return buildErrorResult(
        error instanceof Error
          ? error.message
          : "No se pudo reclamar el WhatsApp entrante.",
        500
      );
    }
  
    const now = new Date().toISOString();
  
    let customer: CustomerRow | null = null;
  
    try {
      customer = await findExistingCustomerByPhone(
        supabaseAdmin,
        company.id,
        message.fromPhone
      );
    } catch (error) {
      return buildFailedResultAfterInboundEvent(
        supabaseAdmin,
        inboundEventId,
        processingToken,
        error instanceof Error
          ? error.message
          : "No se pudo comprobar si el cliente ya existe.",
        500
      );
    }
  
    if (customer) {
      const { data: updatedCustomer, error: updateCustomerError } =
        await supabaseAdmin
          .from("customers")
          .update({
            last_interaction_at: now,
          })
          .eq("id", customer.id)
          .select(
            "id, company_id, name, email, phone, language, status, last_interaction_at, created_at"
          )
          .single<CustomerRow>();
  
      if (updateCustomerError || !updatedCustomer) {
        return buildFailedResultAfterInboundEvent(
          supabaseAdmin,
          inboundEventId,
          processingToken,
          `No se pudo actualizar el cliente existente: ${
            updateCustomerError?.message || "sin detalle del error"
          }`,
          500,
          { customerId: customer.id }
        );
      }
  
      customer = updatedCustomer;
    } else {
      const { data: createdCustomer, error: createCustomerError } =
        await supabaseAdmin
          .from("customers")
          .insert({
            company_id: company.id,
            name: message.customerName || message.fromPhone,
            email: null,
            phone: message.fromPhone,
            language: company.language ?? "es",
            status: "active",
            last_interaction_at: now,
          })
          .select(
            "id, company_id, name, email, phone, language, status, last_interaction_at, created_at"
          )
          .single<CustomerRow>();
  
      if (createCustomerError || !createdCustomer) {
        return buildFailedResultAfterInboundEvent(
          supabaseAdmin,
          inboundEventId,
          processingToken,
          `No se pudo crear el cliente: ${getCustomerDatabaseErrorMessage(
            createCustomerError?.message ?? ""
          )}`,
          500
        );
      }
  
      customer = createdCustomer;
    }
  
    const threadWindowDays = getWhatsAppThreadWindowDays();
    let recentInquiry: WhatsAppThreadInquiryRow | null = null;

    try {
      recentInquiry = await findRecentWhatsAppInquiry(
        supabaseAdmin,
        company.id,
        customer.id,
        threadWindowDays
      );
    } catch (error) {
      return buildFailedResultAfterInboundEvent(
        supabaseAdmin,
        inboundEventId,
        processingToken,
        error instanceof Error
          ? error.message
          : "No se pudo buscar la conversación activa de WhatsApp.",
        500,
        { customerId: customer.id }
      );
    }

    let analysis = buildFallbackAnalysis(
      message.customerName,
      message.textBody,
      company
    );

    try {
      let analysisMessage = message.textBody;

      if (recentInquiry) {
        const inquiryMessages = await findWhatsAppInquiryMessages(
          supabaseAdmin,
          recentInquiry.id
        );
        analysisMessage = buildWhatsAppThreadAnalysisContext(
          recentInquiry.subject ?? "",
          inquiryMessages,
          message.textBody,
          recentInquiry.ai_category
        );
      }

      analysis = await analyzeInquiryForCompany({
        customerName: message.customerName,
        message: analysisMessage,
        company,
      });
    } catch (error) {
      console.error("Inbound WhatsApp analysis fallback used:", error);
    }
  
    const { data: finalizedWhatsAppMessage, error: finalizeWhatsAppError } =
      await supabaseAdmin
        .rpc("finalize_inbound_whatsapp_message", {
          p_inbound_event_id: inboundEventId,
          p_processing_token: processingToken,
          p_company_id: company.id,
          p_customer_id: customer.id,
          p_preferred_inquiry_id: recentInquiry?.id ?? null,
          p_thread_window_days: threadWindowDays,
          p_customer_name: customer.name || message.customerName,
          p_subject: analysis.subject,
          p_original_message: message.textBody,
          p_ai_summary: analysis.summary,
          p_ai_intent: analysis.intent,
          p_ai_category: analysis.category,
          p_ai_priority: analysis.priority,
          p_ai_language: analysis.language,
          p_sentiment: analysis.sentiment,
          p_missing_information: analysis.missingInformation,
          p_recommended_action: analysis.recommendedAction,
          p_suggested_response: analysis.suggestedResponse,
        })
        .single<FinalizedWhatsAppMessageRow>();

    if (finalizeWhatsAppError || !finalizedWhatsAppMessage) {
      return buildFailedResultAfterInboundEvent(
        supabaseAdmin,
        inboundEventId,
        processingToken,
        `No se pudo guardar el WhatsApp en su conversación: ${
          finalizeWhatsAppError?.message || "sin detalle del error"
        }`,
        500,
        {
          customerId: customer.id,
          inquiryId: recentInquiry?.id ?? null,
        }
      );
    }

    const finalizedInquiryId = finalizedWhatsAppMessage.inquiry_id;
  
    return {
      ok: true,
      status: finalizedWhatsAppMessage.created_new ? 201 : 200,
      processed: 1,
      ignored: 0,
      duplicates: 0,
      inquiryIds: [finalizedInquiryId],
      message: finalizedWhatsAppMessage.created_new
        ? "WhatsApp recibido y caso creado correctamente."
        : "WhatsApp añadido a la conversación existente.",
    };
  }
  
  export async function processInboundWhatsAppWebhook(
    payload: WhatsAppWebhookPayload
  ): Promise<InboundWhatsAppProcessingResult> {
    const supabaseAdmin = createAdminClient();
    const messages = extractIncomingMessages(payload);
  
    if (messages.length === 0) {
      return {
        ok: true,
        status: 200,
        processed: 0,
        ignored: 1,
        duplicates: 0,
        inquiryIds: [],
        message: "Evento de WhatsApp ignorado porque no incluye mensajes entrantes.",
      };
    }
  
    let processed = 0;
    let ignored = 0;
    let duplicates = 0;
    const inquiryIds: string[] = [];
  
    for (const message of messages) {
      const result = await processOneWhatsAppMessage(supabaseAdmin, message);
  
      if (!result.ok) {
        return result;
      }
  
      processed += result.processed;
      ignored += result.ignored;
      duplicates += result.duplicates;
      inquiryIds.push(...result.inquiryIds);
    }
  
    return {
      ok: true,
      status: processed > 0 ? 201 : 200,
      processed,
      ignored,
      duplicates,
      inquiryIds,
      message:
        processed > 0
          ? "WhatsApp procesado correctamente."
          : "Webhook de WhatsApp recibido sin mensajes nuevos.",
    };
  }
