-- Track case activity and append consecutive WhatsApp messages to one active
-- conversation. The advisory lock prevents simultaneous webhooks from creating
-- two cases for the same company/customer pair.

alter table public.inquiries
add column if not exists last_message_at timestamp with time zone;

update public.inquiries as inquiry
set last_message_at = coalesce(
  (
    select max(inquiry_message.created_at)
    from public.inquiry_messages as inquiry_message
    where inquiry_message.inquiry_id = inquiry.id
  ),
  inquiry.created_at
)
where inquiry.last_message_at is null;

alter table public.inquiries
alter column last_message_at set default now();

alter table public.inquiries
alter column last_message_at set not null;

create index if not exists inquiries_whatsapp_thread_activity_idx
on public.inquiries (
  company_id,
  customer_id,
  last_message_at desc
)
where source_channel = 'WhatsApp'
  and status in ('new', 'pending', 'waiting_customer', 'replied');

create or replace function public.touch_inquiry_last_message_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.inquiries as inquiry
  set last_message_at = greatest(
    inquiry.last_message_at,
    new.created_at
  )
  where inquiry.id = new.inquiry_id
    and inquiry.company_id = new.company_id;

  return new;
end;
$function$;

drop trigger if exists touch_inquiry_last_message_at
on public.inquiry_messages;

create trigger touch_inquiry_last_message_at
after insert on public.inquiry_messages
for each row
execute function public.touch_inquiry_last_message_at();

revoke all on function public.touch_inquiry_last_message_at() from public;
revoke all on function public.touch_inquiry_last_message_at() from anon;
revoke all on function public.touch_inquiry_last_message_at() from authenticated;
grant execute on function public.touch_inquiry_last_message_at() to service_role;

create or replace function public.finalize_inbound_whatsapp_message(
  p_inbound_event_id uuid,
  p_processing_token uuid,
  p_company_id uuid,
  p_customer_id uuid,
  p_preferred_inquiry_id uuid,
  p_thread_window_days integer,
  p_customer_name text,
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
  p_suggested_response text
)
returns table (
  inquiry_id uuid,
  created_new boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_event public.inbound_events%rowtype;
  v_inquiry_id uuid;
  v_created_new boolean := false;
  v_thread_window interval := make_interval(
    days => least(greatest(coalesce(p_thread_window_days, 30), 1), 365)
  );
begin
  if p_processing_token is null then
    raise exception 'processing_token is required';
  end if;

  if p_company_id is null or p_customer_id is null then
    raise exception 'company and customer are required';
  end if;

  if nullif(btrim(coalesce(p_original_message, '')), '') is null then
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

  if v_event.company_id <> p_company_id
     or v_event.source_channel <> 'WhatsApp' then
    raise exception 'inbound event company or source mismatch';
  end if;

  if v_event.status <> 'received'
     or v_event.processing_token is null
     or v_event.processing_token is distinct from p_processing_token then
    raise exception 'inbound event claim is no longer active';
  end if;

  if not exists (
    select 1
    from public.customers as customer
    where customer.id = p_customer_id
      and customer.company_id = p_company_id
  ) then
    raise exception 'customer not found in inbound event company';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_company_id::text || ':' || p_customer_id::text || ':whatsapp',
      0
    )
  );

  select inquiry.id
  into v_inquiry_id
  from public.inquiries as inquiry
  where inquiry.company_id = p_company_id
    and inquiry.customer_id = p_customer_id
    and inquiry.source_channel = 'WhatsApp'
    and inquiry.status in ('new', 'pending', 'waiting_customer', 'replied')
    and inquiry.last_message_at >= now() - v_thread_window
  order by
    case when inquiry.id = p_preferred_inquiry_id then 0 else 1 end,
    inquiry.last_message_at desc,
    inquiry.created_at desc
  limit 1
  for update;

  if v_inquiry_id is null then
    v_inquiry_id := public.create_inquiry_with_initial_message(
      p_company_id,
      p_customer_id,
      p_customer_name,
      'WhatsApp',
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
      'new',
      'inbound',
      'customer'
    );
    v_created_new := true;
  else
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
      v_inquiry_id,
      p_customer_id,
      'inbound',
      'customer',
      p_original_message,
      'WhatsApp'
    );

    update public.inquiries as inquiry
    set
      status = case
        when inquiry.status in ('new', 'pending') then inquiry.status
        else 'pending'
      end,
      ai_summary = p_ai_summary,
      ai_intent = p_ai_intent,
      ai_category = coalesce(inquiry.ai_category, p_ai_category),
      ai_priority = case
        when inquiry.ai_priority = 'high' or p_ai_priority = 'high' then 'high'
        else coalesce(p_ai_priority, inquiry.ai_priority, 'medium')
      end,
      ai_language = coalesce(p_ai_language, inquiry.ai_language),
      sentiment = case
        when inquiry.sentiment = 'negative' then 'negative'
        else coalesce(p_sentiment, inquiry.sentiment, 'neutral')
      end,
      missing_information = coalesce(p_missing_information, array[]::text[]),
      recommended_action = p_recommended_action,
      suggested_response = p_suggested_response
    where inquiry.id = v_inquiry_id
      and inquiry.company_id = p_company_id;

    if not found then
      raise exception 'WhatsApp inquiry was lost before update';
    end if;
  end if;

  update public.customers as customer
  set last_interaction_at = now()
  where customer.id = p_customer_id
    and customer.company_id = p_company_id;

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

  return query
  select v_inquiry_id, v_created_new;
end;
$function$;

revoke all on function public.finalize_inbound_whatsapp_message(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
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
  text
) from public;

revoke all on function public.finalize_inbound_whatsapp_message(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
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
  text
) from anon;

revoke all on function public.finalize_inbound_whatsapp_message(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
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
  text
) from authenticated;

grant execute on function public.finalize_inbound_whatsapp_message(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
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
  text
) to service_role;
