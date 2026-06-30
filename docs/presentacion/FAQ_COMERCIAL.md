# COPPE — preguntas frecuentes comerciales

## ¿COPPE sustituye a las personas?

No. Ordena el trabajo y prepara contexto y borradores. El equipo revisa y
decide las respuestas y acciones.

## ¿Puede conectarse a WhatsApp?

La integración con WhatsApp Business Cloud API está implementada, pero cada
cliente requiere cuenta, número, permisos, webhook, token permanente y
plantillas aplicables. Se ofrece únicamente después de validarla.

## ¿Puede recibir email?

Sí, mediante un proveedor de entrada configurado durante el onboarding. Antes
del piloto se verifican dominio, SPF, DKIM, DMARC, webhooks y recuperación.

## ¿Utiliza OpenAI?

Puede funcionar con motor local o con OpenAI. La modalidad se acuerda con el
cliente y se documenta en la lista de subencargados.

## ¿Entrena modelos con los datos del cliente?

COPPE no utiliza los datos del cliente para entrenar modelos propios. Las
condiciones del proveedor de IA seleccionado deberán quedar reflejadas en el
contrato y DPA.

## ¿Dónde se alojan los datos?

La base de datos actual se encuentra en una región europea de Supabase. Antes
de producción se confirma la configuración definitiva, los proveedores y las
ubicaciones en el DPA.

## ¿Cómo se separan las empresas?

Cada registro incluye empresa y está protegido mediante políticas RLS y
comprobaciones adicionales en operaciones sensibles.

## ¿Tiene doble factor?

Sí. COPPE permite MFA mediante aplicaciones TOTP.

## ¿Se pueden exportar o eliminar datos?

Existe exportación por empresa. Para el primer piloto, la eliminación completa
se ejecutará mediante un procedimiento administrado y auditado; la
automatización de offboarding forma parte de la evolución posterior.

## ¿Está listo para producción?

El producto está listo para una demostración y para preparar un piloto. La
producción con datos reales comienza después de contratar infraestructura
comercial, activar copias, monitorización, contratos y canales acordados.

## ¿Cuánto dura la puesta en marcha?

Depende de canales y compras del cliente. Un piloto de formulario, chat y
gestión interna puede prepararse con rapidez. Email y WhatsApp dependen además
de DNS, verificación y aprobaciones de terceros.

## ¿Qué soporte se incluye?

El piloto incluye formación, seguimiento semanal y un canal de soporte
acordado. Los horarios y tiempos de respuesta definitivos se incluyen en la
oferta y contrato.

## ¿Se puede probar gratis?

La recomendación es un piloto pagado y acotado. Evita pruebas indefinidas,
financia la configuración y permite medir resultados con compromiso mutuo.
