-- Harden outbound delivery claims, retries and finalization.
-- These functions are server-only and must never be granted to client roles.

alter table public.inquiry_messages
add column if not exists created_by uuid references auth.users(id) on delete set null
default auth.uid();

alter table public.outbound_messages
add column if not exists attempt_count integer not null default 0;

alter table public.outbound_messages
add column if not exists processing_started_at timestamp with time zone;

alter table public.outbound_messages
add column if not exists processing_token uuid;

alter table public.outbound_messages
add column if not exists requested_inquiry_status text;

alter table public.outbound_messages
drop constraint if exists outbound_messages_attempt_count_check;

alter table public.outbound_messages
add constraint outbound_messages_attempt_count_check
check (attempt_count >= 0);

alter table public.outbound_messages
drop constraint if exists outbound_messages_status_check;

alter table public.outbound_messages
add constraint outbound_messages_status_check
check (status in ('pending', 'sent', 'failed', 'unknown'));

alter table public.outbound_messages
drop constraint if exists outbound_messages_requested_inquiry_status_check;

alter table public.outbound_messages
add constraint outbound_messages_requested_inquiry_status_check
check (
  requested_inquiry_status is null
  or requested_inquiry_status in ('replied', 'waiting_customer')
);

update public.outbound_messages
set
  attempt_count = greatest(attempt_count, 1),
  processing_started_at = coalesce(processing_started_at, created_at),
  processing_token = coalesce(processing_token, gen_random_uuid())
where status = 'pending';

create index if not exists outbound_messages_pending_processing_idx
on public.outbound_messages (processing_started_at)
where status = 'pending';

create or replace function public.check_server_api_rate_limit(
  p_bucket_key text,
  p_max_requests integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  current_count integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamp with time zone := now();
  v_clean_bucket_key text := left(btrim(coalesce(p_bucket_key, '')), 250);
  v_max_requests integer := least(greatest(coalesce(p_max_requests, 1), 1), 10000);
  v_window_seconds integer := least(
    greatest(coalesce(p_window_seconds, 60), 1),
    86400
  );
  v_window interval;
  v_count integer;
  v_window_started_at timestamp with time zone;
begin
  if v_clean_bucket_key = '' then
    raise exception 'rate limit bucket key is required';
  end if;

  v_window := make_interval(secs => v_window_seconds);

  insert into public.authenticated_api_rate_limits as rate_limit (
    bucket_key,
    request_count,
    window_started_at,
    last_request_at
  )
  values (
    v_clean_bucket_key,
    1,
    v_now,
    v_now
  )
  on conflict on constraint authenticated_api_rate_limits_pkey
  do update set
    request_count = case
      when rate_limit.window_started_at <= v_now - v_window then 1
      else rate_limit.request_count + 1
    end,
    window_started_at = case
      when rate_limit.window_started_at <= v_now - v_window then v_now
      else rate_limit.window_started_at
    end,
    last_request_at = v_now
  returning
    rate_limit.request_count,
    rate_limit.window_started_at
  into
    v_count,
    v_window_started_at;

  return query
  select
    v_count <= v_max_requests,
    v_count,
    case
      when v_count <= v_max_requests then 0
      else greatest(
        1,
        ceil(
          extract(epoch from ((v_window_started_at + v_window) - v_now))
        )::integer
      )
    end;
end;
$function$;

revoke all on function public.check_server_api_rate_limit(
  text,
  integer,
  integer
) from public;

revoke all on function public.check_server_api_rate_limit(
  text,
  integer,
  integer
) from anon;

revoke all on function public.check_server_api_rate_limit(
  text,
  integer,
  integer
) from authenticated;

grant execute on function public.check_server_api_rate_limit(
  text,
  integer,
  integer
) to service_role;

-- The previous authenticated rate-limit RPC accepted arbitrary bucket keys and
-- limits from browser clients. Keep it unavailable to API roles.
revoke all on function public.check_authenticated_api_rate_limit(
  text,
  integer,
  integer
) from public;

revoke all on function public.check_authenticated_api_rate_limit(
  text,
  integer,
  integer
) from anon;

revoke all on function public.check_authenticated_api_rate_limit(
  text,
  integer,
  integer
) from authenticated;

create or replace function public.claim_outbound_message(
  p_company_id uuid,
  p_inquiry_id uuid,
  p_customer_id uuid,
  p_channel text,
  p_provider text,
  p_from_address text,
  p_from_name text,
  p_to_address text,
  p_subject text,
  p_body text,
  p_deduplication_key text,
  p_reply_token text,
  p_requested_inquiry_status text,
  p_created_by uuid,
  p_stale_after_seconds integer default 300
)
returns table (
  outbound_message_id uuid,
  claim_status text,
  claim_token uuid,
  inquiry_message_id uuid,
  provider_message_id text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_message public.outbound_messages%rowtype;
  v_now timestamp with time zone := now();
  v_claim_token uuid := gen_random_uuid();
  v_stale_after interval := make_interval(
    secs => least(greatest(coalesce(p_stale_after_seconds, 300), 60), 3600)
  );
begin
  if p_company_id is null
     or p_inquiry_id is null
     or p_customer_id is null
     or p_created_by is null then
    raise exception 'company, inquiry, customer and actor are required';
  end if;

  if p_channel not in ('email', 'whatsapp') then
    raise exception 'unsupported outbound channel';
  end if;

  if p_requested_inquiry_status not in ('replied', 'waiting_customer') then
    raise exception 'unsupported requested inquiry status';
  end if;

  if nullif(btrim(coalesce(p_provider, '')), '') is null
     or nullif(btrim(coalesce(p_to_address, '')), '') is null
     or nullif(btrim(coalesce(p_body, '')), '') is null
     or nullif(btrim(coalesce(p_deduplication_key, '')), '') is null then
    raise exception 'provider, destination, body and deduplication key are required';
  end if;

  insert into public.outbound_messages (
    company_id,
    inquiry_id,
    customer_id,
    channel,
    provider,
    status,
    from_address,
    from_name,
    to_address,
    subject,
    body,
    deduplication_key,
    reply_token,
    requested_inquiry_status,
    created_by,
    attempt_count,
    processing_started_at,
    processing_token
  )
  values (
    p_company_id,
    p_inquiry_id,
    p_customer_id,
    p_channel,
    btrim(p_provider),
    'pending',
    nullif(btrim(coalesce(p_from_address, '')), ''),
    nullif(btrim(coalesce(p_from_name, '')), ''),
    btrim(p_to_address),
    nullif(btrim(coalesce(p_subject, '')), ''),
    btrim(p_body),
    lower(btrim(p_deduplication_key)),
    nullif(lower(btrim(coalesce(p_reply_token, ''))), ''),
    p_requested_inquiry_status,
    p_created_by,
    1,
    v_now,
    v_claim_token
  )
  on conflict (
    company_id,
    channel,
    deduplication_key
  )
  where deduplication_key is not null
  do nothing
  returning *
  into v_message;

  if v_message.id is not null then
    return query
    select
      v_message.id,
      'claimed'::text,
      v_message.processing_token,
      v_message.inquiry_message_id,
      v_message.provider_message_id;
    return;
  end if;

  select outbound_message.*
  into v_message
  from public.outbound_messages as outbound_message
  where outbound_message.company_id = p_company_id
    and outbound_message.channel = p_channel
    and outbound_message.deduplication_key = lower(btrim(p_deduplication_key))
  for update;

  if v_message.id is null then
    raise exception 'outbound message could not be claimed';
  end if;

  if v_message.inquiry_id <> p_inquiry_id
     or v_message.customer_id is distinct from p_customer_id
     or v_message.provider <> btrim(p_provider)
     or v_message.to_address is distinct from btrim(p_to_address)
     or v_message.body is distinct from btrim(p_body)
     or v_message.requested_inquiry_status is distinct from p_requested_inquiry_status then
    raise exception 'idempotency key was already used with a different request';
  end if;

  if v_message.status = 'sent' then
    return query
    select
      v_message.id,
      'already_sent'::text,
      null::uuid,
      v_message.inquiry_message_id,
      v_message.provider_message_id;
    return;
  end if;

  if v_message.status = 'unknown' then
    return query
    select
      v_message.id,
      'delivery_unknown'::text,
      null::uuid,
      v_message.inquiry_message_id,
      v_message.provider_message_id;
    return;
  end if;

  if v_message.status = 'pending'
     and coalesce(v_message.processing_started_at, v_message.created_at)
       > v_now - v_stale_after then
    return query
    select
      v_message.id,
      'in_progress'::text,
      null::uuid,
      v_message.inquiry_message_id,
      v_message.provider_message_id;
    return;
  end if;

  if v_message.status = 'pending' and p_channel = 'whatsapp' then
    update public.outbound_messages as outbound_message
    set
      status = 'unknown',
      error_message = coalesce(
        outbound_message.error_message,
        'El intento anterior quedó interrumpido y su entrega no puede confirmarse.'
      ),
      processing_token = null
    where outbound_message.id = v_message.id
    returning *
    into v_message;

    return query
    select
      v_message.id,
      'delivery_unknown'::text,
      null::uuid,
      v_message.inquiry_message_id,
      v_message.provider_message_id;
    return;
  end if;

  update public.outbound_messages as outbound_message
  set
    status = 'pending',
    from_address = nullif(btrim(coalesce(p_from_address, '')), ''),
    from_name = nullif(btrim(coalesce(p_from_name, '')), ''),
    to_address = btrim(p_to_address),
    subject = nullif(btrim(coalesce(p_subject, '')), ''),
    body = btrim(p_body),
    reply_token = coalesce(
      nullif(lower(btrim(coalesce(p_reply_token, ''))), ''),
      outbound_message.reply_token
    ),
    requested_inquiry_status = p_requested_inquiry_status,
    provider_message_id = null,
    inquiry_message_id = null,
    error_message = null,
    sent_at = null,
    failed_at = null,
    created_by = p_created_by,
    attempt_count = outbound_message.attempt_count + 1,
    processing_started_at = v_now,
    processing_token = v_claim_token
  where outbound_message.id = v_message.id
    and outbound_message.status in ('pending', 'failed')
  returning *
  into v_message;

  if v_message.id is null then
    raise exception 'outbound message retry could not be claimed';
  end if;

  return query
  select
    v_message.id,
    'claimed'::text,
    v_message.processing_token,
    v_message.inquiry_message_id,
    v_message.provider_message_id;
end;
$function$;

revoke all on function public.claim_outbound_message(
  uuid,
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
  uuid,
  integer
) from public;

revoke all on function public.claim_outbound_message(
  uuid,
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
  uuid,
  integer
) from anon;

revoke all on function public.claim_outbound_message(
  uuid,
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
  uuid,
  integer
) from authenticated;

grant execute on function public.claim_outbound_message(
  uuid,
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
  uuid,
  integer
) to service_role;

create or replace function public.finalize_outbound_message_delivery(
  p_outbound_message_id uuid,
  p_processing_token uuid,
  p_company_id uuid,
  p_provider_message_id text,
  p_next_status text
)
returns table (
  id uuid,
  direction text,
  author_type text,
  body text,
  source_channel text,
  created_by uuid,
  created_at timestamp with time zone
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_outbound public.outbound_messages%rowtype;
  v_inquiry_message public.inquiry_messages%rowtype;
  v_actor_email text;
  v_actor_role text;
begin
  if p_processing_token is null then
    raise exception 'processing token is required';
  end if;

  if nullif(btrim(coalesce(p_provider_message_id, '')), '') is null then
    raise exception 'provider message id is required';
  end if;

  if p_next_status not in ('replied', 'waiting_customer') then
    raise exception 'unsupported next inquiry status';
  end if;

  select outbound_message.*
  into v_outbound
  from public.outbound_messages as outbound_message
  where outbound_message.id = p_outbound_message_id
  for update;

  if v_outbound.id is null then
    raise exception 'outbound message not found';
  end if;

  if v_outbound.company_id <> p_company_id then
    raise exception 'outbound message company mismatch';
  end if;

  if v_outbound.status <> 'pending'
     or v_outbound.processing_token is null
     or v_outbound.processing_token is distinct from p_processing_token then
    raise exception 'outbound message claim is no longer active';
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
    v_outbound.company_id,
    v_outbound.inquiry_id,
    v_outbound.customer_id,
    'outbound',
    'company',
    v_outbound.body,
    case
      when v_outbound.channel = 'whatsapp' then 'WhatsApp'
      else 'Email'
    end,
    v_outbound.created_by
  )
  returning *
  into v_inquiry_message;

  update public.inquiries as inquiry
  set
    status = case
      when inquiry.status in ('closed', 'discarded') then inquiry.status
      else p_next_status
    end,
    suggested_response = v_outbound.body
  where inquiry.id = v_outbound.inquiry_id
    and inquiry.company_id = v_outbound.company_id;

  if not found then
    raise exception 'inquiry not found in outbound message company';
  end if;

  update public.outbound_messages as outbound_message
  set
    status = 'sent',
    provider_message_id = btrim(p_provider_message_id),
    inquiry_message_id = v_inquiry_message.id,
    error_message = null,
    sent_at = now(),
    failed_at = null,
    processing_token = null
  where outbound_message.id = v_outbound.id
    and outbound_message.processing_token = p_processing_token;

  if not found then
    raise exception 'outbound message claim was lost before completion';
  end if;

  select auth_user.email
  into v_actor_email
  from auth.users as auth_user
  where auth_user.id = v_outbound.created_by
  limit 1;

  select company_member.role
  into v_actor_role
  from public.company_members as company_member
  where company_member.company_id = v_outbound.company_id
    and company_member.user_id = v_outbound.created_by
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
    v_outbound.company_id,
    v_outbound.created_by,
    v_actor_email,
    coalesce(v_actor_role, 'unknown'),
    case
      when v_outbound.channel = 'whatsapp' then 'send_whatsapp_response'
      else 'send_email_response'
    end,
    'inquiry',
    v_outbound.inquiry_id,
    jsonb_build_object(
      'customer_id', v_outbound.customer_id,
      'destination', v_outbound.to_address,
      'outbound_message_id', v_outbound.id,
      'inquiry_message_id', v_inquiry_message.id,
      'provider', v_outbound.provider,
      'provider_message_id', btrim(p_provider_message_id),
      'requested_next_status', p_next_status
    )
  );

  return query
  select
    v_inquiry_message.id,
    v_inquiry_message.direction,
    v_inquiry_message.author_type,
    v_inquiry_message.body,
    v_inquiry_message.source_channel,
    v_inquiry_message.created_by,
    v_inquiry_message.created_at;
end;
$function$;

revoke all on function public.finalize_outbound_message_delivery(
  uuid,
  uuid,
  uuid,
  text,
  text
) from public;

revoke all on function public.finalize_outbound_message_delivery(
  uuid,
  uuid,
  uuid,
  text,
  text
) from anon;

revoke all on function public.finalize_outbound_message_delivery(
  uuid,
  uuid,
  uuid,
  text,
  text
) from authenticated;

grant execute on function public.finalize_outbound_message_delivery(
  uuid,
  uuid,
  uuid,
  text,
  text
) to service_role;
