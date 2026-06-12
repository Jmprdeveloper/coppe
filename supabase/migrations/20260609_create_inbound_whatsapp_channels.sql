create table if not exists public.inbound_whatsapp_channels (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  phone_number_id text not null,
  display_phone_number text,
  provider text default 'meta',
  provider_business_account_id text,
  enabled boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create unique index if not exists inbound_whatsapp_channels_phone_number_id_key
on public.inbound_whatsapp_channels (phone_number_id);

create index if not exists inbound_whatsapp_channels_company_id_idx
on public.inbound_whatsapp_channels (company_id);

alter table public.inbound_whatsapp_channels enable row level security;

drop policy if exists "Users can read inbound whatsapp channels from their companies"
on public.inbound_whatsapp_channels;

create policy "Users can read inbound whatsapp channels from their companies"
on public.inbound_whatsapp_channels
for select
to authenticated
using (is_company_member(company_id));

drop policy if exists "Users can insert inbound whatsapp channels in their companies"
on public.inbound_whatsapp_channels;

create policy "Users can insert inbound whatsapp channels in their companies"
on public.inbound_whatsapp_channels
for insert
to authenticated
with check (is_company_member(company_id));

drop policy if exists "Users can update inbound whatsapp channels from their companies"
on public.inbound_whatsapp_channels;

create policy "Users can update inbound whatsapp channels from their companies"
on public.inbound_whatsapp_channels
for update
to authenticated
using (is_company_member(company_id))
with check (is_company_member(company_id));

drop policy if exists "Users can delete inbound whatsapp channels from their companies"
on public.inbound_whatsapp_channels;

create policy "Users can delete inbound whatsapp channels from their companies"
on public.inbound_whatsapp_channels
for delete
to authenticated
using (is_company_member(company_id));
