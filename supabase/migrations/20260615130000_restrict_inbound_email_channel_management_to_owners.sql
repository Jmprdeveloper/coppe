drop policy if exists "Users can insert inbound email channels in their companies"
on public.inbound_email_channels;

drop policy if exists "Users can update inbound email channels from their companies"
on public.inbound_email_channels;

drop policy if exists "Users can delete inbound email channels from their companies"
on public.inbound_email_channels;

create policy "Owners can insert inbound email channels in their companies"
on public.inbound_email_channels
for insert
to authenticated
with check (
  public.is_company_owner(company_id)
);

create policy "Owners can update inbound email channels from their companies"
on public.inbound_email_channels
for update
to authenticated
using (
  public.is_company_owner(company_id)
)
with check (
  public.is_company_owner(company_id)
);

create policy "Owners can delete inbound email channels from their companies"
on public.inbound_email_channels
for delete
to authenticated
using (
  public.is_company_owner(company_id)
);
