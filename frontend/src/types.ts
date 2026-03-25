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

export type ExploreSortMode = 'canonical' | 'distance' | 'newest' | 'most_reviewed';
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
export type UserPricePreference = '$' | '$$' | '$$$';
export type DiscoveryMode = 'new_places' | 'trending' | 'trusted';

export interface BusinessRankingComponents {
  verified_visits: number;
  weighted_reviews: number;
  recency_days: number;
  engagement_rate: number;
  local_confidence: number;
  freshness_boost: number;
  final_score: number;
}

export interface BusinessPreferenceMatch {
  score: number;
  matched_categories: string[];
  matched_vibes: string[];
  reason_codes: string[];
}

export interface ExploreLane {
  id: 'for_you' | 'active' | 'hidden_gems' | 'trusted' | string;
  title: string;
  subtitle: string;
  items: Business[];
}

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

export interface ReviewCreate {
  business_id: string;
  rating: number;
  comment: string;
}

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

export interface UserUpdate {
  name?: string;
  profile_picture?: string;
  about_me?: string;
}

export interface UserPreferencesUpdate {
  preferred_categories: string[];
  preferred_vibes: string[];
  prefer_independent: number;
  price_pref?: UserPricePreference | null;
  discovery_mode: DiscoveryMode;
  preferences_completed?: boolean;
}

export interface AuthTokens {
  access_token: string;
  token_type: string;
}

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

export interface ClaimCreate {
  business_id: string;
  owner_name: string;
  owner_role?: string;
  owner_phone?: string;
  owner_email?: string;
  proof_description?: string;
}

export type SubscriptionTier = 'free' | 'starter' | 'pro' | 'premium';
export type BillingCycle = 'monthly' | 'yearly';

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
}

export interface SubscriptionCreate {
  business_id: string;
  tier: SubscriptionTier;
  billing_cycle: BillingCycle;
}

export interface TierInfo {
  tier: SubscriptionTier;
  name: string;
  description: string;
  monthly_price: number;
  yearly_price: number;
  features: string[];
  highlighted: boolean;
}

export type CheckInStatus = 'self_reported' | 'geo_verified' | 'receipt_verified' | 'community_confirmed';
export type CredibilityTier = 'new' | 'regular' | 'trusted' | 'local_guide' | 'ambassador';
export type ActivityType = 'checkin' | 'review' | 'deal_posted' | 'event_created' | 'business_claimed' | 'milestone';

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

export interface CheckInCreate {
  business_id: string;
  latitude?: number;
  longitude?: number;
  note?: string;
}

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

export interface ActivityComment {
  id: string;
  user_id: string;
  user_name: string;
  profile_picture?: string;
  content: string;
  created_at: string;
}

export interface ActivityLikeResult {
  liked: boolean;
  likes: number;
  comments: number;
}

export interface BusinessActivityStatus {
  business_id: string;
  is_active_today: boolean;
  checkins_today: number;
  checkins_this_week: number;
  last_checkin_at?: string;
  recent_activity_count: number;
  trending_score: number;
}

export interface ExploreLanesResponse {
  lanes: ExploreLane[];
}

export interface DecideResponse {
  items: Business[];
  intent_explanation: string[];
}

export interface SavedBusinessesResponse {
  items: Business[];
}

export interface PulseBusinessSummary {
  business_id: string;
  name: string;
  category: string;
  image_url?: string;
  short_description?: string;
  address?: string;
}

export interface ActivityPulseItem {
  id: string;
  type: 'verified_visit' | 'review' | 'owner_post' | string;
  summary: string;
  detail?: string;
  timestamp: string;
  business: PulseBusinessSummary;
}

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

export interface OwnerEventCreate {
  business_id: string;
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  image_url?: string;
}
