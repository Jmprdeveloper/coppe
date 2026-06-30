-- Scheduling integrity, omnichannel notifications, automatic courtesy replies
-- and a recoverable quarantine for unsolicited inbound messages.

-- ---------------------------------------------------------------------------
-- Appointment integrity
-- ---------------------------------------------------------------------------

alter table public.appointments
add column if not exists assigned_to uuid references auth.users(id) on delete set null
default auth.uid();

alter table public.appointments
add column if not exists timezone text not null default 'Europe/Madrid';

alter table public.appointments
add column if not exists location text;

alter table public.appointments
add column if not exists buffer_before_minutes integer not null default 0;

alter table public.appointments
add column if not exists buffer_after_minutes integer not null default 0;

alter table public.appointments
drop constraint if exists appointments_duration_minutes_valid;

alter table public.appointments
add constraint appointments_duration_minutes_valid
check (duration_minutes between 5 and 480);

alter table public.appointments
drop constraint if exists appointments_buffer_before_valid;

alter table public.appointments
add constraint appointments_buffer_before_valid
check (buffer_before_minutes between 0 and 240);

alter table public.appointments
drop constraint if exists appointments_buffer_after_valid;

alter table public.appointments
add constraint appointments_buffer_after_valid
check (buffer_after_minutes between 0 and 240);

alter table public.appointments
drop constraint if exists appointments_timezone_not_empty;

alter table public.appointments
add constraint appointments_timezone_not_empty
check (char_length(btrim(timezone)) between 1 and 80);

-- Preserve existing ownership whenever possible. Older appointments did not
-- have a resource, so use the inquiry assignee first and the company owner as
-- a deterministic fallback.
update public.appointments as appointment
set assigned_to = coalesce(
  (
    select inquiry.assigned_to
    from public.inquiries as inquiry
    where inquiry.id = appointment.inquiry_id
      and inquiry.company_id = appointment.company_id
      and inquiry.assigned_to is not null
      and exists (
        select 1
        from public.company_members as assigned_member
        where assigned_member.company_id = appointment.company_id
          and assigned_member.user_id = inquiry.assigned_to
      )
  ),
  (
    select owner_member.user_id
    from public.company_members as owner_member
    where owner_member.company_id = appointment.company_id
      and owner_member.role = 'owner'
    order by owner_member.created_at, owner_member.id
    limit 1
  )
)
where appointment.assigned_to is null;

create index if not exists appointments_company_assignee_scheduled_idx
on public.appointments (
  company_id,
  assigned_to,
  scheduled_at,
  status
);

create or replace function public.validate_appointment_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_resource_key text;
  v_conflict public.appointments%rowtype;
begin
  if new.status not in ('proposed', 'confirmed') then
    return new;
  end if;

  if new.assigned_to is not null and not exists (
    select 1
    from public.company_members as member
    where member.company_id = new.company_id
      and member.user_id = new.assigned_to
  ) then
    raise exception using
      errcode = '23514',
      message = 'APPOINTMENT_ASSIGNEE_NOT_MEMBER';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_timezone_names
    where name = new.timezone
  ) then
    raise exception using
      errcode = '22023',
      message = 'APPOINTMENT_TIMEZONE_INVALID';
  end if;

  v_resource_key := new.company_id::text;

  -- Serialize every active scheduling write in the company. This also closes
  -- the race between a legacy company-wide slot (assigned_to is null) and a
  -- resource-specific slot.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_resource_key, 0)
  );

  select appointment.*
  into v_conflict
  from public.appointments as appointment
  where appointment.company_id = new.company_id
    and (
      appointment.assigned_to = new.assigned_to
      or appointment.assigned_to is null
      or new.assigned_to is null
    )
    and appointment.status in ('proposed', 'confirmed')
    and appointment.id <> new.id
    and tstzrange(
      appointment.scheduled_at
        - make_interval(mins => appointment.buffer_before_minutes),
      appointment.scheduled_at
        + make_interval(
          mins => appointment.duration_minutes
            + appointment.buffer_after_minutes
        ),
      '[)'
    ) && tstzrange(
      new.scheduled_at - make_interval(mins => new.buffer_before_minutes),
      new.scheduled_at
        + make_interval(
          mins => new.duration_minutes + new.buffer_after_minutes
        ),
      '[)'
    )
  order by appointment.scheduled_at
  limit 1;

  if v_conflict.id is not null then
    raise exception using
      errcode = '23P01',
      message = 'APPOINTMENT_CONFLICT',
      detail = jsonb_build_object(
        'appointment_id', v_conflict.id,
        'title', v_conflict.title,
        'scheduled_at', v_conflict.scheduled_at,
        'duration_minutes', v_conflict.duration_minutes
      )::text;
  end if;

  return new;
end;
$function$;

drop trigger if exists validate_appointment_schedule
on public.appointments;

create trigger validate_appointment_schedule
before insert or update of
  company_id,
  assigned_to,
  scheduled_at,
  duration_minutes,
  buffer_before_minutes,
  buffer_after_minutes,
  status,
  timezone
on public.appointments
for each row
execute function public.validate_appointment_schedule();

revoke all on function public.validate_appointment_schedule() from public;
revoke all on function public.validate_appointment_schedule() from anon;
revoke all on function public.validate_appointment_schedule() from authenticated;
grant execute on function public.validate_appointment_schedule() to service_role;

create or replace function public.check_appointment_availability(
  p_company_id uuid,
  p_scheduled_at timestamp with time zone,
  p_duration_minutes integer,
  p_assigned_to uuid,
  p_buffer_before_minutes integer default 0,
  p_buffer_after_minutes integer default 0,
  p_exclude_appointment_id uuid default null
)
returns table (
  appointment_id uuid,
  title text,
  scheduled_at timestamp with time zone,
  duration_minutes integer,
  buffer_before_minutes integer,
  buffer_after_minutes integer
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'No authenticated user';
  end if;

  if not public.is_company_member(p_company_id) then
    raise exception 'User is not a member of this company';
  end if;

  if p_assigned_to is not null and not exists (
    select 1
    from public.company_members as member
    where member.company_id = p_company_id
      and member.user_id = p_assigned_to
  ) then
    raise exception 'Assignee is not a member of this company';
  end if;

  return query
  select
    appointment.id,
    appointment.title,
    appointment.scheduled_at,
    appointment.duration_minutes,
    appointment.buffer_before_minutes,
    appointment.buffer_after_minutes
  from public.appointments as appointment
  where appointment.company_id = p_company_id
    and (
      appointment.assigned_to = p_assigned_to
      or appointment.assigned_to is null
      or p_assigned_to is null
    )
    and appointment.status in ('proposed', 'confirmed')
    and (
      p_exclude_appointment_id is null
      or appointment.id <> p_exclude_appointment_id
    )
    and tstzrange(
      appointment.scheduled_at
        - make_interval(mins => appointment.buffer_before_minutes),
      appointment.scheduled_at
        + make_interval(
          mins => appointment.duration_minutes
            + appointment.buffer_after_minutes
        ),
      '[)'
    ) && tstzrange(
      p_scheduled_at
        - make_interval(
          mins => least(greatest(p_buffer_before_minutes, 0), 240)
        ),
      p_scheduled_at
        + make_interval(
          mins => least(greatest(p_duration_minutes, 5), 480)
            + least(greatest(p_buffer_after_minutes, 0), 240)
        ),
      '[)'
    )
  order by appointment.scheduled_at;
end;
$function$;

revoke all on function public.check_appointment_availability(
  uuid,
  timestamp with time zone,
  integer,
  uuid,
  integer,
  integer,
  uuid
) from public;

grant execute on function public.check_appointment_availability(
  uuid,
  timestamp with time zone,
  integer,
  uuid,
  integer,
  integer,
  uuid
) to authenticated;

-- ---------------------------------------------------------------------------
-- Company inbound automation settings
-- ---------------------------------------------------------------------------

alter table public.companies
add column if not exists auto_acknowledgement_enabled boolean not null
default true;

alter table public.companies
add column if not exists auto_acknowledgement_message text;

alter table public.companies
add column if not exists inbound_filter_enabled boolean not null default true;

alter table public.companies
drop constraint if exists companies_auto_acknowledgement_message_length;

alter table public.companies
add constraint companies_auto_acknowledgement_message_length
check (
  auto_acknowledgement_message is null
  or char_length(auto_acknowledgement_message) between 1 and 1200
);

alter table public.inquiry_messages
add column if not exists message_kind text not null default 'message';

alter table public.inquiry_messages
drop constraint if exists inquiry_messages_message_kind_check;

alter table public.inquiry_messages
add constraint inquiry_messages_message_kind_check
check (message_kind in ('message', 'automatic_acknowledgement'));

create table if not exists public.automatic_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  channel text not null,
  recipient text,
  body text not null,
  provider text,
  provider_message_id text,
  status text not null default 'processing',
  error_message text,
  attempt_count integer not null default 1,
  created_at timestamp with time zone not null default now(),
  sent_at timestamp with time zone,
  updated_at timestamp with time zone not null default now(),
  constraint automatic_acknowledgements_channel_check
    check (channel in ('Formulario web', 'Chat web', 'Email', 'WhatsApp')),
  constraint automatic_acknowledgements_status_check
    check (status in ('processing', 'sent', 'failed', 'skipped')),
  constraint automatic_acknowledgements_body_check
    check (char_length(btrim(body)) between 1 and 1200),
  constraint automatic_acknowledgements_attempt_count_check
    check (attempt_count between 1 and 10),
  unique (inquiry_id)
);

create index if not exists automatic_acknowledgements_company_created_idx
on public.automatic_acknowledgements (company_id, created_at desc);

alter table public.automatic_acknowledgements enable row level security;

revoke all on table public.automatic_acknowledgements from anon;
revoke all on table public.automatic_acknowledgements from authenticated;
grant select on table public.automatic_acknowledgements to authenticated;
grant all on table public.automatic_acknowledgements to service_role;

drop policy if exists "Company members can read automatic acknowledgements"
on public.automatic_acknowledgements;

create policy "Company members can read automatic acknowledgements"
on public.automatic_acknowledgements
for select
to authenticated
using (public.is_company_member(company_id));

-- ---------------------------------------------------------------------------
-- Omnichannel inbound notifications
-- ---------------------------------------------------------------------------

create table if not exists public.inbound_notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  inquiry_message_id uuid not null
    references public.inquiry_messages(id) on delete cascade,
  source_channel text not null,
  customer_name text not null,
  title text not null,
  preview text not null,
  created_at timestamp with time zone not null default now(),
  unique (inquiry_message_id)
);

create index if not exists inbound_notifications_company_created_idx
on public.inbound_notifications (company_id, created_at desc);

create table if not exists public.inbound_notification_reads (
  notification_id uuid not null
    references public.inbound_notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamp with time zone not null default now(),
  primary key (notification_id, user_id)
);

create index if not exists inbound_notification_reads_user_idx
on public.inbound_notification_reads (user_id, read_at desc);

alter table public.inbound_notifications enable row level security;
alter table public.inbound_notification_reads enable row level security;

revoke all on table public.inbound_notifications from anon;
revoke all on table public.inbound_notification_reads from anon;
revoke all on table public.inbound_notifications from authenticated;
revoke all on table public.inbound_notification_reads from authenticated;

grant select on table public.inbound_notifications to authenticated;
grant select, insert on table public.inbound_notification_reads to authenticated;
grant all on table public.inbound_notifications to service_role;
grant all on table public.inbound_notification_reads to service_role;

drop policy if exists "Company members can read inbound notifications"
on public.inbound_notifications;

create policy "Company members can read inbound notifications"
on public.inbound_notifications
for select
to authenticated
using (public.is_company_member(company_id));

drop policy if exists "Users can read their notification receipts"
on public.inbound_notification_reads;

create policy "Users can read their notification receipts"
on public.inbound_notification_reads
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can create their notification receipts"
on public.inbound_notification_reads;

create policy "Users can create their notification receipts"
on public.inbound_notification_reads
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.inbound_notifications as notification
    where notification.id = notification_id
      and public.is_company_member(notification.company_id)
  )
);

create or replace function public.create_inbound_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_inquiry public.inquiries%rowtype;
begin
  if new.direction <> 'inbound' or new.author_type <> 'customer' then
    return new;
  end if;

  select inquiry.*
  into v_inquiry
  from public.inquiries as inquiry
  where inquiry.id = new.inquiry_id
    and inquiry.company_id = new.company_id;

  if v_inquiry.id is null then
    return new;
  end if;

  insert into public.inbound_notifications (
    company_id,
    inquiry_id,
    customer_id,
    inquiry_message_id,
    source_channel,
    customer_name,
    title,
    preview,
    created_at
  )
  values (
    new.company_id,
    new.inquiry_id,
    coalesce(new.customer_id, v_inquiry.customer_id),
    new.id,
    coalesce(
      nullif(btrim(new.source_channel), ''),
      nullif(btrim(v_inquiry.source_channel), ''),
      'Otro'
    ),
    v_inquiry.customer_name,
    coalesce(
      nullif(btrim(v_inquiry.subject), ''),
      'Nuevo mensaje recibido'
    ),
    left(regexp_replace(btrim(new.body), '\s+', ' ', 'g'), 240),
    new.created_at
  )
  on conflict (inquiry_message_id) do nothing;

  return new;
end;
$function$;

drop trigger if exists create_inbound_notification
on public.inquiry_messages;

create trigger create_inbound_notification
after insert on public.inquiry_messages
for each row
execute function public.create_inbound_notification();

revoke all on function public.create_inbound_notification() from public;
revoke all on function public.create_inbound_notification() from anon;
revoke all on function public.create_inbound_notification() from authenticated;
grant execute on function public.create_inbound_notification() to service_role;

create or replace function public.get_inbound_notifications(
  p_company_id uuid,
  p_limit integer default 30
)
returns table (
  id uuid,
  inquiry_id uuid,
  source_channel text,
  customer_name text,
  title text,
  preview text,
  created_at timestamp with time zone,
  is_read boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not public.is_company_member(p_company_id) then
    raise exception 'Not authorized';
  end if;

  return query
  select
    notification.id,
    notification.inquiry_id,
    notification.source_channel,
    notification.customer_name,
    notification.title,
    notification.preview,
    notification.created_at,
    receipt.notification_id is not null
  from public.inbound_notifications as notification
  left join public.inbound_notification_reads as receipt
    on receipt.notification_id = notification.id
   and receipt.user_id = auth.uid()
  where notification.company_id = p_company_id
  order by notification.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$function$;

create or replace function public.mark_inbound_notifications_read(
  p_company_id uuid,
  p_notification_ids uuid[] default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_count integer;
begin
  if auth.uid() is null or not public.is_company_member(p_company_id) then
    raise exception 'Not authorized';
  end if;

  insert into public.inbound_notification_reads (
    notification_id,
    user_id
  )
  select
    notification.id,
    auth.uid()
  from public.inbound_notifications as notification
  where notification.company_id = p_company_id
    and (
      p_notification_ids is null
      or notification.id = any(p_notification_ids)
    )
  on conflict (notification_id, user_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on function public.get_inbound_notifications(uuid, integer)
from public;
revoke all on function public.mark_inbound_notifications_read(uuid, uuid[])
from public;

grant execute on function public.get_inbound_notifications(uuid, integer)
to authenticated;
grant execute on function public.mark_inbound_notifications_read(uuid, uuid[])
to authenticated;

do $block$
begin
  alter publication supabase_realtime
  add table public.inbound_notifications;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$block$;

-- ---------------------------------------------------------------------------
-- Recoverable inbound quarantine
-- ---------------------------------------------------------------------------

create table if not exists public.inbound_sender_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source_channel text not null,
  sender_key text not null,
  action text not null,
  reason text,
  created_by uuid references auth.users(id) on delete set null
    default auth.uid(),
  created_at timestamp with time zone not null default now(),
  constraint inbound_sender_rules_action_check
    check (action in ('allow', 'block')),
  constraint inbound_sender_rules_sender_key_check
    check (char_length(btrim(sender_key)) between 3 and 320),
  unique (company_id, source_channel, sender_key)
);

create table if not exists public.inbound_message_quarantine (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  inbound_event_id uuid references public.inbound_events(id) on delete set null,
  source_channel text not null,
  sender_name text,
  sender_email text,
  sender_phone text,
  sender_key text,
  subject text,
  body text not null,
  classification text not null,
  score integer not null,
  reasons text[] not null default '{}',
  status text not null default 'quarantined',
  released_inquiry_id uuid references public.inquiries(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamp with time zone,
  review_error text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint inbound_message_quarantine_classification_check
    check (
      classification in (
        'spam',
        'commercial_solicitation',
        'automated',
        'rate_limited',
        'blocked_sender'
      )
    ),
  constraint inbound_message_quarantine_score_check
    check (score between 0 and 100),
  constraint inbound_message_quarantine_status_check
    check (status in ('quarantined', 'processing', 'released', 'discarded')),
  constraint inbound_message_quarantine_body_check
    check (char_length(btrim(body)) between 1 and 12000)
);

create index if not exists inbound_message_quarantine_company_status_idx
on public.inbound_message_quarantine (company_id, status, created_at desc);

create index if not exists inbound_sender_rules_lookup_idx
on public.inbound_sender_rules (
  company_id,
  source_channel,
  lower(sender_key)
);

alter table public.inbound_sender_rules enable row level security;
alter table public.inbound_message_quarantine enable row level security;

revoke all on table public.inbound_sender_rules from anon;
revoke all on table public.inbound_message_quarantine from anon;
revoke all on table public.inbound_sender_rules from authenticated;
revoke all on table public.inbound_message_quarantine from authenticated;

grant select on table public.inbound_sender_rules to authenticated;
grant select on table public.inbound_message_quarantine to authenticated;
grant all on table public.inbound_sender_rules to service_role;
grant all on table public.inbound_message_quarantine to service_role;

drop policy if exists "Company members can read inbound sender rules"
on public.inbound_sender_rules;

create policy "Company members can read inbound sender rules"
on public.inbound_sender_rules
for select
to authenticated
using (public.is_company_member(company_id));

drop policy if exists "Company members can read inbound quarantine"
on public.inbound_message_quarantine;

create policy "Company members can read inbound quarantine"
on public.inbound_message_quarantine
for select
to authenticated
using (public.is_company_member(company_id));
