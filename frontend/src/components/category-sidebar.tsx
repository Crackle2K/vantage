import { cn } from "@/lib/utils"
import {
  Utensils, ShoppingBag, Scissors, Coffee, Dumbbell, Sparkles, Grid3X3,
  Wine, Heart, Car, Film, Briefcase, Home, PawPrint, GraduationCap,
  ShoppingCart, Wrench, TreeDeciduous
} from "lucide-react"

const categories = [
  { name: "All Categories", icon: Grid3X3, color: "from-violet-500 to-indigo-500" },
  { name: "Restaurants", icon: Utensils, color: "from-orange-500 to-red-500" },
  { name: "Cafes & Coffee", icon: Coffee, color: "from-amber-500 to-orange-500" },
  { name: "Bars & Nightlife", icon: Wine, color: "from-purple-500 to-pink-500" },
  { name: "Shopping", icon: ShoppingBag, color: "from-sky-500 to-blue-500" },
  { name: "Beauty & Spas", icon: Sparkles, color: "from-pink-500 to-rose-500" },
  { name: "Fitness & Wellness", icon: Dumbbell, color: "from-green-500 to-emerald-500" },
  { name: "Health & Medical", icon: Heart, color: "from-red-500 to-rose-500" },
  { name: "Entertainment", icon: Film, color: "from-indigo-500 to-violet-500" },
  { name: "Grocery", icon: ShoppingCart, color: "from-lime-500 to-green-500" },
  { name: "Automotive", icon: Car, color: "from-slate-500 to-zinc-500" },
  { name: "Home Services", icon: Home, color: "from-teal-500 to-cyan-500" },
  { name: "Professional Services", icon: Briefcase, color: "from-blue-500 to-indigo-500" },
  { name: "Education", icon: GraduationCap, color: "from-yellow-500 to-amber-500" },
  { name: "Hotels & Travel", icon: TreeDeciduous, color: "from-emerald-500 to-teal-500" },
  { name: "Hair & Salon", icon: Scissors, color: "from-fuchsia-500 to-pink-500" },
  { name: "Pets", icon: PawPrint, color: "from-orange-400 to-amber-500" },
  { name: "Local Services", icon: Wrench, color: "from-cyan-500 to-sky-500" },
  { name: "Active Life", icon: Dumbbell, color: "from-green-400 to-emerald-500" },
  { name: "Other", icon: Grid3X3, color: "from-gray-400 to-gray-500" },
]

interface CategorySidebarProps {
  selectedCategory: string
  onSelectCategory: (category: string) => void
  businessCounts?: Record<string, number>
}

export function CategorySidebar({ selectedCategory, onSelectCategory, businessCounts }: CategorySidebarProps) {
  return (
    <aside className="hidden lg:block w-64 flex-shrink-0">
      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl p-4 sticky top-24 shadow-sm">
        <h2 className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-[0.15em] px-3 mb-3">
          Categories
        </h2>
        <nav className="space-y-0.5 max-h-[70vh] overflow-y-auto pr-1 scrollbar-thin">
          {categories.map((category) => {
            const Icon = category.icon
            const isSelected = selectedCategory === category.name
            const count = businessCounts?.[category.name]
            return (
              <button
                key={category.name}
                onClick={() => onSelectCategory(category.name)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200",
                  isSelected
                    ? "bg-[hsl(var(--primary))] text-white shadow-md shadow-[hsl(var(--primary))]/20"
                    : "text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]"
                )}
              >
                <div className={cn(
                  "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all",
                  isSelected
                    ? "bg-white/20"
                    : `bg-gradient-to-br ${category.color} bg-opacity-10`
                )}>
                  <Icon className={cn("w-3.5 h-3.5", isSelected ? "text-white" : "text-white")} />
                </div>
                <span className="truncate flex-1 text-left">{category.name}</span>
                {count !== undefined && count > 0 && (
                  <span className={cn(
                    "text-[10px] font-semibold px-1.5 py-0.5 rounded-full min-w-[20px] text-center",
                    isSelected
                      ? "bg-white/20 text-white"
                      : "bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]"
                  )}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      </div>
    </aside>
  )
}
