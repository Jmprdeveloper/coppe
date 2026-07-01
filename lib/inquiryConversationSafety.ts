import type { CurrentCompany } from "./currentCompany";
import { normalizeSearchText } from "./searchUtils";

type BusinessDomain =
  | "automotive"
  | "accommodation"
  | "healthcare"
  | "restaurant"
  | "education"
  | "legal_accounting";

type DomainDefinition = {
  id: BusinessDomain;
  requestLabelEs: string;
  requestLabelEn: string;
  companyPatterns: RegExp[];
  requestPatterns: RegExp[];
};

export type OutOfScopeRequest = {
  requestDomain: BusinessDomain;
  requestLabelEs: string;
  requestLabelEn: string;
};

const domainDefinitions: DomainDefinition[] = [
  {
    id: "automotive",
    requestLabelEs: "una reparación o servicio para un vehículo",
    requestLabelEn: "a vehicle repair or automotive service",
    companyPatterns: [
      /\btaller(?:\s+mec[aá]nico)?\b/i,
      /\bmec[aá]nic[ao]\b/i,
      /\bautomoci[oó]n\b/i,
      /\breparaci[oó]n\s+de\s+(?:veh[ií]culos?|coches?|motos?)\b/i,
    ],
    requestPatterns: [
      /\b(?:reparar|arreglar|aver[ií]a|no\s+arranca|cambiar|revisar)\b.{0,70}\b(?:moto|coche|veh[ií]culo|motor|frenos?|bater[ií]a)\b/i,
      /\b(?:moto|coche|veh[ií]culo|motor)\b.{0,70}\b(?:aver[ií]a|no\s+arranca|reparar|arreglar|taller)\b/i,
    ],
  },
  {
    id: "accommodation",
    requestLabelEs: "una reserva de alojamiento o habitación",
    requestLabelEn: "an accommodation or room booking",
    companyPatterns: [
      /\bhotel\b/i,
      /\bhostal\b/i,
      /\balojamiento\b/i,
      /\bhospedaje\b/i,
      /\bapartamentos?\s+tur[ií]sticos?\b/i,
      /\bcasa\s+rural\b/i,
    ],
    requestPatterns: [
      /\b(?:habitaci[oó]n|alojamiento|hospedaje|hotel)\b.{0,60}\b(?:persona|personas|noche|noches|fin\s+de\s+semana|reserv)/i,
      /\b(?:reservar|necesito|quiero|busco)\b.{0,60}\b(?:habitaci[oó]n|alojamiento|hotel|noche|noches)\b/i,
      /\b(?:room|accommodation|hotel)\b.{0,60}\b(?:guest|guests|night|nights|weekend|book)/i,
    ],
  },
  {
    id: "healthcare",
    requestLabelEs: "una consulta o atención sanitaria",
    requestLabelEn: "a healthcare consultation or treatment",
    companyPatterns: [
      /\bcl[ií]nica\b/i,
      /\bcentro\s+m[eé]dico\b/i,
      /\bm[eé]dic[oa]\b/i,
      /\bsanitari[oa]\b/i,
      /\bfisioterap/i,
      /\bdental\b/i,
    ],
    requestPatterns: [
      /\b(?:dolor|molestias?|s[ií]ntomas?|paciente|consulta\s+m[eé]dica|doctor|doctora|tratamiento)\b/i,
      /\b(?:pain|symptoms?|patient|medical\s+appointment|doctor|treatment)\b/i,
    ],
  },
  {
    id: "restaurant",
    requestLabelEs: "una reserva de mesa o servicio de restauración",
    requestLabelEn: "a table booking or restaurant service",
    companyPatterns: [
      /\brestaurante\b/i,
      /\bcafeter[ií]a\b/i,
      /\bbar\b/i,
      /\bhosteler[ií]a\b/i,
      /\bcatering\b/i,
    ],
    requestPatterns: [
      /\b(?:reservar|necesito|quiero)\b.{0,50}\bmesa\b/i,
      /\bmesa\s+para\s+\w+\s+personas?\b/i,
      /\b(?:table\s+booking|book\s+a\s+table|table\s+for\s+\w+\s+people)\b/i,
    ],
  },
  {
    id: "education",
    requestLabelEs: "una matrícula, curso o servicio educativo",
    requestLabelEn: "an enrolment, course or education service",
    companyPatterns: [
      /\bacademia\b/i,
      /\bcentro\s+de\s+formaci[oó]n\b/i,
      /\bcolegio\b/i,
      /\bescuela\b/i,
      /\bformaci[oó]n\b/i,
    ],
    requestPatterns: [
      /\b(?:matr[ií]cula|curso|clases?|profesor|alumno|formaci[oó]n)\b/i,
      /\b(?:enrolment|course|classes|teacher|student|training)\b/i,
    ],
  },
  {
    id: "legal_accounting",
    requestLabelEs: "una gestión jurídica, fiscal o contable",
    requestLabelEn: "a legal, tax or accounting service",
    companyPatterns: [
      /\basesor[ií]a\b/i,
      /\bgestor[ií]a\b/i,
      /\bdespacho\s+jur[ií]dico\b/i,
      /\babogad[oa]\b/i,
      /\bcontable\b/i,
      /\bfiscal\b/i,
    ],
    requestPatterns: [
      /\b(?:impuestos?|declaraci[oó]n\s+de\s+la\s+renta|contrato|demanda|abogad[oa]|contabilidad|facturas?\s+contables)\b/i,
      /\b(?:taxes|tax\s+return|legal\s+contract|lawsuit|lawyer|accounting)\b/i,
    ],
  },
];

export function extractLatestCustomerTurn(message: string) {
  const marker = "Último mensaje del cliente:";
  const markerIndex = message.lastIndexOf(marker);

  if (markerIndex < 0) {
    return {
      message: message.trim(),
      hasStructuredHistory: false,
    };
  }

  const valueAfterMarker = message.slice(markerIndex + marker.length).trim();
  const nextSectionIndex = valueAfterMarker.search(
    /\n\s*\n(?:Historial reciente|Asunto del caso|Categoría actual del caso):/i,
  );
  const latestMessage =
    nextSectionIndex >= 0
      ? valueAfterMarker.slice(0, nextSectionIndex).trim()
      : valueAfterMarker;

  return {
    message: latestMessage || message.trim(),
    hasStructuredHistory: true,
  };
}

export function isGreetingOnlyMessage(message: string) {
  const normalizedMessage = normalizeSearchText(message)
    .replace(/[¿?¡!.,;:()[\]{}'"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return [
    "hola",
    "buenas",
    "buenos dias",
    "buenas tardes",
    "buenas noches",
    "hello",
    "hi",
    "hey",
    "good morning",
    "good afternoon",
    "good evening",
  ].includes(normalizedMessage);
}

function getCompanyDomains(company: CurrentCompany) {
  const companyContext = `${company.sector ?? ""} ${
    company.description ?? ""
  }`;

  return domainDefinitions
    .filter((definition) =>
      definition.companyPatterns.some((pattern) =>
        pattern.test(companyContext),
      ),
    )
    .map((definition) => definition.id);
}

export function detectOutOfScopeRequest(
  message: string,
  company: CurrentCompany,
): OutOfScopeRequest | null {
  const companyDomains = getCompanyDomains(company);

  if (companyDomains.length === 0) {
    return null;
  }

  const requestDefinition = domainDefinitions.find((definition) =>
    definition.requestPatterns.some((pattern) => pattern.test(message)),
  );

  if (
    !requestDefinition ||
    companyDomains.includes(requestDefinition.id)
  ) {
    return null;
  }

  return {
    requestDomain: requestDefinition.id,
    requestLabelEs: requestDefinition.requestLabelEs,
    requestLabelEn: requestDefinition.requestLabelEn,
  };
}
