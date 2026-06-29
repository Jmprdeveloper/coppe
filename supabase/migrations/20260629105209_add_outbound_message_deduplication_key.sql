-- Add an idempotency/deduplication key to outbound messages.
-- This lets trusted server routes prevent double sends caused by double click,
-- browser retries, duplicated requests or concurrent tabs.

alter table public.outbound_messages
add column if not exists deduplication_key text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'outbound_messages_deduplication_key_format_check'
  ) then
    alter table public.outbound_messages
    add constraint outbound_messages_deduplication_key_format_check
      check (
        deduplication_key is null
        or (
          deduplication_key = lower(btrim(deduplication_key))
          and length(deduplication_key) between 16 and 200
          and deduplication_key ~ '^[a-z0-9:_-]+$'
        )
      );
  end if;
end $$;

create unique index if not exists outbound_messages_deduplication_key_unique_idx
on public.outbound_messages (company_id, channel, deduplication_key)
where deduplication_key is not null;

create index if not exists outbound_messages_company_channel_created_at_idx
on public.outbound_messages (company_id, channel, created_at desc);