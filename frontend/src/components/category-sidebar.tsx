import { cn } from "@/lib/utils"
import { Utensils, ShoppingBag, Scissors, Wrench, Coffee, Dumbbell, Sparkles, Grid3X3 } from "lucide-react"

const categories = [
  { name: "All Categories", icon: Grid3X3, gradient: "from-[#4ade80] to-[#22c55e]" },
  { name: "Food & Dining", icon: Utensils, gradient: "from-[#4ade80] to-[#22c55e]" },
  { name: "Retail", icon: ShoppingBag, gradient: "from-[#052e16] to-[#4ade80]" },
  { name: "Beauty & Spa", icon: Sparkles, gradient: "from-[#4ade80] to-[#052e16]" },
  { name: "Services", icon: Wrench, gradient: "from-[#052e16] to-[#22c55e]" },
  { name: "Coffee & Bakery", icon: Coffee, gradient: "from-[#4ade80] to-[#22c55e]" },
  { name: "Fitness", icon: Dumbbell, gradient: "from-[#22c55e] to-[#4ade80]" },
  { name: "Hair & Salon", icon: Scissors, gradient: "from-[#052e16] to-[#4ade80]" },
]

interface CategorySidebarProps {
  selectedCategory: string
  onSelectCategory: (category: string) => void
}

export function CategorySidebar({ selectedCategory, onSelectCategory }: CategorySidebarProps) {
  return (
    <aside className="hidden lg:block w-64 flex-shrink-0">
      <div className="glass-card rounded-2xl p-4 sticky top-24">
        <h2 className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-widest px-3 mb-3">
          Categories
        </h2>
        <nav className="space-y-1">
          {categories.map((category) => {
            const Icon = category.icon
            const isSelected = selectedCategory === category.name
            return (
              <button
                key={category.name}
                onClick={() => onSelectCategory(category.name)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  isSelected
                    ? "gradient-primary text-white shadow-lg shadow-[#22c55e]/20"
                    : "text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]"
                )}
              >
                <div className={cn(
                  "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all",
                  isSelected
                    ? "bg-white/20"
                    : `bg-gradient-to-br ${category.gradient} bg-opacity-10`
                )}>
                  <Icon className={cn("w-3.5 h-3.5", isSelected ? "text-white" : "text-white")} />
                </div>
                {category.name}
              </button>
            )
          })}
        </nav>
      </div>
    </aside>
  )
}
