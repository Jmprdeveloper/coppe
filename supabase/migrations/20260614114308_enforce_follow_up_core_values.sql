update public.follow_ups
set status = 'pending'
where status is null
   or status not in ('pending', 'completed', 'cancelled');

update public.follow_ups
set urgency = 'upcoming'
where urgency is null
   or urgency not in ('overdue', 'today', 'upcoming');

alter table public.follow_ups
alter column status set default 'pending';

alter table public.follow_ups
alter column urgency set default 'upcoming';

alter table public.follow_ups
alter column status set not null;

alter table public.follow_ups
alter column urgency set not null;

alter table public.follow_ups
drop constraint if exists follow_ups_status_check;

alter table public.follow_ups
add constraint follow_ups_status_check
check (
  status in ('pending', 'completed', 'cancelled')
);

alter table public.follow_ups
drop constraint if exists follow_ups_urgency_check;

alter table public.follow_ups
add constraint follow_ups_urgency_check
check (
  urgency in ('overdue', 'today', 'upcoming')
);