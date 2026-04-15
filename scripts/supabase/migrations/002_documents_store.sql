-- Supabase document store backing compatibility layer for Mongo-style collections.

create table if not exists public.documents (
  collection text not null,
  doc_id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (collection, doc_id)
);

create index if not exists documents_collection_idx
  on public.documents(collection);

create index if not exists documents_updated_at_idx
  on public.documents(updated_at desc);

create index if not exists documents_data_gin_idx
  on public.documents using gin (data);

alter table public.documents enable row level security;
