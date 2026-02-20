export type CategoryType = 'food' | 'retail' | 'services' | 'entertainment' | 'health';

export interface Business {
  id: string;
  _id?: string;
  name: string;
  category: CategoryType;
  description: string;
  address: string;
  phone: string;
  email: string;
  website?: string;
  image_url: string;
  rating: number;
  review_count: number;
  has_deals: boolean;
  distance?: number;
  location?: {
    type: string;
    coordinates: [number, number];
  };
  // Hybrid model fields
  is_seed?: boolean;
  is_claimed?: boolean;
  owner_id?: string;
  claim_status?: string;
  // Activity signals
  is_active_today?: boolean;
  checkins_today?: number;
  trending_score?: number;
  last_activity_at?: string;
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
}

export interface AuthTokens {
  access_token: string;
  token_type: string;
}

// ── Claims ─────────────────────────────────────────────────────────

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

// ── Subscriptions ──────────────────────────────────────────────────

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

// ── Activity / Trust Layer ─────────────────────────────────────────

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
  created_at: string;
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
