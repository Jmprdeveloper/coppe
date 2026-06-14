revoke execute on function public.check_public_intake_rate_limit(
  text,
  integer,
  integer
) from public;

revoke execute on function public.check_public_intake_rate_limit(
  text,
  integer,
  integer
) from anon;

revoke execute on function public.check_public_intake_rate_limit(
  text,
  integer,
  integer
) from authenticated;

grant execute on function public.check_public_intake_rate_limit(
  text,
  integer,
  integer
) to service_role;

revoke execute on function public.create_inquiry_with_initial_message(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text[],
  text,
  text,
  text,
  text,
  text
) from public;

revoke execute on function public.create_inquiry_with_initial_message(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text[],
  text,
  text,
  text,
  text,
  text
) from anon;

grant execute on function public.create_inquiry_with_initial_message(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text[],
  text,
  text,
  text,
  text,
  text
) to authenticated;

grant execute on function public.create_inquiry_with_initial_message(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text[],
  text,
  text,
  text,
  text,
  text
) to service_role;