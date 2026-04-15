-- Supabase users table for Vantage authentication and profile storage.

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  hashed_password text,
  role text not null default 'customer',
  favorites text[] not null default '{}',
  google_id text,
  auth_provider text,
  profile_picture text,
  about_me text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  preferred_categories text[] not null default '{}',
  preferred_vibes text[] not null default '{}',
  prefer_independent numeric(3,2) not null default 0.50,
  price_pref text,
  discovery_mode text not null default 'trusted',
  preferences_completed boolean not null default false
);

create index if not exists users_email_idx on public.users(email);
create index if not exists users_role_idx on public.users(role);
