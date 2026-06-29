-- Persist public chat conversations without exposing inquiry IDs or tables to
-- anonymous clients. Only a hash of the high-entropy browser token is stored.

create table if not exists public.public_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamp with time zone not null,
  last_activity_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  constraint public_chat_sessions_token_hash_check
    check (token_hash ~ '^[a-f0-9]{64}$')
);

create index if not exists public_chat_sessions_inquiry_idx
on public.public_chat_sessions (inquiry_id, created_at desc);

create index if not exists public_chat_sessions_expiry_idx
on public.public_chat_sessions (expires_at);

alter table public.public_chat_sessions enable row level security;

revoke all privileges on table public.public_chat_sessions from public;
revoke all privileges on table public.public_chat_sessions from anon;
revoke all privileges on table public.public_chat_sessions from authenticated;
grant all privileges on table public.public_chat_sessions to service_role;

create or replace function public.append_public_chat_message(
  p_token_hash text,
  p_body text
)
returns table (
  message_id uuid,
  inquiry_id uuid,
  company_id uuid,
  customer_id uuid
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session public.public_chat_sessions%rowtype;
  v_message_id uuid;
begin
  if p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid public chat token';
  end if;

  if nullif(btrim(coalesce(p_body, '')), '') is null then
    raise exception 'chat message body is required';
  end if;

  select chat_session.*
  into v_session
  from public.public_chat_sessions as chat_session
  where chat_session.token_hash = p_token_hash
  for update;

  if v_session.id is null or v_session.expires_at <= now() then
    raise exception 'public chat session not found or expired';
  end if;

  if not exists (
    select 1
    from public.companies as company
    where company.id = v_session.company_id
      and company.public_chat_enabled = true
  ) then
    raise exception 'public chat is disabled';
  end if;

  insert into public.inquiry_messages (
    company_id,
    inquiry_id,
    customer_id,
    direction,
    author_type,
    body,
    source_channel,
    created_by
  )
  values (
    v_session.company_id,
    v_session.inquiry_id,
    v_session.customer_id,
    'inbound',
    'customer',
    btrim(p_body),
    'Chat web',
    null
  )
  returning id
  into v_message_id;

  update public.inquiries as inquiry
  set status = case
    when inquiry.status in ('new', 'pending') then inquiry.status
    else 'pending'
  end
  where inquiry.id = v_session.inquiry_id
    and inquiry.company_id = v_session.company_id
    and inquiry.status <> 'discarded';

  if not found then
    raise exception 'public chat inquiry not found';
  end if;

  update public.customers as customer
  set last_interaction_at = now()
  where customer.id = v_session.customer_id
    and customer.company_id = v_session.company_id;

  update public.public_chat_sessions as chat_session
  set last_activity_at = now()
  where chat_session.id = v_session.id;

  return query
  select
    v_message_id,
    v_session.inquiry_id,
    v_session.company_id,
    v_session.customer_id;
end;
$function$;

revoke all on function public.append_public_chat_message(text, text) from public;
revoke all on function public.append_public_chat_message(text, text) from anon;
revoke all on function public.append_public_chat_message(text, text) from authenticated;
grant execute on function public.append_public_chat_message(text, text) to service_role;
