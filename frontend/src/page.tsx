"use client"

import { useState } from "react"
import { Header } from "@/components/header"
import { CategorySidebar } from "@/components/category-sidebar"
import { SearchBar } from "@/components/search-bar"
import { BusinessGrid } from "@/components/business-grid"
import { DealsSection } from "@/components/deals-section"

export default function HomePage() {
  const [selectedCategory, setSelectedCategory] = useState("All Categories")
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState("rating")
  const [favorites, setFavorites] = useState<string[]>([])

  const toggleFavorite = (businessId: string) => {
    setFavorites((prev) => (prev.includes(businessId) ? prev.filter((id) => id !== businessId) : [...prev, businessId]))
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="flex">
        <CategorySidebar selectedCategory={selectedCategory} onSelectCategory={setSelectedCategory} />
        <main className="flex-1 p-6">
          <div className="max-w-6xl mx-auto">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-foreground mb-2 text-balance">Discover Local Businesses</h1>
              <p className="text-muted-foreground">Support small businesses in your community</p>
            </div>

            <SearchBar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              sortBy={sortBy}
              onSortChange={setSortBy}
            />

            <DealsSection />

            <BusinessGrid
              selectedCategory={selectedCategory}
              searchQuery={searchQuery}
              sortBy={sortBy}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
            />
          </div>
        </main>
      </div>
    </div>
  )
}
