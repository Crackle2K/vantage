-- Allow sponsored conversion telemetry without allowing sponsored ranking events.
-- These events are analytics inputs only; customer_events_never_affect_lvs
-- continues to enforce that they cannot affect Live Visibility Score.

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
      'campaign_redemption_placeholder',
      'sponsored_impression',
      'sponsored_open',
      'sponsored_profile_open',
      'sponsored_offer_claim',
      'sponsored_directions_click',
      'sponsored_check_in_placeholder',
      'sponsored_redemption_placeholder'
    )
  );
