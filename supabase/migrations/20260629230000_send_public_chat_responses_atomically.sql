-- Publish operator replies to public chat with idempotency, status change and
-- audit logging in one transaction.

alter table public.inquiry_messages
add column if not exists client_request_id uuid;

create unique index if not exists inquiry_messages_client_request_unique_idx
on public.inquiry_messages (inquiry_id, client_request_id)
where client_request_id is not null;

create or replace function public.send_public_chat_response(
  p_inquiry_id uuid,
  p_body text,
  p_next_status text,
  p_client_request_id uuid
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
  v_actor_user_id uuid := auth.uid();
  v_inquiry public.inquiries%rowtype;
  v_message public.inquiry_messages%rowtype;
begin
  if v_actor_user_id is null then
    raise exception 'No authenticated user';
  end if;

  if p_client_request_id is null then
    raise exception 'client request id is required';
  end if;

  if nullif(btrim(coalesce(p_body, '')), '') is null then
    raise exception 'response body is required';
  end if;

  if p_next_status not in ('replied', 'waiting_customer') then
    raise exception 'unsupported next inquiry status';
  end if;

  select inquiry_message.*
  into v_message
  from public.inquiry_messages as inquiry_message
  where inquiry_message.inquiry_id = p_inquiry_id
    and inquiry_message.client_request_id = p_client_request_id;

  if v_message.id is not null then
    if v_message.body is distinct from btrim(p_body)
       or v_message.created_by is distinct from v_actor_user_id then
      raise exception 'client request id was used for a different message';
    end if;

    return query
    select
      v_message.id,
      v_message.direction,
      v_message.author_type,
      v_message.body,
      v_message.source_channel,
      v_message.created_by,
      v_message.created_at;
    return;
  end if;

  select inquiry.*
  into v_inquiry
  from public.inquiries as inquiry
  where inquiry.id = p_inquiry_id
  for update;

  if v_inquiry.id is null
     or not public.is_company_member(v_inquiry.company_id) then
    raise exception 'inquiry not found';
  end if;

  if v_inquiry.source_channel <> 'Chat web' then
    raise exception 'inquiry is not a public chat conversation';
  end if;

  if v_inquiry.status not in ('new', 'pending', 'waiting_customer') then
    raise exception 'inquiry does not accept a chat response';
  end if;

  insert into public.inquiry_messages (
    company_id,
    inquiry_id,
    customer_id,
    direction,
    author_type,
    body,
    source_channel,
    created_by,
    client_request_id
  )
  values (
    v_inquiry.company_id,
    v_inquiry.id,
    v_inquiry.customer_id,
    'outbound',
    'company',
    btrim(p_body),
    'Chat web',
    v_actor_user_id,
    p_client_request_id
  )
  returning *
  into v_message;

  update public.inquiries as inquiry
  set
    status = p_next_status,
    suggested_response = btrim(p_body)
  where inquiry.id = v_inquiry.id;

  perform public.create_audit_log(
    v_inquiry.company_id,
    'send_public_chat_response',
    'inquiry',
    v_inquiry.id,
    jsonb_build_object(
      'customer_id', v_inquiry.customer_id,
      'inquiry_message_id', v_message.id,
      'requested_next_status', p_next_status
    )
  );

  return query
  select
    v_message.id,
    v_message.direction,
    v_message.author_type,
    v_message.body,
    v_message.source_channel,
    v_message.created_by,
    v_message.created_at;
end;
$function$;

revoke all on function public.send_public_chat_response(
  uuid,
  text,
  text,
  uuid
) from public;

revoke all on function public.send_public_chat_response(
  uuid,
  text,
  text,
  uuid
) from anon;

grant execute on function public.send_public_chat_response(
  uuid,
  text,
  text,
  uuid
) to authenticated;

grant execute on function public.send_public_chat_response(
  uuid,
  text,
  text,
  uuid
) to service_role;
