import { createServerClient } from "@supabase/ssr";

import {
  createDemoAdminClient,
  DEMO_COMPANY_NAME,
  DEMO_OWNER_EMAIL,
  loadDemoEnvironment,
} from "./demo-helpers.mjs";

const appUrl = (process.env.COPPE_DEMO_APP_URL ?? "http://localhost:3000")
  .replace(/\/$/, "");
const { environment, supabaseUrl } = loadDemoEnvironment();
const publishableKey = environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabaseHost = new URL(supabaseUrl).hostname;

if (!["127.0.0.1", "localhost", "::1"].includes(supabaseHost)) {
  throw new Error(
    "Esta verificación crea y revisa datos de prueba. Solo puede ejecutarse contra Supabase local.",
  );
}

if (!publishableKey) {
  throw new Error("Falta NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
}

const admin = createDemoAdminClient();

async function getAuthenticatedCookieHeader() {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: DEMO_OWNER_EMAIL,
    options: { redirectTo: appUrl },
  });

  if (error || !data.properties?.action_link) {
    throw new Error(
      `No se pudo generar la sesión local: ${
        error?.message ?? "respuesta vacía"
      }`,
    );
  }

  const verifyResponse = await fetch(data.properties.action_link, {
    redirect: "manual",
  });
  const redirectLocation = verifyResponse.headers.get("location");

  if (!redirectLocation) {
    throw new Error("La sesión local no devolvió una redirección.");
  }

  const hash = new URL(redirectLocation).hash.replace(/^#/, "");
  const parameters = new URLSearchParams(hash);
  const accessToken = parameters.get("access_token");
  const refreshToken = parameters.get("refresh_token");

  if (!accessToken || !refreshToken) {
    throw new Error("La sesión local no devolvió credenciales temporales.");
  }

  let cookies = [];
  const supabase = createServerClient(supabaseUrl, publishableKey, {
    cookies: {
      getAll() {
        return cookies;
      },
      setAll(nextCookies) {
        for (const nextCookie of nextCookies) {
          cookies = cookies.filter(
            (cookie) => cookie.name !== nextCookie.name,
          );

          if (nextCookie.options?.maxAge !== 0) {
            cookies.push({
              name: nextCookie.name,
              value: nextCookie.value,
            });
          }
        }
      },
    },
  });
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (sessionError) {
    throw new Error(`No se pudo establecer la sesión: ${sessionError.message}`);
  }

  if (cookies.length === 0) {
    throw new Error("La sesión no produjo cookies para probar las rutas.");
  }

  return cookies
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
}

async function submitCommercialMessage(publicIntakeToken, suffix) {
  const senderEmail = `commercial-safety-${suffix}@example.com`;
  const response = await fetch(`${appUrl}/api/public-intake`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      publicIntakeToken,
      customerName: `Comercial Safety ${suffix}`,
      email: senderEmail,
      phone: `+3463${suffix.slice(-7).padStart(7, "0")}`,
      message:
        "Hola, he visto vuestra web y me gustaría ofreceros nuestros servicios de SEO y backlinks para captar clientes y llegar a la primera página de Google.",
      sourceChannel: "Formulario web",
    }),
  });
  const payload = await response.json();

  if (!response.ok || !payload.ok || payload.inquiryId) {
    throw new Error("El mensaje comercial no fue aislado correctamente.");
  }

  const { data: row, error } = await admin
    .from("inbound_message_quarantine")
    .select("id, company_id, status")
    .eq("sender_email", senderEmail)
    .eq("status", "quarantined")
    .single();

  if (error || !row) {
    throw new Error(
      `No se encontró el mensaje en cuarentena: ${
        error?.message ?? "respuesta vacía"
      }`,
    );
  }

  return { ...row, senderEmail };
}

async function performQuarantineAction(cookieHeader, id, action) {
  const response = await fetch(`${appUrl}/api/inbound-quarantine/${id}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Cookie: cookieHeader,
    },
    body: JSON.stringify({ action }),
  });
  const payload = await response.json();

  if (!response.ok || !payload.ok) {
    throw new Error(
      payload.error || `Falló la acción de cuarentena "${action}".`,
    );
  }

  return payload;
}

async function verify() {
  const { data: company, error: companyError } = await admin
    .from("companies")
    .select("id, public_intake_token")
    .eq("name", DEMO_COMPANY_NAME)
    .single();

  if (companyError || !company) {
    throw new Error(
      `No se encontró la empresa demo: ${
        companyError?.message ?? "respuesta vacía"
      }`,
    );
  }

  const cookieHeader = await getAuthenticatedCookieHeader();
  const runSuffix = Date.now().toString();

  const releasedRow = await submitCommercialMessage(
    company.public_intake_token,
    `${runSuffix}1`,
  );
  const releaseResult = await performQuarantineAction(
    cookieHeader,
    releasedRow.id,
    "release",
  );

  if (!releaseResult.inquiryId) {
    throw new Error("Recuperar el mensaje no creó un caso.");
  }

  const { data: releasedInquiry, error: releasedInquiryError } = await admin
    .from("inquiries")
    .select("id, customer_id")
    .eq("id", releaseResult.inquiryId)
    .single();

  if (releasedInquiryError || !releasedInquiry?.customer_id) {
    throw new Error("El caso recuperado no conserva el cliente.");
  }

  const { count: acknowledgementCount, error: acknowledgementError } =
    await admin
      .from("automatic_acknowledgements")
      .select("id", { count: "exact", head: true })
      .eq("inquiry_id", releaseResult.inquiryId)
      .eq("status", "sent");

  if (acknowledgementError || acknowledgementCount !== 1) {
    throw new Error("El mensaje recuperado no generó exactamente un acuse.");
  }

  const blockedRow = await submitCommercialMessage(
    company.public_intake_token,
    `${runSuffix}2`,
  );
  const blockResult = await performQuarantineAction(
    cookieHeader,
    blockedRow.id,
    "block",
  );

  if (!blockResult.blocked) {
    throw new Error("La acción de bloqueo no confirmó el remitente.");
  }

  const { count: blockedRuleCount, error: blockedRuleError } = await admin
    .from("inbound_sender_rules")
    .select("id", { count: "exact", head: true })
    .eq("company_id", company.id)
    .eq("sender_key", blockedRow.senderEmail)
    .eq("action", "block");

  if (blockedRuleError || blockedRuleCount !== 1) {
    throw new Error("No se creó la regla del remitente bloqueado.");
  }

  const exportResponse = await fetch(
    `${appUrl}/api/privacy/export-company`,
    { headers: { Cookie: cookieHeader } },
  );
  const exportPayload = await exportResponse.json();
  const expectedExportSections = [
    "automaticAcknowledgements",
    "inboundNotifications",
    "inboundNotificationReads",
    "inboundSenderRules",
    "inboundMessageQuarantine",
  ];

  if (
    !exportResponse.ok ||
    exportPayload.schemaVersion !== 2 ||
    expectedExportSections.some(
      (section) => !Object.hasOwn(exportPayload, section),
    )
  ) {
    throw new Error("La exportación no contiene toda la recepción inteligente.");
  }

  const { count: auditCount, error: auditError } = await admin
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("company_id", company.id)
    .in("action", [
      "release_quarantined_message",
      "block_inbound_sender",
      "export_company_data",
    ]);

  if (auditError || (auditCount ?? 0) < 3) {
    throw new Error("Las acciones críticas no quedaron auditadas.");
  }

  console.log(
    [
      "Recepción inteligente verificada en local.",
      "- Recuperación: caso, cliente y un único acuse.",
      "- Bloqueo: mensaje descartado y regla de remitente creada.",
      "- Exportación: esquema 2 con alertas, acuses, reglas y cuarentena.",
      "- Auditoría: recuperación, bloqueo y exportación registradas.",
    ].join("\n"),
  );
}

verify().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Verificación local fallida.",
  );
  process.exitCode = 1;
});
