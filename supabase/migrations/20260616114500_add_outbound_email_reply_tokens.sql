-- Add reply tokens to outbound messages so email replies can be linked
-- back to the original inquiry in a multitenant-safe way.

alter table public.outbound_messages
add column if not exists reply_token text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'outbound_messages_reply_token_format_check'
  ) then
    alter table public.outbound_messages
    add constraint outbound_messages_reply_token_format_check
      check (
        reply_token is null
        or reply_token ~ '^[a-f0-9]{32}$'
      );
  end if;
end $$;

create unique index if not exists outbound_messages_reply_token_unique_idx
on public.outbound_messages (reply_token)
where reply_token is not null;