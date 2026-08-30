-- Keeps the same NALA access model while removing repeated RLS evaluations.
create index if not exists profiles_company_id_idx
  on public.profiles (company_id)
  where company_id is not null;

drop policy if exists "clients read their company" on public.companies;
drop policy if exists "owners manage companies" on public.companies;

create policy "authorized users read companies"
  on public.companies
  for select
  to authenticated
  using (
    (select private.is_owner())
    or id = (
      select p.company_id
      from public.profiles p
      where p.id = (select auth.uid())
    )
  );

create policy "owners insert companies"
  on public.companies
  for insert
  to authenticated
  with check ((select private.is_owner()));

create policy "owners update companies"
  on public.companies
  for update
  to authenticated
  using ((select private.is_owner()))
  with check ((select private.is_owner()));

create policy "owners delete companies"
  on public.companies
  for delete
  to authenticated
  using ((select private.is_owner()));

drop policy if exists "users read their own profile" on public.profiles;

create policy "users read their own profile"
  on public.profiles
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or (select private.is_owner())
  );
