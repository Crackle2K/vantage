"use client"

import { cn } from "@/lib/utils"
import { Utensils, ShoppingBag, Scissors, Wrench, Coffee, Dumbbell, Sparkles, Grid3X3 } from "lucide-react"

const categories = [
  { name: "All Categories", icon: Grid3X3 },
  { name: "Food & Dining", icon: Utensils },
  { name: "Retail", icon: ShoppingBag },
  { name: "Beauty & Spa", icon: Sparkles },
  { name: "Services", icon: Wrench },
  { name: "Coffee & Bakery", icon: Coffee },
  { name: "Fitness", icon: Dumbbell },
  { name: "Hair & Salon", icon: Scissors },
]

interface CategorySidebarProps {
  selectedCategory: string
  onSelectCategory: (category: string) => void
}

export function CategorySidebar({ selectedCategory, onSelectCategory }: CategorySidebarProps) {
  return (
    <aside className="hidden lg:block w-64 border-r border-border bg-card min-h-[calc(100vh-73px)] p-4">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-3">Categories</h2>
      </div>
      <nav className="space-y-1">
        {categories.map((category) => {
          const Icon = category.icon
          const isSelected = selectedCategory === category.name
          return (
            <button
              key={category.name}
              onClick={() => onSelectCategory(category.name)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isSelected ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-secondary",
              )}
            >
              <Icon className="w-4 h-4" />
              {category.name}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
