export type CategoryType = 'food' | 'retail' | 'services' | 'entertainment' | 'health';

export interface Business {
  id: number;
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
}

export interface Review {
  id: number;
  business_id: number;
  user_name: string;
  rating: number;
  comment: string;
  date: string;
  verified: boolean;
}

export interface Deal {
  id: number;
  business_id: number;
  title: string;
  description: string;
  discount: string;
  valid_until: string;
}

export interface ReviewCreate {
  business_id: number;
  user_name: string;
  rating: number;
  comment: string;
  verification_token: string;
}

export interface VerificationChallenge {
  question: string;
  token: string;
}

export interface Category {
  value: string;
  label: string;
}
