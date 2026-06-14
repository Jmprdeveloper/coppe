update public.appointments
set status = 'proposed'
where status is null
   or status not in ('proposed', 'confirmed', 'completed', 'cancelled');

alter table public.appointments
alter column status set default 'proposed';

alter table public.appointments
alter column status set not null;

alter table public.appointments
drop constraint if exists appointments_status_check;

alter table public.appointments
add constraint appointments_status_check
check (
  status in ('proposed', 'confirmed', 'completed', 'cancelled')
);