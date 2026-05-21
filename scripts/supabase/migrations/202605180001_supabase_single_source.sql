-- Vantage Supabase single-source-of-truth schema.
-- This replaces the former MongoDB collections with Postgres tables,
-- Supabase Auth ownership, Storage buckets, and realtime publications.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  category text,
  address text not null,
  city text,
  state text,
  zip_code text,
  phone text,
  website text,
  description text,
  short_description text,
  location jsonb,
  hours jsonb,
  is_verified boolean not null default false,
  is_claimed boolean not null default false,
  owner_id uuid references auth.users(id) on delete set null,
  google_place_id text unique,
  rating numeric(3,2),
  review_count integer not null default 0 check (review_count >= 0),
  price_level integer,
  photos text[] not null default '{}',
  image_url text,
  image_urls text[] not null default '{}',
  primary_image_url text,
  known_for text[] not null default '{}',
  visibility_score numeric(6,2),
  has_deals boolean not null default false,
  business_type text default 'unknown',
  trust_score numeric(6,2),
  verified_visits_today integer not null default 0,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists businesses_owner_id_idx on public.businesses(owner_id);
create index if not exists businesses_category_idx on public.businesses(category);
create index if not exists businesses_created_at_idx on public.businesses(created_at desc);
create index if not exists businesses_search_idx
  on public.businesses using gin (to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(category, '')));

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_name text,
  rating numeric(2,1) not null check (rating >= 1 and rating <= 5),
  comment text,
  is_verified boolean not null default false,
  credibility_weight numeric(6,2) not null default 1,
  helpful_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create index if not exists reviews_business_id_idx on public.reviews(business_id, created_at desc);
create index if not exists reviews_user_id_idx on public.reviews(user_id);

create table if not exists public.saved_businesses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, business_id)
);

create index if not exists saved_businesses_user_id_idx on public.saved_businesses(user_id, created_at desc);

create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  verification_method text not null default 'manual',
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected', 'revoked')),
  owner_name text,
  owner_role text,
  owner_phone text,
  owner_email text,
  proof_description text,
  review_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists claims_one_pending_idx
  on public.claims(user_id, business_id)
  where status = 'pending';

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  title text not null,
  description text,
  discount_type text not null default 'percentage',
  discount_value numeric(10,2) not null default 0,
  discount_percent numeric(6,2),
  original_price numeric(10,2),
  deal_price numeric(10,2),
  code text,
  valid_until timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists deals_business_id_idx on public.deals(business_id, is_active, created_at desc);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  tier text not null default 'free' check (tier in ('free', 'starter', 'pro', 'premium')),
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'yearly')),
  status text not null default 'active',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_checkout_session_id text,
  stripe_price_id text,
  billing_provider text not null default 'stripe',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_user_id_idx on public.subscriptions(user_id, status);
create index if not exists subscriptions_business_id_idx on public.subscriptions(business_id, status);

create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  status text not null default 'self_reported',
  latitude numeric(9,6),
  longitude numeric(9,6),
  distance_from_business numeric(10,4),
  note text,
  photo_url text,
  is_geo_verified boolean not null default false,
  confirmations integer not null default 0,
  confirmed_by text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists checkins_business_id_idx on public.checkins(business_id, created_at desc);
create index if not exists checkins_user_id_idx on public.checkins(user_id, created_at desc);

create table if not exists public.activity_feed (
  id uuid primary key default gen_random_uuid(),
  activity_type text not null,
  user_id uuid references auth.users(id) on delete set null,
  user_name text,
  user_credibility_tier text,
  business_id uuid references public.businesses(id) on delete cascade,
  business_name text,
  business_category text,
  title text,
  description text,
  image_url text,
  likes integer not null default 0,
  comments integer not null default 0,
  liked_by text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists activity_feed_created_at_idx on public.activity_feed(created_at desc);
create index if not exists activity_feed_business_id_idx on public.activity_feed(business_id, created_at desc);

create table if not exists public.activity_comments (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activity_feed(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_name text,
  profile_picture text,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists activity_comments_activity_id_idx on public.activity_comments(activity_id, created_at asc);

create table if not exists public.owner_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  start_time timestamptz not null,
  end_time timestamptz not null,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists owner_events_business_id_idx on public.owner_events(business_id, start_time asc);
create index if not exists owner_events_start_time_idx on public.owner_events(start_time asc);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'businesses', 'reviews', 'claims', 'deals', 'subscriptions', 'owner_events'
  ]
  loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end $$;

alter table public.businesses enable row level security;
alter table public.reviews enable row level security;
alter table public.saved_businesses enable row level security;
alter table public.claims enable row level security;
alter table public.deals enable row level security;
alter table public.subscriptions enable row level security;
alter table public.checkins enable row level security;
alter table public.activity_feed enable row level security;
alter table public.activity_comments enable row level security;
alter table public.owner_events enable row level security;

drop policy if exists "Users manage own claims" on public.claims;
drop policy if exists "Users manage own checkins" on public.checkins;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'businesses' and policyname = 'Public can read businesses') then
    create policy "Public can read businesses" on public.businesses for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reviews' and policyname = 'Public can read reviews') then
    create policy "Public can read reviews" on public.reviews for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'deals' and policyname = 'Public can read active deals') then
    create policy "Public can read active deals" on public.deals for select using (is_active = true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'activity_feed' and policyname = 'Public can read activity feed') then
    create policy "Public can read activity feed" on public.activity_feed for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'activity_comments' and policyname = 'Public can read comments') then
    create policy "Public can read comments" on public.activity_comments for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'owner_events' and policyname = 'Public can read owner events') then
    create policy "Public can read owner events" on public.owner_events for select using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'saved_businesses' and policyname = 'Users manage own saved businesses') then
    create policy "Users manage own saved businesses" on public.saved_businesses for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'claims' and policyname = 'Users read own claims') then
    create policy "Users read own claims" on public.claims for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'claims' and policyname = 'Users submit pending claims') then
    create policy "Users submit pending claims" on public.claims for insert with check (
      auth.uid() = user_id
      and status = 'pending'
      and review_notes is null
      and reviewed_by is null
      and reviewed_at is null
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'claims' and policyname = 'Admins manage claims') then
    create policy "Admins manage claims" on public.claims for all using (
      auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    ) with check (
      auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'subscriptions' and policyname = 'Users read own subscriptions') then
    create policy "Users read own subscriptions" on public.subscriptions for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'checkins' and policyname = 'Users read own checkins') then
    create policy "Users read own checkins" on public.checkins for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'checkins' and policyname = 'Users submit self-reported checkins') then
    create policy "Users submit self-reported checkins" on public.checkins for insert with check (
      auth.uid() = user_id
      and status = 'self_reported'
      and is_geo_verified = false
      and confirmations = 0
      and cardinality(confirmed_by) = 0
    );
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('business-media', 'business-media', true, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('user-avatars', 'user-avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Public read Vantage media') then
    create policy "Public read Vantage media" on storage.objects for select using (bucket_id in ('business-media', 'user-avatars'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Authenticated upload Vantage media') then
    create policy "Authenticated upload Vantage media" on storage.objects for insert with check (auth.role() = 'authenticated' and bucket_id in ('business-media', 'user-avatars'));
  end if;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.activity_feed;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.activity_comments;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.owner_events;
exception when duplicate_object then null;
end $$;
