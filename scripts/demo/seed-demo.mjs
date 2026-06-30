import {
  createDemoAdminClient,
  DEMO_COMPANY_NAME,
  DEMO_IDS,
  DEMO_MEMBER_EMAIL,
  DEMO_OWNER_EMAIL,
  ensureDemoUser,
  isoAtOffset,
  upsertRows,
} from "./demo-helpers.mjs";

const admin = createDemoAdminClient();

async function ensureCompany() {
  const { data: existingCompany, error: selectError } = await admin
    .from("companies")
    .select("id")
    .eq("name", DEMO_COMPANY_NAME)
    .maybeSingle();

  if (selectError) {
    throw new Error(
      `No se pudo consultar la empresa demo: ${selectError.message}`
    );
  }

  const values = {
    name: DEMO_COMPANY_NAME,
    sector: "Alojamiento turístico",
    description:
      "Hotel boutique ficticio de 48 habitaciones que centraliza reservas, cambios, incidencias y seguimiento de huéspedes.",
    tone: "Profesional, cercano y resolutivo",
    language: "es",
    public_intake_enabled: true,
    public_chat_enabled: true,
  };

  if (existingCompany) {
    const { data, error } = await admin
      .from("companies")
      .update(values)
      .eq("id", existingCompany.id)
      .select("id")
      .single();

    if (error) {
      throw new Error(
        `No se pudo actualizar la empresa demo: ${error.message}`
      );
    }

    return data;
  }

  const { data, error } = await admin
    .from("companies")
    .insert(values)
    .select("id")
    .single();

  if (error) {
    throw new Error(`No se pudo crear la empresa demo: ${error.message}`);
  }

  return data;
}

async function seed() {
  const [company, owner, member] = await Promise.all([
    ensureCompany(),
    ensureDemoUser(admin, {
      email: DEMO_OWNER_EMAIL,
      fullName: "Lucía Fernández",
      roleLabel: "Responsable de atención",
    }),
    ensureDemoUser(admin, {
      email: DEMO_MEMBER_EMAIL,
      fullName: "Marcos Vidal",
      roleLabel: "Recepción",
    }),
  ]);

  const { error: membershipError } = await admin
    .from("company_members")
    .upsert(
      [
        {
          company_id: company.id,
          user_id: owner.id,
          role: "owner",
        },
        {
          company_id: company.id,
          user_id: member.id,
          role: "member",
        },
      ],
      {
        onConflict: "company_id,user_id",
      }
    );

  if (membershipError) {
    throw new Error(
      `No se pudo preparar el equipo demo: ${membershipError.message}`
    );
  }

  const customerRows = [
    ["Ana Torres", "ana.torres@example.com", "+34 611 000 101", "es", -1],
    ["David Martín", "david.martin@example.com", "+34 611 000 102", "es", 0],
    ["Laura Gómez", "laura.gomez@example.com", "+34 611 000 103", "es", -2],
    ["Carlos Ruiz", "carlos.ruiz@example.com", "+34 611 000 104", "es", -4],
    ["Sophie Bernard", "sophie.bernard@example.com", "+33 600 000 105", "en", -3],
    ["Miguel Santos", "miguel.santos@example.com", "+34 611 000 106", "es", -6],
    ["Elena Navarro", "elena.navarro@example.com", "+34 611 000 107", "es", -1],
    ["Thomas Müller", "thomas.muller@example.com", "+49 151 000 108", "en", -8],
    ["Paula Herrera", "paula.herrera@example.com", "+34 611 000 109", "es", -5],
    ["Javier Romero", "javier.romero@example.com", "+34 611 000 110", "es", -9],
    ["Isabel Vega", "isabel.vega@example.com", "+34 611 000 111", "es", -12],
    ["Andrea Molina", "andrea.molina@example.com", "+34 611 000 112", "es", -14],
  ].map(([name, email, phone, language, dayOffset], index) => ({
    id: DEMO_IDS.customers[index],
    company_id: company.id,
    name,
    email,
    phone,
    language,
    status: index === 11 ? "inactive" : "active",
    last_interaction_at: isoAtOffset(dayOffset, 11 + (index % 5), 15),
    created_at: isoAtOffset(dayOffset - 20, 9, 0),
  }));

  await upsertRows(admin, "customers", customerRows);

  const inquiryDefinitions = [
    {
      customer: 0,
      channel: "Chat web",
      subject: "Cambio urgente de fecha de reserva",
      original:
        "Necesito retrasar mi llegada un día por la cancelación de mi vuelo. ¿Podéis mantener la habitación?",
      summary:
        "La huésped solicita retrasar un día la llegada por cancelación de vuelo sin perder la reserva.",
      intent: "Modificar una reserva existente",
      category: "change_or_cancellation",
      priority: "high",
      language: "es",
      sentiment: "negative",
      missing: ["Localizador de la reserva"],
      action:
        "Solicitar el localizador y bloquear provisionalmente la nueva fecha.",
      suggestion:
        "Hola Ana, sentimos la incidencia con tu vuelo. Envíanos el localizador y comprobaremos ahora mismo el cambio para mantener tu habitación.",
      status: "pending",
      days: 0,
      assignee: owner.id,
    },
    {
      customer: 1,
      channel: "Formulario web",
      subject: "Presupuesto para grupo de empresa",
      original:
        "Somos 18 personas y necesitamos alojamiento y una sala de reuniones durante dos días en septiembre.",
      summary:
        "Solicitud de presupuesto corporativo para 18 personas, alojamiento y sala durante dos días.",
      intent: "Solicitar presupuesto de grupo",
      category: "quote_request",
      priority: "high",
      language: "es",
      sentiment: "positive",
      missing: ["Fechas exactas", "Configuración de la sala"],
      action:
        "Confirmar fechas y necesidades audiovisuales antes de preparar la propuesta.",
      suggestion:
        "Hola David, gracias por contar con nosotros. Para preparar una propuesta cerrada necesitamos las fechas exactas y saber si requerís pantalla o videoconferencia.",
      status: "new",
      days: 0,
      assignee: owner.id,
    },
    {
      customer: 2,
      channel: "Email",
      subject: "Objeto olvidado en la habitación",
      original:
        "Creo que olvidé un portátil pequeño en la habitación 214 al salir esta mañana.",
      summary:
        "La clienta informa de un posible portátil olvidado en la habitación 214.",
      intent: "Recuperar un objeto perdido",
      category: "support_request",
      priority: "high",
      language: "es",
      sentiment: "negative",
      missing: ["Descripción del portátil"],
      action:
        "Contactar con pisos de inmediato y confirmar custodia del objeto.",
      suggestion:
        "Hola Laura, ya hemos avisado al equipo de pisos para revisar la habitación 214. ¿Puedes indicarnos marca, color y tamaño aproximado?",
      status: "waiting_customer",
      days: -1,
      assignee: member.id,
    },
    {
      customer: 3,
      channel: "Teléfono",
      subject: "Reserva de cena y traslado",
      original:
        "Quiero reservar cena para cuatro personas y un taxi al aeropuerto mañana a las seis.",
      summary:
        "Solicitud de cena para cuatro y traslado al aeropuerto a las 06:00.",
      intent: "Organizar servicios adicionales",
      category: "service_request",
      priority: "medium",
      language: "es",
      sentiment: "neutral",
      missing: ["Hora preferida para la cena"],
      action:
        "Confirmar hora de cena, reservar mesa y programar traslado.",
      suggestion:
        "Carlos, podemos encargarnos de ambos servicios. ¿A qué hora preferís cenar? El taxi quedaría solicitado para las 06:00.",
      status: "replied",
      days: -2,
      assignee: member.id,
    },
    {
      customer: 4,
      channel: "Chat web",
      subject: "Late check-in et parking",
      original:
        "Notre vol arrive à 23h40. Est-il possible de faire le check-in après minuit et de réserver une place de parking?",
      summary:
        "La cliente consulta por llegada después de medianoche y reserva de aparcamiento.",
      intent: "Confirmar llegada tardía y aparcamiento",
      category: "general_info",
      priority: "medium",
      language: "en",
      sentiment: "neutral",
      missing: ["Matrícula del vehículo"],
      action:
        "Confirmar recepción 24 horas y solicitar matrícula para el parking.",
      suggestion:
        "Bonjour Sophie, notre réception est ouverte 24h/24. Nous pouvons réserver votre place de parking; indiquez-nous simplement l'immatriculation.",
      status: "waiting_customer",
      days: -3,
      assignee: owner.id,
    },
    {
      customer: 5,
      channel: "WhatsApp",
      subject: "Aire acondicionado no funciona",
      original:
        "El aire de la habitación 308 no enfría y tenemos un bebé. ¿Podéis ayudarnos pronto?",
      summary:
        "Incidencia urgente con climatización en habitación 308; viajan con un bebé.",
      intent: "Resolver incidencia en habitación",
      category: "complaint_or_incident",
      priority: "high",
      language: "es",
      sentiment: "negative",
      missing: [],
      action:
        "Enviar mantenimiento de inmediato y preparar habitación alternativa.",
      suggestion:
        "Miguel, sentimos la incidencia. Mantenimiento sube ahora mismo y dejamos preparada una habitación alternativa por si no se resuelve de inmediato.",
      status: "closed",
      days: -5,
      assignee: owner.id,
    },
    {
      customer: 6,
      channel: "Email",
      subject: "Factura con datos de empresa",
      original:
        "Necesito que la factura incluya la razón social y el CIF de mi empresa.",
      summary:
        "La clienta solicita corregir la factura con datos fiscales de empresa.",
      intent: "Modificar datos de facturación",
      category: "billing_or_payment",
      priority: "medium",
      language: "es",
      sentiment: "neutral",
      missing: ["Razón social", "CIF", "Domicilio fiscal"],
      action:
        "Solicitar datos fiscales completos y emitir factura rectificativa.",
      suggestion:
        "Hola Elena, envíanos razón social, CIF y domicilio fiscal y te remitiremos la factura corregida.",
      status: "pending",
      days: -1,
      assignee: member.id,
    },
    {
      customer: 7,
      channel: "Formulario web",
      subject: "Accessibility information",
      original:
        "Do you have an accessible room with a roll-in shower and step-free access from the car park?",
      summary:
        "Consulta por habitación accesible, ducha adaptada y acceso sin escalones desde aparcamiento.",
      intent: "Verificar accesibilidad",
      category: "product_service_inquiry",
      priority: "medium",
      language: "en",
      sentiment: "neutral",
      missing: ["Fechas de estancia"],
      action:
        "Confirmar fechas y disponibilidad de habitación accesible.",
      suggestion:
        "Hello Thomas, we do have accessible rooms and step-free access. Please send us your dates so we can confirm availability.",
      status: "replied",
      days: -7,
      assignee: owner.id,
    },
    {
      customer: 8,
      channel: "Instagram",
      subject: "Celebración de aniversario",
      original:
        "Nos alojamos el viernes por nuestro aniversario. ¿Podéis preparar algún detalle en la habitación?",
      summary:
        "Solicitud de detalle especial en habitación para una celebración de aniversario.",
      intent: "Personalizar una estancia",
      category: "service_request",
      priority: "low",
      language: "es",
      sentiment: "positive",
      missing: ["Presupuesto aproximado"],
      action:
        "Ofrecer opciones de bienvenida y confirmar presupuesto.",
      suggestion:
        "¡Enhorabuena, Paula! Podemos preparar varias opciones de bienvenida. ¿Prefieres un detalle incluido o una experiencia especial con presupuesto adicional?",
      status: "new",
      days: -4,
      assignee: null,
    },
    {
      customer: 9,
      channel: "Perfil de Empresa de Google",
      subject: "Seguimiento de reclamación",
      original:
        "Hace una semana informé de un cargo duplicado y todavía no he recibido confirmación del abono.",
      summary:
        "Seguimiento por cargo duplicado sin confirmación de devolución tras una semana.",
      intent: "Reclamar devolución pendiente",
      category: "follow_up",
      priority: "high",
      language: "es",
      sentiment: "negative",
      missing: ["Últimos cuatro dígitos de la tarjeta"],
      action:
        "Revisar el expediente de cobro, confirmar estado y dar plazo de resolución.",
      suggestion:
        "Javier, sentimos la demora. Estamos revisando el expediente con administración y hoy te confirmaremos el estado y la fecha prevista del abono.",
      status: "pending",
      days: -8,
      assignee: owner.id,
    },
  ];

  const inquiryRows = inquiryDefinitions.map((definition, index) => {
    const customer = customerRows[definition.customer];

    return {
      id: DEMO_IDS.inquiries[index],
      company_id: company.id,
      customer_id: customer.id,
      customer_name: customer.name,
      source_channel: definition.channel,
      subject: definition.subject,
      original_message: definition.original,
      ai_summary: definition.summary,
      ai_intent: definition.intent,
      ai_category: definition.category,
      ai_priority: definition.priority,
      ai_language: definition.language,
      sentiment: definition.sentiment,
      missing_information: definition.missing,
      recommended_action: definition.action,
      suggested_response: definition.suggestion,
      status: definition.status,
      created_at: isoAtOffset(definition.days, 9 + (index % 7), 10),
      assigned_to: definition.assignee,
      assigned_at: definition.assignee
        ? isoAtOffset(definition.days, 10 + (index % 6), 0)
        : null,
      assigned_by: definition.assignee ? owner.id : null,
    };
  });

  await upsertRows(admin, "inquiries", inquiryRows);

  const messageRows = [];
  let messageIndex = 0;

  inquiryRows.forEach((inquiry, index) => {
    const definition = inquiryDefinitions[index];

    messageRows.push({
      id: DEMO_IDS.messages[messageIndex],
      company_id: company.id,
      inquiry_id: inquiry.id,
      customer_id: inquiry.customer_id,
      direction: "inbound",
      author_type: "customer",
      body: definition.original,
      source_channel: definition.channel,
      created_by: null,
      created_at: inquiry.created_at,
    });
    messageIndex += 1;

    if (["waiting_customer", "replied", "closed"].includes(inquiry.status)) {
      messageRows.push({
        id: DEMO_IDS.messages[messageIndex],
        company_id: company.id,
        inquiry_id: inquiry.id,
        customer_id: inquiry.customer_id,
        direction: "outbound",
        author_type: "company",
        body: definition.suggestion,
        source_channel: definition.channel,
        created_by: definition.assignee ?? owner.id,
        created_at: isoAtOffset(definition.days, 12 + (index % 5), 20),
      });
      messageIndex += 1;
    }
  });

  await upsertRows(admin, "inquiry_messages", messageRows);

  await upsertRows(admin, "follow_ups", [
    {
      id: DEMO_IDS.followUps[0],
      company_id: company.id,
      customer_id: customerRows[0].id,
      inquiry_id: inquiryRows[0].id,
      title: "Confirmar cambio de fechas con Ana",
      due_at: isoAtOffset(0, 13, 0),
      status: "pending",
      urgency: "today",
      created_at: isoAtOffset(-1, 16, 0),
    },
    {
      id: DEMO_IDS.followUps[1],
      company_id: company.id,
      customer_id: customerRows[9].id,
      inquiry_id: inquiryRows[9].id,
      title: "Actualizar devolución del cargo duplicado",
      due_at: isoAtOffset(-1, 17, 0),
      status: "pending",
      urgency: "overdue",
      created_at: isoAtOffset(-4, 10, 0),
    },
    {
      id: DEMO_IDS.followUps[2],
      company_id: company.id,
      customer_id: customerRows[1].id,
      inquiry_id: inquiryRows[1].id,
      title: "Preparar propuesta para el grupo de empresa",
      due_at: isoAtOffset(1, 11, 0),
      status: "pending",
      urgency: "upcoming",
      created_at: isoAtOffset(0, 10, 30),
    },
    {
      id: DEMO_IDS.followUps[3],
      company_id: company.id,
      customer_id: customerRows[8].id,
      inquiry_id: inquiryRows[8].id,
      title: "Confirmar detalle de aniversario",
      due_at: isoAtOffset(3, 12, 0),
      status: "pending",
      urgency: "upcoming",
      created_at: isoAtOffset(-2, 9, 0),
    },
    {
      id: DEMO_IDS.followUps[4],
      company_id: company.id,
      customer_id: customerRows[5].id,
      inquiry_id: inquiryRows[5].id,
      title: "Comprobar satisfacción tras resolver climatización",
      due_at: isoAtOffset(-3, 12, 0),
      status: "completed",
      urgency: "upcoming",
      created_at: isoAtOffset(-5, 17, 0),
    },
  ]);

  await upsertRows(admin, "appointments", [
    {
      id: DEMO_IDS.appointments[0],
      company_id: company.id,
      inquiry_id: inquiryRows[1].id,
      customer_id: customerRows[1].id,
      assigned_to: owner.id,
      title: "Videollamada: alojamiento del equipo",
      scheduled_at: isoAtOffset(1, 12, 30),
      duration_minutes: 30,
      timezone: "Europe/Madrid",
      location: "Videollamada · recepción",
      buffer_before_minutes: 10,
      buffer_after_minutes: 15,
      status: "confirmed",
      notes: "Revisar sala, desayunos, cancelación y facturación centralizada.",
      created_at: isoAtOffset(-1, 14, 0),
      updated_at: isoAtOffset(0, 9, 0),
    },
    {
      id: DEMO_IDS.appointments[1],
      company_id: company.id,
      inquiry_id: inquiryRows[3].id,
      customer_id: customerRows[3].id,
      assigned_to: member.id,
      title: "Cena en restaurante",
      scheduled_at: isoAtOffset(0, 21, 0),
      duration_minutes: 90,
      timezone: "Europe/Madrid",
      location: "Restaurante · mesa 12",
      buffer_before_minutes: 15,
      buffer_after_minutes: 15,
      status: "confirmed",
      notes: "Mesa para cuatro; avisar de intolerancia a la lactosa.",
      created_at: isoAtOffset(-2, 12, 0),
      updated_at: isoAtOffset(-1, 8, 0),
    },
    {
      id: DEMO_IDS.appointments[2],
      company_id: company.id,
      inquiry_id: inquiryRows[8].id,
      customer_id: customerRows[8].id,
      assigned_to: owner.id,
      title: "Preparar habitación aniversario",
      scheduled_at: isoAtOffset(2, 16, 0),
      duration_minutes: 30,
      timezone: "Europe/Madrid",
      location: "Habitación asignada",
      buffer_before_minutes: 15,
      buffer_after_minutes: 0,
      status: "proposed",
      notes: "Pendiente confirmar opción de bienvenida.",
      created_at: isoAtOffset(-2, 10, 0),
      updated_at: isoAtOffset(-2, 10, 0),
    },
    {
      id: DEMO_IDS.appointments[3],
      company_id: company.id,
      inquiry_id: inquiryRows[5].id,
      customer_id: customerRows[5].id,
      assigned_to: member.id,
      title: "Revisión técnica habitación 308",
      scheduled_at: isoAtOffset(-5, 15, 0),
      duration_minutes: 45,
      timezone: "Europe/Madrid",
      location: "Habitación 308",
      buffer_before_minutes: 10,
      buffer_after_minutes: 10,
      status: "completed",
      notes: "Sustituido condensador; temperatura verificada.",
      created_at: isoAtOffset(-5, 14, 0),
      updated_at: isoAtOffset(-5, 16, 0),
    },
  ]);

  await upsertRows(admin, "internal_notes", [
    {
      id: DEMO_IDS.notes[0],
      company_id: company.id,
      customer_id: customerRows[1].id,
      inquiry_id: inquiryRows[1].id,
      body: "Cliente corporativo con potencial de repetición trimestral. Priorizar propuesta clara y condiciones de cancelación.",
      created_by: owner.id,
      created_at: isoAtOffset(0, 10, 45),
    },
    {
      id: DEMO_IDS.notes[1],
      company_id: company.id,
      customer_id: customerRows[2].id,
      inquiry_id: inquiryRows[2].id,
      body: "Pisos ha localizado un portátil gris. Mantener en custodia hasta validar la descripción.",
      created_by: member.id,
      created_at: isoAtOffset(-1, 13, 0),
    },
    {
      id: DEMO_IDS.notes[2],
      company_id: company.id,
      customer_id: customerRows[5].id,
      inquiry_id: inquiryRows[5].id,
      body: "Incidencia resuelta en 28 minutos. Se ofreció cambio de habitación, que no fue necesario.",
      created_by: owner.id,
      created_at: isoAtOffset(-5, 16, 10),
    },
    {
      id: DEMO_IDS.notes[3],
      company_id: company.id,
      customer_id: customerRows[9].id,
      inquiry_id: inquiryRows[9].id,
      body: "Administración confirma devolución emitida; solicitar justificante para enviarlo al cliente.",
      created_by: owner.id,
      created_at: isoAtOffset(-1, 9, 15),
    },
  ]);

  await upsertRows(admin, "audit_logs", [
    {
      id: DEMO_IDS.auditLogs[0],
      company_id: company.id,
      actor_user_id: owner.id,
      actor_email: DEMO_OWNER_EMAIL,
      actor_role: "owner",
      action: "assign_inquiry",
      entity_type: "inquiry",
      entity_id: inquiryRows[0].id,
      metadata: { assigned_to: owner.id, demo: true },
      created_at: isoAtOffset(0, 10, 0),
    },
    {
      id: DEMO_IDS.auditLogs[1],
      company_id: company.id,
      actor_user_id: owner.id,
      actor_email: DEMO_OWNER_EMAIL,
      actor_role: "owner",
      action: "assign_inquiry",
      entity_type: "inquiry",
      entity_id: inquiryRows[1].id,
      metadata: { assigned_to: owner.id, demo: true },
      created_at: isoAtOffset(0, 10, 5),
    },
    {
      id: DEMO_IDS.auditLogs[2],
      company_id: company.id,
      actor_user_id: member.id,
      actor_email: DEMO_MEMBER_EMAIL,
      actor_role: "member",
      action: "create_internal_note",
      entity_type: "inquiry",
      entity_id: inquiryRows[2].id,
      metadata: { demo: true },
      created_at: isoAtOffset(-1, 13, 0),
    },
    {
      id: DEMO_IDS.auditLogs[3],
      company_id: company.id,
      actor_user_id: owner.id,
      actor_email: DEMO_OWNER_EMAIL,
      actor_role: "owner",
      action: "update_inquiry_status",
      entity_type: "inquiry",
      entity_id: inquiryRows[5].id,
      metadata: { previous_status: "pending", status: "closed", demo: true },
      created_at: isoAtOffset(-5, 16, 20),
    },
    {
      id: DEMO_IDS.auditLogs[4],
      company_id: company.id,
      actor_user_id: member.id,
      actor_email: DEMO_MEMBER_EMAIL,
      actor_role: "member",
      action: "create_appointment",
      entity_type: "appointment",
      entity_id: DEMO_IDS.appointments[1],
      metadata: { demo: true },
      created_at: isoAtOffset(-2, 12, 0),
    },
    {
      id: DEMO_IDS.auditLogs[5],
      company_id: company.id,
      actor_user_id: owner.id,
      actor_email: DEMO_OWNER_EMAIL,
      actor_role: "owner",
      action: "export_company_data",
      entity_type: "company",
      entity_id: company.id,
      metadata: { reason: "Demostración de portabilidad", demo: true },
      created_at: isoAtOffset(-1, 17, 30),
    },
  ]);

  console.log(
    [
      `Empresa demo preparada: ${DEMO_COMPANY_NAME}`,
      "Datos: 12 clientes, 10 casos, conversaciones, 5 seguimientos,",
      "4 citas, 4 notas internas, 6 eventos de auditoría y 2 roles.",
      "No se ha enviado ningún correo, WhatsApp ni solicitud a OpenAI.",
    ].join("\n")
  );
}

seed().catch((error) => {
  console.error(`No se pudo preparar la demo: ${error.message}`);
  process.exitCode = 1;
});
