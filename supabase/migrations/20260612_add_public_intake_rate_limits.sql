begin;

create table if not exists public.public_intake_rate_limits (
  bucket_key text primary key,
  request_count integer not null default 0,
  window_started_at timestamp with time zone not null default now(),
  last_request_at timestamp with time zone not null default now(),
  constraint public_intake_rate_limits_request_count_check
    check (request_count >= 0)
);

alter table public.public_intake_rate_limits enable row level security;

revoke all on table public.public_intake_rate_limits from anon;
revoke all on table public.public_intake_rate_limits from authenticated;

create or replace function public.check_public_intake_rate_limit(
  p_bucket_key text,
  p_max_requests integer default 5,
  p_window_seconds integer default 600
)
returns table (
  allowed boolean,
  current_count integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamp with time zone := now();
  v_window interval := make_interval(
    secs => greatest(coalesce(p_window_seconds, 600), 1)
  );
  v_max_requests integer := greatest(coalesce(p_max_requests, 5), 1);
  v_count integer;
  v_window_started_at timestamp with time zone;
begin
  if p_bucket_key is null or btrim(p_bucket_key) = '' then
    raise exception 'Missing rate limit bucket key';
  end if;

  insert into public.public_intake_rate_limits as rate_limits (
    bucket_key,
    request_count,
    window_started_at,
    last_request_at
  )
  values (
    p_bucket_key,
    1,
    v_now,
    v_now
  )
  on conflict (bucket_key) do update
  set
    request_count = case
      when rate_limits.window_started_at <= (v_now - v_window) then 1
      else rate_limits.request_count + 1
    end,
    window_started_at = case
      when rate_limits.window_started_at <= (v_now - v_window) then v_now
      else rate_limits.window_started_at
    end,
    last_request_at = v_now
  returning
    request_count,
    window_started_at
  into
    v_count,
    v_window_started_at;

  return query
  select
    v_count <= v_max_requests as allowed,
    v_count as current_count,
    case
      when v_count <= v_max_requests then 0
      else greatest(
        1,
        ceil(
          extract(
            epoch from ((v_window_started_at + v_window) - v_now)
          )
        )::integer
      )
    end as retry_after_seconds;
end;
$$;

revoke all on function public.check_public_intake_rate_limit(
  text,
  integer,
  integer
) from public;

grant execute on function public.check_public_intake_rate_limit(
  text,
  integer,
  integer
) to service_role;

commit;
