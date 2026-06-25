-- Allow audit logs for public/system actions that are not performed by an authenticated user.
-- This is needed for server-side public intake flows that run with the service role.

alter table public.audit_logs
  alter column actor_user_id drop not null;

alter table public.audit_logs
  drop constraint if exists audit_logs_actor_role_check;

alter table public.audit_logs
  add constraint audit_logs_actor_role_check
  check (actor_role in ('owner', 'member', 'unknown', 'public', 'system'));
