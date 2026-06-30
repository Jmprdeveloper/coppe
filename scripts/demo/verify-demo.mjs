import {
  countDemoRows,
  createDemoAdminClient,
  DEMO_COMPANY_NAME,
  DEMO_IDS,
  getDemoContext,
} from "./demo-helpers.mjs";

const admin = createDemoAdminClient();

async function verify() {
  const { company, owner, member } = await getDemoContext(admin);
  const expectedCounts = {
    customers: DEMO_IDS.customers.length,
    inquiries: DEMO_IDS.inquiries.length,
    inquiry_messages: 15,
    follow_ups: DEMO_IDS.followUps.length,
    appointments: DEMO_IDS.appointments.length,
    internal_notes: DEMO_IDS.notes.length,
    audit_logs: DEMO_IDS.auditLogs.length,
  };
  const idSets = {
    customers: DEMO_IDS.customers,
    inquiries: DEMO_IDS.inquiries,
    inquiry_messages: DEMO_IDS.messages,
    follow_ups: DEMO_IDS.followUps,
    appointments: DEMO_IDS.appointments,
    internal_notes: DEMO_IDS.notes,
    audit_logs: DEMO_IDS.auditLogs,
  };
  const observedCounts = Object.fromEntries(
    await Promise.all(
      Object.entries(idSets).map(async ([table, ids]) => [
        table,
        await countDemoRows(admin, table, ids),
      ])
    )
  );
  const { data: memberships, error: membershipError } = await admin
    .from("company_members")
    .select("user_id, role")
    .eq("company_id", company.id)
    .in("user_id", [owner.id, member.id]);

  if (membershipError) {
    throw new Error(
      `No se pudo verificar el equipo: ${membershipError.message}`
    );
  }

  const failures = Object.entries(expectedCounts)
    .filter(([table, expected]) => observedCounts[table] !== expected)
    .map(
      ([table, expected]) =>
        `${table}: ${observedCounts[table]} de ${expected}`
    );
  const hasOwner = memberships.some(
    (membership) =>
      membership.user_id === owner.id && membership.role === "owner"
  );
  const hasMember = memberships.some(
    (membership) =>
      membership.user_id === member.id && membership.role === "member"
  );

  if (!hasOwner || !hasMember) {
    failures.push("equipo: faltan los roles owner/member esperados");
  }

  if (failures.length > 0) {
    throw new Error(`Verificación incompleta:\n- ${failures.join("\n- ")}`);
  }

  console.log(
    [
      `Demo verificada: ${DEMO_COMPANY_NAME}`,
      ...Object.entries(expectedCounts).map(
        ([table, count]) => `- ${table}: ${count}`
      ),
      "- equipo: responsable + recepción",
      "- proveedores externos: no utilizados",
    ].join("\n")
  );
}

verify().catch((error) => {
  console.error(`La demo no está lista: ${error.message}`);
  process.exitCode = 1;
});
