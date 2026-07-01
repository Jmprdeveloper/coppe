-- Allow one automatic acknowledgement per contact session instead of one
-- acknowledgement for the entire lifetime of an inquiry.

alter table public.automatic_acknowledgements
add column if not exists deduplication_key text;

update public.automatic_acknowledgements
set deduplication_key = 'legacy:' || id::text
where deduplication_key is null;

alter table public.automatic_acknowledgements
alter column deduplication_key set not null;

alter table public.automatic_acknowledgements
drop constraint if exists automatic_acknowledgements_inquiry_id_key;

alter table public.automatic_acknowledgements
drop constraint if exists automatic_acknowledgements_deduplication_key_length;

alter table public.automatic_acknowledgements
add constraint automatic_acknowledgements_deduplication_key_length
check (char_length(btrim(deduplication_key)) between 1 and 255);

alter table public.automatic_acknowledgements
drop constraint if exists automatic_acknowledgements_inquiry_session_key;

alter table public.automatic_acknowledgements
add constraint automatic_acknowledgements_inquiry_session_key
unique (inquiry_id, deduplication_key);

create index if not exists automatic_acknowledgements_inquiry_created_idx
on public.automatic_acknowledgements (inquiry_id, created_at desc);
