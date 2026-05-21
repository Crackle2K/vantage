-- Keeps businesses.has_deals synchronized with the current deals table.
-- A deal counts only when it is active and either has no expiry or expires in
-- the future. The API also calls refresh_business_has_deals after writes, but
-- this trigger makes Supabase the source of truth for the denormalized flag.

create or replace function public.refresh_business_has_deals(p_business_id uuid)
returns table(item jsonb)
language sql
security definer
set search_path = public
as $$
  with summary as (
    select exists (
      select 1
      from public.deals d
      where d.business_id = p_business_id
        and d.is_active = true
        and (d.valid_until is null or d.valid_until > now())
    ) as has_current_deals
  ),
  changed as (
    update public.businesses b
    set has_deals = summary.has_current_deals
    from summary
    where b.id = p_business_id
      and b.has_deals is distinct from summary.has_current_deals
    returning to_jsonb(b) as item
  ),
  unchanged as (
    select to_jsonb(b) as item
    from public.businesses b, summary
    where b.id = p_business_id
      and b.has_deals is not distinct from summary.has_current_deals
      and not exists (select 1 from changed)
  )
  select item from changed
  union all
  select item from unchanged;
$$;

revoke all on function public.refresh_business_has_deals(uuid) from public;
grant execute on function public.refresh_business_has_deals(uuid) to service_role;

create or replace function public.sync_business_has_deals_from_deal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform 1 from public.refresh_business_has_deals(old.business_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.business_id is distinct from new.business_id then
    perform 1 from public.refresh_business_has_deals(old.business_id);
  end if;

  perform 1 from public.refresh_business_has_deals(new.business_id);
  return new;
end;
$$;

revoke all on function public.sync_business_has_deals_from_deal() from public;

drop trigger if exists sync_business_has_deals_from_deal on public.deals;
create trigger sync_business_has_deals_from_deal
after insert or update or delete on public.deals
for each row
execute function public.sync_business_has_deals_from_deal();

update public.businesses b
set
  has_deals = exists (
    select 1
    from public.deals d
    where d.business_id = b.id
      and d.is_active = true
      and (d.valid_until is null or d.valid_until > now())
  ),
  updated_at = now()
where b.has_deals is distinct from exists (
  select 1
  from public.deals d
  where d.business_id = b.id
    and d.is_active = true
    and (d.valid_until is null or d.valid_until > now())
);
