export const companySectorOptions = [
    "Alojamiento turístico",
    "Hotel",
    "Hostal / pensión",
    "Apartamento turístico",
    "Casa rural",
    "Restaurante",
    "Bar / cafetería",
    "Catering / eventos",
    "Inmobiliaria",
    "Administración de fincas",
    "Construcción / reformas",
    "Arquitectura / interiorismo",
    "Clínica médica",
    "Clínica dental",
    "Fisioterapia",
    "Psicología / salud mental",
    "Veterinaria",
    "Farmacia / parafarmacia",
    "Centro de estética",
    "Peluquería / barbería",
    "Gimnasio / centro deportivo",
    "Academia / formación",
    "Centro educativo",
    "Guardería / escuela infantil",
    "Asesoría / gestoría",
    "Despacho jurídico",
    "Consultoría",
    "Agencia de marketing",
    "Agencia de viajes",
    "Comercio minorista",
    "Tienda online",
    "Moda / complementos",
    "Alimentación",
    "Automoción",
    "Taller mecánico",
    "Alquiler de vehículos",
    "Transporte / logística",
    "Instalaciones / mantenimiento",
    "Electricidad / fontanería",
    "Limpieza profesional",
    "Seguridad privada",
    "Tecnología / software",
    "Soporte técnico",
    "Eventos / ocio",
    "Fotografía / vídeo",
    "Servicios profesionales",
    "Organización sin ánimo de lucro",
    "Otro",
  ];
  
  export function normalizeCompanySector(value: string | null | undefined) {
    const cleanValue = (value ?? "").trim();
  
    if (companySectorOptions.includes(cleanValue)) {
      return cleanValue;
    }
  
    return "";
  }