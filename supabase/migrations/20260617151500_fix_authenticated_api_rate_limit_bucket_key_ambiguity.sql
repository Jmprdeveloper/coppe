create or replace function public.check_authenticated_api_rate_limit(
  bucket_key text,
  max_requests integer,
  window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  clean_bucket_key text;
  next_request_count integer;
  window_interval interval;
begin
  if auth.uid() is null then
    raise exception 'No authenticated user';
  end if;

  clean_bucket_key := left(trim(coalesce(bucket_key, '')), 250);

  if clean_bucket_key = '' then
    raise exception 'Rate limit bucket key is required';
  end if;

  if max_requests < 1 then
    raise exception 'max_requests must be greater than zero';
  end if;

  if window_seconds < 1 then
    raise exception 'window_seconds must be greater than zero';
  end if;

  window_interval := make_interval(secs => window_seconds);

  insert into public.authenticated_api_rate_limits as rate_limit (
    bucket_key,
    request_count,
    window_started_at,
    last_request_at
  )
  values (
    clean_bucket_key,
    1,
    now(),
    now()
  )
  on conflict on constraint authenticated_api_rate_limits_pkey
  do update set
    request_count = case
      when rate_limit.window_started_at <= now() - window_interval then 1
      else rate_limit.request_count + 1
    end,
    window_started_at = case
      when rate_limit.window_started_at <= now() - window_interval then now()
      else rate_limit.window_started_at
    end,
    last_request_at = now()
  returning rate_limit.request_count into next_request_count;

  return next_request_count <= max_requests;
end;
$function$;
