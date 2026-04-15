-- Slice 1 migration: saved + subscriptions
-- This schema intentionally uses TEXT user_id/business_id for compatibility
-- with current Mongo ObjectId-based identity until user/business migration completes.

create extension if not exists pgcrypto;

create table if not exists public.saved (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  business_id text not null,
  created_at timestamptz not null default now(),
  legacy_source text not null default 'mongo'
);

create unique index if not exists saved_user_business_unique
  on public.saved(user_id, business_id);

create index if not exists saved_user_created_idx
  on public.saved(user_id, created_at desc);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  business_id text not null,
  tier text not null,
  billing_cycle text not null,
  status text not null,
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  legacy_subscription_id text,
  legacy_source text not null default 'mongo',
  constraint subscriptions_tier_check check (tier in ('free', 'starter', 'pro', 'premium')),
  constraint subscriptions_cycle_check check (billing_cycle in ('monthly', 'yearly'))
);

create unique index if not exists subscriptions_user_business_unique
  on public.subscriptions(user_id, business_id);

create index if not exists subscriptions_user_created_idx
  on public.subscriptions(user_id, created_at desc);

create index if not exists subscriptions_business_active_idx
  on public.subscriptions(business_id, user_id, status);
