create or replace function public.create_inquiry_with_initial_message(
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
  p_status text default 'new',
  p_message_direction text default 'inbound',
  p_message_author_type text default 'customer'
)
returns uuid
language plpgsql
set search_path to 'public'
as $function$
declare
  v_inquiry_id uuid;
begin
  if p_company_id is null then
    raise exception 'company_id is required';
  end if;

  if p_customer_id is null then
    raise exception 'customer_id is required';
  end if;

  if nullif(btrim(coalesce(p_customer_name, '')), '') is null then
    raise exception 'customer_name is required';
  end if;

  if nullif(btrim(coalesce(p_original_message, '')), '') is null then
    raise exception 'original_message is required';
  end if;

  insert into public.inquiries (
    company_id,
    customer_id,
    customer_name,
    source_channel,
    subject,
    original_message,
    ai_summary,
    ai_intent,
    ai_category,
    ai_priority,
    ai_language,
    sentiment,
    missing_information,
    recommended_action,
    suggested_response,
    status
  )
  values (
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
    coalesce(p_missing_information, array[]::text[]),
    p_recommended_action,
    p_suggested_response,
    p_status
  )
  returning id into v_inquiry_id;

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
    p_message_direction,
    p_message_author_type,
    p_original_message,
    p_source_channel
  );

  return v_inquiry_id;
end;
$function$;

revoke all on function public.create_inquiry_with_initial_message(
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
) to service_role;