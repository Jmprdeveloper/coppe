-- Make inbound email and WhatsApp processing retryable and concurrency-safe.
-- Existing migrations remain unchanged. These functions are server-only.

alter table public.inbound_events
add column if not exists attempt_count integer not null default 0;

alter table public.inbound_events
add column if not exists processing_started_at timestamp with time zone;

alter table public.inbound_events
add column if not exists processing_token uuid;

alter table public.inbound_events
drop constraint if exists inbound_events_attempt_count_check;

alter table public.inbound_events
add constraint inbound_events_attempt_count_check
check (attempt_count >= 0);

update public.inbound_events
set
  attempt_count = greatest(attempt_count, 1),
  processing_started_at = coalesce(processing_started_at, received_at, created_at)
where source_channel in ('Email', 'WhatsApp')
  and status = 'received';

create index if not exists inbound_events_processing_started_at_idx
on public.inbound_events (processing_started_at)
where status = 'received'
  and source_channel in ('Email', 'WhatsApp');

create or replace function public.claim_inbound_event(
  p_company_id uuid,
  p_source_channel text,
  p_external_message_id text,
  p_raw_payload jsonb,
  p_stale_after_seconds integer default 600
)
returns table (
  event_id uuid,
  claim_status text,
  claim_token uuid,
  customer_id uuid,
  inquiry_id uuid
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_event public.inbound_events%rowtype;
  v_now timestamp with time zone := now();
  v_claim_token uuid := gen_random_uuid();
  v_stale_after interval := make_interval(
    secs => least(
      greatest(coalesce(p_stale_after_seconds, 600), 60),
      3600
    )
  );
begin
  if p_company_id is null then
    raise exception 'company_id is required';
  end if;

  if p_source_channel is null
     or p_source_channel not in ('Email', 'WhatsApp') then
    raise exception 'unsupported inbound source channel';
  end if;

  if nullif(btrim(coalesce(p_external_message_id, '')), '') is null then
    raise exception 'external_message_id is required';
  end if;

  insert into public.inbound_events (
    company_id,
    source_channel,
    external_message_id,
    status,
    raw_payload,
    attempt_count,
    processing_started_at,
    processing_token
  )
  values (
    p_company_id,
    p_source_channel,
    btrim(p_external_message_id),
    'received',
    p_raw_payload,
    1,
    v_now,
    v_claim_token
  )
  on conflict (
    company_id,
    source_channel,
    external_message_id
  )
  where external_message_id is not null
  do nothing
  returning *
  into v_event;

  if v_event.id is not null then
    return query
    select
      v_event.id,
      'claimed'::text,
      v_event.processing_token,
      v_event.customer_id,
      v_event.inquiry_id;
    return;
  end if;

  select inbound_event.*
  into v_event
  from public.inbound_events as inbound_event
  where inbound_event.company_id = p_company_id
    and inbound_event.source_channel = p_source_channel
    and inbound_event.external_message_id = btrim(p_external_message_id)
  for update;

  if v_event.id is null then
    raise exception 'inbound event could not be claimed';
  end if;

  if v_event.status = 'processed' then
    return query
    select
      v_event.id,
      'processed'::text,
      null::uuid,
      v_event.customer_id,
      v_event.inquiry_id;
    return;
  end if;

  if v_event.status = 'failed'
     or (
       v_event.status = 'received'
       and coalesce(
         v_event.processing_started_at,
         v_event.received_at,
         v_event.created_at
       ) <= (v_now - v_stale_after)
     ) then
    update public.inbound_events as inbound_event
    set
      status = 'received',
      error_message = null,
      processed_at = null,
      raw_payload = coalesce(p_raw_payload, inbound_event.raw_payload),
      attempt_count = inbound_event.attempt_count + 1,
      processing_started_at = v_now,
      processing_token = v_claim_token
    where inbound_event.id = v_event.id
    returning inbound_event.*
    into v_event;

    return query
    select
      v_event.id,
      'claimed'::text,
      v_event.processing_token,
      v_event.customer_id,
      v_event.inquiry_id;
    return;
  end if;

  return query
  select
    v_event.id,
    'in_progress'::text,
    null::uuid,
    v_event.customer_id,
    v_event.inquiry_id;
end;
$function$;

revoke all on function public.claim_inbound_event(
  uuid,
  text,
  text,
  jsonb,
  integer
) from public;

revoke all on function public.claim_inbound_event(
  uuid,
  text,
  text,
  jsonb,
  integer
) from anon;

revoke all on function public.claim_inbound_event(
  uuid,
  text,
  text,
  jsonb,
  integer
) from authenticated;

grant execute on function public.claim_inbound_event(
  uuid,
  text,
  text,
  jsonb,
  integer
) to service_role;

create or replace function public.create_inbound_inquiry_with_initial_message(
  p_inbound_event_id uuid,
  p_processing_token uuid,
  p_company_id uuid,
  p_customer_id uuid,
  p_customer_name text,
  p_source_channel text,
  p_subject text,
  p_original_message text,
  p_ai_summary text,
  p_ai_intent text,
  p_ai_category text,
  p_ai_priority text,
  p_ai_language text,
  p_sentiment text,
  p_missing_information text[],
  p_recommended_action text,
  p_suggested_response text,
  p_status text,
  p_message_direction text,
  p_message_author_type text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_event public.inbound_events%rowtype;
  v_inquiry_id uuid;
begin
  if p_processing_token is null then
    raise exception 'processing_token is required';
  end if;

  select inbound_event.*
  into v_event
  from public.inbound_events as inbound_event
  where inbound_event.id = p_inbound_event_id
  for update;

  if v_event.id is null then
    raise exception 'inbound event not found';
  end if;

  if v_event.company_id <> p_company_id then
    raise exception 'inbound event company mismatch';
  end if;

  if v_event.source_channel <> p_source_channel then
    raise exception 'inbound event source channel mismatch';
  end if;

  if v_event.status <> 'received'
     or v_event.processing_token is null
     or v_event.processing_token is distinct from p_processing_token then
    raise exception 'inbound event claim is no longer active';
  end if;

  v_inquiry_id := public.create_inquiry_with_initial_message(
    p_company_id,
    p_customer_id,
    p_customer_name,
    p_source_channel,
    p_subject,
    p_original_message,
    p_ai_summary,
    p_ai_intent,
    p_ai_category,
    p_ai_priority,
    p_ai_language,
    p_sentiment,
    p_missing_information,
    p_recommended_action,
    p_suggested_response,
    p_status,
    p_message_direction,
    p_message_author_type
  );

  update public.inbound_events as inbound_event
  set
    status = 'processed',
    customer_id = p_customer_id,
    inquiry_id = v_inquiry_id,
    error_message = null,
    processed_at = now(),
    processing_token = null
  where inbound_event.id = p_inbound_event_id
    and inbound_event.processing_token = p_processing_token;

  if not found then
    raise exception 'inbound event claim was lost before completion';
  end if;

  return v_inquiry_id;
end;
$function$;

revoke all on function public.create_inbound_inquiry_with_initial_message(
  uuid,
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
  text[],
  text,
  text,
  text,
  text,
  text
) from public;

revoke all on function public.create_inbound_inquiry_with_initial_message(
  uuid,
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
  text[],
  text,
  text,
  text,
  text,
  text
) from anon;

revoke all on function public.create_inbound_inquiry_with_initial_message(
  uuid,
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
  text[],
  text,
  text,
  text,
  text,
  text
) from authenticated;

grant execute on function public.create_inbound_inquiry_with_initial_message(
  uuid,
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
  text[],
  text,
  text,
  text,
  text,
  text
) to service_role;

create or replace function public.finalize_inbound_email_reply(
  p_inbound_event_id uuid,
  p_processing_token uuid,
  p_company_id uuid,
  p_inquiry_id uuid,
  p_customer_id uuid,
  p_body text,
  p_status text,
  p_ai_summary text,
  p_ai_intent text,
  p_ai_category text,
  p_ai_priority text,
  p_ai_language text,
  p_sentiment text,
  p_missing_information text[],
  p_recommended_action text,
  p_suggested_response text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_event public.inbound_events%rowtype;
  v_message_id uuid;
begin
  if p_processing_token is null then
    raise exception 'processing_token is required';
  end if;

  if nullif(btrim(coalesce(p_body, '')), '') is null then
    raise exception 'message body is required';
  end if;

  select inbound_event.*
  into v_event
  from public.inbound_events as inbound_event
  where inbound_event.id = p_inbound_event_id
  for update;

  if v_event.id is null then
    raise exception 'inbound event not found';
  end if;

  if v_event.company_id <> p_company_id then
    raise exception 'inbound event company mismatch';
  end if;

  if v_event.source_channel <> 'Email' then
    raise exception 'inbound event source channel mismatch';
  end if;

  if v_event.status <> 'received'
     or v_event.processing_token is null
     or v_event.processing_token is distinct from p_processing_token then
    raise exception 'inbound event claim is no longer active';
  end if;

  update public.customers as customer
  set last_interaction_at = now()
  where customer.id = p_customer_id
    and customer.company_id = p_company_id;

  if not found then
    raise exception 'customer not found in inbound event company';
  end if;

  insert into public.inquiry_messages (
    company_id,
    inquiry_id,
    customer_id,
    direction,
    author_type,
    body,
    source_channel
  )
  values (
    p_company_id,
    p_inquiry_id,
    p_customer_id,
    'inbound',
    'customer',
    p_body,
    'Email'
  )
  returning id
  into v_message_id;

  update public.inquiries as inquiry
  set
    status = p_status,
    ai_summary = p_ai_summary,
    ai_intent = p_ai_intent,
    ai_category = p_ai_category,
    ai_priority = p_ai_priority,
    ai_language = p_ai_language,
    sentiment = p_sentiment,
    missing_information = coalesce(p_missing_information, array[]::text[]),
    recommended_action = p_recommended_action,
    suggested_response = p_suggested_response
  where inquiry.id = p_inquiry_id
    and inquiry.company_id = p_company_id;

  if not found then
    raise exception 'inquiry not found in inbound event company';
  end if;

  update public.inbound_events as inbound_event
  set
    status = 'processed',
    customer_id = p_customer_id,
    inquiry_id = p_inquiry_id,
    error_message = null,
    processed_at = now(),
    processing_token = null
  where inbound_event.id = p_inbound_event_id
    and inbound_event.processing_token = p_processing_token;

  if not found then
    raise exception 'inbound event claim was lost before completion';
  end if;

  return v_message_id;
end;
$function$;

revoke all on function public.finalize_inbound_email_reply(
  uuid,
  uuid,
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
  text[],
  text,
  text
) from public;

revoke all on function public.finalize_inbound_email_reply(
  uuid,
  uuid,
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
  text[],
  text,
  text
) from anon;

revoke all on function public.finalize_inbound_email_reply(
  uuid,
  uuid,
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
  text[],
  text,
  text
) from authenticated;

grant execute on function public.finalize_inbound_email_reply(
  uuid,
  uuid,
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
  text[],
  text,
  text
) to service_role;
