# COPPE — pasos que debe completar el propietario

Esta guía contiene únicamente las acciones que requieren una cuenta externa,
una decisión comercial o datos legales del propietario. El trabajo técnico,
las migraciones, las pruebas y el despliegue los realizará Codex después de
cada autorización.

## Restricción actual: coste cero

Hasta que el propietario lo cambie expresamente:

- no contratar planes, pruebas que pidan tarjeta ni complementos de pago;
- no crear recursos que muestren un importe distinto de `0`;
- no habilitar facturación por consumo ni eliminar límites de gasto;
- no activar proveedores reales: se usarán mocks y entornos de prueba;
- no desplegar COPPE como servicio comercial;
- detenerse y pedir autorización si cualquier panel muestra un precio,
  una tarjeta obligatoria o la posibilidad de generar cargos.

El desarrollo, las pruebas automatizadas y la documentación pueden continuar
localmente sin coste. Producción comercial requerirá evaluar alojamiento,
copias de seguridad, correo y otros proveedores más adelante.

### Estado confirmado el 29 de junio de 2026

- Organización Supabase en plan `FREE`.
- Proyecto `coppe` confirmado como entorno con datos de prueba desechables.
- Copia manual previa guardada fuera del repositorio en
  `C:\Users\Juanma\Desktop\coppe-backups\20260629-205251`.
- Nueve migraciones de endurecimiento aplicadas correctamente.
- Historial local y remoto sincronizado; no quedan migraciones pendientes.
- Linter remoto: sin errores de esquema.
- Pruebas: 212 de 212 correctas.
- ESLint, build de producción y `git diff --check`: correctos.
- `GET /api/health`: HTTP 200, aplicación y base de datos `ok`.
- Ningún servicio o plan de pago activado.

## Regla de seguridad

No enviar por chat, correo ni Git:

- contraseñas de base de datos;
- claves `sb_secret_...` o `service_role`;
- claves Stripe `sk_...` o secretos `whsec_...`;
- claves Resend `re_...` o secretos de webhook;
- `WHATSAPP_APP_SECRET`, tokens de acceso o tokens de verificación;
- claves de OpenAI.

Guardar esos valores únicamente en el gestor de secretos de Vercel y, para
desarrollo local, en `.env.local`, que no debe subirse a Git.

Sí se pueden comunicar a Codex: referencias de proyecto, URLs, nombres de
entorno, IDs de precios, Phone Number ID, WABA ID y decisiones comerciales.

## 1. Clasificar el proyecto Supabase que ya está enlazado

El repositorio está enlazado actualmente al proyecto:

`nbieuwvfojuxfwdcvqao`

1. Abrir `https://supabase.com/dashboard/project/nbieuwvfojuxfwdcvqao`.
2. Confirmar el nombre que aparece arriba.
3. Abrir **Table Editor** y comprobar si contiene clientes o empresas reales.
4. Responder a Codex con:
   - nombre del proyecto;
   - `STAGING` si sus datos se pueden borrar, o `PRODUCCIÓN` si hay datos reales;
   - si existe una copia de seguridad reciente.
5. No ejecutar migraciones ni pegar la contraseña de la base de datos.

Si el proyecto actual es producción, crear un proyecto separado:

1. En el panel de Supabase, pulsar **New project**.
2. Continuar únicamente si el panel muestra **Free / 0** y no solicita una
   mejora de plan ni un método de pago. Supabase limita actualmente el plan
   gratuito a dos proyectos activos.
3. Nombre: `coppe-staging`.
4. Elegir una región europea próxima a los usuarios.
5. Generar una contraseña fuerte y guardarla en un gestor de contraseñas.
6. Esperar a que termine la creación.
7. Copiar únicamente la referencia visible en la URL:
   `.../project/<PROJECT_REF>`.
8. Enviar a Codex esa referencia y confirmar que el proyecto es desechable.

Si no queda un proyecto gratuito disponible, no crear staging remoto: Codex
mantendrá las pruebas en local hasta que el propietario decida otra opción.

Codex enlazará el repositorio, hará primero un `dry-run`, indicará exactamente
qué migraciones se aplicarían y pedirá autorización antes de escribir.

## 2. Autorizar la rama de Git

El trabajo está en la rama:

`harden/outbound-delivery-reliability`

Responder a Codex:

`Autorizo crear el commit y subir únicamente la rama harden/outbound-delivery-reliability a GitHub. No autorizo fusionarla con main ni desplegar producción.`

Codex creará el commit, lo subirá y facilitará el SHA exacto. La rama no se
fusionará con `main` hasta que staging haya superado todas las pruebas.

## 3. Crear el entorno de staging en Vercel

Fase aplazada mientras rija la restricción de coste cero. El plan Hobby es
gratuito, pero Vercel lo presenta para uso personal/no comercial; por tanto,
solo podría usarse para pruebas privadas y nunca para vender COPPE. No iniciar
una prueba Pro ni introducir una tarjeta.

Si el propietario autoriza más adelante un staging privado gratuito, hacerlo
después de que Codex confirme que la rama está subida:

1. Entrar en `https://vercel.com/new`.
2. Iniciar sesión con la cuenta de GitHub que puede acceder a
   `Jmprdeveloper/coppe`.
3. Importar ese repositorio.
4. Nombre recomendado: `coppe-staging`.
5. Framework: **Next.js**. Directorio raíz: el predeterminado.
6. Antes de usar el entorno, abrir **Project > Settings > Environment
   Variables**.
7. Añadir para **Preview** los valores del proyecto Supabase de staging:
   - `NEXT_PUBLIC_SUPABASE_URL`;
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`;
   - `SUPABASE_SECRET_KEY`.
8. Añadir:
   - `COPPE_INQUIRY_ANALYSIS_ENGINE=local`;
   - `PUBLIC_CHAT_SESSION_DAYS=30`;
   - `WHATSAPP_THREAD_WINDOW_DAYS=30`;
   - `COPPE_RELEASE=<SHA que entregue Codex>`.
9. No seleccionar **Production** para secretos de staging.
10. Comunicar a Codex la URL `https://....vercel.app`.

Codex aplicará antes las migraciones en staging y después activará el
despliegue correspondiente. No conectar todavía el dominio público final.

## 4. Configurar Supabase Auth en staging

Estos cambios del panel no los aplica `supabase db push`.

1. En Supabase staging, abrir **Authentication > URL Configuration**.
2. Poner como **Site URL** la URL de staging de Vercel.
3. Añadir como redirect URL:
   `https://<URL-STAGING>/recuperar-contrasena`.
4. En **Authentication > Providers > Email**:
   - mantener el inicio de sesión por email habilitado;
   - deshabilitar el registro público por email;
   - habilitar la confirmación de email.
5. En los ajustes de contraseña:
   - mínimo 10 caracteres;
   - cambio seguro de contraseña habilitado.
6. Mantener la rotación de refresh tokens habilitada.
7. Mantener TOTP/App Authenticator habilitado.
8. No probar invitaciones ni recuperación hasta configurar el SMTP de la fase
   de Resend.

## 5. Crear y configurar Resend para staging

Fase aplazada. Mientras rija la restricción de coste cero se probará la
integración con mocks y no se enviará correo real.

1. Entrar en `https://resend.com` y crear la cuenta del negocio.
2. En **Domains**, pulsar **Add Domain**.
3. Usar preferentemente subdominios separados, por ejemplo:
   - envío/auth: `notify-staging.tudominio.com`;
   - recepción: `inbound-staging.tudominio.com`.
4. Copiar en el proveedor DNS todos los registros que muestre Resend.
5. Esperar a que SPF y DKIM aparezcan como verificados.
6. Añadir DMARC siguiendo el valor recomendado por Resend.
7. En **API Keys**, crear una clave limitada al dominio de staging.
8. Guardar la clave directamente en Vercel como `RESEND_API_KEY`; no copiarla
   al chat.
9. En **Webhooks > Add Webhook**:
   - URL: `https://<URL-STAGING>/api/inbound-email/resend`;
   - evento: `email.received`.
10. Copiar el signing secret directamente a Vercel como
    `RESEND_WEBHOOK_SECRET`.
11. En Vercel añadir:
    - `RESEND_REQUEST_TIMEOUT_MS=15000`;
    - `NEXT_PUBLIC_COPPE_INBOUND_EMAIL_DOMAIN=inbound-staging.tudominio.com`.
12. En Supabase staging, conectar Resend como proveedor de correo de Auth o
    configurar SMTP con los datos ofrecidos por Resend.
13. Comunicar a Codex solo los dos dominios, el remitente elegido y la URL del
    webhook.

## 6. Crear WhatsApp de prueba en Meta

Fase aplazada. Mientras rija la restricción de coste cero se usarán payloads y
respuestas simuladas; no se registrará un número real ni se enviarán mensajes.

1. Crear o usar un **Business Portfolio** en Meta Business.
2. Entrar en `https://developers.facebook.com/apps` y crear una aplicación de
   tipo **Business**.
3. Añadir el producto **WhatsApp**.
4. Usar primero el número de prueba que ofrece Meta.
5. Anotar:
   - Phone Number ID;
   - WhatsApp Business Account ID (WABA ID).
6. En **WhatsApp > Configuration**, configurar:
   - callback:
     `https://<URL-STAGING>/api/inbound-whatsapp`;
   - verify token: una cadena aleatoria larga creada por el propietario.
7. Guardar ese verify token en Vercel como
   `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
8. Suscribirse al campo de webhook `messages`.
9. Guardar el **App Secret** directamente en Vercel como
   `WHATSAPP_APP_SECRET`.
10. Guardar el token temporal de prueba directamente en Vercel como
    `WHATSAPP_ACCESS_TOKEN`.
11. Comunicar a Codex únicamente Phone Number ID, WABA ID y el número de
    prueba visible.

Para producción se sustituirá el token temporal por un token de system user,
se verificará la empresa, se registrará el número definitivo y se aprobarán
las plantillas necesarias. La versión de Graph API se comprobará en el panel
de la aplicación antes de fijar `WHATSAPP_GRAPH_API_VERSION`.

## 7. Decidir el producto comercial antes de integrar Stripe

Definir precios no cuesta dinero, pero la conexión con Stripe queda aplazada.
Codex podrá implementar y probar la lógica con fixtures y test doubles sin
realizar cargos ni activar pagos.

Completar y enviar a Codex esta ficha, sin claves:

```text
Moneda:
Precios con IVA incluido o sin IVA:
Días de prueba:
¿Se exige tarjeta durante la prueba?:

PLAN 1
Nombre:
Precio mensual:
Precio anual:
Usuarios incluidos:
Casos nuevos al mes:
Análisis con IA al mes:
Canales incluidos:

PLAN 2
Nombre:
Precio mensual:
Precio anual:
Usuarios incluidos:
Casos nuevos al mes:
Análisis con IA al mes:
Canales incluidos:

Cancelación: inmediata / al final del periodo
Cambio de plan: inmediato con prorrateo / siguiente periodo
Qué ocurre al superar un límite: bloquear / cobrar extra / avisar
```

Confirmar con una asesoría fiscal el tratamiento del IVA y la información de
facturación. Cuando la ficha esté cerrada, Codex implementará Stripe Checkout,
Customer Portal, webhooks, estado de suscripción y límites de uso. Solo
entonces se crearán los productos/precios de prueba y sus Price IDs.

## 8. Entregar los datos legales

Crear un documento local que no contenga secretos con:

```text
Razón social o nombre del autónomo:
Nombre comercial:
NIF/CIF:
Domicilio:
País:
Dominio web:
Email de privacidad:
Email de soporte:
Responsable del tratamiento:
Delegado de protección de datos, si existe:
Plazos de conservación deseados:
Horario y nivel de soporte ofrecido:
Política de cancelación y reembolso:
Tipos de empresas a las que se venderá:
Países donde se venderá:
¿Se tratarán datos de salud, menores o categorías especiales?:
```

Codex podrá redactar borradores de privacidad, términos, DPA, lista de
subencargados y política de conservación. Antes de vender, los documentos y
el modelo fiscal deben revisarlos un abogado/asesor competente.

## 9. Paso independiente para producción

Producción no se tocará como consecuencia de una autorización de staging.
Después de probar Auth, MFA, recuperación, aislamiento entre empresas, email,
WhatsApp, chat, exportación, facturación, copias y restauración, Codex
presentará:

- SHA exacto probado;
- migraciones exactas;
- copia de seguridad verificada;
- plan de despliegue y rollback.

Solo entonces se solicitará una autorización nueva que identifique
expresamente el proyecto de producción.
