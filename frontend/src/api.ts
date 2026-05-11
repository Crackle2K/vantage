/**
 * @fileoverview Central API client for the Vantage frontend. Resolves the
 * correct backend base URL based on environment (localhost vs. Vercel
 * production) and exposes a typed `api` object whose methods map 1:1 to
 * backend REST endpoints. All requests include credentials (httpOnly
 * cookies) for session-based authentication.
 */

import type { Business, Review, Deal, ReviewCreate, User, BusinessClaim, ClaimCreate, Subscription, SubscriptionCreate, TierInfo, CheckIn, CheckInCreate, UserCredibility, ActivityFeedItem, ActivityPulseItem, OwnerEvent, OwnerEventCreate, BusinessActivityStatus, ActivityComment, ActivityLikeResult, UserUpdate, UserPreferencesUpdate, ExploreSortMode, ExploreLanesResponse, DecideIntent, DecideResponse, SavedBusinessesResponse, ReverseGeocodeResponse } from './types';

/**
 * Determines the API base URL based on environment variables and the
 * current hostname. Returns `/api` for production (same-origin) or
 * `http://localhost:8000/api` for local development.
 *
 * @returns The resolved API base URL string.
 */
function resolveApiUrl(): string {
  const configured = (import.meta.env.VITE_API_URL || '').trim();

  if (!configured) {
    if (typeof window !== 'undefined' && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      return '/api';
    }
    return 'http://localhost:8000/api';
  }

  const normalized = configured.replace(/\/$/, '');
  const apiBase = normalized.endsWith('/api') ? normalized : `${normalized}/api`;

  if (typeof window === 'undefined') {
    return apiBase;
  }

  const frontendIsLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);

  try {
    const configuredUrl = new URL(normalized, window.location.origin);
    const configuredIsLocal = ['localhost', '127.0.0.1'].includes(configuredUrl.hostname);
    if (!frontendIsLocal && configuredIsLocal) {
      return '/api';
    }
  } catch {
    // Ignore malformed configured URLs and fall back to the normalized API base.
  }

  return apiBase;
}

const API_URL = resolveApiUrl();
const GET_CACHE_TTL_MS = 15_000;
const responseCache = new Map<string, { expiresAt: number; data: unknown }>();
const inflightRequests = new Map<string, Promise<unknown>>();

/**
 * Constructs a full API URL from a path, handling `/api` prefix
 * deduplication when the base URL already ends with `/api`.
 *
 * @param {string} path - The API path (e.g. `/auth/login` or `/api/photos`).
 * @returns {string} The fully resolved URL.
 */
export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (API_URL.endsWith('/api') && normalizedPath.startsWith('/api/')) {
    return `${API_URL}${normalizedPath.slice(4)}`;
  }
  if (API_URL.endsWith('/api') && normalizedPath === '/api') {
    return API_URL;
  }
  return `${API_URL}${normalizedPath}`;
}

/**
 * Reads the error detail from an API response and throws an Error.
 * Falls back to a generic message including the HTTP status code.
 *
 * @param {Response} response - The failed fetch Response object.
 * @param {string} fallback - Default error message if no detail is found.
 * @returns {never} Always throws; the return type is `never`.
 */
async function throwApiError(response: Response, fallback: string): Promise<never> {
  let message = `${fallback} (HTTP ${response.status})`;
  let responseBody = '';
  try {
    responseBody = await response.text();
    const data = responseBody ? JSON.parse(responseBody) : null;
    if (data?.detail && typeof data.detail === 'string') {
      message = data.detail;
    } else if (Array.isArray(data?.detail) && data.detail.length > 0) {
      const firstIssue = data.detail[0];
      if (typeof firstIssue === 'string') {
        message = firstIssue;
      } else if (firstIssue && typeof firstIssue.msg === 'string') {
        message = firstIssue.msg;
      }
    }
  } catch {
    // Ignore non-JSON error bodies and use the HTTP fallback message.
  }
  console.error('API request failed', {
    endpoint: response.url,
    status: response.status,
    body: responseBody,
  });
  throw new Error(message);
}

/**
 * Builds request headers for authenticated API calls. Authentication
 * credentials are sent automatically via httpOnly cookies, so this
 * primarily sets Content-Type when needed.
 *
 * @param {boolean} includeJson - Whether to add `application/json` Content-Type.
 * @returns {HeadersInit} The headers object.
 */
function getAuthHeaders(includeJson: boolean = false): HeadersInit {
  const headers: HeadersInit = {};
  if (includeJson) {
    headers['Content-Type'] = 'application/json';
  }
  // Authentication is handled via httpOnly cookies, which are sent automatically
  // by the browser when requests use `credentials: 'include'`.
  return headers;
}

/**
 * Performs an authenticated fetch request and returns the parsed JSON.
 * Throws on non-OK responses with a descriptive error message.
 *
 * @param {string} path - API endpoint path.
 * @param {RequestInit | undefined} init - Fetch options.
 * @param {string} fallback - Error message used if the response fails.
 * @returns {Promise<T>} Parsed JSON response body.
 */
async function request<T>(path: string, init: RequestInit | undefined, fallback: string): Promise<T> {
  const method = (init?.method || 'GET').toUpperCase();
  const cacheKey = `${method}:${path}`;

  if (method === 'GET') {
    const cached = responseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data as T;
    }

    const inflight = inflightRequests.get(cacheKey);
    if (inflight) {
      return inflight as Promise<T>;
    }
  } else {
    responseCache.clear();
  }

  const fetchPromise = (async () => {
    const response = await fetch(buildApiUrl(path), { ...init, credentials: 'include' });
    if (!response.ok) await throwApiError(response, fallback);
    const data = await response.json() as T;
    if (method === 'GET') {
      responseCache.set(cacheKey, { expiresAt: Date.now() + GET_CACHE_TTL_MS, data });
    }
    return data;
  })();

  if (method === 'GET') {
    inflightRequests.set(cacheKey, fetchPromise);
  }

  try {
    return await fetchPromise;
  } finally {
    if (method === 'GET') {
      inflightRequests.delete(cacheKey);
    }
  }
}

/**
 * Performs an authenticated fetch and returns parsed JSON, or null on
 * any non-OK response. Used for optional/conditional API calls where a
 * 404 or error should not crash the UI.
 *
 * @param {string} path - API endpoint path.
 * @param {RequestInit} [init] - Fetch options.
 * @returns {Promise<T | null>} Parsed JSON or null.
 */
async function requestOrNull<T>(path: string, init?: RequestInit): Promise<T | null> {
  const response = await fetch(buildApiUrl(path), { ...init, credentials: 'include' });
  if (!response.ok) return null;
  return response.json() as Promise<T>;
}

export const api = {
  async login(email: string, password: string): Promise<void> {
    await request<{ message: string }>('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }, 'Login failed');
  },

  async register(
    name: string,
    email: string,
    password: string,
    role: string,
    recaptchaToken: string,
    recaptchaAction: string
  ): Promise<void> {
    await request<{ message: string }>('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        email,
        password,
        role,
        recaptcha_token: recaptchaToken,
        recaptcha_action: recaptchaAction,
      }),
    }, 'Registration failed');
  },

  async getMe(): Promise<User> {
    return request<User>('/auth/me', {
      headers: getAuthHeaders(),
    }, 'Not authenticated');
  },

  async googleAuth(credential: string): Promise<void> {
    await request<{ message: string }>('/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    }, 'Google authentication failed');
  },

  async logout(): Promise<void> {
    await request<{ message: string }>('/auth/logout', {
      method: 'POST',
    }, 'Logout failed');
  },

  async getUserProfile(userId: string): Promise<User> {
    return request<User>(`/users/${userId}`, undefined, 'Failed to fetch user profile');
  },

  async updateMyProfile(updates: UserUpdate): Promise<User> {
    return request<User>('/users/me', {
      method: 'PUT',
      headers: getAuthHeaders(true),
      body: JSON.stringify(updates),
    }, 'Failed to update profile');
  },

  async getBusinesses(category?: string, sortBy?: string, search?: string, ownerId?: string): Promise<Business[]> {
    const params = new URLSearchParams();
    if (category) params.append('category', category);
    if (sortBy) params.append('sort_by', sortBy);
    if (search) params.append('search', search);
    if (ownerId) params.append('owner_id', ownerId);
    return request<Business[]>(`/businesses?${params}`, undefined, 'Failed to fetch businesses');
  },

  async getNearbyBusinesses(lat: number, lng: number, radius: number): Promise<Business[]> {
    return request<Business[]>(
      `/businesses/nearby?lat=${lat}&lng=${lng}&radius=${radius}`,
      undefined,
      'Failed to fetch nearby businesses'
    );
  },

  async reverseGeocodeLocation(lat: number, lng: number): Promise<ReverseGeocodeResponse> {
    const params = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
    });
    return request<ReverseGeocodeResponse>(
      `/location/reverse?${params}`,
      undefined,
      'Failed to resolve location'
    );
  },

  async getBusiness(id: string): Promise<Business> {
    return request<Business>(`/businesses/${id}`, undefined, 'Failed to fetch business');
  },

  async updateMyPreferences(preferences: UserPreferencesUpdate): Promise<User> {
    return request<User>('/users/preferences', {
      method: 'PUT',
      headers: getAuthHeaders(true),
      body: JSON.stringify(preferences),
    }, 'Failed to update preferences');
  },

  async updateBusinessProfile(
    businessId: string,
    updates: { short_description?: string; known_for?: string[] }
  ): Promise<Business> {
    return request<Business>(`/businesses/${businessId}/profile`, {
      method: 'PUT',
      headers: getAuthHeaders(true),
      body: JSON.stringify(updates),
    }, 'Failed to update business profile');
  },

  async getBusinessReviews(businessId: string): Promise<Review[]> {
    return request<Review[]>(`/reviews/business/${businessId}`, undefined, 'Failed to fetch reviews');
  },

  async createReview(review: ReviewCreate): Promise<Review> {
    return request<Review>('/reviews', {
      method: 'POST',
      headers: getAuthHeaders(true),
      body: JSON.stringify(review),
    }, 'Failed to create review');
  },

  async getDeals(): Promise<Deal[]> {
    return request<Deal[]>('/deals', undefined, 'Failed to fetch deals');
  },

  async getBusinessDeals(businessId: string): Promise<Deal[]> {
    const data = await request<{ items?: Deal[] } | Deal[]>(`/deals/business/${businessId}`, undefined, 'Failed to fetch deals');
    return Array.isArray(data) ? data : (data.items ?? []);
  },

  async submitClaim(claim: ClaimCreate): Promise<BusinessClaim> {
    return request<BusinessClaim>('/claims', {
      method: 'POST',
      headers: getAuthHeaders(true),
      body: JSON.stringify(claim),
    }, 'Failed to submit claim');
  },

  async getMyClaims(): Promise<BusinessClaim[]> {
    const data = await request<{ items?: BusinessClaim[] } | BusinessClaim[]>('/claims/my', {
      headers: getAuthHeaders(),
    }, 'Failed to fetch claims');
    return Array.isArray(data) ? data : (data.items ?? []);
  },

  async getSubscriptionTiers(): Promise<TierInfo[]> {
    return request<TierInfo[]>('/subscriptions/tiers', undefined, 'Failed to fetch tiers');
  },

  async createSubscription(sub: SubscriptionCreate): Promise<Subscription | { checkout_url: string; checkout_session_id?: string; status: string }> {
    return request<Subscription | { checkout_url: string; checkout_session_id?: string; status: string }>('/subscriptions', {
      method: 'POST',
      headers: getAuthHeaders(true),
      body: JSON.stringify(sub),
    }, 'Failed to create subscription');
  },

  async getMySubscriptions(): Promise<Subscription[]> {
    return request<Subscription[]>('/subscriptions/my', {
      headers: getAuthHeaders(),
    }, 'Failed to fetch subscriptions');
  },

  async getBusinessSubscription(businessId: string): Promise<Subscription | null> {
    return requestOrNull<Subscription>(`/subscriptions/business/${businessId}`, {
      headers: getAuthHeaders(),
    });
  },

  async checkIn(data: CheckInCreate): Promise<CheckIn> {
    return request<CheckIn>('/checkins', {
      method: 'POST',
      headers: getAuthHeaders(true),
      body: JSON.stringify(data),
    }, 'Failed to check in');
  },

  async getActivityFeed(page: number = 1, pageSize: number = 20): Promise<{ items: ActivityFeedItem[]; has_more: boolean }> {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('page_size', pageSize.toString());
    const data = await request<{ items?: ActivityFeedItem[]; has_more?: boolean } | ActivityFeedItem[]>(
      `/feed?${params}`,
      undefined,
      'Failed to fetch activity feed'
    );

    if (!Array.isArray(data) && Array.isArray(data.items)) {
      return { items: data.items, has_more: !!data.has_more };
    }

    if (Array.isArray(data)) {
      return { items: data, has_more: data.length >= pageSize };
    }
    return { items: [], has_more: false };
  },

  async getActivityPulse(
    lat: number,
    lng: number,
    radius: number = 5,
    limit: number = 10
  ): Promise<ActivityPulseItem[]> {
    const params = new URLSearchParams();
    params.append('lat', lat.toString());
    params.append('lng', lng.toString());
    params.append('radius', radius.toString());
    params.append('limit', limit.toString());
    const data = await request<{ items?: ActivityPulseItem[] }>(
      `/activity/pulse?${params}`,
      undefined,
      'Failed to fetch pulse'
    );
    return Array.isArray(data?.items) ? data.items : [];
  },

  async getOwnerEvents(options: {
    businessId?: string;
    lat?: number;
    lng?: number;
    radius?: number;
    includePast?: boolean;
    limit?: number;
  }): Promise<OwnerEvent[]> {
    const params = new URLSearchParams();
    if (options.businessId) {
      params.append('business_id', options.businessId);
    } else {
      if (typeof options.lat === 'number') params.append('lat', options.lat.toString());
      if (typeof options.lng === 'number') params.append('lng', options.lng.toString());
      params.append('radius', String(options.radius ?? 5));
    }
    if (options.includePast) params.append('include_past', 'true');
    if (typeof options.limit === 'number') params.append('limit', options.limit.toString());
    return request<OwnerEvent[]>(`/events?${params}`, undefined, 'Failed to fetch events');
  },

  async createOwnerEvent(payload: OwnerEventCreate): Promise<OwnerEvent> {
    return request<OwnerEvent>('/events', {
      method: 'POST',
      headers: getAuthHeaders(true),
      body: JSON.stringify(payload),
    }, 'Failed to create event');
  },

  async getBusinessActivity(businessId: string): Promise<BusinessActivityStatus> {
    return request<BusinessActivityStatus>(
      `/businesses/${businessId}/activity`,
      undefined,
      'Failed to fetch business activity'
    );
  },

  async getMyCredibility(): Promise<UserCredibility> {
    return request<UserCredibility>('/credibility/me', {
      headers: getAuthHeaders(),
    }, 'Failed to fetch credibility');
  },

  async toggleActivityLike(activityId: string): Promise<ActivityLikeResult> {
    return request<ActivityLikeResult>(`/feed/${activityId}/like`, {
      method: 'POST',
      headers: getAuthHeaders(true),
    }, 'Failed to like activity');
  },

  async getActivityComments(activityId: string): Promise<ActivityComment[]> {
    return request<ActivityComment[]>(
      `/feed/${activityId}/comments`,
      undefined,
      'Failed to fetch comments'
    );
  },

  async addActivityComment(activityId: string, content: string): Promise<{ comment: ActivityComment; comments: number }> {
    return request<{ comment: ActivityComment; comments: number }>(`/feed/${activityId}/comments`, {
      method: 'POST',
      headers: getAuthHeaders(true),
      body: JSON.stringify({ content }),
    }, 'Failed to add comment');
  },

  async createPost(content: string, businessId?: string): Promise<ActivityFeedItem> {
    return request<ActivityFeedItem>('/feed/posts', {
      method: 'POST',
      headers: getAuthHeaders(true),
      body: JSON.stringify({ content, business_id: businessId }),
    }, 'Failed to create post');
  },

  async discoverBusinesses(
    lat: number,
    lng: number,
    radius: number = 5,
    category?: string,
    limit: number = 200,
    refresh: boolean = false,
    sortMode: ExploreSortMode = 'canonical'
  ): Promise<Business[]> {
    const params = new URLSearchParams();
    params.append('lat', lat.toString());
    params.append('lng', lng.toString());
    params.append('radius', radius.toString());
    params.append('limit', limit.toString());
    if (refresh) params.append('refresh', 'true');
    params.append('sort_mode', sortMode);
    if (category) params.append('category', category);
    return request<Business[]>(`/discover?${params}`, undefined, 'Failed to discover businesses');
  },

  async getExploreLanes(
    lat: number,
    lng: number,
    radius: number = 5,
    limit: number = 120
  ): Promise<ExploreLanesResponse> {
    const params = new URLSearchParams();
    params.append('lat', lat.toString());
    params.append('lng', lng.toString());
    params.append('radius', radius.toString());
    params.append('limit', limit.toString());
    let response: Response;
    try {
      response = await fetch(buildApiUrl(`/explore/lanes?${params}`), {
        headers: getAuthHeaders(),
      });
    } catch {
      response = await fetch(buildApiUrl(`/explore/lanes?${params}`));
      if (!response.ok) await throwApiError(response, 'Failed to fetch explore lanes');
      return response.json();
    }
    if (!response.ok) await throwApiError(response, 'Failed to fetch explore lanes');
    return response.json();
  },

  async decideForMe(
    lat: number,
    lng: number,
    radiusKm: number,
    intent: DecideIntent,
    options?: {
      category?: string;
      limit?: number;
      constraints?: DecideIntent[];
    }
  ): Promise<DecideResponse> {
    const params = new URLSearchParams();
    params.append('lat', lat.toString());
    params.append('lng', lng.toString());
    params.append('radius_km', radiusKm.toString());
    params.append('intent', intent);
    params.append('limit', String(options?.limit ?? 3));
    if (options?.category) params.append('category', options.category);
    if (options?.constraints?.length) params.append('constraints', options.constraints.join(','));
    return request<DecideResponse>(`/decide?${params}`, undefined, 'Failed to get decide picks');
  },

  async getSavedBusinesses(): Promise<SavedBusinessesResponse> {
    return request<SavedBusinessesResponse>('/saved', {
      headers: getAuthHeaders(),
    }, 'Failed to fetch saved businesses');
  },

  async saveBusiness(businessId: string): Promise<{ business_id: string; saved: boolean }> {
    return request<{ business_id: string; saved: boolean }>(`/saved/${businessId}`, {
      method: 'POST',
      headers: getAuthHeaders(),
    }, 'Failed to save business');
  },

  async unsaveBusiness(businessId: string): Promise<{ business_id: string; saved: boolean }> {
    return request<{ business_id: string; saved: boolean }>(`/saved/${businessId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }, 'Failed to remove saved business');
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
    return request<{ message: string }>('/users/me/password', {
      method: 'PUT',
      headers: getAuthHeaders(true),
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    }, 'Failed to change password');
  },

  async purgeChains(): Promise<{ deleted: number; confidence_updated: number; total_scanned: number }> {
    return request<{ deleted: number; confidence_updated: number; total_scanned: number }>('/purge-chains', {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }, 'Failed to purge chain businesses');
  },

};
