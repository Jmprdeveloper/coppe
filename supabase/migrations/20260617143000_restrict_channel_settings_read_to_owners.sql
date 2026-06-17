-- Restrict technical channel configuration reads to company owners.
-- Members can still use operational flows that read these channels through server-side code.

begin;

-- Email channel technical settings
DROP POLICY IF EXISTS "Users can read inbound email channels from their companies"
ON public.inbound_email_channels;

CREATE POLICY "Owners can read inbound email channels from their companies"
ON public.inbound_email_channels
FOR SELECT
TO authenticated
USING (public.is_company_owner(company_id));

-- WhatsApp channel technical settings
DROP POLICY IF EXISTS "Users can read inbound whatsapp channels from their companies"
ON public.inbound_whatsapp_channels;

CREATE POLICY "Owners can read inbound whatsapp channels from their companies"
ON public.inbound_whatsapp_channels
FOR SELECT
TO authenticated
USING (public.is_company_owner(company_id));

commit;
