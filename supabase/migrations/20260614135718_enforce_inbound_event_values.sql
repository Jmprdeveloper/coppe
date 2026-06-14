update public.inbound_events
set status = 'received'
where status is null
   or status not in ('received', 'processed', 'failed');

update public.inbound_events
set source_channel = 'Formulario web'
where source_channel is null
   or source_channel not in ('Formulario web', 'Chat web', 'Email', 'WhatsApp');

alter table public.inbound_events
alter column status set default 'received';

alter table public.inbound_events
alter column status set not null;

alter table public.inbound_events
alter column source_channel set not null;

alter table public.inbound_events
drop constraint if exists inbound_events_status_check;

alter table public.inbound_events
add constraint inbound_events_status_check
check (
  status in ('received', 'processed', 'failed')
);

alter table public.inbound_events
drop constraint if exists inbound_events_source_channel_check;

alter table public.inbound_events
add constraint inbound_events_source_channel_check
check (
  source_channel in ('Formulario web', 'Chat web', 'Email', 'WhatsApp')
);