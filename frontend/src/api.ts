import type { Business, Review, Deal, ReviewCreate, User, AuthTokens, BusinessClaim, ClaimCreate, Subscription, SubscriptionCreate, TierInfo, CheckIn, CheckInCreate, UserCredibility, ActivityFeedItem, BusinessActivityStatus, ActivityComment, ActivityLikeResult } from './types';

const API_URL = 'http://localhost:8000/api';

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('vantage_token');
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export const api = {
  // ─── Auth ────────────────────────────────────
  async login(email: string, password: string): Promise<AuthTokens> {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.detail || 'Login failed');
    }
    return response.json();
  },

  async register(name: string, email: string, password: string, role: string): Promise<AuthTokens> {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, role }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.detail || 'Registration failed');
    }
    return response.json();
  },

  async getMe(): Promise<User> {
    const response = await fetch(`${API_URL}/auth/me`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Not authenticated');
    return response.json();
  },

  async googleAuth(credential: string): Promise<AuthTokens> {
    const response = await fetch(`${API_URL}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.detail || 'Google authentication failed');
    }
    return response.json();
  },

  // ─── Businesses ──────────────────────────────
  async getBusinesses(category?: string, sortBy?: string, search?: string): Promise<Business[]> {
    const params = new URLSearchParams();
    if (category) params.append('category', category);
    if (sortBy) params.append('sort_by', sortBy);
    if (search) params.append('search', search);
    const response = await fetch(`${API_URL}/businesses?${params}`);
    if (!response.ok) throw new Error('Failed to fetch businesses');
    return response.json();
  },

  async getNearbyBusinesses(lat: number, lng: number, radius: number): Promise<Business[]> {
    const response = await fetch(
      `${API_URL}/businesses/nearby?lat=${lat}&lng=${lng}&radius=${radius}`
    );
    if (!response.ok) throw new Error('Failed to fetch nearby businesses');
    return response.json();
  },

  async getBusiness(id: string): Promise<Business> {
    const response = await fetch(`${API_URL}/businesses/${id}`);
    if (!response.ok) throw new Error('Failed to fetch business');
    return response.json();
  },

  // ─── Reviews ─────────────────────────────────
  async getBusinessReviews(businessId: string): Promise<Review[]> {
    const response = await fetch(`${API_URL}/reviews/business/${businessId}`);
    if (!response.ok) throw new Error('Failed to fetch reviews');
    return response.json();
  },

  async createReview(review: ReviewCreate): Promise<Review> {
    const response = await fetch(`${API_URL}/reviews`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(review),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.detail || 'Failed to create review');
    }
    return response.json();
  },

  // ─── Deals ───────────────────────────────────
  async getDeals(): Promise<Deal[]> {
    const response = await fetch(`${API_URL}/deals`);
    if (!response.ok) throw new Error('Failed to fetch deals');
    return response.json();
  },

  async getBusinessDeals(businessId: string): Promise<Deal[]> {
    const response = await fetch(`${API_URL}/deals/business/${businessId}`);
    if (!response.ok) throw new Error('Failed to fetch deals');
    return response.json();
  },

  // ─── Claims ──────────────────────────────────
  async submitClaim(claim: ClaimCreate): Promise<BusinessClaim> {
    const response = await fetch(`${API_URL}/claims`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(claim),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.detail || 'Failed to submit claim');
    }
    return response.json();
  },

  async getMyClaims(): Promise<BusinessClaim[]> {
    const response = await fetch(`${API_URL}/claims/my`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch claims');
    return response.json();
  },

  // ─── Subscriptions ──────────────────────────────
  async getSubscriptionTiers(): Promise<TierInfo[]> {
    const response = await fetch(`${API_URL}/subscriptions/tiers`);
    if (!response.ok) throw new Error('Failed to fetch tiers');
    return response.json();
  },

  async createSubscription(sub: SubscriptionCreate): Promise<Subscription> {
    const response = await fetch(`${API_URL}/subscriptions`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(sub),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.detail || 'Failed to create subscription');
    }
    return response.json();
  },

  async getMySubscriptions(): Promise<Subscription[]> {
    const response = await fetch(`${API_URL}/subscriptions/my`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch subscriptions');
    return response.json();
  },

  async getBusinessSubscription(businessId: string): Promise<Subscription | null> {
    const response = await fetch(`${API_URL}/subscriptions/business/${businessId}`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) return null;
    return response.json();
  },

  // ─── Activity / Trust Layer ──────────────────────
  async checkIn(data: CheckInCreate): Promise<CheckIn> {
    const response = await fetch(`${API_URL}/checkins`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.detail || 'Failed to check in');
    }
    return response.json();
  },

  async getActivityFeed(page: number = 1, pageSize: number = 20): Promise<{ items: ActivityFeedItem[]; has_more: boolean }> {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('page_size', pageSize.toString());
    const response = await fetch(`${API_URL}/feed?${params}`);
    if (!response.ok) throw new Error('Failed to fetch activity feed');
    const data = await response.json();
    // Backend returns paginated object { items, total, page, page_size, has_more }
    if (data && Array.isArray(data.items)) {
      return { items: data.items, has_more: !!data.has_more };
    }
    // Fallback: if response is already an array (backwards compat)
    if (Array.isArray(data)) {
      return { items: data, has_more: data.length >= pageSize };
    }
    return { items: [], has_more: false };
  },

  async getBusinessActivity(businessId: string): Promise<BusinessActivityStatus> {
    const response = await fetch(`${API_URL}/businesses/${businessId}/activity`);
    if (!response.ok) throw new Error('Failed to fetch business activity');
    return response.json();
  },

  async getMyCredibility(): Promise<UserCredibility> {
    const response = await fetch(`${API_URL}/credibility/me`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch credibility');
    return response.json();
  },

  async toggleActivityLike(activityId: string): Promise<ActivityLikeResult> {
    const response = await fetch(`${API_URL}/feed/${activityId}/like`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.detail || 'Failed to like activity');
    }
    return response.json();
  },

  async getActivityComments(activityId: string): Promise<ActivityComment[]> {
    const response = await fetch(`${API_URL}/feed/${activityId}/comments`);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.detail || 'Failed to fetch comments');
    }
    return response.json();
  },

  async addActivityComment(activityId: string, content: string): Promise<{ comment: ActivityComment; comments: number }> {
    const response = await fetch(`${API_URL}/feed/${activityId}/comments`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ content }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.detail || 'Failed to add comment');
    }
    return response.json();
  },

  // ─── Discovery (Google Places backfill) ──────
  async discoverBusinesses(
    lat: number,
    lng: number,
    radius: number = 5,
    category?: string,
    limit: number = 200,
    refresh: boolean = false
  ): Promise<Business[]> {
    const params = new URLSearchParams();
    params.append('lat', lat.toString());
    params.append('lng', lng.toString());
    params.append('radius', radius.toString());
    params.append('limit', limit.toString());
    if (refresh) params.append('refresh', 'true');
    params.append('sort_by', 'local_confidence'); // server pre-sorts by local independent confidence
    if (category) params.append('category', category);
    const response = await fetch(`${API_URL}/discover?${params}`);
    if (!response.ok) throw new Error('Failed to discover businesses');
    return response.json();
  },

  async purgeChains(): Promise<{ deleted: number; confidence_updated: number; total_scanned: number }> {
    const response = await fetch(`${API_URL}/purge-chains`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to purge chain businesses');
    return response.json();
  },

};
