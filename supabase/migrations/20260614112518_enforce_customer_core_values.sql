update public.customers
set status = 'active'
where status is null
   or status not in ('active', 'new', 'inactive', 'archived');

update public.customers
set language = 'es'
where language is null
   or language not in ('es', 'en');

alter table public.customers
alter column status set not null;

alter table public.customers
alter column language set not null;

alter table public.customers
drop constraint if exists customers_status_check;

alter table public.customers
add constraint customers_status_check
check (
  status in ('active', 'new', 'inactive', 'archived')
);

alter table public.customers
drop constraint if exists customers_language_check;

alter table public.customers
add constraint customers_language_check
check (
  language in ('es', 'en')
);