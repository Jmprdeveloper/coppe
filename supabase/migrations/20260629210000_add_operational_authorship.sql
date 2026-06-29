-- Attribute human-authored messages and notes to a concrete team member.

alter table public.inquiry_messages
add column if not exists created_by uuid references auth.users(id) on delete set null
default auth.uid();

alter table public.internal_notes
add column if not exists created_by uuid references auth.users(id) on delete set null
default auth.uid();

update public.inquiry_messages as inquiry_message
set created_by = outbound_message.created_by
from public.outbound_messages as outbound_message
where outbound_message.inquiry_message_id = inquiry_message.id
  and inquiry_message.created_by is null
  and outbound_message.created_by is not null;

create index if not exists inquiry_messages_created_by_idx
on public.inquiry_messages (created_by, created_at desc)
where created_by is not null;

create index if not exists internal_notes_created_by_idx
on public.internal_notes (created_by, created_at desc)
where created_by is not null;
