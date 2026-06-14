drop policy if exists "Owners can read company invitations" on public.company_invitations;

create policy "Owners can read company invitations"
on public.company_invitations
for select
to authenticated
using (public.is_company_owner(company_id));

drop index if exists public.company_invitations_token_idx;

create unique index if not exists company_invitations_token_unique_idx
on public.company_invitations (token);