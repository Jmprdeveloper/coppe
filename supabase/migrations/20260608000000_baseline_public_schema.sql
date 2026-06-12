


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."accept_company_invitation"("invitation_token" "uuid") RETURNS TABLE("company_id" "uuid", "company_name" "text", "role" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  invitation_record public.company_invitations%rowtype;
  current_user_email text;
begin
  if auth.uid() is null then
    raise exception 'No authenticated user';
  end if;

  current_user_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  if current_user_email = '' then
    raise exception 'Current user email could not be resolved';
  end if;

  select *
  into invitation_record
  from public.company_invitations ci
  where ci.token = invitation_token;

  if invitation_record.id is null then
    raise exception 'Invitation not found';
  end if;

  if invitation_record.status <> 'pending' then
    raise exception 'Invitation is not pending';
  end if;

  if invitation_record.expires_at <= now() then
    update public.company_invitations ci
    set
      status = 'expired',
      updated_at = now()
    where ci.id = invitation_record.id;

    raise exception 'Invitation has expired';
  end if;

  if lower(invitation_record.email) <> current_user_email then
    raise exception 'Invitation email does not match current user';
  end if;

  if exists (
    select 1
    from public.company_members cm
    where cm.user_id = auth.uid()
  ) then
    raise exception 'User already belongs to a company';
  end if;

  insert into public.company_members (
    company_id,
    user_id,
    role
  )
  values (
    invitation_record.company_id,
    auth.uid(),
    invitation_record.role
  );

  update public.company_invitations ci
  set
    status = 'accepted',
    accepted_by = auth.uid(),
    accepted_at = now(),
    updated_at = now()
  where ci.id = invitation_record.id;

  return query
  select
    c.id,
    c.name,
    invitation_record.role
  from public.companies c
  where c.id = invitation_record.company_id;
end;
$$;


ALTER FUNCTION "public"."accept_company_invitation"("invitation_token" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_company_invitation"("invitation_id" "uuid") RETURNS TABLE("id" "uuid", "company_id" "uuid", "email" "text", "role" "text", "status" "text", "token" "uuid", "expires_at" timestamp with time zone, "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  invitation_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No authenticated user';
  end if;

  select ci.company_id
  into invitation_company_id
  from public.company_invitations ci
  where ci.id = invitation_id;

  if invitation_company_id is null then
    raise exception 'Invitation not found';
  end if;

  if not public.is_company_owner(invitation_company_id) then
    raise exception 'Only company owners can cancel invitations';
  end if;

  return query
  update public.company_invitations ci
  set
    status = 'cancelled',
    updated_at = now()
  where ci.id = invitation_id
    and ci.status = 'pending'
  returning
    ci.id,
    ci.company_id,
    ci.email,
    ci.role,
    ci.status,
    ci.token,
    ci.expires_at,
    ci.created_at;
end;
$$;


ALTER FUNCTION "public"."cancel_company_invitation"("invitation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_public_intake_rate_limit"("p_bucket_key" "text", "p_max_requests" integer DEFAULT 5, "p_window_seconds" integer DEFAULT 600) RETURNS TABLE("allowed" boolean, "current_count" integer, "retry_after_seconds" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."check_public_intake_rate_limit"("p_bucket_key" "text", "p_max_requests" integer, "p_window_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_company_for_current_user"("company_name" "text", "company_sector" "text", "company_description" "text" DEFAULT NULL::"text", "company_tone" "text" DEFAULT 'profesional y cercano'::"text", "company_language" "text" DEFAULT 'es'::"text") RETURNS TABLE("id" "uuid", "name" "text", "sector" "text", "description" "text", "tone" "text", "language" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  new_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No authenticated user';
  end if;

  if exists (
    select 1
    from public.company_members cm
    where cm.user_id = auth.uid()
  ) then
    raise exception 'User already belongs to a company';
  end if;

  if trim(coalesce(company_name, '')) = '' then
    raise exception 'Company name is required';
  end if;

  if trim(coalesce(company_sector, '')) = '' then
    raise exception 'Company sector is required';
  end if;

  insert into public.companies (
    name,
    sector,
    description,
    tone,
    language
  )
  values (
    trim(company_name),
    trim(company_sector),
    nullif(trim(coalesce(company_description, '')), ''),
    nullif(trim(coalesce(company_tone, '')), ''),
    nullif(trim(coalesce(company_language, '')), '')
  )
  returning companies.id into new_company_id;

  insert into public.company_members (
    company_id,
    user_id,
    role
  )
  values (
    new_company_id,
    auth.uid(),
    'owner'
  );

  return query
  select
    c.id,
    c.name,
    c.sector,
    c.description,
    c.tone,
    c.language
  from public.companies c
  where c.id = new_company_id;
end;
$$;


ALTER FUNCTION "public"."create_company_for_current_user"("company_name" "text", "company_sector" "text", "company_description" "text", "company_tone" "text", "company_language" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_company_invitation"("target_company_id" "uuid", "invite_email" "text") RETURNS TABLE("id" "uuid", "company_id" "uuid", "email" "text", "role" "text", "status" "text", "token" "uuid", "expires_at" timestamp with time zone, "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  normalized_email text;
begin
  if auth.uid() is null then
    raise exception 'No authenticated user';
  end if;

  if not public.is_company_owner(target_company_id) then
    raise exception 'Only company owners can create invitations';
  end if;

  normalized_email := lower(trim(coalesce(invite_email, '')));

  if normalized_email = '' then
    raise exception 'Invitation email is required';
  end if;

  if normalized_email !~ '^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$' then
    raise exception 'Invitation email is not valid';
  end if;

  if exists (
    select 1
    from public.company_invitations ci
    where ci.company_id = target_company_id
      and lower(ci.email) = normalized_email
      and ci.status = 'pending'
  ) then
    raise exception 'There is already a pending invitation for this email';
  end if;

  return query
  insert into public.company_invitations (
    company_id,
    email,
    role,
    status,
    invited_by
  )
  values (
    target_company_id,
    normalized_email,
    'member',
    'pending',
    auth.uid()
  )
  returning
    company_invitations.id,
    company_invitations.company_id,
    company_invitations.email,
    company_invitations.role,
    company_invitations.status,
    company_invitations.token,
    company_invitations.expires_at,
    company_invitations.created_at;
end;
$_$;


ALTER FUNCTION "public"."create_company_invitation"("target_company_id" "uuid", "invite_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_company_invitation_preview"("invitation_token" "uuid") RETURNS TABLE("company_name" "text", "email" "text", "role" "text", "status" "text", "expires_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    c.name as company_name,
    ci.email,
    ci.role,
    case
      when ci.status = 'pending' and ci.expires_at <= now() then 'expired'
      else ci.status
    end as status,
    ci.expires_at
  from public.company_invitations ci
  join public.companies c on c.id = ci.company_id
  where ci.token = invitation_token
  limit 1;
$$;


ALTER FUNCTION "public"."get_company_invitation_preview"("invitation_token" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_company_team_members"("target_company_id" "uuid") RETURNS TABLE("user_id" "uuid", "email" "text", "full_name" "text", "role" "text", "created_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    cm.user_id,
    coalesce(au.email, '')::text as email,
    coalesce(au.raw_user_meta_data ->> 'full_name', '')::text as full_name,
    cm.role,
    cm.created_at
  from public.company_members cm
  join auth.users au on au.id = cm.user_id
  where cm.company_id = target_company_id
    and auth.uid() is not null
    and public.is_company_member(target_company_id)
  order by
    case cm.role
      when 'owner' then 0
      else 1
    end,
    cm.created_at asc;
$$;


ALTER FUNCTION "public"."get_company_team_members"("target_company_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_company_membership"() RETURNS TABLE("company_id" "uuid", "company_name" "text", "role" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    c.id as company_id,
    c.name as company_name,
    cm.role
  from public.company_members cm
  join public.companies c on c.id = cm.company_id
  where cm.user_id = auth.uid()
  order by cm.created_at asc
  limit 1;
$$;


ALTER FUNCTION "public"."get_current_company_membership"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_company_member"("target_company_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.company_members cm
    where cm.company_id = target_company_id
      and cm.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_company_member"("target_company_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_company_owner"("target_company_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.company_members cm
    where cm.company_id = target_company_id
      and cm.user_id = auth.uid()
      and cm.role = 'owner'
  );
$$;


ALTER FUNCTION "public"."is_company_owner"("target_company_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_phone_es_for_unique"("phone_input" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $_$
  select case
    when regexp_replace(coalesce(phone_input, ''), '\D', '', 'g') ~ '^0034[0-9]{9}$'
      then substring(regexp_replace(coalesce(phone_input, ''), '\D', '', 'g') from 5)
    when regexp_replace(coalesce(phone_input, ''), '\D', '', 'g') ~ '^34[0-9]{9}$'
      then substring(regexp_replace(coalesce(phone_input, ''), '\D', '', 'g') from 3)
    else regexp_replace(coalesce(phone_input, ''), '\D', '', 'g')
  end;
$_$;


ALTER FUNCTION "public"."normalize_phone_es_for_unique"("phone_input" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_appointments_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_appointments_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_appointment_company"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.inquiry_id is not null and not exists (
    select 1
    from public.inquiries
    where inquiries.id = new.inquiry_id
      and inquiries.company_id = new.company_id
  ) then
    raise exception 'La cita no pertenece a la misma empresa que el caso.';
  end if;

  if new.customer_id is not null and not exists (
    select 1
    from public.customers
    where customers.id = new.customer_id
      and customers.company_id = new.company_id
  ) then
    raise exception 'La cita no pertenece a la misma empresa que el cliente.';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_appointment_company"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."appointments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "inquiry_id" "uuid",
    "customer_id" "uuid",
    "title" "text" NOT NULL,
    "scheduled_at" timestamp with time zone NOT NULL,
    "duration_minutes" integer DEFAULT 60 NOT NULL,
    "status" "text" DEFAULT 'proposed'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "appointments_duration_minutes_valid" CHECK ((("duration_minutes" > 0) AND ("duration_minutes" <= 480))),
    CONSTRAINT "appointments_status_valid" CHECK (("status" = ANY (ARRAY['proposed'::"text", 'confirmed'::"text", 'completed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "appointments_title_not_empty" CHECK (("length"(TRIM(BOTH FROM "title")) > 0))
);


ALTER TABLE "public"."appointments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."companies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "sector" "text" NOT NULL,
    "description" "text",
    "tone" "text" DEFAULT 'Profesional'::"text",
    "language" "text" DEFAULT 'Español'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "public_intake_token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "public_intake_enabled" boolean DEFAULT true NOT NULL,
    "public_chat_enabled" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."companies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "invited_by" "uuid",
    "accepted_by" "uuid",
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval) NOT NULL,
    "accepted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "company_invitations_role_check" CHECK (("role" = 'member'::"text")),
    CONSTRAINT "company_invitations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'cancelled'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."company_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'owner'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "company_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."company_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "language" "text" DEFAULT 'es'::"text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "last_interaction_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."follow_ups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "customer_id" "uuid",
    "inquiry_id" "uuid",
    "title" "text" NOT NULL,
    "due_at" timestamp with time zone,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "urgency" "text" DEFAULT 'upcoming'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."follow_ups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inbound_email_channels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "inbound_email_address" "text" NOT NULL,
    "local_part" "text" NOT NULL,
    "provider" "text",
    "provider_route_id" "text",
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."inbound_email_channels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inbound_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "source_channel" "text" NOT NULL,
    "external_message_id" "text",
    "customer_id" "uuid",
    "inquiry_id" "uuid",
    "status" "text" DEFAULT 'received'::"text" NOT NULL,
    "error_message" "text",
    "raw_payload" "jsonb",
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."inbound_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inbound_whatsapp_channels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "phone_number_id" "text" NOT NULL,
    "display_phone_number" "text",
    "provider" "text" DEFAULT 'meta'::"text",
    "provider_business_account_id" "text",
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."inbound_whatsapp_channels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inquiries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "customer_id" "uuid",
    "customer_name" "text" NOT NULL,
    "source_channel" "text" DEFAULT 'form'::"text" NOT NULL,
    "subject" "text",
    "original_message" "text" NOT NULL,
    "ai_summary" "text",
    "ai_intent" "text",
    "ai_category" "text",
    "ai_priority" "text",
    "ai_language" "text",
    "sentiment" "text",
    "missing_information" "text"[] DEFAULT '{}'::"text"[],
    "recommended_action" "text",
    "suggested_response" "text",
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."inquiries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inquiry_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "inquiry_id" "uuid" NOT NULL,
    "customer_id" "uuid",
    "direction" "text" NOT NULL,
    "author_type" "text" NOT NULL,
    "body" "text" NOT NULL,
    "source_channel" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inquiry_messages_author_type_check" CHECK (("author_type" = ANY (ARRAY['customer'::"text", 'company'::"text", 'ai'::"text"]))),
    CONSTRAINT "inquiry_messages_body_check" CHECK (("length"(TRIM(BOTH FROM "body")) > 0)),
    CONSTRAINT "inquiry_messages_direction_check" CHECK (("direction" = ANY (ARRAY['inbound'::"text", 'outbound'::"text"])))
);


ALTER TABLE "public"."inquiry_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."internal_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "customer_id" "uuid",
    "inquiry_id" "uuid",
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."internal_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."public_intake_rate_limits" (
    "bucket_key" "text" NOT NULL,
    "request_count" integer DEFAULT 0 NOT NULL,
    "window_started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_request_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "public_intake_rate_limits_request_count_check" CHECK (("request_count" >= 0))
);


ALTER TABLE "public"."public_intake_rate_limits" OWNER TO "postgres";


ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_invitations"
    ADD CONSTRAINT "company_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_members"
    ADD CONSTRAINT "company_members_company_id_user_id_key" UNIQUE ("company_id", "user_id");



ALTER TABLE ONLY "public"."company_members"
    ADD CONSTRAINT "company_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."follow_ups"
    ADD CONSTRAINT "follow_ups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inbound_email_channels"
    ADD CONSTRAINT "inbound_email_channels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inbound_events"
    ADD CONSTRAINT "inbound_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inbound_whatsapp_channels"
    ADD CONSTRAINT "inbound_whatsapp_channels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inquiries"
    ADD CONSTRAINT "inquiries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inquiry_messages"
    ADD CONSTRAINT "inquiry_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."internal_notes"
    ADD CONSTRAINT "internal_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."public_intake_rate_limits"
    ADD CONSTRAINT "public_intake_rate_limits_pkey" PRIMARY KEY ("bucket_key");



CREATE INDEX "appointments_company_scheduled_at_idx" ON "public"."appointments" USING "btree" ("company_id", "scheduled_at");



CREATE INDEX "appointments_company_status_scheduled_at_idx" ON "public"."appointments" USING "btree" ("company_id", "status", "scheduled_at");



CREATE INDEX "appointments_customer_id_idx" ON "public"."appointments" USING "btree" ("customer_id");



CREATE INDEX "appointments_inquiry_id_idx" ON "public"."appointments" USING "btree" ("inquiry_id");



CREATE UNIQUE INDEX "companies_public_intake_token_key" ON "public"."companies" USING "btree" ("public_intake_token");



CREATE INDEX "company_invitations_company_id_idx" ON "public"."company_invitations" USING "btree" ("company_id");



CREATE INDEX "company_invitations_email_idx" ON "public"."company_invitations" USING "btree" ("lower"("email"));



CREATE UNIQUE INDEX "company_invitations_pending_email_unique_idx" ON "public"."company_invitations" USING "btree" ("company_id", "lower"("email")) WHERE ("status" = 'pending'::"text");



CREATE INDEX "company_invitations_status_idx" ON "public"."company_invitations" USING "btree" ("status");



CREATE INDEX "company_invitations_token_idx" ON "public"."company_invitations" USING "btree" ("token");



CREATE INDEX "company_members_company_role_idx" ON "public"."company_members" USING "btree" ("company_id", "role");



CREATE UNIQUE INDEX "company_members_user_id_unique_idx" ON "public"."company_members" USING "btree" ("user_id");



CREATE UNIQUE INDEX "customers_company_email_unique" ON "public"."customers" USING "btree" ("company_id", "lower"("email")) WHERE (("email" IS NOT NULL) AND ("btrim"("email") <> ''::"text"));



CREATE UNIQUE INDEX "customers_company_phone_normalized_unique" ON "public"."customers" USING "btree" ("company_id", "public"."normalize_phone_es_for_unique"("phone")) WHERE (("phone" IS NOT NULL) AND ("btrim"("phone") <> ''::"text") AND ("public"."normalize_phone_es_for_unique"("phone") <> ''::"text"));



CREATE INDEX "inbound_email_channels_company_id_idx" ON "public"."inbound_email_channels" USING "btree" ("company_id");



CREATE UNIQUE INDEX "inbound_email_channels_company_local_part_key" ON "public"."inbound_email_channels" USING "btree" ("company_id", "lower"("local_part"));



CREATE UNIQUE INDEX "inbound_email_channels_email_key" ON "public"."inbound_email_channels" USING "btree" ("lower"("inbound_email_address"));



CREATE INDEX "inbound_email_channels_enabled_idx" ON "public"."inbound_email_channels" USING "btree" ("enabled");



CREATE INDEX "inbound_events_company_id_idx" ON "public"."inbound_events" USING "btree" ("company_id");



CREATE UNIQUE INDEX "inbound_events_external_message_unique_idx" ON "public"."inbound_events" USING "btree" ("company_id", "source_channel", "external_message_id") WHERE ("external_message_id" IS NOT NULL);



CREATE INDEX "inbound_events_received_at_idx" ON "public"."inbound_events" USING "btree" ("received_at" DESC);



CREATE INDEX "inbound_events_source_channel_idx" ON "public"."inbound_events" USING "btree" ("source_channel");



CREATE INDEX "inbound_events_status_idx" ON "public"."inbound_events" USING "btree" ("status");



CREATE INDEX "inbound_whatsapp_channels_company_id_idx" ON "public"."inbound_whatsapp_channels" USING "btree" ("company_id");



CREATE UNIQUE INDEX "inbound_whatsapp_channels_phone_number_id_key" ON "public"."inbound_whatsapp_channels" USING "btree" ("phone_number_id");



CREATE INDEX "inquiry_messages_company_id_idx" ON "public"."inquiry_messages" USING "btree" ("company_id");



CREATE INDEX "inquiry_messages_customer_id_idx" ON "public"."inquiry_messages" USING "btree" ("customer_id");



CREATE INDEX "inquiry_messages_inquiry_id_created_at_idx" ON "public"."inquiry_messages" USING "btree" ("inquiry_id", "created_at");



CREATE OR REPLACE TRIGGER "set_appointments_updated_at" BEFORE UPDATE ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."set_appointments_updated_at"();



CREATE OR REPLACE TRIGGER "validate_appointment_company" BEFORE INSERT OR UPDATE ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."validate_appointment_company"();



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_invitations"
    ADD CONSTRAINT "company_invitations_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."company_invitations"
    ADD CONSTRAINT "company_invitations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_invitations"
    ADD CONSTRAINT "company_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."company_members"
    ADD CONSTRAINT "company_members_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_members"
    ADD CONSTRAINT "company_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."follow_ups"
    ADD CONSTRAINT "follow_ups_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."follow_ups"
    ADD CONSTRAINT "follow_ups_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."follow_ups"
    ADD CONSTRAINT "follow_ups_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inbound_email_channels"
    ADD CONSTRAINT "inbound_email_channels_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inbound_events"
    ADD CONSTRAINT "inbound_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inbound_events"
    ADD CONSTRAINT "inbound_events_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inbound_events"
    ADD CONSTRAINT "inbound_events_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inbound_whatsapp_channels"
    ADD CONSTRAINT "inbound_whatsapp_channels_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inquiries"
    ADD CONSTRAINT "inquiries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inquiries"
    ADD CONSTRAINT "inquiries_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inquiry_messages"
    ADD CONSTRAINT "inquiry_messages_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inquiry_messages"
    ADD CONSTRAINT "inquiry_messages_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inquiry_messages"
    ADD CONSTRAINT "inquiry_messages_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."internal_notes"
    ADD CONSTRAINT "internal_notes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."internal_notes"
    ADD CONSTRAINT "internal_notes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."internal_notes"
    ADD CONSTRAINT "internal_notes_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE CASCADE;



CREATE POLICY "Owners can read company invitations" ON "public"."company_invitations" FOR SELECT USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "Owners can update their companies" ON "public"."companies" FOR UPDATE TO "authenticated" USING ("public"."is_company_owner"("id")) WITH CHECK ("public"."is_company_owner"("id"));



CREATE POLICY "Users can delete appointments from their companies" ON "public"."appointments" FOR DELETE TO "authenticated" USING ("public"."is_company_member"("company_id"));



CREATE POLICY "Users can delete customers from their companies" ON "public"."customers" FOR DELETE TO "authenticated" USING ("public"."is_company_member"("company_id"));



CREATE POLICY "Users can delete follow ups from their companies" ON "public"."follow_ups" FOR DELETE TO "authenticated" USING ("public"."is_company_member"("company_id"));



CREATE POLICY "Users can delete inbound email channels from their companies" ON "public"."inbound_email_channels" FOR DELETE TO "authenticated" USING ("public"."is_company_member"("company_id"));



CREATE POLICY "Users can delete inbound events from their companies" ON "public"."inbound_events" FOR DELETE TO "authenticated" USING ("public"."is_company_member"("company_id"));



CREATE POLICY "Users can delete inbound whatsapp channels from their companies" ON "public"."inbound_whatsapp_channels" FOR DELETE TO "authenticated" USING ("public"."is_company_member"("company_id"));



CREATE POLICY "Users can delete inquiries from their companies" ON "public"."inquiries" FOR DELETE TO "authenticated" USING ("public"."is_company_member"("company_id"));



CREATE POLICY "Users can delete inquiry messages from their companies" ON "public"."inquiry_messages" FOR DELETE TO "authenticated" USING ("public"."is_company_member"("company_id"));



CREATE POLICY "Users can delete internal notes from their companies" ON "public"."internal_notes" FOR DELETE TO "authenticated" USING ("public"."is_company_member"("company_id"));



CREATE POLICY "Users can insert appointments in their companies" ON "public"."appointments" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_company_member"("company_id"));



CREATE POLICY "Users can insert customers in their companies" ON "public"."customers" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_company_member"("company_id"));



CREATE POLICY "Users can insert follow ups in their companies" ON "public"."follow_ups" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_company_member"("company_id"));



CREATE POLICY "Users can insert inbound email channels in their companies" ON "public"."inbound_email_channels" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_company_member"("company_id"));



CREATE POLICY "Users can insert inbound events in their companies" ON "public"."inbound_events" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_company_member"("company_id"));



CREATE POLICY "Users can insert inbound whatsapp channels in their companies" ON "public"."inbound_whatsapp_channels" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_company_member"("company_id"));



CREATE POLICY "Users can insert inquiries in their companies" ON "public"."inquiries" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_company_member"("company_id"));



CREATE POLICY "Users can insert inquiry messages in their companies" ON "public"."inquiry_messages" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_company_member"("company_id"));



CREATE POLICY "Users can insert internal notes in their companies" ON "public"."internal_notes" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_company_member"("company_id"));



CREATE POLICY "Users can read appointments from their companies" ON "public"."appointments" FOR SELECT TO "authenticated" USING ("public"."is_company_member"("company_id"));



CREATE POLICY "Users can read company memberships" ON "public"."company_members" FOR SELECT TO "authenticated" USING ("public"."is_company_member"("company_id"));



CREATE POLICY "Users can read customers from their companies" ON "public"."customers" FOR SELECT TO "authenticated" USING ("public"."is_company_member"("company_id"));



CREATE POLICY "Users can read follow ups from their companies" ON "public"."follow_ups" FOR SELECT TO "authenticated" USING ("public"."is_company_member"("company_id"));



CREATE POLICY "Users can read inbound email channels from their companies" ON "public"."inbound_email_channels" FOR SELECT TO "authenticated" USING ("public"."is_company_member"("company_id"));



CREATE POLICY "Users can read inbound events from their companies" ON "public"."inbound_events" FOR SELECT TO "authenticated" USING ("public"."is_company_member"("company_id"));



CREATE POLICY "Users can read inbound whatsapp channels from their companies" ON "public"."inbound_whatsapp_channels" FOR SELECT TO "authenticated" USING ("public"."is_company_member"("company_id"));



CREATE POLICY "Users can read inquiries from their companies" ON "public"."inquiries" FOR SELECT TO "authenticated" USING ("public"."is_company_member"("company_id"));



CREATE POLICY "Users can read inquiry messages from their companies" ON "public"."inquiry_messages" FOR SELECT TO "authenticated" USING ("public"."is_company_member"("company_id"));



CREATE POLICY "Users can read internal notes from their companies" ON "public"."internal_notes" FOR SELECT TO "authenticated" USING ("public"."is_company_member"("company_id"));



CREATE POLICY "Users can read their companies" ON "public"."companies" FOR SELECT TO "authenticated" USING ("public"."is_company_member"("id"));



CREATE POLICY "Users can update appointments from their companies" ON "public"."appointments" FOR UPDATE TO "authenticated" USING ("public"."is_company_member"("company_id")) WITH CHECK ("public"."is_company_member"("company_id"));



CREATE POLICY "Users can update customers from their companies" ON "public"."customers" FOR UPDATE TO "authenticated" USING ("public"."is_company_member"("company_id")) WITH CHECK ("public"."is_company_member"("company_id"));



CREATE POLICY "Users can update follow ups from their companies" ON "public"."follow_ups" FOR UPDATE TO "authenticated" USING ("public"."is_company_member"("company_id")) WITH CHECK ("public"."is_company_member"("company_id"));



CREATE POLICY "Users can update inbound email channels from their companies" ON "public"."inbound_email_channels" FOR UPDATE TO "authenticated" USING ("public"."is_company_member"("company_id")) WITH CHECK ("public"."is_company_member"("company_id"));



CREATE POLICY "Users can update inbound events from their companies" ON "public"."inbound_events" FOR UPDATE TO "authenticated" USING ("public"."is_company_member"("company_id")) WITH CHECK ("public"."is_company_member"("company_id"));



CREATE POLICY "Users can update inbound whatsapp channels from their companies" ON "public"."inbound_whatsapp_channels" FOR UPDATE TO "authenticated" USING ("public"."is_company_member"("company_id")) WITH CHECK ("public"."is_company_member"("company_id"));



CREATE POLICY "Users can update inquiries from their companies" ON "public"."inquiries" FOR UPDATE TO "authenticated" USING ("public"."is_company_member"("company_id")) WITH CHECK ("public"."is_company_member"("company_id"));



CREATE POLICY "Users can update inquiry messages from their companies" ON "public"."inquiry_messages" FOR UPDATE TO "authenticated" USING ("public"."is_company_member"("company_id")) WITH CHECK ("public"."is_company_member"("company_id"));



CREATE POLICY "Users can update internal notes from their companies" ON "public"."internal_notes" FOR UPDATE TO "authenticated" USING ("public"."is_company_member"("company_id")) WITH CHECK ("public"."is_company_member"("company_id"));



ALTER TABLE "public"."appointments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."companies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."follow_ups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inbound_email_channels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inbound_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inbound_whatsapp_channels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inquiries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inquiry_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."internal_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."public_intake_rate_limits" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."accept_company_invitation"("invitation_token" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_company_invitation"("invitation_token" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_company_invitation"("invitation_token" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_company_invitation"("invitation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_company_invitation"("invitation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_company_invitation"("invitation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_public_intake_rate_limit"("p_bucket_key" "text", "p_max_requests" integer, "p_window_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_public_intake_rate_limit"("p_bucket_key" "text", "p_max_requests" integer, "p_window_seconds" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."check_public_intake_rate_limit"("p_bucket_key" "text", "p_max_requests" integer, "p_window_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_public_intake_rate_limit"("p_bucket_key" "text", "p_max_requests" integer, "p_window_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_company_for_current_user"("company_name" "text", "company_sector" "text", "company_description" "text", "company_tone" "text", "company_language" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_company_for_current_user"("company_name" "text", "company_sector" "text", "company_description" "text", "company_tone" "text", "company_language" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_company_for_current_user"("company_name" "text", "company_sector" "text", "company_description" "text", "company_tone" "text", "company_language" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_company_invitation"("target_company_id" "uuid", "invite_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_company_invitation"("target_company_id" "uuid", "invite_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_company_invitation"("target_company_id" "uuid", "invite_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_company_invitation_preview"("invitation_token" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_company_invitation_preview"("invitation_token" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_company_invitation_preview"("invitation_token" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_company_invitation_preview"("invitation_token" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_company_team_members"("target_company_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_company_team_members"("target_company_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_company_team_members"("target_company_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_current_company_membership"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_current_company_membership"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_company_membership"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_company_member"("target_company_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_company_member"("target_company_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_company_member"("target_company_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_company_owner"("target_company_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_company_owner"("target_company_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_company_owner"("target_company_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_phone_es_for_unique"("phone_input" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_phone_es_for_unique"("phone_input" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_phone_es_for_unique"("phone_input" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_appointments_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_appointments_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_appointments_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_appointment_company"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_appointment_company"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_appointment_company"() TO "service_role";



GRANT ALL ON TABLE "public"."appointments" TO "anon";
GRANT ALL ON TABLE "public"."appointments" TO "authenticated";
GRANT ALL ON TABLE "public"."appointments" TO "service_role";



GRANT ALL ON TABLE "public"."companies" TO "anon";
GRANT ALL ON TABLE "public"."companies" TO "authenticated";
GRANT ALL ON TABLE "public"."companies" TO "service_role";



GRANT ALL ON TABLE "public"."company_invitations" TO "anon";
GRANT ALL ON TABLE "public"."company_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."company_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."company_members" TO "anon";
GRANT ALL ON TABLE "public"."company_members" TO "authenticated";
GRANT ALL ON TABLE "public"."company_members" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."follow_ups" TO "anon";
GRANT ALL ON TABLE "public"."follow_ups" TO "authenticated";
GRANT ALL ON TABLE "public"."follow_ups" TO "service_role";



GRANT ALL ON TABLE "public"."inbound_email_channels" TO "anon";
GRANT ALL ON TABLE "public"."inbound_email_channels" TO "authenticated";
GRANT ALL ON TABLE "public"."inbound_email_channels" TO "service_role";



GRANT ALL ON TABLE "public"."inbound_events" TO "anon";
GRANT ALL ON TABLE "public"."inbound_events" TO "authenticated";
GRANT ALL ON TABLE "public"."inbound_events" TO "service_role";



GRANT ALL ON TABLE "public"."inbound_whatsapp_channels" TO "anon";
GRANT ALL ON TABLE "public"."inbound_whatsapp_channels" TO "authenticated";
GRANT ALL ON TABLE "public"."inbound_whatsapp_channels" TO "service_role";



GRANT ALL ON TABLE "public"."inquiries" TO "anon";
GRANT ALL ON TABLE "public"."inquiries" TO "authenticated";
GRANT ALL ON TABLE "public"."inquiries" TO "service_role";



GRANT ALL ON TABLE "public"."inquiry_messages" TO "anon";
GRANT ALL ON TABLE "public"."inquiry_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."inquiry_messages" TO "service_role";



GRANT ALL ON TABLE "public"."internal_notes" TO "anon";
GRANT ALL ON TABLE "public"."internal_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."internal_notes" TO "service_role";



GRANT ALL ON TABLE "public"."public_intake_rate_limits" TO "anon";
GRANT ALL ON TABLE "public"."public_intake_rate_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."public_intake_rate_limits" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







