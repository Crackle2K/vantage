"use client"

import { BusinessCard } from "@/components/business-card"

const businesses = [
  {
    id: "1",
    name: "The Cozy Corner Café",
    category: "Food & Dining",
    rating: 4.8,
    reviews: 127,
    image: "/cozy-cafe-interior.png",
    description: "Farm-to-table breakfast and brunch spot with organic coffee.",
    hasDeal: true,
    dealText: "15% off weekday mornings",
  },
  {
    id: "2",
    name: "Bloom & Petal Florist",
    category: "Retail",
    rating: 4.9,
    reviews: 89,
    image: "/beautiful-flower-shop-with-colorful-arrangements.jpg",
    description: "Locally grown flowers and custom arrangements for any occasion.",
    hasDeal: false,
  },
  {
    id: "3",
    name: "Precision Auto Care",
    category: "Services",
    rating: 4.7,
    reviews: 203,
    image: "/modern-auto-repair-shop.png",
    description: "Trusted mechanics with transparent pricing and fast service.",
    hasDeal: true,
    dealText: "Free oil change with inspection",
  },
  {
    id: "4",
    name: "Serenity Spa & Wellness",
    category: "Beauty & Spa",
    rating: 4.9,
    reviews: 156,
    image: "/relaxing-spa-interior-with-candles.jpg",
    description: "Full-service spa offering massages, facials, and body treatments.",
    hasDeal: false,
  },
  {
    id: "5",
    name: "Main Street Books",
    category: "Retail",
    rating: 4.6,
    reviews: 78,
    image: "/cozy-independent-bookstore-with-wooden-shelves.jpg",
    description: "Independent bookstore with curated selections and author events.",
    hasDeal: true,
    dealText: "Buy 2 get 1 free on used books",
  },
  {
    id: "6",
    name: "FitZone Gym",
    category: "Fitness",
    rating: 4.5,
    reviews: 234,
    image: "/modern-gym-equipment.png",
    description: "24/7 fitness center with personal training and group classes.",
    hasDeal: false,
  },
]

interface BusinessGridProps {
  selectedCategory: string
  searchQuery: string
  sortBy: string
  favorites: string[]
  onToggleFavorite: (id: string) => void
}

export function BusinessGrid({
  selectedCategory,
  searchQuery,
  sortBy,
  favorites,
  onToggleFavorite,
}: BusinessGridProps) {
  let filtered = businesses.filter((business) => {
    const matchesCategory = selectedCategory === "All Categories" || business.category === selectedCategory
    const matchesSearch =
      business.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      business.description.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  // Sort businesses
  filtered = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case "rating":
        return b.rating - a.rating
      case "reviews":
        return b.reviews - a.reviews
      case "deals":
        return (b.hasDeal ? 1 : 0) - (a.hasDeal ? 1 : 0)
      default:
        return 0
    }
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">
          {selectedCategory === "All Categories" ? "All Businesses" : selectedCategory}
        </h2>
        <span className="text-sm text-muted-foreground">{filtered.length} results</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filtered.map((business) => (
          <BusinessCard
            key={business.id}
            business={business}
            isFavorite={favorites.includes(business.id)}
            onToggleFavorite={() => onToggleFavorite(business.id)}
          />
        ))}
      </div>
      {filtered.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No businesses found matching your criteria.</p>
        </div>
      )}
    </div>
  )
}
