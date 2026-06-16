-- Harden inbound channel and inbound event policies for multitenant production.
-- Members can read company channels/events, but only owners can manage channels.
-- Inbound events are written by server-side APIs using the Supabase service role.

drop policy if exists "Users can insert inbound whatsapp channels in their companies"
on public.inbound_whatsapp_channels;

drop policy if exists "Users can update inbound whatsapp channels from their companies"
on public.inbound_whatsapp_channels;

drop policy if exists "Users can delete inbound whatsapp channels from their companies"
on public.inbound_whatsapp_channels;

drop policy if exists "Owners can insert inbound whatsapp channels in their companies"
on public.inbound_whatsapp_channels;

drop policy if exists "Owners can update inbound whatsapp channels from their companies"
on public.inbound_whatsapp_channels;

drop policy if exists "Owners can delete inbound whatsapp channels from their companies"
on public.inbound_whatsapp_channels;

create policy "Owners can insert inbound whatsapp channels in their companies"
on public.inbound_whatsapp_channels
for insert
to authenticated
with check (
  public.is_company_owner(company_id)
);

create policy "Owners can update inbound whatsapp channels from their companies"
on public.inbound_whatsapp_channels
for update
to authenticated
using (
  public.is_company_owner(company_id)
)
with check (
  public.is_company_owner(company_id)
);

create policy "Owners can delete inbound whatsapp channels from their companies"
on public.inbound_whatsapp_channels
for delete
to authenticated
using (
  public.is_company_owner(company_id)
);

drop policy if exists "Users can insert inbound events in their companies"
on public.inbound_events;

drop policy if exists "Users can update inbound events from their companies"
on public.inbound_events;

drop policy if exists "Users can delete inbound events from their companies"
on public.inbound_events;