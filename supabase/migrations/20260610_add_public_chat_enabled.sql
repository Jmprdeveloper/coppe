alter table public.companies
add column if not exists public_chat_enabled boolean;

update public.companies
set public_chat_enabled = coalesce(public_chat_enabled, public_intake_enabled, false);

alter table public.companies
alter column public_chat_enabled set default true;

alter table public.companies
alter column public_chat_enabled set not null;
