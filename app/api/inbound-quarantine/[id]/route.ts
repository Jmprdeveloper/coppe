import { NextResponse } from "next/server";

import { sendAutomaticAcknowledgement } from "../../../../lib/automaticAcknowledgement";
import {
  getCustomerDatabaseErrorMessage,
  normalizePhoneForComparison,
} from "../../../../lib/customerValidation";
import { inferSentiment } from "../../../../lib/inquiryAnalysis";
import { analyzeInquiryForCompany } from "../../../../lib/inquiryAnalysisService";
import {
  buildRequestBodyTooLargeResponse,
  readRequestJsonWithLimit,
  RequestBodyTooLargeError,
} from "../../../../lib/requestBodyLimits";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { createClient } from "../../../../lib/supabase/server";

export const runtime = "nodejs";

type QuarantineAction = "release" | "discard" | "block";

type QuarantineActionBody = {
  action?: unknown;
};

type QuarantineRow = {
  id: string;
  company_id: string;
  inbound_event_id: string | null;
  source_channel: "Email" | "WhatsApp" | "Formulario web" | "Chat web";
  sender_name: string | null;
  sender_email: string | null;
  sender_phone: string | null;
  sender_key: string | null;
  subject: string | null;
  body: string;
  classification: string;
  status: string;
};

type QuarantineCompany = {
  id: string;
  name: string;
  sector: string;
  description: string | null;
  tone: string | null;
  language: string | null;
  auto_acknowledgement_enabled: boolean;
  auto_acknowledgement_message: string | null;
};

type CustomerRow = {
  id: string;
  company_id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

function isQuarantineAction(value: unknown): value is QuarantineAction {
  return value === "release" || value === "discard" || value === "block";
}

async function findCustomer(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  row: QuarantineRow,
) {
  if (row.sender_email) {
    const { data, error } = await supabaseAdmin
      .from("customers")
      .select("id, company_id, name, email, phone")
      .eq("company_id", row.company_id)
      .eq("email", row.sender_email.toLowerCase())
      .limit(1)
      .maybeSingle<CustomerRow>();

    if (error) {
      throw new Error(error.message);
    }

    if (data) {
      return data;
    }
  }

  if (!row.sender_phone) {
    return null;
  }

  const normalizedPhone = normalizePhoneForComparison(row.sender_phone);
  const { data, error } = await supabaseAdmin
    .from("customers")
    .select("id, company_id, name, email, phone")
    .eq("company_id", row.company_id);

  if (error) {
    throw new Error(error.message);
  }

  return (
    ((data ?? []) as CustomerRow[]).find(
      (customer) =>
        normalizePhoneForComparison(customer.phone) === normalizedPhone,
    ) ?? null
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  let body: QuarantineActionBody;

  try {
    body = await readRequestJsonWithLimit<QuarantineActionBody>(request, 2048);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return buildRequestBodyTooLargeResponse(error.maxBytes);
    }

    return NextResponse.json({ error: "Petición no válida." }, { status: 400 });
  }

  if (!isQuarantineAction(body.action)) {
    return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
  }

  const { id } = await context.params;
  const { data: visibleRow, error: rowError } = await supabase
    .from("inbound_message_quarantine")
    .select(
      "id, company_id, inbound_event_id, source_channel, sender_name, sender_email, sender_phone, sender_key, subject, body, classification, status",
    )
    .eq("id", id)
    .maybeSingle<QuarantineRow>();

  if (rowError) {
    return NextResponse.json(
      { error: "No se pudo cargar el mensaje aislado." },
      { status: 500 },
    );
  }

  if (!visibleRow) {
    return NextResponse.json(
      { error: "El mensaje no existe o no pertenece a tu empresa." },
      { status: 404 },
    );
  }

  if (visibleRow.status !== "quarantined") {
    return NextResponse.json(
      { error: "Este mensaje ya ha sido revisado." },
      { status: 409 },
    );
  }

  const supabaseAdmin = createAdminClient();
  const reviewedAt = new Date().toISOString();

  if (body.action === "discard" || body.action === "block") {
    if (body.action === "block" && !visibleRow.sender_key) {
      return NextResponse.json(
        { error: "Este mensaje no tiene un remitente que se pueda bloquear." },
        { status: 400 },
      );
    }

    if (body.action === "block") {
      const { error: ruleError } = await supabaseAdmin
        .from("inbound_sender_rules")
        .upsert(
          {
            company_id: visibleRow.company_id,
            source_channel: visibleRow.source_channel,
            sender_key: visibleRow.sender_key?.toLowerCase(),
            action: "block",
            reason: "Bloqueado desde la cuarentena",
            created_by: user.id,
          },
          { onConflict: "company_id,source_channel,sender_key" },
        );

      if (ruleError) {
        return NextResponse.json(
          { error: "No se pudo bloquear el remitente." },
          { status: 500 },
        );
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from("inbound_message_quarantine")
      .update({
        status: "discarded",
        reviewed_by: user.id,
        reviewed_at: reviewedAt,
        updated_at: reviewedAt,
        review_error: null,
      })
      .eq("id", visibleRow.id)
      .eq("status", "quarantined");

    if (updateError) {
      return NextResponse.json(
        { error: "No se pudo descartar el mensaje." },
        { status: 500 },
      );
    }

    const { error: auditError } = await supabase.rpc("create_audit_log", {
      target_company_id: visibleRow.company_id,
      audit_action:
        body.action === "block"
          ? "block_inbound_sender"
          : "discard_quarantined_message",
      audit_entity_type: "inbound_message_quarantine",
      audit_entity_id: visibleRow.id,
      audit_metadata: {
        source_channel: visibleRow.source_channel,
        classification: visibleRow.classification,
        sender_blocked: body.action === "block",
      },
    });

    if (auditError) {
      console.error("Quarantine action completed, but audit log failed:", auditError);
    }

    return NextResponse.json({
      ok: true,
      status: "discarded",
      blocked: body.action === "block",
    });
  }

  const { data: claimedRow, error: claimError } = await supabaseAdmin
    .from("inbound_message_quarantine")
    .update({
      status: "processing",
      reviewed_by: user.id,
      reviewed_at: reviewedAt,
      updated_at: reviewedAt,
      review_error: null,
    })
    .eq("id", visibleRow.id)
    .eq("status", "quarantined")
    .select("id")
    .maybeSingle<{ id: string }>();

  if (claimError || !claimedRow) {
    return NextResponse.json(
      { error: "Otro usuario ya está revisando este mensaje." },
      { status: 409 },
    );
  }

  try {
    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .select(
        "id, name, sector, description, tone, language, auto_acknowledgement_enabled, auto_acknowledgement_message",
      )
      .eq("id", visibleRow.company_id)
      .single<QuarantineCompany>();

    if (companyError || !company) {
      throw new Error(companyError?.message || "Empresa no encontrada.");
    }

    let customer = await findCustomer(supabaseAdmin, visibleRow);

    if (!customer) {
      const { data: createdCustomer, error: customerError } =
        await supabaseAdmin
          .from("customers")
          .insert({
            company_id: visibleRow.company_id,
            name:
              visibleRow.sender_name?.trim() ||
              visibleRow.sender_email ||
              visibleRow.sender_phone ||
              "Contacto recuperado",
            email: visibleRow.sender_email,
            phone: visibleRow.sender_phone,
            language: company.language ?? "es",
            status: "active",
            last_interaction_at: reviewedAt,
          })
          .select("id, company_id, name, email, phone")
          .single<CustomerRow>();

      if (customerError || !createdCustomer) {
        throw new Error(
          getCustomerDatabaseErrorMessage(customerError?.message ?? ""),
        );
      }

      customer = createdCustomer;
    }

    const fallbackSubject =
      visibleRow.subject?.trim() ||
      visibleRow.body.split("\n").find((line) => line.trim())?.slice(0, 80) ||
      "Mensaje recuperado de cuarentena";
    let analysis = {
      language: company.language === "en" ? "en" : "es",
      category: "general_info",
      priority: "medium",
      sentiment: inferSentiment("general_info", visibleRow.body),
      summary: `${customer.name} ha enviado un mensaje por ${visibleRow.source_channel}.`,
      intent: "Mensaje legítimo recuperado de la cuarentena.",
      missingInformation: [] as string[],
      recommendedAction: "Revisar el mensaje y responder al cliente.",
      suggestedResponse: `Hola ${customer.name}, gracias por contactar con ${company.name}.`,
      subject: fallbackSubject,
    };

    try {
      analysis = await analyzeInquiryForCompany({
        customerName: customer.name,
        message: visibleRow.body,
        company,
      });
    } catch (analysisError) {
      console.error("Quarantine release analysis fallback used:", analysisError);
    }

    const { data: inquiryId, error: inquiryError } = await supabaseAdmin.rpc(
      "create_inquiry_with_initial_message",
      {
        p_company_id: company.id,
        p_customer_id: customer.id,
        p_customer_name: customer.name,
        p_source_channel: visibleRow.source_channel,
        p_subject: analysis.subject,
        p_original_message: visibleRow.body,
        p_ai_summary: analysis.summary,
        p_ai_intent: analysis.intent,
        p_ai_category: analysis.category,
        p_ai_priority: analysis.priority,
        p_ai_language: analysis.language,
        p_sentiment: analysis.sentiment,
        p_missing_information: analysis.missingInformation,
        p_recommended_action: analysis.recommendedAction,
        p_suggested_response: analysis.suggestedResponse,
        p_status: "new",
        p_message_direction: "inbound",
        p_message_author_type: "customer",
      },
    );

    if (inquiryError || !inquiryId) {
      throw new Error(inquiryError?.message || "No se pudo crear el caso.");
    }

    const releasedInquiryId = String(inquiryId);
    const { error: finishError } = await supabaseAdmin
      .from("inbound_message_quarantine")
      .update({
        status: "released",
        released_inquiry_id: releasedInquiryId,
        updated_at: new Date().toISOString(),
        review_error: null,
      })
      .eq("id", visibleRow.id)
      .eq("status", "processing");

    if (finishError) {
      throw new Error(finishError.message);
    }

    if (visibleRow.inbound_event_id) {
      await supabaseAdmin
        .from("inbound_events")
        .update({
          customer_id: customer.id,
          inquiry_id: releasedInquiryId,
        })
        .eq("id", visibleRow.inbound_event_id);
    }

    await sendAutomaticAcknowledgement(supabaseAdmin, {
      company,
      inquiryId: releasedInquiryId,
      customer,
      channel: visibleRow.source_channel,
      subject: analysis.subject,
    });

    const { error: auditError } = await supabase.rpc("create_audit_log", {
      target_company_id: visibleRow.company_id,
      audit_action: "release_quarantined_message",
      audit_entity_type: "inbound_message_quarantine",
      audit_entity_id: visibleRow.id,
      audit_metadata: {
        inquiry_id: releasedInquiryId,
        customer_id: customer.id,
        source_channel: visibleRow.source_channel,
      },
    });

    if (auditError) {
      console.error(
        "Quarantine release completed, but audit log failed:",
        auditError,
      );
    }

    return NextResponse.json({
      ok: true,
      status: "released",
      inquiryId: releasedInquiryId,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message.slice(0, 1000)
        : "No se pudo recuperar el mensaje.";

    await supabaseAdmin
      .from("inbound_message_quarantine")
      .update({
        status: "quarantined",
        review_error: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq("id", visibleRow.id)
      .eq("status", "processing");

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
