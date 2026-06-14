update public.inbound_email_channels
set provider = 'local'
where provider is null
   or btrim(provider) = ''
   or provider not in ('local', 'resend');

update public.inbound_whatsapp_channels
set provider = 'meta'
where provider is null
   or btrim(provider) = ''
   or provider not in ('meta');

alter table public.inbound_email_channels
alter column provider set default 'local';

alter table public.inbound_email_channels
alter column provider set not null;

alter table public.inbound_whatsapp_channels
alter column provider set default 'meta';

alter table public.inbound_whatsapp_channels
alter column provider set not null;

alter table public.inbound_email_channels
drop constraint if exists inbound_email_channels_provider_check;

alter table public.inbound_email_channels
add constraint inbound_email_channels_provider_check
check (
  provider in ('local', 'resend')
);

alter table public.inbound_whatsapp_channels
drop constraint if exists inbound_whatsapp_channels_provider_check;

alter table public.inbound_whatsapp_channels
add constraint inbound_whatsapp_channels_provider_check
check (
  provider in ('meta')
);

alter table public.inbound_email_channels
drop constraint if exists inbound_email_channels_email_not_empty_check;

alter table public.inbound_email_channels
add constraint inbound_email_channels_email_not_empty_check
check (
  btrim(inbound_email_address) <> ''
);

alter table public.inbound_email_channels
drop constraint if exists inbound_email_channels_local_part_not_empty_check;

alter table public.inbound_email_channels
add constraint inbound_email_channels_local_part_not_empty_check
check (
  btrim(local_part) <> ''
);

alter table public.inbound_whatsapp_channels
drop constraint if exists inbound_whatsapp_channels_phone_number_id_not_empty_check;

alter table public.inbound_whatsapp_channels
add constraint inbound_whatsapp_channels_phone_number_id_not_empty_check
check (
  btrim(phone_number_id) <> ''
);