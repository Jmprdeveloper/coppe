import { NextResponse } from "next/server";

import { getCurrentCompany } from "../../../../lib/currentCompany";
import { checkServerApiRateLimit } from "../../../../lib/serverApiRateLimit";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { createClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ExportQueryResult = {
  data: unknown;
  error: { message?: string } | null;
};

function assertExportQuery(
  result: ExportQueryResult,
  sectionName: string
) {
  if (result.error) {
    throw new Error(
      `No se pudo exportar ${sectionName}: ${
        result.error.message || "sin detalle del error"
      }`
    );
  }

  return result.data ?? [];
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { data: company, error: companyError } =
    await getCurrentCompany(supabase);

  if (companyError || !company) {
    return NextResponse.json(
      { error: "No se pudo localizar la empresa." },
      { status: 404 }
    );
  }

  if (!("userRole" in company) || company.userRole !== "owner") {
    return NextResponse.json(
      { error: "Solo un propietario puede exportar los datos de la empresa." },
      { status: 403 }
    );
  }

  const supabaseAdmin = createAdminClient();

  try {
    const rateLimit = await checkServerApiRateLimit(supabaseAdmin, {
      bucketKey: `privacy-export:company:${company.id}:user:${user.id}`,
      maxRequests: 3,
      windowSeconds: 60 * 60,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error:
            "Se ha alcanzado el límite temporal de exportaciones. Inténtalo más tarde.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retry_after_seconds),
          },
        }
      );
    }
  } catch (error) {
    console.error("Could not check privacy export rate limit:", error);

    return NextResponse.json(
      { error: "No se pudo comprobar el límite de exportaciones." },
      { status: 500 }
    );
  }

  const { error: auditError } = await supabase.rpc("create_audit_log", {
    target_company_id: company.id,
    audit_action: "export_company_data",
    audit_entity_type: "company",
    audit_entity_id: company.id,
    audit_metadata: {
      export_format: "json",
    },
  });

  if (auditError) {
    return NextResponse.json(
      { error: "No se pudo auditar la exportación solicitada." },
      { status: 500 }
    );
  }

  try {
    const [
      companyResult,
      teamResult,
      customersResult,
      inquiriesResult,
      messagesResult,
      notesResult,
      followUpsResult,
      appointmentsResult,
      inboundEventsResult,
      outboundMessagesResult,
      auditLogsResult,
      emailChannelsResult,
      whatsAppChannelsResult,
      publicChatSessionsResult,
      acknowledgementsResult,
      inboundNotificationsResult,
      notificationReadsResult,
      inboundSenderRulesResult,
      inboundQuarantineResult,
    ] = await Promise.all([
      supabaseAdmin
        .from("companies")
        .select(
          "id, name, sector, description, tone, language, public_intake_enabled, public_chat_enabled, auto_acknowledgement_enabled, auto_acknowledgement_message, inbound_filter_enabled, created_at"
        )
        .eq("id", company.id)
        .maybeSingle(),
      supabase.rpc("get_company_team_members", {
        target_company_id: company.id,
      }),
      supabaseAdmin.from("customers").select("*").eq("company_id", company.id),
      supabaseAdmin.from("inquiries").select("*").eq("company_id", company.id),
      supabaseAdmin
        .from("inquiry_messages")
        .select("*")
        .eq("company_id", company.id),
      supabaseAdmin
        .from("internal_notes")
        .select("*")
        .eq("company_id", company.id),
      supabaseAdmin.from("follow_ups").select("*").eq("company_id", company.id),
      supabaseAdmin
        .from("appointments")
        .select("*")
        .eq("company_id", company.id),
      supabaseAdmin
        .from("inbound_events")
        .select("*")
        .eq("company_id", company.id),
      supabaseAdmin
        .from("outbound_messages")
        .select(
          "id, company_id, inquiry_id, customer_id, inquiry_message_id, channel, provider, status, from_address, from_name, to_address, subject, body, provider_message_id, error_message, sent_at, failed_at, created_by, created_at, attempt_count, processing_started_at, requested_inquiry_status, resolved_at, resolved_by, resolution"
        )
        .eq("company_id", company.id),
      supabaseAdmin
        .from("audit_logs")
        .select("*")
        .eq("company_id", company.id),
      supabaseAdmin
        .from("inbound_email_channels")
        .select(
          "id, company_id, inbound_email_address, local_part, provider, enabled, created_at"
        )
        .eq("company_id", company.id),
      supabaseAdmin
        .from("inbound_whatsapp_channels")
        .select(
          "id, company_id, phone_number_id, display_phone_number, provider, provider_business_account_id, enabled, created_at"
        )
        .eq("company_id", company.id),
      supabaseAdmin
        .from("public_chat_sessions")
        .select(
          "id, company_id, inquiry_id, customer_id, expires_at, last_activity_at, created_at"
        )
        .eq("company_id", company.id),
      supabaseAdmin
        .from("automatic_acknowledgements")
        .select("*")
        .eq("company_id", company.id),
      supabaseAdmin
        .from("inbound_notifications")
        .select("*")
        .eq("company_id", company.id),
      supabaseAdmin
        .from("inbound_notification_reads")
        .select(
          "notification_id, user_id, read_at, inbound_notifications!inner(company_id)"
        )
        .eq("inbound_notifications.company_id", company.id),
      supabaseAdmin
        .from("inbound_sender_rules")
        .select("*")
        .eq("company_id", company.id),
      supabaseAdmin
        .from("inbound_message_quarantine")
        .select("*")
        .eq("company_id", company.id),
    ]);

    const exportedAt = new Date().toISOString();
    const exportPayload = {
      schemaVersion: 2,
      exportedAt,
      company: assertExportQuery(companyResult, "la empresa"),
      team: assertExportQuery(teamResult, "el equipo"),
      customers: assertExportQuery(customersResult, "los clientes"),
      inquiries: assertExportQuery(inquiriesResult, "los casos"),
      inquiryMessages: assertExportQuery(
        messagesResult,
        "los mensajes de casos"
      ),
      internalNotes: assertExportQuery(notesResult, "las notas internas"),
      followUps: assertExportQuery(followUpsResult, "los seguimientos"),
      appointments: assertExportQuery(appointmentsResult, "las citas"),
      inboundEvents: assertExportQuery(
        inboundEventsResult,
        "los eventos entrantes"
      ),
      outboundMessages: assertExportQuery(
        outboundMessagesResult,
        "los envíos salientes"
      ),
      auditLogs: assertExportQuery(auditLogsResult, "la auditoría"),
      inboundEmailChannels: assertExportQuery(
        emailChannelsResult,
        "los canales de email"
      ),
      inboundWhatsAppChannels: assertExportQuery(
        whatsAppChannelsResult,
        "los canales de WhatsApp"
      ),
      publicChatSessions: assertExportQuery(
        publicChatSessionsResult,
        "las sesiones de chat público"
      ),
      automaticAcknowledgements: assertExportQuery(
        acknowledgementsResult,
        "los acuses automáticos"
      ),
      inboundNotifications: assertExportQuery(
        inboundNotificationsResult,
        "las notificaciones de entrada"
      ),
      inboundNotificationReads: assertExportQuery(
        notificationReadsResult,
        "las lecturas de notificaciones"
      ),
      inboundSenderRules: assertExportQuery(
        inboundSenderRulesResult,
        "las reglas de remitentes"
      ),
      inboundMessageQuarantine: assertExportQuery(
        inboundQuarantineResult,
        "la cuarentena de entrada"
      ),
    };
    const filenameDate = exportedAt.slice(0, 10);

    return new NextResponse(JSON.stringify(exportPayload, null, 2), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="coppe-company-export-${filenameDate}.json"`,
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("Company privacy export failed:", error);

    return NextResponse.json(
      { error: "No se pudo generar la exportación de la empresa." },
      { status: 500 }
    );
  }
}
