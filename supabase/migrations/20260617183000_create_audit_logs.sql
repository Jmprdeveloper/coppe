-- Create an audit log for sensitive human actions in COPPE.
-- This table is intended to record who did what, in which company, and when.
-- Direct inserts are not granted to authenticated users; use create_audit_log(...).

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_user_id uuid not null,
  actor_email text,
  actor_role text not null default 'unknown'
    check (actor_role in ('owner', 'member', 'unknown')),
  action text not null
    check (char_length(trim(action)) > 0 and char_length(action) <= 120),
  entity_type text not null
    check (char_length(trim(entity_type)) > 0 and char_length(entity_type) <= 80),
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamp with time zone not null default now()
);

create index if not exists audit_logs_company_created_at_idx
  on public.audit_logs (company_id, created_at desc);

create index if not exists audit_logs_company_entity_idx
  on public.audit_logs (company_id, entity_type, entity_id)
  where entity_id is not null;

create index if not exists audit_logs_actor_created_at_idx
  on public.audit_logs (actor_user_id, created_at desc);

alter table public.audit_logs enable row level security;

revoke all on table public.audit_logs from anon;
revoke all on table public.audit_logs from authenticated;

grant select on table public.audit_logs to authenticated;
grant all on table public.audit_logs to service_role;

drop policy if exists "Owners can read audit logs from their companies"
  on public.audit_logs;

create policy "Owners can read audit logs from their companies"
  on public.audit_logs
  for select
  to authenticated
  using (public.is_company_owner(company_id));

create or replace function public.create_audit_log(
  target_company_id uuid,
  audit_action text,
  audit_entity_type text,
  audit_entity_id uuid default null,
  audit_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  current_user_id uuid;
  clean_action text;
  clean_entity_type text;
  clean_metadata jsonb;
  current_actor_email text;
  current_actor_role text;
  inserted_audit_log_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'No authenticated user';
  end if;

  if target_company_id is null then
    raise exception 'Company id is required';
  end if;

  if not public.is_company_member(target_company_id) then
    raise exception 'User is not a member of this company';
  end if;

  clean_action := nullif(trim(coalesce(audit_action, '')), '');
  clean_entity_type := nullif(trim(coalesce(audit_entity_type, '')), '');
  clean_metadata := coalesce(audit_metadata, '{}'::jsonb);

  if clean_action is null then
    raise exception 'Audit action is required';
  end if;

  if char_length(clean_action) > 120 then
    raise exception 'Audit action is too long';
  end if;

  if clean_entity_type is null then
    raise exception 'Audit entity type is required';
  end if;

  if char_length(clean_entity_type) > 80 then
    raise exception 'Audit entity type is too long';
  end if;

  if jsonb_typeof(clean_metadata) <> 'object' then
    raise exception 'Audit metadata must be a JSON object';
  end if;

  select cm.role
  into current_actor_role
  from public.company_members cm
  where cm.company_id = target_company_id
    and cm.user_id = current_user_id
  limit 1;

  select au.email
  into current_actor_email
  from auth.users au
  where au.id = current_user_id
  limit 1;

  insert into public.audit_logs (
    company_id,
    actor_user_id,
    actor_email,
    actor_role,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    target_company_id,
    current_user_id,
    current_actor_email,
    coalesce(current_actor_role, 'unknown'),
    clean_action,
    clean_entity_type,
    audit_entity_id,
    clean_metadata
  )
  returning id into inserted_audit_log_id;

  return inserted_audit_log_id;
end;
$function$;

revoke all on function public.create_audit_log(
  uuid,
  text,
  text,
  uuid,
  jsonb
) from public;

grant execute on function public.create_audit_log(
  uuid,
  text,
  text,
  uuid,
  jsonb
) to authenticated;

grant execute on function public.create_audit_log(
  uuid,
  text,
  text,
  uuid,
  jsonb
) to service_role;
