-- Milestone three campaign and offer tools.
-- Campaigns are owner marketing tools only. They must never affect
-- Live Visibility Score, canonical ranking, or paid placement.

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null,
  campaign_type text not null,
  offer_kind text not null default 'perk',
  discount_type text,
  discount_value numeric,
  perk_description text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status text not null default 'active',
  targeting jsonb not null default '{"audience":"all_visitors"}'::jsonb,
  template_id text,
  linked_event_id uuid references public.owner_events(id) on delete set null,
  claim_limit integer,
  per_user_limit integer,
  metadata jsonb not null default '{}'::jsonb,
  affects_lvs boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaigns_type_check check (
    campaign_type in (
      'slow_hour',
      'first_time_visitor',
      'event_promotion',
      'limited_time_perk',
      'non_discount',
      'custom_template'
    )
  ),
  constraint campaigns_offer_kind_check check (
    offer_kind in ('discount', 'perk', 'event', 'non_discount')
  ),
  constraint campaigns_status_check check (
    status in ('draft', 'scheduled', 'active', 'ended', 'cancelled')
  ),
  constraint campaigns_dates_check check (ends_at > starts_at),
  constraint campaigns_claim_limit_check check (claim_limit is null or claim_limit > 0),
  constraint campaigns_per_user_limit_check check (per_user_limit is null or per_user_limit > 0),
  constraint campaigns_never_affect_lvs check (affects_lvs = false)
);

create table if not exists public.campaign_claims (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  claim_code text not null,
  status text not null default 'claimed',
  claimed_at timestamptz not null default now(),
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  affects_lvs boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_claims_status_check check (
    status in ('claimed', 'used_placeholder', 'expired', 'cancelled')
  ),
  constraint campaign_claims_never_affect_lvs check (affects_lvs = false)
);

alter table public.customer_events
  add column if not exists campaign_id uuid references public.campaigns(id) on delete set null,
  add column if not exists campaign_claim_id uuid references public.campaign_claims(id) on delete set null;

alter table public.customer_events
  drop constraint if exists customer_events_type_check;

alter table public.customer_events
  add constraint customer_events_type_check check (
    event_type in (
      'match_card_impression',
      'swipe_left',
      'swipe_right',
      'save',
      'match',
      'business_profile_open',
      'offer_claim',
      'directions_click',
      'check_in_placeholder',
      'redemption_placeholder',
      'campaign_impression',
      'campaign_open',
      'campaign_claim',
      'campaign_directions_click',
      'campaign_redemption_placeholder'
    )
  );

create index if not exists campaigns_business_status_window_idx
  on public.campaigns(business_id, status, starts_at, ends_at);
create index if not exists campaigns_owner_created_idx
  on public.campaigns(owner_id, created_at desc);
create index if not exists campaigns_event_idx
  on public.campaigns(linked_event_id);

create index if not exists campaign_claims_business_created_idx
  on public.campaign_claims(business_id, created_at desc);
create index if not exists campaign_claims_campaign_created_idx
  on public.campaign_claims(campaign_id, created_at desc);
create index if not exists campaign_claims_user_created_idx
  on public.campaign_claims(user_id, created_at desc);

create index if not exists customer_events_campaign_created_idx
  on public.customer_events(campaign_id, created_at desc);
create index if not exists customer_events_campaign_claim_created_idx
  on public.customer_events(campaign_claim_id, created_at desc);

alter table public.campaigns enable row level security;
alter table public.campaign_claims enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'campaigns'
      and policyname = 'Public can read active campaigns'
  ) then
    create policy "Public can read active campaigns"
      on public.campaigns
      for select
      using (
        status = 'active'
        and starts_at <= now()
        and ends_at > now()
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'campaigns'
      and policyname = 'Owners manage own campaigns'
  ) then
    create policy "Owners manage own campaigns"
      on public.campaigns
      for all
      using (auth.uid() = owner_id)
      with check (auth.uid() = owner_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'campaign_claims'
      and policyname = 'Users read own campaign claims'
  ) then
    create policy "Users read own campaign claims"
      on public.campaign_claims
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'campaign_claims'
      and policyname = 'Users insert own campaign claims'
  ) then
    create policy "Users insert own campaign claims"
      on public.campaign_claims
      for insert
      with check (auth.uid() = user_id);
  end if;
end $$;
