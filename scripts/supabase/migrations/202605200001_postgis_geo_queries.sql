-- Adds indexed PostGIS radius queries for discovery, nearby businesses, pulse,
-- and owner events. Existing JSON location values remain the source field; the
-- generated geography column gives Postgres an indexable representation.

create schema if not exists extensions;
create extension if not exists postgis with schema extensions;
set search_path = public, extensions;

alter table public.businesses
  add column if not exists location_geog geography(Point, 4326)
  generated always as (
    case
      when jsonb_typeof(location->'coordinates') = 'array' then
        case
          when jsonb_array_length(location->'coordinates') = 2
            and (location #>> '{coordinates,0}') ~ '^-?[0-9]+(\.[0-9]+)?$'
            and (location #>> '{coordinates,1}') ~ '^-?[0-9]+(\.[0-9]+)?$'
          then st_setsrid(
            st_makepoint(
              (location #>> '{coordinates,0}')::double precision,
              (location #>> '{coordinates,1}')::double precision
            ),
            4326
          )::geography
          else null
        end
      else null
    end
  ) stored;

create index if not exists businesses_location_geog_idx
  on public.businesses using gist(location_geog);

create or replace function public.search_businesses_geo(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 25,
  p_limit integer default 50,
  p_offset integer default 0,
  p_category text default null,
  p_search text default null,
  p_verified_only boolean default false,
  p_sort text default 'distance'
)
returns table(item jsonb)
language sql
stable
set search_path = public, extensions
as $$
  with origin as (
    select st_setsrid(
      st_makepoint(p_lng, p_lat),
      4326
    )::geography as geog
  ),
  candidates as (
    select
      b.*,
      st_distance(b.location_geog, origin.geog) / 1000.0 as distance_km
    from public.businesses b, origin
    where b.location_geog is not null
      and st_dwithin(
        b.location_geog,
        origin.geog,
        greatest(0.1, least(coalesce(p_radius_km, 25), 150)) * 1000.0
      )
      and (coalesce(p_category, '') = '' or b.category = p_category)
      and (not coalesce(p_verified_only, false) or b.is_verified)
      and (
        coalesce(p_search, '') = ''
        or b.name ilike '%' || p_search || '%'
        or coalesce(b.description, '') ilike '%' || p_search || '%'
        or coalesce(b.category, '') ilike '%' || p_search || '%'
      )
  )
  select to_jsonb(candidates)
    || jsonb_build_object('distance', distance_km, 'distance_km', distance_km)
  from candidates
  order by
    case when coalesce(p_sort, 'distance') = 'distance' then distance_km end asc nulls last,
    case when p_sort = 'rating' then rating end desc nulls last,
    case when p_sort = 'rating' then review_count end desc nulls last,
    case when p_sort = 'newest' then created_at end desc nulls last,
    created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 600))
  offset greatest(0, coalesce(p_offset, 0));
$$;

create or replace function public.activity_pulse_geo(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 5,
  p_limit integer default 10
)
returns table(item jsonb)
language sql
stable
set search_path = public, extensions
as $$
  with origin as (
    select st_setsrid(
      st_makepoint(p_lng, p_lat),
      4326
    )::geography as geog
  ),
  scoped as (
    select
      af.*,
      b.name as joined_business_name,
      b.category as joined_business_category,
      coalesce(b.primary_image_url, b.image_url) as joined_business_image_url,
      st_distance(b.location_geog, origin.geog) / 1000.0 as distance_km
    from public.activity_feed af
    join public.businesses b on b.id = af.business_id
    cross join origin
    where b.location_geog is not null
      and st_dwithin(
        b.location_geog,
        origin.geog,
        greatest(0.1, least(coalesce(p_radius_km, 5), 150)) * 1000.0
      )
    order by af.created_at desc
    limit greatest(1, least(coalesce(p_limit, 10), 30))
  )
  select jsonb_build_object(
    'id', id,
    'type', activity_type,
    'summary', title,
    'detail', description,
    'timestamp', created_at,
    'business', jsonb_build_object(
      'business_id', business_id,
      'name', coalesce(joined_business_name, business_name),
      'category', coalesce(joined_business_category, business_category),
      'image_url', joined_business_image_url,
      'distance_km', distance_km
    )
  )
  from scoped;
$$;

create or replace function public.owner_events_geo(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 5,
  p_limit integer default 20,
  p_include_past boolean default false,
  p_business_id uuid default null
)
returns table(item jsonb)
language sql
stable
set search_path = public, extensions
as $$
  with origin as (
    select st_setsrid(
      st_makepoint(p_lng, p_lat),
      4326
    )::geography as geog
  ),
  scoped as (
    select
      e.*,
      b.name as joined_business_name,
      b.category as joined_business_category,
      coalesce(b.primary_image_url, b.image_url) as joined_business_image_url,
      st_distance(b.location_geog, origin.geog) / 1000.0 as distance_km
    from public.owner_events e
    join public.businesses b on b.id = e.business_id
    cross join origin
    where b.location_geog is not null
      and (p_business_id is null or e.business_id = p_business_id)
      and (coalesce(p_include_past, false) or e.end_time >= now())
      and st_dwithin(
        b.location_geog,
        origin.geog,
        greatest(0.1, least(coalesce(p_radius_km, 5), 150)) * 1000.0
      )
    order by e.start_time asc
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  )
  select to_jsonb(scoped)
    || jsonb_build_object(
      'business_name', joined_business_name,
      'business_category', joined_business_category,
      'business_image_url', joined_business_image_url,
      'distance_km', distance_km
    )
  from scoped;
$$;
