-- Create outbound message delivery log for multitenant production sends.
-- This table stores real outbound delivery attempts separately from case history.

create table if not exists public.outbound_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  inquiry_message_id uuid references public.inquiry_messages(id) on delete set null,
  channel text not null,
  provider text not null,
  status text not null default 'pending',
  from_address text,
  from_name text,
  to_address text,
  subject text,
  body text not null,
  provider_message_id text,
  error_message text,
  sent_at timestamp with time zone,
  failed_at timestamp with time zone,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  constraint outbound_messages_channel_check
    check (channel in ('email', 'whatsapp')),
  constraint outbound_messages_status_check
    check (status in ('pending', 'sent', 'failed')),
  constraint outbound_messages_body_check
    check (length(trim(body)) > 0),
  constraint outbound_messages_email_addresses_check
    check (
      channel <> 'email'
      or (
        from_address is not null
        and length(trim(from_address)) > 0
        and to_address is not null
        and length(trim(to_address)) > 0
      )
    )
);

create index if not exists outbound_messages_company_id_idx
on public.outbound_messages (company_id);

create index if not exists outbound_messages_inquiry_id_created_at_idx
on public.outbound_messages (inquiry_id, created_at desc);

create index if not exists outbound_messages_customer_id_idx
on public.outbound_messages (customer_id);

create index if not exists outbound_messages_status_created_at_idx
on public.outbound_messages (status, created_at desc);

create unique index if not exists outbound_messages_provider_message_id_unique_idx
on public.outbound_messages (provider, provider_message_id)
where provider_message_id is not null;

alter table public.outbound_messages enable row level security;

drop policy if exists "Users can read outbound messages from their companies"
on public.outbound_messages;

create policy "Users can read outbound messages from their companies"
on public.outbound_messages
for select
to authenticated
using (
  public.is_company_member(company_id)
);