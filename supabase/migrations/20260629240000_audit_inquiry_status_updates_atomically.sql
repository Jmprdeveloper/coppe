-- Make ordinary case status changes and their audit entry one transaction.

create or replace function public.update_inquiry_status(
  p_inquiry_id uuid,
  p_next_status text
)
returns table (
  inquiry_id uuid,
  previous_status text,
  next_status text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_inquiry public.inquiries%rowtype;
begin
  if auth.uid() is null then
    raise exception 'No authenticated user';
  end if;

  if p_next_status not in (
    'new',
    'pending',
    'waiting_customer',
    'replied',
    'closed',
    'discarded'
  ) then
    raise exception 'unsupported inquiry status';
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

  if v_inquiry.status <> p_next_status then
    update public.inquiries as inquiry
    set status = p_next_status
    where inquiry.id = v_inquiry.id;

    perform public.create_audit_log(
      v_inquiry.company_id,
      'update_inquiry_status',
      'inquiry',
      v_inquiry.id,
      jsonb_build_object(
        'previous_status', v_inquiry.status,
        'next_status', p_next_status,
        'customer_id', v_inquiry.customer_id,
        'source', 'inquiry_detail'
      )
    );
  end if;

  return query
  select
    v_inquiry.id,
    v_inquiry.status,
    p_next_status;
end;
$function$;

revoke all on function public.update_inquiry_status(uuid, text) from public;
revoke all on function public.update_inquiry_status(uuid, text) from anon;
grant execute on function public.update_inquiry_status(uuid, text) to authenticated;
grant execute on function public.update_inquiry_status(uuid, text) to service_role;
