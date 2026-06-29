# COPPE production runbook

## Release gate

A release is eligible for staging only when all of these commands pass:

```powershell
npm ci
npm test
npm run lint
npm audit --omit=dev --audit-level=high
npm run build
npx supabase db push --dry-run
npx supabase db lint --linked --schema public --level warning
```

The linked database linter must run from a machine that trusts the Supabase TLS
certificate chain. Never disable TLS verification to make this check pass.

## Deployment order

1. Take or verify a recent database backup.
2. Apply pending migrations to staging.
3. Deploy the matching application build to staging.
4. Test login, invitation acceptance, case creation, email, WhatsApp, chat,
   MFA, password recovery, assignments, company export and outbound
   reconciliation.
5. Record the tested commit SHA as `COPPE_RELEASE`.
6. Apply migrations to production.
7. Deploy that exact application build.
8. Check `/api/health` until it reports `200` and `status: ok`.
9. Run one controlled inbound and outbound test per enabled provider.

Application code that calls a new RPC must never be deployed before its
migration.

## Rollback

- Roll back application code to the previous tested build first.
- Database migrations are forward-only by default. Do not manually reverse a
  migration that has already written production data.
- If a migration causes an incident, disable the affected feature or route,
  deploy a corrective migration and preserve all outbound/inbound event rows.
- Restore a backup only for corruption or unrecoverable data loss, after
  preserving the current database for investigation.

## Required monitoring

Configure an external uptime monitor for:

- `GET /api/health`: alert after two consecutive non-200 responses.
- Public contact and chat pages: synthetic GET every five minutes.

Create alerts for:

- `outbound_messages.status = 'unknown'` older than five minutes.
- `inbound_events.status = 'failed'` or stale `received` rows.
- Webhook HTTP 5xx responses.
- Authentication or invitation failure spikes.
- Provider quota, billing or credential expiry warnings.
- Database storage, connection and backup failures.

Never include customer message bodies, access tokens, webhook secrets or
service-role keys in alert payloads.

## Ambiguous outbound delivery

1. Open the case and locate “Entrega pendiente de confirmar”.
2. Search the provider dashboard using destination, time and any stored
   provider message ID.
3. If delivered, copy the provider ID and choose “Confirmar que fue
   entregado”.
4. If definitely rejected/not delivered, choose “Confirmar que no se
   entregó”.
5. Do not resend while the provider result is unknown.

Both resolutions are audited and update the case transactionally.

## Backup and restore drill

- Enable daily database backups with retention appropriate to the contracted
  plan.
- Perform a restore into an isolated project at least quarterly.
- Verify tenant counts, recent cases, messages, memberships and audit logs.
- Run the application test suite against the restored staging project.
- Record restore start/end times and any manual steps. The drill is not
  complete until the restored application can log in and open a case.

## Incident priorities

- **P0:** cross-tenant access, leaked secret, incorrect recipient, destructive
  data loss. Disable affected access immediately and preserve evidence.
- **P1:** provider sends duplicated, inbound messages lost, authentication
  unavailable. Stop the affected channel and reconcile event logs.
- **P2:** degraded UI, delayed analysis or isolated integration failure.

For every P0/P1 incident, record timeline, affected tenants, identifiers
without message content, containment, correction and prevention.
