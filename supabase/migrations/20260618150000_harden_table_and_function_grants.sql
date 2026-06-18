-- Harden table and function grants for COPPE.
-- RLS remains the primary row-level protection, but table/function grants should
-- also follow least privilege. This removes broad anon/authenticated privileges
-- such as DELETE, TRUNCATE, TRIGGER and REFERENCES from operational tables.

-- Keep schema usable for API roles.
grant usage on schema public to anon;
grant usage on schema public to authenticated;
grant usage on schema public to service_role;

-- Remove broad table privileges from API roles.
revoke all privileges on all tables in schema public from anon;
revoke all privileges on all tables in schema public from authenticated;

-- Service role must keep full operational access for server-side jobs, webhooks
-- and trusted API routes.
grant all privileges on all tables in schema public to service_role;

-- Public/anonymous users should not access public tables directly.
-- Public contact/chat pages and webhooks use server-side service role flows.

-- Authenticated application table access, constrained by RLS policies.
grant select, update on table public.companies to authenticated;

grant select on table public.company_members to authenticated;
grant select on table public.company_invitations to authenticated;

grant select, insert, update on table public.customers to authenticated;
grant select, insert, update on table public.inquiries to authenticated;
grant select, insert, update on table public.inquiry_messages to authenticated;
grant select, insert, update on table public.internal_notes to authenticated;
grant select, insert, update on table public.follow_ups to authenticated;
grant select, insert, update on table public.appointments to authenticated;

grant select on table public.inbound_events to authenticated;
grant select on table public.outbound_messages to authenticated;
grant select on table public.audit_logs to authenticated;

-- Technical channel settings remain owner-only through RLS, but owners need the
-- table privileges to manage them from Settings.
grant select, insert, update, delete on table public.inbound_email_channels to authenticated;
grant select, insert, update, delete on table public.inbound_whatsapp_channels to authenticated;

-- No direct access needed for rate limit storage tables.
revoke all privileges on table public.public_intake_rate_limits from anon;
revoke all privileges on table public.public_intake_rate_limits from authenticated;
revoke all privileges on table public.authenticated_api_rate_limits from anon;
revoke all privileges on table public.authenticated_api_rate_limits from authenticated;

grant all privileges on table public.public_intake_rate_limits to service_role;
grant all privileges on table public.authenticated_api_rate_limits to service_role;

-- Remove broad function execution privileges inherited through PUBLIC.
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
revoke execute on all functions in schema public from authenticated;

-- Service role can execute trusted database functions.
grant execute on all functions in schema public to service_role;

-- Anonymous functions intentionally exposed.
grant execute on function public.get_company_invitation_preview(uuid) to anon;
grant execute on function public.get_company_invitation_preview(uuid) to authenticated;

-- Authenticated application RPCs.
grant execute on function public.accept_company_invitation(uuid) to authenticated;
grant execute on function public.cancel_company_invitation(uuid) to authenticated;
grant execute on function public.check_authenticated_api_rate_limit(text, integer, integer) to authenticated;
grant execute on function public.create_audit_log(uuid, text, text, uuid, jsonb) to authenticated;
grant execute on function public.create_company_for_current_user(text, text, text, text, text) to authenticated;
grant execute on function public.create_company_invitation(uuid, text) to authenticated;
grant execute on function public.create_inquiry_with_initial_message(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text[],
  text,
  text,
  text,
  text,
  text
) to authenticated;
grant execute on function public.get_company_team_members(uuid) to authenticated;
grant execute on function public.get_current_company_membership() to authenticated;
grant execute on function public.is_company_member(uuid) to authenticated;
grant execute on function public.is_company_owner(uuid) to authenticated;
grant execute on function public.normalize_phone_es_for_unique(text) to authenticated;

-- Internal/server-side RPCs should not be callable from anon/authenticated.
revoke execute on function public.check_public_intake_rate_limit(text, integer, integer) from anon;
revoke execute on function public.check_public_intake_rate_limit(text, integer, integer) from authenticated;
grant execute on function public.check_public_intake_rate_limit(text, integer, integer) to service_role;

-- Trigger functions are invoked by triggers and do not need direct API execute grants.
revoke execute on function public.set_appointments_updated_at() from anon;
revoke execute on function public.set_appointments_updated_at() from authenticated;

revoke execute on function public.validate_appointment_company() from anon;
revoke execute on function public.validate_appointment_company() from authenticated;

revoke execute on function public.validate_follow_up_company() from anon;
revoke execute on function public.validate_follow_up_company() from authenticated;

revoke execute on function public.validate_inbound_event_company() from anon;
revoke execute on function public.validate_inbound_event_company() from authenticated;

revoke execute on function public.validate_inquiry_company() from anon;
revoke execute on function public.validate_inquiry_company() from authenticated;

revoke execute on function public.validate_inquiry_message_company() from anon;
revoke execute on function public.validate_inquiry_message_company() from authenticated;

revoke execute on function public.validate_internal_note_company() from anon;
revoke execute on function public.validate_internal_note_company() from authenticated;

revoke execute on function public.validate_outbound_message_company() from anon;
revoke execute on function public.validate_outbound_message_company() from authenticated;

-- Safer defaults for future objects created in this schema.
alter default privileges in schema public revoke all privileges on tables from anon;
alter default privileges in schema public revoke all privileges on tables from authenticated;
alter default privileges in schema public grant all privileges on tables to service_role;

alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke execute on functions from authenticated;
alter default privileges in schema public grant execute on functions to service_role;
