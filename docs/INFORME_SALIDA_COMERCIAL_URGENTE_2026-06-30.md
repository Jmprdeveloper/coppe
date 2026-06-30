# COPPE: informe de salida comercial urgente

**Fecha de referencia:** 30 de junio de 2026

**Escenario:** una empresa quiere contratar COPPE hoy y comenzar a usarla cuanto antes.
**Interpretación comercial:** la empresa compra una suscripción y servicios de
implantación; no se vende ni se cede el código fuente, la marca o la propiedad
intelectual de COPPE.

> Este documento es un plan técnico, operativo y comercial. Las decisiones
> fiscales, laborales y contractuales deben validarse con una gestoría y un
> abogado en España antes de firmar o facturar.

## 1. Veredicto ejecutivo

COPPE tiene un **MVP técnicamente sólido y probado**, pero hoy no es todavía un
SaaS comercial listo para recibir datos reales sin trabajo adicional.

La diferencia no está principalmente en la funcionalidad: la aplicación ya
dispone de autenticación, MFA, aislamiento multiempresa, clientes, casos,
seguimientos, citas, notas, auditoría, formulario y chat públicos, email,
WhatsApp, exportación y análisis local o con OpenAI. La diferencia está en la
puesta en producción real, los proveedores externos, la facturación, la
operación, los contratos y la entidad jurídica.

La respuesta honesta al supuesto de “terminarlo hoy” es:

- **Sí se puede cerrar comercialmente la operación hoy**, mediante una oferta,
  pedido o contrato condicionado a la constitución y activación de la entidad
  que facturará.
- **Sí se puede preparar un piloto técnico muy rápido**, inicialmente con
  formulario, chat web y gestión interna.
- **No se debe prometer que absolutamente todo estará operativo hoy**. La
  constitución de una S.L., la propagación DNS, la verificación de dominios de
  correo, la revisión de Meta y los procesos de compra del cliente dependen de
  terceros y no tienen un plazo garantizado.
- **No se debe facturar en nombre de una S.L. que todavía no existe.** Si el
  cliente exige factura y pago el mismo día, la alternativa práctica es darse
  de alta previamente como empresario individual/autónomo y novar después el
  contrato a la S.L.; si se quiere vender directamente desde la S.L., el cobro
  y la factura deben esperar a que la sociedad esté correctamente constituida
  y dada de alta.

La opción recomendada es firmar hoy una **carta de intención, reserva o pedido
condicionado**, constituir la S.L. por CIRCE con asistencia de un PAE/gestoría
y activar al cliente cuando existan NIF, cuenta bancaria, contratos y
producción verificada.

## 2. Estado real comprobado

### 2.1 Código y pruebas

- Rama preparada: `harden/outbound-delivery-reliability`.
- Commit probado y publicado: `5fc70e97453b08ce2bb6424d856372687e685e95`.
- La rama está sincronizada con GitHub, pero no está fusionada con `main`.
- El 30 de junio de 2026 se han repetido localmente:
  - 212 de 212 pruebas correctas;
  - ESLint correcto;
  - TypeScript correcto;
  - build de producción correcto.
- Las nueve migraciones de endurecimiento están aplicadas al proyecto actual
  de Supabase y el linter remoto no encontró errores.
- Las pruebas realizadas anteriormente cubren aislamiento entre empresas,
  MFA AAL2, formularios públicos, chat, idempotencia de envíos, respuestas,
  webhooks no firmados, exportación y flujos de negocio.

Esto permite afirmar que la rama es una buena candidata para una versión de
producción. No permite afirmar que los proveedores reales estén verificados:
siguen pendientes pruebas completas con correo real, recuperación de
contraseña, WhatsApp real, pagos y el despliegue final.

### 2.2 Producción pública y dominio

- `app.coppe.es` resuelve mediante CNAME a Vercel y devuelve HTTP 200.
- `app.coppe.es/api/health` devuelve 404. Por tanto, el despliegue público es
  anterior a la rama endurecida, que sí contiene ese endpoint.
- `www.app.coppe.es` **no existe en DNS**. La URL comunicada como
  `www.app.coppe.es` no funciona.
- El directorio local no está enlazado a un proyecto de Vercel mediante
  `.vercel/project.json`.

Debe elegirse una URL canónica:

1. Recomendación: usar públicamente `https://app.coppe.es`.
2. Si se quiere conservar `https://www.app.coppe.es`, añadir ese hostname
   tanto en Vercel como en el DNS de IONOS y redirigirlo permanentemente a
   `https://app.coppe.es`.
3. No se debe inventar el valor DNS: Vercel mostrará el CNAME exacto al añadir
   el dominio.

### 2.3 Supabase

El panel se ha comprobado de nuevo el 30 de junio:

- organización `Jmprdeveloper's Org`;
- plan **Free**;
- un proyecto;
- proyecto `coppe` en Irlanda;
- sin copias automáticas en el plan actual.

Además, la configuración de Auth realizada durante las pruebas sigue pensada
para `http://localhost:3000`. Antes de producción hay que sustituir la Site URL
y las redirecciones por el dominio real y probar invitación, confirmación,
recuperación y cambio de contraseña.

Supabase Free no es adecuado para datos de un cliente de pago: puede pausar
proyectos inactivos y no incluye copias automáticas. Supabase Pro cuesta
actualmente desde **25 USD/mes**, incluye el primer proyecto Micro, 8 GB de
disco, 250 GB de salida, 100 GB de almacenamiento, 100.000 MAU, siete días de
copias diarias y siete días de logs. Un segundo proyecto Micro para staging
parte de unos **10 USD/mes adicionales**. El límite de gasto está activado por
defecto en Pro. [Precios oficiales de Supabase](https://supabase.com/pricing)

### 2.4 Vercel

La sesión del navegador no estaba autenticada en Vercel, por lo que no se ha
podido leer la etiqueta exacta del plan de la cuenta. Como el usuario confirma
que no paga y existe un despliegue, debe tratarse como **Hobby hasta que el
panel demuestre lo contrario**.

Esto no es opcional comercialmente: Vercel limita Hobby al uso personal o no
comercial. Pro cuesta **20 USD/mes por puesto de desarrollador**, incluye 20
USD de crédito de uso y gestión de gasto. El DPA de Vercel se aplica a clientes
Pro y Enterprise. [Plan Hobby](https://vercel.com/docs/plans/hobby),
[precios](https://vercel.com/pricing) y
[DPA](https://vercel.com/legal/dpa).

También hay que fijar las funciones en una región europea cercana a la base de
datos. Por defecto, los proyectos nuevos ejecutan funciones en `iad1`,
Washington D. C.; para COPPE debería seleccionarse `dub1` u otra región
europea adecuada y verificarlo en el resumen del despliegue.
[Regiones de funciones de Vercel](https://vercel.com/docs/functions/configuring-functions/region)

### 2.5 IONOS

No hace falta contratar hosting en IONOS: Vercel ya aloja la aplicación e
IONOS puede seguir gestionando el dominio y el DNS.

El contrato personal no impide técnicamente que el dominio funcione, pero no
es la situación deseable para un activo empresarial. Tras constituir la S.L.:

- la sociedad debe recibir por escrito la cesión de la marca, código y dominio
  aportados por el fundador;
- debe abrirse o adaptarse la cuenta de IONOS a datos empresariales;
- conviene transferir la titularidad contractual y del dominio a la S.L.;
- deben mantenerse copias de los códigos de recuperación y acceso.

IONOS dispone de un procedimiento de cambio de titularidad a otra
persona/empresa y advierte de que puede conllevar costes. El importe exacto
debe solicitarse a IONOS porque depende del contrato.
[Cambio de titularidad en IONOS](https://www.ionos.es/ayuda/mi-cuenta/modificar-los-datos-de-cliente/cambiar-los-datos-de-contacto-en-ionos/)

### 2.6 Dependencias

`npm audit --omit=dev` encuentra:

- 0 vulnerabilidades críticas;
- 0 altas;
- 2 moderadas, originadas por una versión de PostCSS empaquetada dentro de
  Next.js.

El aviso es
[`GHSA-qx2v-qp2m-jg93`](https://github.com/advisories/GHSA-qx2v-qp2m-jg93)
y se corrige en PostCSS 8.5.10. El caso de explotación descrito requiere
procesar CSS controlado por el usuario, función que COPPE no ofrece, por lo que
el riesgo práctico actual es bajo. Aun así, debe eliminarse el aviso antes de
una due diligence:

- actualizar a una versión estable de Next que incluya PostCSS corregido, o
  introducir un `override` controlado a PostCSS 8.5.10 o superior;
- repetir pruebas, lint, build y auditoría;
- no ejecutar `npm audit fix --force`, porque actualmente propone una
  degradación incorrecta a Next 9.

## 3. Bloqueos de salida

| Prioridad | Bloqueo | Condición de salida |
|---|---|---|
| P0 | No existe todavía la entidad vendedora | S.L. constituida y censada, o alta previa como autónomo |
| P0 | El código nuevo no está en producción | PR revisada, `main` autorizada, despliegue del SHA probado y rollback preparado |
| P0 | Vercel probablemente está en Hobby | Vercel Pro activado y facturado a la entidad |
| P0 | Supabase está en Free | Supabase Pro, copias diarias y alertas de uso |
| P0 | Producción usa una versión antigua | `/api/health` 200 con el SHA esperado |
| P0 | Auth apunta a localhost | Site URL y redirects de producción; recuperación e invitación reales probadas |
| P0 | No hay paquete contractual | Pedido, contrato SaaS, DPA, seguridad, privacidad y subencargados revisados |
| P0 | No existe proceso real de soporte/incidente | Email, horario, prioridades, responsables y registro de incidentes |
| P1 | Email real no verificado de extremo a extremo | SPF, DKIM, DMARC, SMTP, entrada, salida y recuperación probados |
| P1 | WhatsApp real no verificado | WABA, número, token permanente, webhook, ventana de 24 h y plantillas |
| P1 | No hay facturación ni límites de plan en el producto | Para el primer cliente: factura manual y contrato; antes de autoservicio: Stripe y entitlements |
| P1 | No hay monitor externo ni restore drill | Monitor de `/api/health`, alertas y restauración documentada |
| P1 | No hay borrado completo de tenant automatizado | Procedimiento manual auditado para el piloto; automatización posterior |
| P1 | Dependencia moderada pendiente | Auditoría sin altas/críticas y excepción moderada resuelta |

## 4. Qué se debe hacer para ponerlo en servicio

### Fase A: cerrar la venta sin crear un problema legal

1. Definir por escrito que se vende acceso SaaS y onboarding, no propiedad
   intelectual.
2. Firmar un pedido o carta de intención condicionada a:
   - constitución y alta de la entidad vendedora;
   - aprobación de seguridad y DPA;
   - prueba de aceptación;
   - fecha de activación acordada.
3. No cobrar ni emitir factura desde una S.L. inexistente.
4. Contratar de urgencia una gestoría/PAE y un abogado mercantil-protección de
   datos.
5. Limitar el primer alcance a formulario, chat web, gestión interna y email.
   WhatsApp puede activarse después de su validación. Es preferible lanzar tres
   canales fiables que prometer cuatro y fallar en uno.

### Fase B: constituir la empresa

La forma recomendada para un SaaS B2B es una **Sociedad Limitada**:

1. Solicitar certificación negativa de denominación al Registro Mercantil
   Central.
2. Preparar estatutos, objeto social, domicilio, administración y régimen de
   retribución del administrador.
3. Constituir mediante CIRCE/PAE y firmar en notaría.
4. Obtener NIF provisional, presentar el alta censal mediante modelo 036,
   inscribir la sociedad y obtener NIF definitivo.
5. Abrir cuenta bancaria empresarial.
6. Tramitar el encuadramiento del fundador/administrador en Seguridad Social.
7. Obtener certificado digital de representante.
8. Firmar una cesión o aportación a la S.L. de:
   - repositorio y código;
   - documentación y bases de datos de prueba;
   - dominio `coppe.es`;
   - nombre, logotipo y materiales;
   - cuentas de proveedores relacionadas.
9. Crear `soporte@coppe.es`, `privacidad@coppe.es` y
   `facturacion@coppe.es`.

CIRCE permite tramitar la S.L. por internet y un PAE debe prestar el
acompañamiento de forma gratuita. Con estatutos tipo y capital no superior a
3.100 €, la guía oficial indica aranceles de 60 € de notaría y 40 € de
registro, más IVA y otros conceptos. El capital legal mínimo es 1 €, pero por
debajo de 3.000 € existen reglas especiales de reserva y responsabilidad. Se
recomienda aportar **3.000 €**, que no es una tasa ni un gasto: permanece como
patrimonio y liquidez de la sociedad.
[CIRCE/PAE](https://paeelectronico.es/es-es/CreaEmpresaPorTiMismo/Paginas/Home.aspx),
[guía oficial de SRL](https://paeelectronico.es/Documents/Formacion/SociedadResponsabilidadLimitada/Gu%C3%ADa_cumplimentaci%C3%B3n_DUE_SRL.pdf)
y [capital mínimo](https://boe.es/buscar/act.php?id=BOE-A-2022-15818).

El administrador que controla la sociedad y trabaja de forma habitual puede
quedar incluido en RETA. La cotización de 2026 depende de rendimientos y base;
los tipos generales suman aproximadamente un 31,5 % de la base y existen
reglas mínimas específicas para societarios. Para presupuestar, reservar
provisionalmente **300–450 €/mes**, sujeto al cálculo de la gestoría y a
posibles reducciones.
[Cotización 2026](https://www.boe.es/eli/es/o/2026/03/30/pjc297/dof/spa) y
[criterios para societarios](https://www.seg-social.es/wps/portal/wss/internet/HerramientasWeb/9d2fd4f1-ab0f-42a6-8d10-2e74b378ee24/44b5f09d-6c25-4dcd-8210-c21700c67096).

### Fase C: desplegar el producto correcto

1. Corregir el aviso de PostCSS y repetir la batería de calidad.
2. Crear una pull request de la rama endurecida.
3. Revisar los cambios y la salida de GitHub Actions.
4. Crear un despliegue Preview con una base de staging separada.
5. Ejecutar las pruebas de aceptación en Preview.
6. Tomar una copia de producción.
7. Aplicar migraciones antes que el código que depende de ellas.
8. Fusionar en `main` solo con autorización expresa.
9. Desplegar exactamente el SHA aprobado.
10. Verificar `/api/health`, cabeceras, logs y versión.
11. Mantener disponible el rollback inmediato de Vercel.

### Fase D: configurar Vercel

1. Pasar a Pro con un único puesto de desarrollador.
2. Vincular `Jmprdeveloper/coppe`.
3. Separar secretos de Preview y Production.
4. Configurar únicamente en el gestor de secretos:
   - URL y clave pública de Supabase;
   - `SUPABASE_SECRET_KEY`;
   - secretos de Resend;
   - secretos de WhatsApp;
   - clave de OpenAI;
   - secretos de webhooks.
5. Eliminar la antigua `SUPABASE_SERVICE_ROLE_KEY` local si ya no es
   necesaria y rotar todos los secretos antes de producción.
6. Configurar región europea próxima a Supabase.
7. Añadir `app.coppe.es` como dominio de producción.
8. Añadir `www.app.coppe.es` únicamente como alias con redirección.
9. Activar alertas de consumo y un límite de gasto prudente.

### Fase E: configurar Supabase

1. Pasar la organización a Pro.
2. Mantener el proyecto de Irlanda como producción.
3. Crear un proyecto o branch de staging; si se quiere ahorrar inicialmente,
   mantener staging local hasta que sea necesario.
4. Configurar:
   - Site URL: `https://app.coppe.es`;
   - redirects exactos de invitación y recuperación;
   - registro público desactivado;
   - confirmación de email;
   - contraseña mínima de 10 caracteres;
   - rotación de refresh tokens;
   - MFA TOTP;
   - SMTP personalizado.
5. Ejecutar una recuperación y una invitación reales.
6. Confirmar copia diaria y realizar una restauración aislada antes o durante
   el piloto.
7. Firmar o aceptar el DPA de Supabase y añadirlo como subencargado.
[DPA actual de Supabase](https://supabase.com/downloads/docs/Supabase%2BDPA%2B260601.pdf)

### Fase F: correo con Resend

Para el primer cliente se puede comenzar con Free si no se superan 3.000
emails mensuales y 100 diarios. Pro cuesta 20 USD/mes e incluye 50.000
emails, sin límite diario y con sobreconsumo disponible.
[Precios de Resend](https://resend.com/docs/knowledge-base/what-is-resend-pricing)

Pasos:

1. Usar subdominios diferenciados:
   - `notify.coppe.es` para envío y Auth;
   - `inbound.coppe.es` para recepción.
2. Publicar SPF, DKIM y DMARC en IONOS.
3. Configurar Resend como SMTP de Supabase Auth.
4. Crear una API key limitada y un webhook firmado.
5. Probar:
   - invitación;
   - recuperación;
   - entrada de email;
   - respuesta;
   - duplicado;
   - rechazo y reintento.
6. Aceptar el DPA y registrar a Resend como subencargado. Resend almacena datos
   en EE. UU. y su DPA incorpora las salvaguardas de transferencia.
[DPA de Resend](https://resend.com/legal/dpa)

### Fase G: OpenAI

COPPE puede funcionar con el motor local sin coste de IA. Por tanto, OpenAI no
es un bloqueo para el piloto.

Si se habilita:

1. Crear un proyecto de API perteneciente a la S.L.
2. Comprar el mínimo de crédito prepago, actualmente **5 USD**.
3. Desactivar la recarga automática o limitarla al principio.
4. Limitar el uso por empresa dentro de COPPE.
5. Aceptar el DPA de OpenAI.
6. Informar al cliente y mantener revisión humana de los borradores.
7. Prohibir inicialmente categorías especiales de datos.

El modelo actual del proyecto es `gpt-4o-mini`. No debe cambiarse el día de
salida sin una evaluación comparativa. OpenAI recomienda `gpt-5.4-nano` para
clasificación y extracción, pero es necesario medir precisión y coste:

- con 2.000 tokens de entrada y 500 de salida por análisis, 1.000 análisis
  cuestan aproximadamente 0,60 USD con `gpt-4o-mini`;
- con el mismo supuesto, aproximadamente 1,03 USD con `gpt-5.4-nano`;
- con `gpt-5.4-mini`, aproximadamente 3,75 USD.

Son estimaciones; mensajes largos, reintentos y cambios de precios alteran el
resultado. OpenAI no usa por defecto los datos de API para entrenar modelos,
puede retener entradas y salidas hasta 30 días en la configuración estándar y
ofrece un DPA.
[GPT-5.4 nano](https://developers.openai.com/api/docs/models/gpt-5.4-nano),
[privacidad empresarial](https://openai.com/enterprise-privacy/) y
[prepago](https://help.openai.com/es-es/articles/8264778-qu%C3%A9-es-la-facturaci%C3%B3n-prepago).

### Fase H: WhatsApp

WhatsApp debe considerarse un add-on posterior salvo que Meta y el número
estén ya aprobados.

1. Crear Business Portfolio, app Business y WABA de la S.L.
2. Registrar el número definitivo.
3. Usar un system user token permanente, no un token temporal.
4. Verificar challenge y firma del webhook.
5. Probar entrada, respuesta, duplicados, errores y reconciliación.
6. Adaptar COPPE a la regla de Meta:
   - el agrupamiento interno de casos puede seguir siendo de 30 días;
   - una respuesta de servicio libre solo puede enviarse durante las 24 horas
     posteriores al último mensaje del usuario;
   - fuera de esa ventana se necesitan plantillas aprobadas.
7. Impedir en la interfaz envíos libres fuera de ventana y ofrecer una
   plantilla válida.

Meta cobra por mensaje entregado según mercado y categoría. Los mensajes de
servicio en la ventana de 24 horas y las respuestas utility al usuario son
gratuitos; las tarifas de otras categorías son variables.
[Precios oficiales de WhatsApp Business](https://whatsappbusiness.com/products/platform-pricing/)

### Fase I: monitorización y operación

1. Monitorizar externamente:
   - `/api/health`;
   - formulario público;
   - chat público;
   - caducidad TLS y DNS.
2. Alertar sobre:
   - errores 5xx;
   - webhooks fallidos;
   - entregas en estado desconocido;
   - fallos de Auth;
   - consumo, disco, conexiones y copias.
3. Mantener un runbook de incidente y un registro de brechas.
4. Realizar restore drill trimestral.
5. Crear un canal de soporte y guardia razonable.
6. Mantener una página de estado básica.

UptimeRobot Free admite expresamente uso comercial, 50 monitores y chequeos
cada cinco minutos, por lo que puede usarse inicialmente a coste cero.
[Uso comercial de UptimeRobot Free](https://help.uptimerobot.com/en/articles/11604710-who-should-use-uptimerobot-s-free-plan)

## 5. Contratos y cumplimiento necesarios

### 5.1 Paquete para el cliente

1. **Pedido u Order Form**
   - entidad, CIF y contactos;
   - plan, usuarios y límites;
   - onboarding;
   - duración, renovación y pago;
   - fecha de activación;
   - canales incluidos y excluidos.
2. **Contrato SaaS B2B**
   - licencia de uso no exclusiva e intransferible;
   - titularidad de COPPE;
   - confidencialidad;
   - uso aceptable;
   - suspensión;
   - soporte;
   - garantías limitadas;
   - responsabilidad y límite de indemnización;
   - terminación, exportación y borrado;
   - ley y jurisdicción.
3. **DPA o contrato de encargo del tratamiento**
   - cliente como responsable;
   - COPPE como encargado;
   - objeto, duración, categorías de datos e interesados;
   - seguridad, brechas y derechos;
   - subencargados y transferencias;
   - devolución/borrado.
4. **Anexo de seguridad**
   - RLS y aislamiento;
   - cifrado;
   - MFA;
   - logs;
   - backups;
   - gestión de vulnerabilidades;
   - incidentes.
5. **Política de soporte/SLA**
   - para el piloto, compromisos de respuesta, no de resolución;
   - no prometer 99,9 % hasta tener medición y proveedores con SLA.
6. **Política de IA**
   - finalidad de clasificación y borradores;
   - supervisión humana;
   - limitaciones;
   - datos que no deben introducirse.

La AEPD ofrece Facilita RGPD y Facilita Emprende como herramientas gratuitas,
pero aclara que sus documentos no producen cumplimiento automático.
[Facilita RGPD](https://www.aepd.es/guias-y-herramientas/herramientas/facilita-rgpd)

### 5.2 Documentos públicos

- aviso legal;
- política de privacidad;
- política de cookies, solo en la medida necesaria;
- términos de uso;
- lista de subencargados;
- contacto de privacidad;
- política de conservación y eliminación.

Si solo se usan cookies estrictamente necesarias para Auth y no se añaden
analítica o publicidad, no se debe instalar un banner invasivo por inercia;
debe documentarse y validarse el inventario real de cookies.

### 5.3 Obligaciones operativas de privacidad

- registro de actividades de tratamiento;
- análisis de riesgos;
- procedimiento de derechos;
- procedimiento de brechas;
- inventario de subencargados y sus DPAs;
- plazos de retención;
- exportación y borrado al terminar;
- prohibición inicial de salud, biometría, menores y otras categorías
  especiales.

Una brecha con riesgo debe notificarse a la AEPD en un máximo de 72 horas
desde que la organización tenga constancia; todas las brechas deben
documentarse.
[AEPD: notificación de brechas](https://www.aepd.es/derechos-y-deberes/cumple-tus-deberes/medidas-de-cumplimiento/brechas-de-datos-personales-notificacion)

### 5.4 Inteligencia artificial

Por el uso previsto —clasificación y ayuda para redactar respuestas con
revisión humana— COPPE no parece, por sí solo, un sistema de alto riesgo. Esa
conclusión cambia si se utiliza en empleo, educación, crédito, salud u otros
ámbitos regulados.

Ya es aplicable la obligación de alfabetización en IA para el personal que
opera el sistema. Desde el 2 de agosto de 2026 se aplican obligaciones de
transparencia para determinados sistemas que interactúan directamente con
personas. Debe añadirse formación breve, supervisión humana y aviso cuando el
usuario interactúe realmente con IA.
[Calendario del AI Act](https://digital-strategy.ec.europa.eu/en/faqs/navigating-ai-act)
y [artículo 4](https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX%3A32024R1689).

### 5.5 Facturación

Para un cliente español se presupuestarán precios **más el 21 % de IVA**, salvo
que la gestoría determine otra regla por localización o tipo de operación. La
AEAT obliga a emitir factura cuando el destinatario es empresario o
profesional.
[Tipo general](https://sede.agenciatributaria.gob.es/Sede/iva/calculo-iva-repercutido-clientes/tipos-impositivos-iva.html)
y [obligación de facturar](https://sede.agenciatributaria.gob.es/Sede/iva/facturacion-registro/facturacion-iva/obligacion-facturar.html).

Para el primer cliente es más rápido:

- factura emitida por la gestoría o software fiscal;
- transferencia bancaria o adeudo SEPA;
- conciliación manual.

Stripe no es imprescindible para la primera venta. Debe integrarse antes de
ofrecer alta autoservicio:

- Checkout;
- Billing;
- Customer Portal;
- webhooks;
- estado de suscripción;
- límites y suspensión;
- facturas y conciliación.

Stripe no cobra alta ni cuota mensual en su tarifa estándar. Una tarjeta
estándar del EEE cuesta 1,5 % + 0,25 € y Stripe Billing añade 0,7 % del volumen
recurrente.
[Stripe Payments](https://stripe.com/es/pricing) y
[Stripe Billing](https://stripe.com/es/billing/pricing).

La S.L. deberá adaptar su sistema de facturación a VERI*FACTU antes del 1 de
enero de 2027. La factura electrónica B2B ya cuenta con desarrollo
reglamentario, pero sus plazos dependen de la orden ministerial que active el
cómputo. Conviene elegir desde el principio una gestoría o herramienta
preparada.
[Plazos VERI*FACTU](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes.html?faqId=2e0c77fe52572910VgnVCM100000dc381e0aRCRD)
y [factura electrónica B2B](https://sede.agenciatributaria.gob.es/Sede/todas-noticias/2026/marzo/31/facturacion-electronica-obligatoria.html).

## 6. Presupuesto

Las conversiones orientativas usan 1 EUR ≈ 1,14 USD. Los proveedores pueden
aplicar cambio, IVA u otros impuestos distintos.
[Cambio de referencia del BCE](https://data.ecb.europa.eu/currency-converter)

### 6.1 Infraestructura mensual

| Concepto | Mínimo comercial | Recomendado |
|---|---:|---:|
| Supabase | Pro: 25 USD | Pro + staging Micro: 35 USD |
| Vercel | Pro, 1 puesto: 20 USD | Pro, 1 puesto: 20 USD |
| Resend | Free: 0 USD | Pro: 20 USD |
| OpenAI | Consumo; se puede usar local por 0 | 5–10 USD de presupuesto inicial |
| WhatsApp | Sin cuota COPPE; variable por mensaje | Variable por mensaje |
| Monitor externo | Free: 0 USD | 0–10 USD |
| Dominio | Ya contratado | Renovación actual de IONOS |
| Buzones | 0 si están incluidos en IONOS | 5–15 €/usuario si no |

**Mínimo de plataforma:** 45 USD/mes, unos **39,50 €/mes**, más consumo.
**Configuración recomendada:** 75 USD/mes, unos **66 €/mes**, más consumo.

No se necesita al inicio:

- Supabase Team de 599 USD/mes;
- Vercel Enterprise;
- PITR de Supabase de 100 USD/mes;
- dominio personalizado de Supabase de 10 USD/mes;
- observabilidad empresarial;
- certificación ISO propia.

Estos productos solo deben contratarse si un cliente exige formalmente SSO,
SLA, controles de acceso de proveedor, PITR o certificaciones específicas.

### 6.2 Puesta en marcha y empresa

| Concepto | Presupuesto |
|---|---:|
| Constitución CIRCE con estatutos tipo | Aproximadamente 150 € de aranceles base y certificado, más posibles extras |
| Gestoría para constitución y alta | 200–600 € estimados |
| Revisión de contratos, DPA y privacidad | 800–2.500 € estimados |
| Marca española, primera clase online | 127,88 € de tasa |
| Segunda clase de marca, si procede | 82,84 € adicionales |
| Cambio de titular IONOS | Pendiente de presupuesto de IONOS |
| Seguro RC profesional/ciberriesgo | 300–1.000 €/año estimados, si se contrata |
| Capital social recomendado | 3.000 €, no es gasto |

La OEPM recomienda buscar antecedentes antes de solicitar y la tasa
electrónica de 2026 es 127,88 € para la primera clase.
[Tasas OEPM 2026](https://oepm.es/export/sites/portal/comun/documentos_relacionados/PDF/TASAS_MARCAS_Y_NOMBRES_COMERCIALES.pdf)

**Desembolso realista de salida:** **1.300–3.500 €**, excluido el capital
social y un eventual seguro. Una revisión legal compleja o exigencias del
cliente pueden superar esa cifra.

### 6.3 Coste mensual completo del negocio

| Concepto | Estimación |
|---|---:|
| Plataforma | 40–66 €/mes |
| Gestoría recurrente | 70–150 €/mes |
| Buzones y herramientas | 0–15 €/mes por usuario |
| RETA del fundador/administrador, si aplica | Reservar 300–450 €/mes |

Presupuesto fijo inicial: aproximadamente **410–680 €/mes**, antes de salario,
impuestos, consumos, seguros y acciones comerciales.

## 7. Oferta que se debe vender

### 7.1 Propuesta inmediata

No conviene lanzar diez planes ni una prueba gratuita. Para el primer cliente:

**COPPE Professional — Cliente Fundador**

- onboarding: **1.500 € + IVA**;
- suscripción: **399 €/mes + IVA** con compromiso de 12 meses;
- alternativa anual anticipada: **3.990 € + IVA**;
- primer año anual anticipado: **5.490 € + IVA**;
- total con IVA español: **6.642,90 €**;
- una empresa;
- hasta 10 usuarios;
- hasta 1.000 casos nuevos al mes durante el piloto;
- formulario, chat web y email;
- análisis local y una bolsa razonable de IA;
- dos sesiones de formación;
- soporte laborable;
- exportación de datos al terminar;
- WhatsApp excluido hasta su activación formal.

El onboarding financia la configuración, formación, migración asistida,
documentación y acompañamiento. No debe regalarse: el primer cliente consume
más soporte que los siguientes.

Puede precederse de un **piloto pagado de 30 días por 1.500 € + IVA**. Si se
convierte en contrato anual, ese importe se considera onboarding. Los
criterios de éxito deben estar firmados antes:

- usuarios activados;
- casos capturados;
- reducción de tiempo de respuesta;
- ausencia de seguimientos perdidos;
- adopción semanal;
- incidencias críticas igual a cero.

### 7.2 Catálogo después de validar el primer cliente

| Plan | Precio | Alcance propuesto |
|---|---:|---|
| Essential | 199 €/mes + 750 € onboarding | 3 usuarios, web/chat, 250 casos/mes, motor local |
| Professional | 399 €/mes + 1.500 € onboarding | 10 usuarios, email/web/chat, 1.000 casos/mes, IA |
| Business | 799 €/mes + 3.000 € onboarding | 25 usuarios, mayor volumen, WhatsApp validado, soporte prioritario |

Reglas:

- precio anual: diez mensualidades pagadas por adelantado;
- usuario adicional: precio cerrado por contrato;
- WhatsApp y consumos extraordinarios: add-on y costes de proveedor;
- exceso de uso: aviso y propuesta de ampliación, no cargos sorpresa;
- no ofrecer Enterprise, SSO, SCIM o SLA fuerte hasta que existan.

Los límites son inicialmente contractuales y se supervisan de forma manual.
Antes del alta autoservicio o del segundo/tercer cliente deben existir tablas
de suscripción, entitlements, contadores y automatización de Stripe.

### 7.3 Posicionamiento

COPPE no debe venderse como “otro CRM”. La propuesta es:

> COPPE reúne mensajes, casos, responsables y seguimientos para que una
> empresa de servicios no pierda solicitudes y responda con contexto desde un
> único lugar.

Cliente ideal inicial:

- empresa de servicios española;
- 5–50 personas;
- varias entradas por web, email y WhatsApp;
- trabajo basado en casos, citas o solicitudes;
- seguimiento realizado hoy con bandejas, hojas de cálculo y memoria.

Sectores iniciales prudentes:

- agencias;
- consultorías no reguladas;
- mantenimiento y reparación;
- servicios para inmuebles;
- empresas B2B de atención y operaciones.

Evitar al principio salud, crédito, selección de personal, menores, legal de
alta sensibilidad y administraciones: elevan de forma considerable el riesgo,
la contratación y el cumplimiento.

### 7.4 Proceso de venta

1. **Descubrimiento:** medir volumen de mensajes, canales, tiempo de respuesta
   y casos perdidos.
2. **Demo con datos ficticios:** reproducir un flujo real del cliente.
3. **Caso de negocio:** cuantificar horas ahorradas y oportunidades
   recuperadas sin prometer resultados inventados.
4. **Security pack:** arquitectura, pruebas, DPA, subencargados, backup,
   incidentes y exportación.
5. **Piloto pagado:** una unidad o equipo, alcance cerrado y métricas.
6. **Revisión a 15 y 30 días:** incidencias, adopción y retorno.
7. **Conversión anual:** descuento solo por pago anticipado.
8. **Caso de éxito y referencia:** con autorización expresa.

Canal de adquisición recomendado:

- venta directa del fundador;
- red personal y empresas locales;
- LinkedIn con mensajes muy dirigidos;
- alianzas con consultoras de procesos/agencias;
- una vertical concreta antes de publicidad de pago.

## 8. Qué puede esperar al segundo mes

Una vez que el primer cliente esté estable:

1. implementar Stripe Checkout/Billing/Portal;
2. automatizar planes, límites y suspensión;
3. crear importación CSV guiada;
4. automatizar borrado y offboarding de tenant;
5. añadir seguimiento de errores y trazas sanitizadas;
6. aprobar plantillas de WhatsApp y controlar la ventana de 24 horas;
7. ejecutar un restore drill;
8. medir SLI de disponibilidad y latencia;
9. hacer una prueba de carga con el volumen del plan;
10. registrar la marca COPPE tras búsqueda profesional;
11. completar evaluación de impacto/IA según los sectores vendidos;
12. preparar una sala de due diligence con contratos, DPAs, inventario,
    licencias y evidencias de pruebas.

## 9. Criterio final de autorización

COPPE puede recibir al primer cliente únicamente cuando todos estos puntos
sean afirmativos:

- [ ] Existe una entidad o alta legal que puede contratar y facturar.
- [ ] El contrato, pedido y DPA están firmados.
- [ ] Supabase está en Pro y la copia automática está activa.
- [ ] Vercel está en Pro.
- [ ] El SHA aprobado está en producción.
- [ ] `https://app.coppe.es/api/health` devuelve 200 y el release correcto.
- [ ] Auth ya no apunta a localhost.
- [ ] Invitación y recuperación reales funcionan.
- [ ] Los canales ofrecidos han superado pruebas reales.
- [ ] WhatsApp se excluye o cumple ventana y plantillas.
- [ ] Existe monitor externo y una persona que recibe alertas.
- [ ] Existe una copia y un procedimiento de restauración.
- [ ] Los secretos se han rotado y solo están en el gestor de Vercel.
- [ ] No quedan vulnerabilidades altas o críticas y se ha resuelto PostCSS.
- [ ] El cliente conoce límites, soporte, retención, IA y subencargados.
- [ ] Existe exportación y procedimiento de borrado/offboarding.
- [ ] Se ha emitido una factura correcta o se ha acordado cuándo se emitirá.

Cumplidos esos puntos, COPPE será vendible como **SaaS B2B para un primer
cliente controlado**. La categoría “enterprise” requerirá después SSO,
controles administrativos adicionales, SLA respaldado por proveedores,
pruebas de carga, gestión formal de cambios y, según el comprador,
certificaciones o planes superiores.
