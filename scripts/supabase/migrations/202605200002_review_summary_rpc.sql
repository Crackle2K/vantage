-- Keeps business rating/review_count updates inside Postgres so review writes
-- do not need to load all review rows through the API.

create or replace function public.refresh_business_review_summary(p_business_id uuid)
returns table(item jsonb)
language sql
security definer
set search_path = public
as $$
  with summary as (
    select
      count(*)::integer as review_count,
      round(avg(rating)::numeric, 2) as rating
    from public.reviews
    where business_id = p_business_id
  ),
  updated as (
    update public.businesses b
    set
      rating = summary.rating,
      review_count = summary.review_count,
      updated_at = now()
    from summary
    where b.id = p_business_id
    returning b.*
  )
  select to_jsonb(updated) from updated;
$$;

revoke all on function public.refresh_business_review_summary(uuid) from public;
grant execute on function public.refresh_business_review_summary(uuid) to service_role;
