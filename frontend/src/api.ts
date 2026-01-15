import type { Business, Review, Deal, ReviewCreate, VerificationChallenge, Category } from './types';

const API_URL = 'http://localhost:8000/api';

export const api = {
  // Businesses
  async getBusinesses(category?: string, sortBy?: string, search?: string): Promise<Business[]> {
    const params = new URLSearchParams();
    if (category) params.append('category', category);
    if (sortBy) params.append('sort_by', sortBy);
    if (search) params.append('search', search);
    
    const response = await fetch(`${API_URL}/businesses?${params}`);
    if (!response.ok) throw new Error('Failed to fetch businesses');
    return response.json();
  },

  async getBusiness(id: number): Promise<Business> {
    const response = await fetch(`${API_URL}/businesses/${id}`);
    if (!response.ok) throw new Error('Failed to fetch business');
    return response.json();
  },

  // Reviews
  async getBusinessReviews(businessId: number): Promise<Review[]> {
    const response = await fetch(`${API_URL}/businesses/${businessId}/reviews`);
    if (!response.ok) throw new Error('Failed to fetch reviews');
    return response.json();
  },

  async createReview(review: ReviewCreate): Promise<Review> {
    const response = await fetch(`${API_URL}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(review),
    });
    if (!response.ok) throw new Error('Failed to create review');
    return response.json();
  },

  // Deals
  async getDeals(businessId?: number): Promise<Deal[]> {
    const params = businessId ? `?business_id=${businessId}` : '';
    const response = await fetch(`${API_URL}/deals${params}`);
    if (!response.ok) throw new Error('Failed to fetch deals');
    return response.json();
  },

  // Verification
  async requestVerification(): Promise<VerificationChallenge> {
    const response = await fetch(`${API_URL}/verification/request`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to request verification');
    return response.json();
  },

  async verifyAnswer(answer: number): Promise<{ verified: boolean }> {
    const response = await fetch(`${API_URL}/verification/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer }),
    });
    if (!response.ok) throw new Error('Failed to verify answer');
    return response.json();
  },

  // Categories
  async getCategories(): Promise<Category[]> {
    const response = await fetch(`${API_URL}/categories`);
    if (!response.ok) throw new Error('Failed to fetch categories');
    return response.json();
  },
};
