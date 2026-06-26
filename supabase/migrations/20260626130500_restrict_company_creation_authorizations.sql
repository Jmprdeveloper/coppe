-- Restrict company workspace creation during COPPE private access.
-- Only authenticated users with a pending authorization for their email can create a new company.

create table if not exists public.company_creation_authorizations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  status text not null default 'pending',
  note text,
  created_by uuid references auth.users(id) on delete set null,
  used_by uuid references auth.users(id) on delete set null,
  used_company_id uuid references public.companies(id) on delete set null,
  expires_at timestamp with time zone,
  used_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint company_creation_authorizations_status_check check (
    status in ('pending', 'used', 'cancelled', 'expired')
  ),
  constraint company_creation_authorizations_email_check check (
    trim(coalesce(email, '')) <> ''
  )
);

alter table public.company_creation_authorizations enable row level security;

create index if not exists company_creation_authorizations_email_idx
  on public.company_creation_authorizations (lower(email));

create index if not exists company_creation_authorizations_status_idx
  on public.company_creation_authorizations (status);

create unique index if not exists company_creation_authorizations_pending_email_unique_idx
  on public.company_creation_authorizations (lower(email))
  where status = 'pending';

revoke all on table public.company_creation_authorizations from anon;
revoke all on table public.company_creation_authorizations from authenticated;
grant all on table public.company_creation_authorizations to service_role;

create or replace function public.create_company_for_current_user(
  company_name text,
  company_sector text,
  company_description text default null::text,
  company_tone text default 'profesional y cercano'::text,
  company_language text default 'es'::text
)
returns table(
  id uuid,
  name text,
  sector text,
  description text,
  tone text,
  language text
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  new_company_id uuid;
  current_user_id uuid;
  current_user_email text;
  authorization_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'No authenticated user';
  end if;

  select lower(trim(au.email))
    into current_user_email
  from auth.users au
  where au.id = current_user_id;

  if coalesce(current_user_email, '') = '' then
    raise exception 'Authenticated user email is required';
  end if;

  if exists (
    select 1
    from public.company_members cm
    where cm.user_id = current_user_id
  ) then
    raise exception 'User already belongs to a company';
  end if;

  select cca.id
    into authorization_id
  from public.company_creation_authorizations cca
  where lower(trim(cca.email)) = current_user_email
    and cca.status = 'pending'
    and (cca.expires_at is null or cca.expires_at > now())
  order by cca.created_at asc
  limit 1
  for update;

  if authorization_id is null then
    raise exception 'Company creation is not authorized for this email';
  end if;

  if trim(coalesce(company_name, '')) = '' then
    raise exception 'Company name is required';
  end if;

  if trim(coalesce(company_sector, '')) = '' then
    raise exception 'Company sector is required';
  end if;

  insert into public.companies (
    name,
    sector,
    description,
    tone,
    language
  )
  values (
    trim(company_name),
    trim(company_sector),
    nullif(trim(coalesce(company_description, '')), ''),
    coalesce(nullif(trim(coalesce(company_tone, '')), ''), 'profesional y cercano'),
    coalesce(nullif(trim(coalesce(company_language, '')), ''), 'es')
  )
  returning companies.id into new_company_id;

  insert into public.company_members (
    company_id,
    user_id,
    role
  )
  values (
    new_company_id,
    current_user_id,
    'owner'
  );

  update public.company_creation_authorizations
  set
    status = 'used',
    used_by = current_user_id,
    used_company_id = new_company_id,
    used_at = now(),
    updated_at = now()
  where company_creation_authorizations.id = authorization_id;

  return query
  select
    c.id,
    c.name,
    c.sector,
    c.description,
    c.tone,
    c.language
  from public.companies c
  where c.id = new_company_id;
end;
$$;

revoke all on function public.create_company_for_current_user(text, text, text, text, text) from public;
revoke all on function public.create_company_for_current_user(text, text, text, text, text) from anon;
grant execute on function public.create_company_for_current_user(text, text, text, text, text) to authenticated;
grant execute on function public.create_company_for_current_user(text, text, text, text, text) to service_role;
