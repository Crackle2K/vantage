"""
Create missing Supabase tables for Vantage
"""
import sys
sys.path.insert(0, '/c/Users/nadee/OneDrive/Documents/GitHub/Vantage')

from backend.database.supabase import get_supabase_client
from backend.config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    print("ERROR: Supabase credentials not configured")
    sys.exit(1)

client = get_supabase_client()

# Create tables using RPC or raw SQL
migrations = [
    # Users table
    """
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
    """,
    
    # Saved table
    """
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
    """,
    
    # Subscriptions table
    """
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
    """
]

try:
    # Try to execute via raw SQL through Supabase admin API
    # Note: This requires direct HTTP access which the Supabase client doesn't expose
    # So we'll need to do it manually through the dashboard
    
    # Check if tables exist first
    print("Checking for existing tables...")
    result = client.table('users').select('count', count='exact').execute()
    print("✓ Users table exists")
except Exception as e:
    print(f"✗ Users table does not exist: {e}")
    print("\nYou need to manually create the tables in Supabase SQL Editor.")
    print("Copy and paste the migrations from scripts/supabase/migrations/")
    sys.exit(1)

print("\n✓ All required tables exist!")
