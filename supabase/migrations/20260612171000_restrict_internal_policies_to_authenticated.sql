begin;

-- appointments

drop policy if exists "Users can delete appointments from their companies"
on public.appointments;

drop policy if exists "Users can insert appointments in their companies"
on public.appointments;

drop policy if exists "Users can read appointments from their companies"
on public.appointments;

drop policy if exists "Users can update appointments from their companies"
on public.appointments;

create policy "Users can read appointments from their companies"
on public.appointments
for select
to authenticated
using (
  is_company_member(company_id)
);

create policy "Users can insert appointments in their companies"
on public.appointments
for insert
to authenticated
with check (
  is_company_member(company_id)
);

create policy "Users can update appointments from their companies"
on public.appointments
for update
to authenticated
using (
  is_company_member(company_id)
)
with check (
  is_company_member(company_id)
);

create policy "Users can delete appointments from their companies"
on public.appointments
for delete
to authenticated
using (
  is_company_member(company_id)
);

-- companies

drop policy if exists "Owners can update their companies"
on public.companies;

create policy "Owners can update their companies"
on public.companies
for update
to authenticated
using (
  is_company_owner(id)
)
with check (
  is_company_owner(id)
);

-- inbound_email_channels

drop policy if exists "Users can delete inbound email channels from their companies"
on public.inbound_email_channels;

drop policy if exists "Users can insert inbound email channels in their companies"
on public.inbound_email_channels;

drop policy if exists "Users can read inbound email channels from their companies"
on public.inbound_email_channels;

drop policy if exists "Users can update inbound email channels from their companies"
on public.inbound_email_channels;

create policy "Users can read inbound email channels from their companies"
on public.inbound_email_channels
for select
to authenticated
using (
  is_company_member(company_id)
);

create policy "Users can insert inbound email channels in their companies"
on public.inbound_email_channels
for insert
to authenticated
with check (
  is_company_member(company_id)
);

create policy "Users can update inbound email channels from their companies"
on public.inbound_email_channels
for update
to authenticated
using (
  is_company_member(company_id)
)
with check (
  is_company_member(company_id)
);

create policy "Users can delete inbound email channels from their companies"
on public.inbound_email_channels
for delete
to authenticated
using (
  is_company_member(company_id)
);

-- inbound_events

drop policy if exists "Users can delete inbound events from their companies"
on public.inbound_events;

drop policy if exists "Users can insert inbound events in their companies"
on public.inbound_events;

drop policy if exists "Users can read inbound events from their companies"
on public.inbound_events;

drop policy if exists "Users can update inbound events from their companies"
on public.inbound_events;

create policy "Users can read inbound events from their companies"
on public.inbound_events
for select
to authenticated
using (
  is_company_member(company_id)
);

create policy "Users can insert inbound events in their companies"
on public.inbound_events
for insert
to authenticated
with check (
  is_company_member(company_id)
);

create policy "Users can update inbound events from their companies"
on public.inbound_events
for update
to authenticated
using (
  is_company_member(company_id)
)
with check (
  is_company_member(company_id)
);

create policy "Users can delete inbound events from their companies"
on public.inbound_events
for delete
to authenticated
using (
  is_company_member(company_id)
);

commit;
