/**
 * @fileoverview Shared TypeScript type definitions for the Vantage frontend.
 * Covers business entities, user models, authentication, subscriptions,
 * activity feed, and explore/discovery data shapes. All API response types
 * are defined here to ensure consistency between the API client and UI.
 */

/** Business category labels accepted by the backend and displayed in the UI. */
export type CategoryType =
  | 'Restaurants'
  | 'Cafes & Coffee'
  | 'Bars & Nightlife'
  | 'Shopping'
  | 'Fitness & Wellness'
  | 'Beauty & Spas'
  | 'Health & Medical'
  | 'Financial Services'
  | 'Automotive'
  | 'Entertainment'
  | 'Hotels & Travel'
  | 'Professional Services'
  | 'Home Services'
  | 'Pets'
  | 'Education'
  | 'Grocery'
  | 'Local Services'
  | 'Active Life'
  | 'Other'
  
  | 'food'
  | 'retail'
  | 'services'
  | 'entertainment'
  | 'health';

/** Sort modes available for the explore/discover page. */
export type ExploreSortMode = 'canonical' | 'distance' | 'newest' | 'most_reviewed';
/** Intent presets for the "Decide for me" feature, representing user goals. */
export type DecideIntent =
  | 'DINNER'
  | 'COFFEE'
  | 'STUDY'
  | 'DATE_NIGHT'
  | 'QUICK_BITE'
  | 'DESSERT'
  | 'WALKABLE'
  | 'OPEN_NOW'
  | 'CHEAP'
  | 'TRENDING'
  | 'HIDDEN_GEM'
  | 'MOST_TRUSTED';
/** User's price tier preference ($, $$, $$$). */
export type UserPricePreference = '$' | '$$' | '$$$';
/** Controls which candidates surface in the For You explore lane. */
export type DiscoveryMode = 'new_places' | 'trending' | 'trusted';

/** Components that contribute to a business's ranking score. */
export interface BusinessRankingComponents {
  verified_visits: number;
  weighted_reviews: number;
  recency_days: number;
  engagement_rate: number;
  local_confidence: number;
  freshness_boost: number;
  final_score: number;
}

/** How well a business matches a user's saved preferences. */
export interface BusinessPreferenceMatch {
  score: number;
  matched_categories: string[];
  matched_vibes: string[];
  reason_codes: string[];
}

/** A horizontal lane of businesses in the explore page (e.g. "For You", "Active"). */
export interface ExploreLane {
  id: 'for_you' | 'active' | 'hidden_gems' | 'trusted' | string;
  title: string;
  subtitle: string;
  items: Business[];
}

/** Core business entity returned by the API and displayed throughout the UI. */
export interface Business {
  id: string;
  _id?: string;
  name: string;
  category: CategoryType;
  description: string;
  address: string;
  phone?: string;
  email?: string;
  website?: string;
  image_url?: string;
  image_urls?: string[];
  primary_image_url?: string;
  image?: string;
  short_description?: string;
  known_for?: string[];
  rating: number;
  review_count: number;
  has_deals: boolean;
  distance?: number;
  location?: {
    type: string;
    coordinates: [number, number];
  };
  
  is_seed?: boolean;
  is_claimed?: boolean;
  owner_id?: string;
  claim_status?: string;
  business_type?: 'independent' | 'chain' | 'unknown';
  trust_score?: number;
  trust_label?: 'High Trust' | 'Growing Trust' | 'New & Active' | 'Unverified';
  verified_visits_today?: number;
  last_verified_at?: string | null;
  badges?: string[];
  
  is_active_today?: boolean;
  checkins_today?: number;
  trending_score?: number;
  last_activity_at?: string;
  
  live_visibility_score?: number;
  local_confidence?: number;
  canonical_rank_score?: number;
  ranking_components?: BusinessRankingComponents;
  preference_match?: BusinessPreferenceMatch;
  reason_codes?: string[];
  open_now?: boolean | null;
  price_level?: number | null;
  saved_at?: string;
  created_at?: string;
  place_id?: string;
}

/** A user-submitted review for a business. */
export interface Review {
  id: string;
  _id?: string;
  business_id: string;
  user_id: string;
  user_name: string;
  rating: number;
  comment: string;
  created_at: string;
  verified: boolean;
}

/** A promotional deal offered by a business. */
export interface Deal {
  id: string;
  _id?: string;
  business_id: string;
  business_name?: string;
  title: string;
  description: string;
  discount_type: string;
  discount_value: number;
  code?: string;
  valid_until: string;
  is_active: boolean;
}

/** Customer action event names recorded by the milestone-one analytics stream. */
export type CustomerEventType =
  | 'match_card_impression'
  | 'swipe_left'
  | 'swipe_right'
  | 'save'
  | 'match'
  | 'business_profile_open'
  | 'offer_claim'
  | 'directions_click'
  | 'check_in_placeholder'
  | 'redemption_placeholder'
  | 'campaign_impression'
  | 'campaign_open'
  | 'campaign_claim'
  | 'campaign_directions_click'
  | 'campaign_redemption_placeholder';

/** Payload for best-effort customer action tracking. */
export interface CustomerEventCreate {
  event_type: CustomerEventType;
  business_id: string;
  source_surface: string;
  anonymous_session_id?: string;
  intent?: string;
  constraints?: string[];
  match_reason_codes?: string[];
  deal_id?: string;
  offer_claim_id?: string;
  campaign_id?: string;
  campaign_claim_id?: string;
  location_context?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/** API response after a customer event is recorded. */
export interface CustomerEventResponse {
  id: string;
  created_at: string;
}

/** Durable claim created for an active offer. */
export interface OfferClaim {
  offer_claim_id: string;
  deal_id: string;
  business_id: string;
  claim_code: string;
  status: 'claimed' | 'used_placeholder' | 'expired' | 'cancelled' | string;
  claimed_at: string;
  expires_at?: string | null;
}

/** Campaign categories available to claimed business owners. */
export type CampaignType =
  | 'slow_hour'
  | 'first_time_visitor'
  | 'event_promotion'
  | 'limited_time_perk'
  | 'non_discount'
  | 'custom_template';

/** How the campaign value is presented to customers. */
export type CampaignOfferKind = 'discount' | 'perk' | 'event' | 'non_discount';

/** Lifecycle state for an owner-created campaign. */
export type CampaignStatus = 'draft' | 'scheduled' | 'active' | 'ended' | 'cancelled';

/** Basic milestone-three targeting metadata. */
export interface CampaignTargeting {
  audience:
    | 'all_visitors'
    | 'first_time_visitors'
    | 'saved_business_users'
    | 'slow_hour'
    | 'event_interested'
    | 'intent_match'
    | 'category_match';
  time_window?: string;
  intent?: string;
  category?: string;
}

/** Owner campaign rendered in dashboard and existing customer surfaces. */
export interface Campaign {
  id: string;
  _id?: string;
  business_id: string;
  owner_id: string;
  title: string;
  description: string;
  campaign_type: CampaignType;
  offer_kind: CampaignOfferKind;
  discount_type?: 'percentage' | 'fixed' | string | null;
  discount_value?: number | null;
  perk_description?: string | null;
  starts_at: string;
  ends_at: string;
  status: CampaignStatus;
  targeting: CampaignTargeting;
  template_id?: string | null;
  linked_event_id?: string | null;
  claim_limit?: number | null;
  per_user_limit?: number | null;
  metadata?: Record<string, unknown>;
  affects_lvs: false;
  created_at: string;
  updated_at?: string;
}

/** Campaign creation/update payload. */
export interface CampaignCreate {
  title: string;
  description: string;
  campaign_type: CampaignType;
  offer_kind?: CampaignOfferKind;
  discount_type?: 'percentage' | 'fixed';
  discount_value?: number;
  perk_description?: string;
  starts_at?: string;
  ends_at: string;
  status?: CampaignStatus;
  targeting?: CampaignTargeting;
  template_id?: string;
  linked_event_id?: string;
  claim_limit?: number;
  per_user_limit?: number;
  metadata?: Record<string, unknown>;
}

/** Campaign template used to prefill simple owner campaigns. */
export interface CampaignTemplate {
  id: string;
  name: string;
  campaign_type: CampaignType;
  offer_kind: CampaignOfferKind;
  title: string;
  description: string;
  perk_description?: string;
  targeting: CampaignTargeting;
  recommended_duration_days: number;
}

/** Durable claim created for a campaign. */
export interface CampaignClaim {
  campaign_claim_id: string;
  campaign_id: string;
  business_id: string;
  claim_code: string;
  status: 'claimed' | 'used_placeholder' | 'expired' | 'cancelled' | string;
  claimed_at: string;
  expires_at?: string | null;
}

/** Campaign performance aggregate counts. */
export interface CampaignPerformanceTotals {
  impressions: number;
  opens: number;
  claims: number;
  directions_clicks: number;
  check_ins: number;
  redemption_placeholders: number;
}

/** Campaign performance aggregate rates. */
export interface CampaignPerformanceRates {
  open_rate: number;
  claim_rate: number;
  action_rate: number;
  redemption_placeholder_rate: number;
}

/** Daily campaign performance bucket. */
export interface CampaignPerformanceBucket {
  date: string;
  impressions: number;
  opens: number;
  claims: number;
  directions_clicks: number;
  check_ins: number;
  redemption_placeholders: number;
}

/** Top campaign row in owner analytics. */
export interface TopCampaignPerformance {
  campaign_id: string;
  title: string;
  campaign_type: CampaignType | string;
  status: CampaignStatus | string;
  actions: number;
  claims: number;
  impressions: number;
}

/** Owner campaign performance response. */
export interface CampaignPerformance {
  business_id: string;
  range: ConversionRange;
  totals: CampaignPerformanceTotals;
  rates: CampaignPerformanceRates;
  buckets: CampaignPerformanceBucket[];
  top_campaigns: TopCampaignPerformance[];
}

/** Date range options supported by owner-facing conversion analytics. */
export type ConversionRange = '7d' | '30d' | '90d';

/** Aggregate conversion event counts for a business analytics window. */
export interface BusinessConversionTotals {
  impressions: number;
  swipe_left: number;
  swipe_right: number;
  saves: number;
  matches: number;
  profile_opens: number;
  offer_claims: number;
  directions_clicks: number;
  check_ins: number;
  redemption_placeholders: number;
}

/** Conversion rates derived from aggregate event counts. */
export interface BusinessConversionRates {
  match_rate: number;
  save_rate: number;
  profile_open_rate: number;
  action_rate: number;
  claim_rate: number;
  redemption_placeholder_rate: number;
}

/** A single step in the owner conversion funnel. */
export interface BusinessConversionFunnelStep {
  id: 'impressions' | 'positive_intent' | 'profile_opens' | 'actions' | 'redemptions';
  label: string;
  count: number;
}

/** Counted match reason code surfaced in conversion analytics. */
export interface BusinessConversionReason {
  reason_code: string;
  label: string;
  count: number;
}

/** Summary analytics response for a claimed/owned business. */
export interface BusinessConversionSummary {
  business_id: string;
  range: ConversionRange;
  totals: BusinessConversionTotals;
  rates: BusinessConversionRates;
  funnel: BusinessConversionFunnelStep[];
  top_match_reasons: BusinessConversionReason[];
  top_skipped_reasons: BusinessConversionReason[];
}

/** Daily conversion analytics bucket. */
export interface BusinessConversionTimeseriesBucket {
  date: string;
  impressions: number;
  saves: number;
  matches: number;
  profile_opens: number;
  offer_claims: number;
  directions_clicks: number;
  check_ins: number;
  redemption_placeholders: number;
}

/** Daily trend response for a claimed/owned business. */
export interface BusinessConversionTimeseries {
  business_id: string;
  range: ConversionRange;
  bucket: 'day';
  buckets: BusinessConversionTimeseriesBucket[];
}

/** Payload for creating a new review. */
export interface ReviewCreate {
  business_id: string;
  rating: number;
  comment: string;
}

/** Authenticated user profile returned by the API. */
export interface User {
  id: string;
  _id?: string;
  name: string;
  email: string;
  role: 'customer' | 'business_owner' | 'admin';
  created_at?: string;
  profile_picture?: string;
  about_me?: string;
  auth_provider?: string;
  google_id?: string;
  preferred_categories?: string[];
  preferred_vibes?: string[];
  prefer_independent?: number;
  price_pref?: UserPricePreference | null;
  discovery_mode?: DiscoveryMode;
  preferences_completed?: boolean;
}

/** Partial update payload for the current user's profile. */
export interface UserUpdate {
  name?: string;
  profile_picture?: string;
  about_me?: string;
}

/** Payload for updating the user's discovery preferences. */
export interface UserPreferencesUpdate {
  preferred_categories: string[];
  preferred_vibes: string[];
  prefer_independent: number;
  price_pref?: UserPricePreference | null;
  discovery_mode: DiscoveryMode;
  preferences_completed?: boolean;
}

/** A business ownership claim submission with verification status. */
export interface BusinessClaim {
  id: string;
  business_id: string;
  user_id: string;
  status: 'pending' | 'verified' | 'rejected' | 'revoked';
  verification_method?: string;
  verification_notes?: string;
  owner_name: string;
  owner_role: string;
  owner_phone?: string;
  owner_email?: string;
  proof_description?: string;
  created_at: string;
  reviewed_at?: string;
}

/** Payload for submitting a business ownership claim. */
export interface ClaimCreate {
  business_id: string;
  owner_name: string;
  owner_role?: string;
  owner_phone?: string;
  owner_email?: string;
  proof_description?: string;
}

/** Subscription tier names available for business owners. */
export type SubscriptionTier = 'free' | 'starter' | 'pro' | 'premium';
/** Billing period for subscriptions. */
export type BillingCycle = 'monthly' | 'yearly';

/** An active or past subscription for a business listing. */
export interface Subscription {
  id: string;
  user_id: string;
  business_id: string;
  tier: SubscriptionTier;
  billing_cycle: BillingCycle;
  status: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at?: string;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_checkout_session_id?: string | null;
  stripe_price_id?: string | null;
  billing_provider?: string;
}

/** Stripe Checkout session response for subscription sign-up. */
export interface StripeCheckoutResponse {
  checkout_url: string;
  checkout_session_id?: string;
  status: string;
}

/** Payload for creating a new subscription. */
export interface SubscriptionCreate {
  business_id: string;
  tier: SubscriptionTier;
  billing_cycle: BillingCycle;
}

/** Payload for canceling a subscription, scoped to a business when needed. */
export interface SubscriptionCancel {
  business_id?: string;
}

/** Describes a subscription tier's name, pricing, and feature list. */
export interface TierInfo {
  tier: SubscriptionTier;
  name: string;
  description: string;
  monthly_price: number;
  yearly_price: number;
  features: string[];
  highlighted: boolean;
}

/** Verification status of a user check-in. */
export type CheckInStatus = 'self_reported' | 'geo_verified' | 'receipt_verified' | 'community_confirmed';
/** User credibility tiers, from newcomer to ambassador. */
export type CredibilityTier = 'new' | 'regular' | 'trusted' | 'local_guide' | 'ambassador';
/** Types of activity that can appear in the community feed. */
export type ActivityType = 'checkin' | 'review' | 'deal_posted' | 'event_created' | 'business_claimed' | 'milestone' | 'user_post';

/** A user check-in at a business, with optional geo-verification. */
export interface CheckIn {
  id: string;
  user_id: string;
  business_id: string;
  status: CheckInStatus;
  latitude?: number;
  longitude?: number;
  distance_from_business?: number;
  note?: string;
  photo_url?: string;
  confirmations: number;
  confirmed_by: string[];
  created_at: string;
}

/** Payload for submitting a check-in. */
export interface CheckInCreate {
  business_id: string;
  latitude?: number;
  longitude?: number;
  note?: string;
}

/** A user's credibility metrics and tier, used for trust-weighted interactions. */
export interface UserCredibility {
  user_id: string;
  total_checkins: number;
  verified_checkins: number;
  total_reviews: number;
  helpful_votes: number;
  confirmations_given: number;
  confirmations_received: number;
  events_attended: number;
  credibility_score: number;
  tier: CredibilityTier;
  is_verified_local: boolean;
  joined_at?: string;
  last_active?: string;
}

/** A single item in the community activity feed. */
export interface ActivityFeedItem {
  id: string;
  activity_type: ActivityType;
  user_id?: string;
  user_name?: string;
  user_credibility_tier?: CredibilityTier;
  business_id: string;
  business_name: string;
  business_category?: string;
  title: string;
  description?: string;
  likes: number;
  comments: number;
  liked_by?: string[];
  comments_list?: ActivityComment[];
  created_at: string;
}

/** A comment on an activity feed item. */
export interface ActivityComment {
  id: string;
  user_id: string;
  user_name: string;
  profile_picture?: string;
  content: string;
  created_at: string;
}

/** Result of toggling a like on an activity feed item. */
export interface ActivityLikeResult {
  liked: boolean;
  likes: number;
  comments: number;
}

/** Real-time activity metrics for a single business. */
export interface BusinessActivityStatus {
  business_id: string;
  is_active_today: boolean;
  checkins_today: number;
  checkins_this_week: number;
  last_checkin_at?: string;
  recent_activity_count: number;
  trending_score: number;
}

/** Response containing the explore lane groups returned by the backend. */
export interface ExploreLanesResponse {
  lanes: ExploreLane[];
}

/** City/province-state label resolved from browser geolocation coordinates. */
export interface ReverseGeocodeResponse {
  city: string;
  region: string;
  label: string;
}

/** Response from the "Decide for me" endpoint, containing curated picks. */
export interface DecideResponse {
  items: Business[];
  intent_explanation: string[];
}

/** Response containing the user's saved/bookmarked businesses. */
export interface SavedBusinessesResponse {
  items: Business[];
}

/** Lightweight business summary used in pulse/activity items. */
export interface PulseBusinessSummary {
  business_id: string;
  name: string;
  category: string;
  image_url?: string;
  short_description?: string;
  address?: string;
}

/** A privacy-safe recent activity item shown in the Local Pulse rail. */
export interface ActivityPulseItem {
  id: string;
  type: 'verified_visit' | 'review' | 'owner_post' | string;
  summary: string;
  detail?: string;
  timestamp: string;
  business: PulseBusinessSummary;
}

/** An event created by a business owner (e.g. wine tasting, promo). */
export interface OwnerEvent {
  id: string;
  business_id: string;
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  created_at: string;
  image_url?: string;
  business_name?: string;
  business_category?: string;
  business_image_url?: string;
}

/** Payload for creating a new owner event. */
export interface OwnerEventCreate {
  business_id: string;
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  image_url?: string;
}
