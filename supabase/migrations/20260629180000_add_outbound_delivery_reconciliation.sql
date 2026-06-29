-- Let authenticated operators safely reconcile ambiguous provider deliveries.
-- The state transition, case history update and audit log are one transaction.

alter table public.outbound_messages
add column if not exists resolved_at timestamp with time zone;

alter table public.outbound_messages
add column if not exists resolved_by uuid references auth.users(id) on delete set null;

alter table public.outbound_messages
add column if not exists resolution text;

alter table public.outbound_messages
drop constraint if exists outbound_messages_resolution_check;

alter table public.outbound_messages
add constraint outbound_messages_resolution_check
check (
  resolution is null
  or resolution in ('confirmed_sent', 'confirmed_not_sent')
);

create index if not exists outbound_messages_company_unknown_created_at_idx
on public.outbound_messages (company_id, created_at desc)
where status = 'unknown';

create or replace function public.reconcile_outbound_message(
  p_outbound_message_id uuid,
  p_company_id uuid,
  p_actor_user_id uuid,
  p_resolution text,
  p_provider_message_id text default null
)
returns table (
  outbound_message_id uuid,
  outbound_status text,
  inquiry_message_id uuid,
  provider_message_id text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_outbound public.outbound_messages%rowtype;
  v_inquiry_message_id uuid;
  v_provider_message_id text;
  v_actor_email text;
  v_actor_role text;
begin
  if p_outbound_message_id is null
     or p_company_id is null
     or p_actor_user_id is null then
    raise exception 'outbound message, company and actor are required';
  end if;

  if p_resolution not in ('confirmed_sent', 'confirmed_not_sent') then
    raise exception 'unsupported outbound resolution';
  end if;

  select company_member.role
  into v_actor_role
  from public.company_members as company_member
  where company_member.company_id = p_company_id
    and company_member.user_id = p_actor_user_id
  limit 1;

  if v_actor_role is null then
    raise exception 'actor is not a member of the outbound message company';
  end if;

  select auth_user.email
  into v_actor_email
  from auth.users as auth_user
  where auth_user.id = p_actor_user_id
  limit 1;

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

  if v_outbound.status <> 'unknown' then
    raise exception 'only unknown outbound deliveries can be reconciled';
  end if;

  if p_resolution = 'confirmed_not_sent' then
    update public.outbound_messages as outbound_message
    set
      status = 'failed',
      error_message = 'Un operador confirmó que el proveedor no entregó el mensaje.',
      failed_at = now(),
      processing_token = null,
      resolution = p_resolution,
      resolved_at = now(),
      resolved_by = p_actor_user_id
    where outbound_message.id = v_outbound.id;

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
      p_company_id,
      p_actor_user_id,
      v_actor_email,
      coalesce(v_actor_role, 'unknown'),
      'reconcile_outbound_not_sent',
      'outbound_message',
      v_outbound.id,
      jsonb_build_object(
        'channel', v_outbound.channel,
        'inquiry_id', v_outbound.inquiry_id,
        'previous_status', v_outbound.status
      )
    );

    return query
    select
      v_outbound.id,
      'failed'::text,
      v_outbound.inquiry_message_id,
      v_outbound.provider_message_id;
    return;
  end if;

  v_provider_message_id := nullif(
    btrim(coalesce(p_provider_message_id, v_outbound.provider_message_id, '')),
    ''
  );

  if v_provider_message_id is null then
    raise exception 'provider message id is required to confirm delivery';
  end if;

  if v_outbound.inquiry_message_id is null then
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
    returning id
    into v_inquiry_message_id;
  else
    v_inquiry_message_id := v_outbound.inquiry_message_id;
  end if;

  update public.inquiries as inquiry
  set status = case
    when inquiry.status in ('closed', 'discarded') then inquiry.status
    else coalesce(v_outbound.requested_inquiry_status, 'waiting_customer')
  end
  where inquiry.id = v_outbound.inquiry_id
    and inquiry.company_id = v_outbound.company_id;

  if not found then
    raise exception 'inquiry not found in outbound message company';
  end if;

  update public.outbound_messages as outbound_message
  set
    status = 'sent',
    provider_message_id = v_provider_message_id,
    inquiry_message_id = v_inquiry_message_id,
    error_message = null,
    sent_at = coalesce(outbound_message.sent_at, now()),
    failed_at = null,
    processing_token = null,
    resolution = p_resolution,
    resolved_at = now(),
    resolved_by = p_actor_user_id
  where outbound_message.id = v_outbound.id;

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
    p_company_id,
    p_actor_user_id,
    v_actor_email,
    coalesce(v_actor_role, 'unknown'),
    'reconcile_outbound_sent',
    'outbound_message',
    v_outbound.id,
    jsonb_build_object(
      'channel', v_outbound.channel,
      'inquiry_id', v_outbound.inquiry_id,
      'inquiry_message_id', v_inquiry_message_id,
      'provider_message_id', v_provider_message_id,
      'previous_status', v_outbound.status
    )
  );

  return query
  select
    v_outbound.id,
    'sent'::text,
    v_inquiry_message_id,
    v_provider_message_id;
end;
$function$;

revoke all on function public.reconcile_outbound_message(
  uuid,
  uuid,
  uuid,
  text,
  text
) from public;

revoke all on function public.reconcile_outbound_message(
  uuid,
  uuid,
  uuid,
  text,
  text
) from anon;

revoke all on function public.reconcile_outbound_message(
  uuid,
  uuid,
  uuid,
  text,
  text
) from authenticated;

grant execute on function public.reconcile_outbound_message(
  uuid,
  uuid,
  uuid,
  text,
  text
) to service_role;
