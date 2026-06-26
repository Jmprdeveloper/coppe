# COPPE

COPPE es una plataforma SaaS para pequeñas empresas que centraliza clientes, casos, seguimientos, citas internas y mensajes entrantes con apoyo de IA.

El flujo principal es:

1. Registrar o recibir un mensaje de cliente.
2. Analizarlo y clasificarlo con el motor local o con IA.
3. Crear o actualizar el cliente.
4. Crear el caso con su mensaje inicial.
5. Gestionar respuesta, estado, seguimientos, notas internas y citas.

## Stack técnico

* Next.js 16 con App Router
* React 19
* TypeScript
* Tailwind CSS 4
* Supabase PostgreSQL, Auth, RLS y RPC
* Vercel para despliegue
* OpenAI opcional para análisis avanzado de casos
* Resend opcional para entrada de emails
* WhatsApp Business Cloud API opcional para entrada de WhatsApp

## Requisitos

* Node.js compatible con Next.js 16
* npm
* Proyecto Supabase configurado
* Supabase CLI para aplicar migraciones
* Cuenta de Vercel para despliegue

## Instalación local

```bash
npm install
```

Copia el archivo de variables de entorno:

```bash
cp .env.example .env.local
```

En Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Completa `.env.local` con los valores reales de Supabase y, si corresponde, OpenAI, Resend y WhatsApp.

## Variables de entorno

### Supabase cliente

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

### Supabase servidor/admin

```env
SUPABASE_SECRET_KEY=
```

`SUPABASE_SECRET_KEY` solo debe existir en entorno servidor. No debe exponerse en el navegador. Se usa para rutas públicas, webhooks y altas de usuarios por invitación que deben ejecutarse sin exponer credenciales administrativas al cliente.

### Motor de análisis

```env
COPPE_INQUIRY_ANALYSIS_ENGINE=local
```

Valores admitidos:

* `local`: motor local basado en reglas.
* `ai`: motor OpenAI con fallback automático al motor local.

### OpenAI

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
OPENAI_REQUEST_TIMEOUT_MS=15000
OPENAI_MAX_OUTPUT_TOKENS=1200
```

Solo es obligatorio si `COPPE_INQUIRY_ANALYSIS_ENGINE=ai`.

### Email entrante

```env
INBOUND_EMAIL_WEBHOOK_SECRET=
RESEND_API_KEY=
RESEND_WEBHOOK_SECRET=
```

### WhatsApp entrante

```env
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
```

## Desarrollo

```bash
npm run dev
```

La aplicación local se abrirá normalmente en:

```text
http://localhost:3000
```

## Validación antes de commit

Ejecuta siempre:

```bash
npm run lint
npm run build
git diff --check
```

En Windows PowerShell:

```powershell
npm run lint
npm run build
git diff --check
```

## Base de datos y migraciones

Las migraciones se encuentran en:

```text
supabase/migrations
```

Para enlazar el proyecto local con Supabase:

```bash
supabase link --project-ref <PROJECT_REF>
```

Para revisar migraciones:

```bash
supabase migration list
```

Para aplicar migraciones al proyecto remoto:

```bash
supabase db push
```

## Rutas principales

### Aplicación privada

* `/`: entrada principal de la aplicación.

### APIs

* `/api/inquiries/analyze`: análisis de casos autenticado.
* `/api/public-intake`: recepción desde formulario web y chat web.
* `/api/inbound-email`: recepción de email entrante mediante secreto compartido.
* `/api/inbound-email/resend`: recepción de webhooks de Resend.
* `/api/inbound-whatsapp`: recepción de webhooks de WhatsApp Business Cloud API.
* `/api/invitations/register`: creación segura de cuenta para usuarios invitados mediante enlace de invitación.

### Rutas públicas

* `/contacto/[token]`: formulario público de contacto.
* `/chat/[token]`: entrada pública tipo chat.
* `/invitacion/[token]`: aceptación de invitación a empresa.

## Seguridad

COPPE usa Row Level Security en Supabase para aislar datos por empresa. Las rutas públicas y webhooks usan cliente admin solo en servidor y deben estar protegidas mediante tokens, firmas o rate limit según el canal.

Puntos clave:

* No exponer `SUPABASE_SECRET_KEY` en cliente.
* Mantener cerrado el registro público de cuentas.
* Permitir altas de usuarios únicamente mediante autorización de empresa o invitación válida.
* Mantener RLS activa en tablas de negocio.
* Aplicar migraciones antes de desplegar cambios dependientes de base de datos.
* Configurar secretos de webhook en Vercel antes de activar canales externos.
* Validar `npm run lint`, `npm run build` y `git diff --check` antes de cada push.

## Despliegue

El despliegue recomendado es Vercel.

Antes de desplegar:

1. Configurar todas las variables necesarias en Vercel.
2. Aplicar migraciones en Supabase.
3. Ejecutar validaciones locales.
4. Hacer commit y push a la rama conectada con Vercel.

## Estado del proyecto

COPPE está en fase MVP funcional con flujo end-to-end para:

* Autenticación y empresa.
* Clientes.
* Casos.
* Seguimientos.
* Citas internas.
* Notas internas.
* Formulario web público.
* Chat web público.
* Email entrante.
* WhatsApp entrante.
* Invitaciones a miembros de empresa.
* Análisis local o mediante IA.

Antes de venta comercial deben revisarse especialmente onboarding, facturación, límites de uso, emails transaccionales, analítica, soporte, política de privacidad, términos legales y monitorización de errores.
