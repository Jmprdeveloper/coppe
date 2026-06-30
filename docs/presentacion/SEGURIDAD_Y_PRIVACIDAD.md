# COPPE — ficha de seguridad y privacidad para conversaciones comerciales

## Controles ya implementados

- Aislamiento lógico por empresa.
- Políticas RLS en base de datos.
- Roles propietario y miembro.
- MFA TOTP disponible.
- Registro de acciones sensibles.
- Exportación de datos por empresa.
- Validación de pertenencia al asignar casos.
- Límites de tamaño y frecuencia en APIs sensibles.
- Verificación de firma en webhooks compatibles.
- Idempotencia y conciliación de envíos.
- Cabeceras de seguridad.
- Secretos separados del código.
- Pruebas automatizadas de aislamiento, autenticación y rutas críticas.

## Modelo de IA

- El modo local permite demostrar clasificación y borradores sin enviar datos
  a OpenAI.
- La IA externa se activa únicamente con acuerdo, configuración y
  documentación de subencargados.
- Los borradores requieren revisión humana.
- No se deben introducir categorías especiales de datos sin análisis previo.

## Datos y proveedores

Para producción se documentarán:

- responsable y encargado del tratamiento;
- finalidades y categorías de datos;
- retención y eliminación;
- lista de subencargados;
- ubicación y transferencias;
- procedimiento de derechos;
- contacto de privacidad;
- procedimiento de incidentes.

## Condiciones obligatorias antes de datos reales

- Contrato SaaS y DPA firmados.
- Vercel Pro o infraestructura comercial equivalente.
- Supabase Pro con copias automáticas.
- Dominio y URLs de autenticación de producción.
- SMTP y recuperación de contraseña probados.
- Monitorización y alertas.
- Procedimiento de restauración probado.
- Rotación y custodia de secretos.
- Canales externos verificados de extremo a extremo.

## Declaraciones que COPPE no realiza actualmente

- No dispone todavía de certificación ISO 27001.
- No dispone todavía de informe SOC 2.
- No debe prometerse un SLA hasta formalizar operación y monitorización.
- La adecuación a normativa sectorial se evalúa por cliente y caso de uso.

## Respuesta comercial breve

> COPPE incorpora aislamiento por empresa, RLS, MFA, auditoría, exportación y
> controles en APIs críticas. El entorno comercial se activa únicamente
> después de contratar copias, monitorización y acuerdos con proveedores. No
> declaramos certificaciones que todavía no tenemos.
