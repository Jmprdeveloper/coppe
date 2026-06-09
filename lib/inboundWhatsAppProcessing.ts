import {
    getCustomerDatabaseErrorMessage,
    normalizePhoneForComparison,
  } from "./customerValidation";
  import { MAX_ANALYSIS_MESSAGE_LENGTH } from "./inquiryAnalysisLimits";
  import { analyzeInquiryForCompany } from "./inquiryAnalysisService";
  import { createAdminClient } from "./supabase/admin";
  
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
  
  type InboundEventRow = {
    id: string;
    status: string;
    customer_id: string | null;
    inquiry_id: string | null;
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
  
    return {
      language,
      category: "general_info",
      priority: "medium",
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
    inboundEvent: InboundEventRow
  ): InboundWhatsAppProcessingResult {
    return {
      ok: true,
      status: 200,
      processed: 0,
      ignored: 0,
      duplicates: 1,
      inquiryIds: inboundEvent.inquiry_id ? [inboundEvent.inquiry_id] : [],
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
  
  async function findDuplicateInboundEvent(
    supabaseAdmin: ReturnType<typeof createAdminClient>,
    companyId: string,
    externalMessageId: string
  ) {
    if (!externalMessageId) {
      return null;
    }
  
    const { data, error } = await supabaseAdmin
      .from("inbound_events")
      .select("id, status, customer_id, inquiry_id")
      .eq("company_id", companyId)
      .eq("source_channel", "WhatsApp")
      .eq("external_message_id", externalMessageId)
      .maybeSingle<InboundEventRow>();
  
    if (error) {
      throw new Error(
        `No se pudo comprobar si el WhatsApp ya fue procesado: ${
          error.message || "sin detalle del error"
        }`
      );
    }
  
    return data;
  }
  
  async function createInboundEvent(
    supabaseAdmin: ReturnType<typeof createAdminClient>,
    companyId: string,
    externalMessageId: string,
    rawPayload: Record<string, unknown>
  ) {
    const { data, error } = await supabaseAdmin
      .from("inbound_events")
      .insert({
        company_id: companyId,
        source_channel: "WhatsApp",
        external_message_id: externalMessageId || null,
        status: "received",
        raw_payload: rawPayload,
      })
      .select("id")
      .single<{ id: string }>();
  
    if (error || !data) {
      throw new Error(
        `No se pudo registrar el WhatsApp entrante: ${
          error?.message || "sin detalle del error"
        }`
      );
    }
  
    return data.id;
  }
  
  async function updateInboundEvent(
    supabaseAdmin: ReturnType<typeof createAdminClient>,
    inboundEventId: string,
    values: {
      status: "processed" | "failed";
      customer_id?: string | null;
      inquiry_id?: string | null;
      error_message?: string | null;
      processed_at: string;
    }
  ) {
    const { error } = await supabaseAdmin
      .from("inbound_events")
      .update(values)
      .eq("id", inboundEventId);
  
    if (error) {
      console.error("Could not update inbound WhatsApp event:", error);
    }
  }
  
  async function buildFailedResultAfterInboundEvent(
    supabaseAdmin: ReturnType<typeof createAdminClient>,
    inboundEventId: string,
    errorMessage: string,
    status: number,
    ids: {
      customerId?: string | null;
      inquiryId?: string | null;
    } = {}
  ): Promise<InboundWhatsAppProcessingResult> {
    await updateInboundEvent(supabaseAdmin, inboundEventId, {
      status: "failed",
      customer_id: ids.customerId ?? null,
      inquiry_id: ids.inquiryId ?? null,
      error_message: errorMessage,
      processed_at: new Date().toISOString(),
    });
  
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
  
    try {
      const duplicateInboundEvent = await findDuplicateInboundEvent(
        supabaseAdmin,
        company.id,
        message.externalMessageId
      );
  
      if (duplicateInboundEvent) {
        return buildDuplicateResult(duplicateInboundEvent);
      }
    } catch (error) {
      return buildErrorResult(
        error instanceof Error
          ? error.message
          : "No se pudo comprobar si el WhatsApp ya fue procesado.",
        500
      );
    }
  
    let inboundEventId: string;
  
    try {
      inboundEventId = await createInboundEvent(
        supabaseAdmin,
        company.id,
        message.externalMessageId,
        {
          phoneNumberId: message.phoneNumberId,
          displayPhoneNumber: message.displayPhoneNumber,
          fromPhone: message.fromPhone,
          customerName: message.customerName,
          messageType: message.messageType,
          textBody: message.textBody,
          sourceChannel: "WhatsApp",
          rawMessage: message.rawMessage,
        }
      );
    } catch (error) {
      return buildErrorResult(
        error instanceof Error
          ? error.message
          : "No se pudo registrar el WhatsApp entrante.",
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
            status: "new",
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
          `No se pudo crear el cliente: ${getCustomerDatabaseErrorMessage(
            createCustomerError?.message ?? ""
          )}`,
          500
        );
      }
  
      customer = createdCustomer;
    }
  
    let analysis = buildFallbackAnalysis(
      message.customerName,
      message.textBody,
      company
    );
  
    try {
      analysis = await analyzeInquiryForCompany({
        customerName: message.customerName,
        message: message.textBody,
        company,
      });
    } catch (error) {
      console.error("Inbound WhatsApp analysis fallback used:", error);
    }
  
    const { data: createdInquiry, error: createInquiryError } =
      await supabaseAdmin
        .from("inquiries")
        .insert({
          company_id: company.id,
          customer_id: customer.id,
          customer_name: customer.name || message.customerName,
          source_channel: "WhatsApp",
          subject: analysis.subject,
          original_message: message.textBody,
          ai_summary: analysis.summary,
          ai_intent: analysis.intent,
          ai_category: analysis.category,
          ai_priority: analysis.priority,
          ai_language: analysis.language,
          sentiment: "neutral",
          missing_information: analysis.missingInformation,
          recommended_action: analysis.recommendedAction,
          suggested_response: analysis.suggestedResponse,
          status: "new",
        })
        .select("id")
        .single<{ id: string }>();
  
    if (createInquiryError || !createdInquiry) {
      return buildFailedResultAfterInboundEvent(
        supabaseAdmin,
        inboundEventId,
        `No se pudo crear el caso: ${
          createInquiryError?.message || "sin detalle del error"
        }`,
        500,
        { customerId: customer.id }
      );
    }
  
    const { error: createMessageError } = await supabaseAdmin
      .from("inquiry_messages")
      .insert({
        company_id: company.id,
        inquiry_id: createdInquiry.id,
        customer_id: customer.id,
        direction: "inbound",
        author_type: "customer",
        body: message.textBody,
        source_channel: "WhatsApp",
      });
  
    if (createMessageError) {
      return buildFailedResultAfterInboundEvent(
        supabaseAdmin,
        inboundEventId,
        `El caso se creó, pero no se pudo guardar el mensaje inicial: ${
          createMessageError.message || "sin detalle del error"
        }`,
        500,
        {
          customerId: customer.id,
          inquiryId: createdInquiry.id,
        }
      );
    }
  
    await updateInboundEvent(supabaseAdmin, inboundEventId, {
      status: "processed",
      customer_id: customer.id,
      inquiry_id: createdInquiry.id,
      error_message: null,
      processed_at: new Date().toISOString(),
    });
  
    return {
      ok: true,
      status: 201,
      processed: 1,
      ignored: 0,
      duplicates: 0,
      inquiryIds: [createdInquiry.id],
      message: "WhatsApp recibido correctamente.",
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