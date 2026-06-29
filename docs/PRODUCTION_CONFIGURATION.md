# Production configuration checklist

## Supabase Auth

Mirror the secure settings in `supabase/config.toml` in the hosted project:

- Public email and general sign-up disabled.
- Invitation/admin-created users enabled.
- Minimum password length: 10.
- Email confirmation enabled.
- Secure password change enabled.
- Refresh-token rotation enabled.
- TOTP enrollment and verification enabled.
- Production site URL and exact redirect URLs configured.
- Custom SMTP configured and tested.

Do not assume `supabase db push` changes hosted Auth settings.

## Required secrets

Configure these only in the deployment secret manager:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `OPENAI_API_KEY`
- `INBOUND_EMAIL_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `RESEND_WEBHOOK_SECRET`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_ACCESS_TOKEN`

Optional operational values:

- `RESEND_REQUEST_TIMEOUT_MS`
- `WHATSAPP_GRAPH_API_VERSION`
- `WHATSAPP_REQUEST_TIMEOUT_MS`
- `WHATSAPP_THREAD_WINDOW_DAYS`
- `PUBLIC_CHAT_SESSION_DAYS`
- `COPPE_RELEASE`

Password recovery also requires the production application URL in the Auth
redirect allow-list. Test the complete email link before onboarding users.

Never expose service-role or provider secrets through `NEXT_PUBLIC_` values.

## Provider verification

For Resend:

- Verify the sending/inbound domain and SPF, DKIM and DMARC.
- Confirm webhook signature verification.
- Confirm reply addresses reach the inbound webhook.
- Test provider idempotency with the same request ID.

For WhatsApp:

- Use a permanent system-user token stored as a secret.
- Verify the webhook challenge and signature.
- Subscribe the production phone number to message events.
- Test inbound threading and outbound delivery IDs.
- Define the operational policy for template messages outside Meta's customer
  service window before enabling unsolicited follow-ups.

## Commercial and privacy configuration

Before onboarding paying tenants, publish and validate:

- Terms of service and privacy policy.
- Data processing agreement and subprocessors list.
- Retention periods for cases, messages, audit logs and provider payloads.
- Procedures for access, export, rectification and deletion requests.
- Support channel, incident contact and service-level commitments.
