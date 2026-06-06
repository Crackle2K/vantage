-- Milestone one customer intent-to-action loop.
-- These records are analytics/action data only and must never contribute to
-- Live Visibility Score. The affects_lvs flag is constrained false.

create table if not exists public.customer_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  business_id uuid not null references public.businesses(id) on delete cascade,
  source_surface text not null,
  user_id uuid references auth.users(id) on delete set null,
  anonymous_session_id text,
  intent text,
  constraints jsonb not null default '[]'::jsonb,
  match_reason_codes jsonb not null default '[]'::jsonb,
  deal_id uuid references public.deals(id) on delete set null,
  offer_claim_id uuid,
  location_context jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  affects_lvs boolean not null default false,
  created_at timestamptz not null default now(),
  constraint customer_events_identity_check check (
    user_id is not null or nullif(trim(anonymous_session_id), '') is not null
  ),
  constraint customer_events_never_affect_lvs check (affects_lvs = false),
  constraint customer_events_type_check check (
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
      'redemption_placeholder'
    )
  )
);

create table if not exists public.offer_claims (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
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
  constraint offer_claims_status_check check (
    status in ('claimed', 'used_placeholder', 'expired', 'cancelled')
  ),
  constraint offer_claims_never_affect_lvs check (affects_lvs = false)
);

alter table public.customer_events
  add constraint customer_events_offer_claim_fk
  foreign key (offer_claim_id) references public.offer_claims(id) on delete set null
  not valid;

alter table public.customer_events validate constraint customer_events_offer_claim_fk;

create index if not exists customer_events_business_created_idx
  on public.customer_events(business_id, created_at desc);
create index if not exists customer_events_type_created_idx
  on public.customer_events(event_type, created_at desc);
create index if not exists customer_events_user_created_idx
  on public.customer_events(user_id, created_at desc);
create index if not exists customer_events_anon_created_idx
  on public.customer_events(anonymous_session_id, created_at desc);
create index if not exists customer_events_deal_created_idx
  on public.customer_events(deal_id, created_at desc);

create index if not exists offer_claims_business_created_idx
  on public.offer_claims(business_id, created_at desc);
create index if not exists offer_claims_deal_created_idx
  on public.offer_claims(deal_id, created_at desc);
create index if not exists offer_claims_user_created_idx
  on public.offer_claims(user_id, created_at desc);

alter table public.customer_events enable row level security;
alter table public.offer_claims enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'customer_events'
      and policyname = 'Users insert own customer events'
  ) then
    create policy "Users insert own customer events"
      on public.customer_events
      for insert
      with check (auth.uid() = user_id or user_id is null);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'offer_claims'
      and policyname = 'Users read own offer claims'
  ) then
    create policy "Users read own offer claims"
      on public.offer_claims
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'offer_claims'
      and policyname = 'Users insert own offer claims'
  ) then
    create policy "Users insert own offer claims"
      on public.offer_claims
      for insert
      with check (auth.uid() = user_id);
  end if;
end $$;
