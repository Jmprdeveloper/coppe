-- Add explicit ownership of work while keeping assignment changes tenant-safe
-- and transactionally audited.

alter table public.inquiries
add column if not exists assigned_to uuid references auth.users(id) on delete set null;

alter table public.inquiries
add column if not exists assigned_at timestamp with time zone;

alter table public.inquiries
add column if not exists assigned_by uuid references auth.users(id) on delete set null;

create index if not exists inquiries_company_assigned_status_idx
on public.inquiries (company_id, assigned_to, status, created_at desc);

create or replace function public.validate_inquiry_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.assigned_to is not null and not exists (
    select 1
    from public.company_members as company_member
    where company_member.company_id = new.company_id
      and company_member.user_id = new.assigned_to
  ) then
    raise exception 'El responsable no pertenece a la empresa del caso.';
  end if;

  return new;
end;
$function$;

drop trigger if exists validate_inquiry_assignment
on public.inquiries;

create trigger validate_inquiry_assignment
before insert or update of company_id, assigned_to on public.inquiries
for each row
execute function public.validate_inquiry_assignment();

revoke all on function public.validate_inquiry_assignment() from public;
revoke all on function public.validate_inquiry_assignment() from anon;
revoke all on function public.validate_inquiry_assignment() from authenticated;
grant execute on function public.validate_inquiry_assignment() to service_role;

create or replace function public.assign_inquiry(
  p_inquiry_id uuid,
  p_assigned_to uuid
)
returns table (
  inquiry_id uuid,
  assigned_to uuid,
  assigned_at timestamp with time zone,
  assigned_by uuid
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_user_id uuid := auth.uid();
  v_inquiry public.inquiries%rowtype;
  v_assigned_at timestamp with time zone;
begin
  if v_actor_user_id is null then
    raise exception 'No authenticated user';
  end if;

  select inquiry.*
  into v_inquiry
  from public.inquiries as inquiry
  where inquiry.id = p_inquiry_id
  for update;

  if v_inquiry.id is null then
    raise exception 'inquiry not found';
  end if;

  if not public.is_company_member(v_inquiry.company_id) then
    raise exception 'user is not a member of the inquiry company';
  end if;

  if p_assigned_to is not null and not exists (
    select 1
    from public.company_members as company_member
    where company_member.company_id = v_inquiry.company_id
      and company_member.user_id = p_assigned_to
  ) then
    raise exception 'assignee is not a member of the inquiry company';
  end if;

  v_assigned_at := case
    when p_assigned_to is null then null
    else now()
  end;

  update public.inquiries as inquiry
  set
    assigned_to = p_assigned_to,
    assigned_at = v_assigned_at,
    assigned_by = case
      when p_assigned_to is null then null
      else v_actor_user_id
    end
  where inquiry.id = v_inquiry.id;

  perform public.create_audit_log(
    v_inquiry.company_id,
    case
      when p_assigned_to is null then 'unassign_inquiry'
      else 'assign_inquiry'
    end,
    'inquiry',
    v_inquiry.id,
    jsonb_build_object(
      'previous_assigned_to', v_inquiry.assigned_to,
      'assigned_to', p_assigned_to
    )
  );

  return query
  select
    v_inquiry.id,
    p_assigned_to,
    v_assigned_at,
    case
      when p_assigned_to is null then null::uuid
      else v_actor_user_id
    end;
end;
$function$;

revoke all on function public.assign_inquiry(uuid, uuid) from public;
revoke all on function public.assign_inquiry(uuid, uuid) from anon;
grant execute on function public.assign_inquiry(uuid, uuid) to authenticated;
grant execute on function public.assign_inquiry(uuid, uuid) to service_role;
