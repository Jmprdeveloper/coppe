-- Restrict destructive deletes on operational business data.
-- Operational records should be preserved for history/auditability and handled
-- through statuses such as closed, discarded, cancelled, archived, completed, etc.
--
-- Channel configuration delete policies are intentionally left untouched because
-- they are already restricted to company owners.

drop policy if exists "Users can delete appointments from their companies"
  on public.appointments;

drop policy if exists "Users can delete customers from their companies"
  on public.customers;

drop policy if exists "Users can delete follow ups from their companies"
  on public.follow_ups;

drop policy if exists "Users can delete inquiries from their companies"
  on public.inquiries;

drop policy if exists "Users can delete inquiry messages from their companies"
  on public.inquiry_messages;

drop policy if exists "Users can delete internal notes from their companies"
  on public.internal_notes;
