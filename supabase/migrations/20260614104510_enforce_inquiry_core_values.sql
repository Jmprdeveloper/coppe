update public.inquiries
set status = 'new'
where status is null
   or status not in ('new', 'pending', 'waiting_customer', 'replied', 'closed', 'discarded');

update public.inquiries
set ai_priority = 'medium'
where ai_priority is null
   or ai_priority not in ('low', 'medium', 'high');

update public.inquiries
set ai_language = 'es'
where ai_language is null
   or ai_language not in ('es', 'en');

alter table public.inquiries
alter column status set not null;

alter table public.inquiries
alter column ai_priority set not null;

alter table public.inquiries
alter column ai_language set not null;

alter table public.inquiries
drop constraint if exists inquiries_status_check;

alter table public.inquiries
add constraint inquiries_status_check
check (
  status in ('new', 'pending', 'waiting_customer', 'replied', 'closed', 'discarded')
);

alter table public.inquiries
drop constraint if exists inquiries_ai_priority_check;

alter table public.inquiries
add constraint inquiries_ai_priority_check
check (
  ai_priority in ('low', 'medium', 'high')
);

alter table public.inquiries
drop constraint if exists inquiries_ai_language_check;

alter table public.inquiries
add constraint inquiries_ai_language_check
check (
  ai_language in ('es', 'en')
);