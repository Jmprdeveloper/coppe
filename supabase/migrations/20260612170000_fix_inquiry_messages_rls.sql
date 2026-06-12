begin;

drop policy if exists "Users can delete inquiry messages for their companies"
on public.inquiry_messages;

drop policy if exists "Users can insert inquiry messages for their companies"
on public.inquiry_messages;

drop policy if exists "Users can read inquiry messages for their companies"
on public.inquiry_messages;

drop policy if exists "Users can update inquiry messages for their companies"
on public.inquiry_messages;

drop policy if exists "Users can delete inquiry messages from their companies"
on public.inquiry_messages;

drop policy if exists "Users can insert inquiry messages in their companies"
on public.inquiry_messages;

drop policy if exists "Users can read inquiry messages from their companies"
on public.inquiry_messages;

drop policy if exists "Users can update inquiry messages from their companies"
on public.inquiry_messages;

create policy "Users can read inquiry messages from their companies"
on public.inquiry_messages
for select
to authenticated
using (
  is_company_member(company_id)
);

create policy "Users can insert inquiry messages in their companies"
on public.inquiry_messages
for insert
to authenticated
with check (
  is_company_member(company_id)
);

create policy "Users can update inquiry messages from their companies"
on public.inquiry_messages
for update
to authenticated
using (
  is_company_member(company_id)
)
with check (
  is_company_member(company_id)
);

create policy "Users can delete inquiry messages from their companies"
on public.inquiry_messages
for delete
to authenticated
using (
  is_company_member(company_id)
);

commit;
