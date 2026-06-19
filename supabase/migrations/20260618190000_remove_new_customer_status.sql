-- Remove the legacy "new" customer status.
-- "new" remains valid for inquiries; this migration affects customers only.

update public.customers
set status = 'active'
where status = 'new';

alter table public.customers
drop constraint if exists customers_status_check;

alter table public.customers
add constraint customers_status_check
check (status in ('active', 'inactive', 'archived'));
