begin;

-- Enforce multitenant relationship integrity across operational tables.
-- This prevents records from linking to customers, inquiries or messages
-- that belong to a different company_id.

lock table
  public.inquiries,
  public.inquiry_messages,
  public.follow_ups,
  public.internal_notes,
  public.inbound_events,
  public.outbound_messages,
  public.customers
in share row exclusive mode;

do $$
begin
  if exists (
    select 1
    from public.inquiries i
    left join public.customers c
      on c.id = i.customer_id
    where i.customer_id is not null
      and (
        c.id is null
        or c.company_id <> i.company_id
      )
  ) then
    raise exception 'Existing invalid data found: inquiries.customer_id does not belong to inquiries.company_id.';
  end if;

  if exists (
    select 1
    from public.inquiry_messages im
    left join public.inquiries i
      on i.id = im.inquiry_id
    where i.id is null
      or i.company_id <> im.company_id
  ) then
    raise exception 'Existing invalid data found: inquiry_messages.inquiry_id does not belong to inquiry_messages.company_id.';
  end if;

  if exists (
    select 1
    from public.inquiry_messages im
    left join public.customers c
      on c.id = im.customer_id
    where im.customer_id is not null
      and (
        c.id is null
        or c.company_id <> im.company_id
      )
  ) then
    raise exception 'Existing invalid data found: inquiry_messages.customer_id does not belong to inquiry_messages.company_id.';
  end if;

  if exists (
    select 1
    from public.follow_ups f
    left join public.inquiries i
      on i.id = f.inquiry_id
    where f.inquiry_id is not null
      and (
        i.id is null
        or i.company_id <> f.company_id
      )
  ) then
    raise exception 'Existing invalid data found: follow_ups.inquiry_id does not belong to follow_ups.company_id.';
  end if;

  if exists (
    select 1
    from public.follow_ups f
    left join public.customers c
      on c.id = f.customer_id
    where f.customer_id is not null
      and (
        c.id is null
        or c.company_id <> f.company_id
      )
  ) then
    raise exception 'Existing invalid data found: follow_ups.customer_id does not belong to follow_ups.company_id.';
  end if;

  if exists (
    select 1
    from public.internal_notes n
    left join public.inquiries i
      on i.id = n.inquiry_id
    where n.inquiry_id is not null
      and (
        i.id is null
        or i.company_id <> n.company_id
      )
  ) then
    raise exception 'Existing invalid data found: internal_notes.inquiry_id does not belong to internal_notes.company_id.';
  end if;

  if exists (
    select 1
    from public.internal_notes n
    left join public.customers c
      on c.id = n.customer_id
    where n.customer_id is not null
      and (
        c.id is null
        or c.company_id <> n.company_id
      )
  ) then
    raise exception 'Existing invalid data found: internal_notes.customer_id does not belong to internal_notes.company_id.';
  end if;

  if exists (
    select 1
    from public.inbound_events e
    left join public.inquiries i
      on i.id = e.inquiry_id
    where e.inquiry_id is not null
      and (
        i.id is null
        or i.company_id <> e.company_id
      )
  ) then
    raise exception 'Existing invalid data found: inbound_events.inquiry_id does not belong to inbound_events.company_id.';
  end if;

  if exists (
    select 1
    from public.inbound_events e
    left join public.customers c
      on c.id = e.customer_id
    where e.customer_id is not null
      and (
        c.id is null
        or c.company_id <> e.company_id
      )
  ) then
    raise exception 'Existing invalid data found: inbound_events.customer_id does not belong to inbound_events.company_id.';
  end if;

  if exists (
    select 1
    from public.outbound_messages om
    left join public.inquiries i
      on i.id = om.inquiry_id
    where i.id is null
      or i.company_id <> om.company_id
  ) then
    raise exception 'Existing invalid data found: outbound_messages.inquiry_id does not belong to outbound_messages.company_id.';
  end if;

  if exists (
    select 1
    from public.outbound_messages om
    left join public.customers c
      on c.id = om.customer_id
    where om.customer_id is not null
      and (
        c.id is null
        or c.company_id <> om.company_id
      )
  ) then
    raise exception 'Existing invalid data found: outbound_messages.customer_id does not belong to outbound_messages.company_id.';
  end if;

  if exists (
    select 1
    from public.outbound_messages om
    left join public.inquiry_messages im
      on im.id = om.inquiry_message_id
    where om.inquiry_message_id is not null
      and (
        im.id is null
        or im.company_id <> om.company_id
        or im.inquiry_id <> om.inquiry_id
      )
  ) then
    raise exception 'Existing invalid data found: outbound_messages.inquiry_message_id does not belong to outbound_messages company/inquiry.';
  end if;
end;
$$;

create or replace function public.validate_inquiry_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.customer_id is not null and not exists (
    select 1
    from public.customers c
    where c.id = new.customer_id
      and c.company_id = new.company_id
  ) then
    raise exception 'El caso no pertenece a la misma empresa que el cliente.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_inquiry_company on public.inquiries;

create trigger validate_inquiry_company
before insert or update on public.inquiries
for each row
execute function public.validate_inquiry_company();

create or replace function public.validate_inquiry_message_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.inquiries i
    where i.id = new.inquiry_id
      and i.company_id = new.company_id
  ) then
    raise exception 'El mensaje no pertenece a la misma empresa que el caso.';
  end if;

  if new.customer_id is not null and not exists (
    select 1
    from public.customers c
    where c.id = new.customer_id
      and c.company_id = new.company_id
  ) then
    raise exception 'El mensaje no pertenece a la misma empresa que el cliente.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_inquiry_message_company on public.inquiry_messages;

create trigger validate_inquiry_message_company
before insert or update on public.inquiry_messages
for each row
execute function public.validate_inquiry_message_company();

create or replace function public.validate_follow_up_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.inquiry_id is not null and not exists (
    select 1
    from public.inquiries i
    where i.id = new.inquiry_id
      and i.company_id = new.company_id
  ) then
    raise exception 'El seguimiento no pertenece a la misma empresa que el caso.';
  end if;

  if new.customer_id is not null and not exists (
    select 1
    from public.customers c
    where c.id = new.customer_id
      and c.company_id = new.company_id
  ) then
    raise exception 'El seguimiento no pertenece a la misma empresa que el cliente.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_follow_up_company on public.follow_ups;

create trigger validate_follow_up_company
before insert or update on public.follow_ups
for each row
execute function public.validate_follow_up_company();

create or replace function public.validate_internal_note_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.inquiry_id is not null and not exists (
    select 1
    from public.inquiries i
    where i.id = new.inquiry_id
      and i.company_id = new.company_id
  ) then
    raise exception 'La nota interna no pertenece a la misma empresa que el caso.';
  end if;

  if new.customer_id is not null and not exists (
    select 1
    from public.customers c
    where c.id = new.customer_id
      and c.company_id = new.company_id
  ) then
    raise exception 'La nota interna no pertenece a la misma empresa que el cliente.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_internal_note_company on public.internal_notes;

create trigger validate_internal_note_company
before insert or update on public.internal_notes
for each row
execute function public.validate_internal_note_company();

create or replace function public.validate_inbound_event_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.inquiry_id is not null and not exists (
    select 1
    from public.inquiries i
    where i.id = new.inquiry_id
      and i.company_id = new.company_id
  ) then
    raise exception 'El evento entrante no pertenece a la misma empresa que el caso.';
  end if;

  if new.customer_id is not null and not exists (
    select 1
    from public.customers c
    where c.id = new.customer_id
      and c.company_id = new.company_id
  ) then
    raise exception 'El evento entrante no pertenece a la misma empresa que el cliente.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_inbound_event_company on public.inbound_events;

create trigger validate_inbound_event_company
before insert or update on public.inbound_events
for each row
execute function public.validate_inbound_event_company();

create or replace function public.validate_outbound_message_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.inquiries i
    where i.id = new.inquiry_id
      and i.company_id = new.company_id
  ) then
    raise exception 'El mensaje saliente no pertenece a la misma empresa que el caso.';
  end if;

  if new.customer_id is not null and not exists (
    select 1
    from public.customers c
    where c.id = new.customer_id
      and c.company_id = new.company_id
  ) then
    raise exception 'El mensaje saliente no pertenece a la misma empresa que el cliente.';
  end if;

  if new.inquiry_message_id is not null and not exists (
    select 1
    from public.inquiry_messages im
    where im.id = new.inquiry_message_id
      and im.company_id = new.company_id
      and im.inquiry_id = new.inquiry_id
  ) then
    raise exception 'El mensaje saliente no pertenece a la misma empresa o caso que el mensaje del historial.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_outbound_message_company on public.outbound_messages;

create trigger validate_outbound_message_company
before insert or update on public.outbound_messages
for each row
execute function public.validate_outbound_message_company();

commit;
