import { Star, Heart, Tag, MapPin, ArrowUpRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import type { Business } from "@/types"

interface BusinessCardProps {
  business: Business
  isFavorite: boolean
  onToggleFavorite: () => void
  onViewDetails?: () => void
}

const categoryColors: Record<string, string> = {
  Restaurants: "from-orange-500 to-red-500",
  "Cafes & Coffee": "from-amber-500 to-orange-500",
  "Bars & Nightlife": "from-purple-500 to-pink-500",
  Shopping: "from-sky-500 to-blue-500",
  "Beauty & Spas": "from-pink-500 to-rose-500",
  "Fitness & Wellness": "from-green-500 to-emerald-500",
  "Health & Medical": "from-red-500 to-rose-500",
  Entertainment: "from-indigo-500 to-violet-500",
  Grocery: "from-lime-500 to-green-500",
  Automotive: "from-slate-500 to-zinc-500",
  "Home Services": "from-teal-500 to-cyan-500",
  "Professional Services": "from-blue-500 to-indigo-500",
  Education: "from-yellow-500 to-amber-500",
  "Hotels & Travel": "from-emerald-500 to-teal-500",
  "Financial Services": "from-blue-400 to-indigo-500",
  Pets: "from-orange-400 to-amber-500",
  "Local Services": "from-cyan-500 to-sky-500",
  "Active Life": "from-green-400 to-emerald-500",
  Other: "from-gray-400 to-gray-500",
  // Legacy lowercase fallbacks
  food: "from-orange-500 to-red-500",
  retail: "from-sky-500 to-blue-500",
  services: "from-cyan-500 to-sky-500",
  entertainment: "from-indigo-500 to-violet-500",
  health: "from-red-500 to-rose-500",
}

export function BusinessCard({ business, isFavorite, onToggleFavorite, onViewDetails }: BusinessCardProps) {
  const rating = business.rating || 0
  const reviewCount = business.review_count || 0
  const imageUrl = business.image_url || business.image || ''
  const hasDeal = business.has_deals
  const gradient = categoryColors[business.category] || "from-gray-400 to-gray-500"

  return (
    <div
      className="group bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl overflow-hidden cursor-pointer hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20 transition-all duration-300 hover:-translate-y-0.5"
      onClick={onViewDetails}
    >
      {/* Image */}
      <div className="relative aspect-[16/10] overflow-hidden bg-[hsl(var(--secondary))]">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={business.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${gradient} flex items-center justify-center`}>
            <span className="text-3xl font-bold text-white/80">{business.name[0]}</span>
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Deal badge */}
        {hasDeal && (
          <div className="absolute top-3 left-3">
            <Badge className="bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))] text-white border-0 shadow-lg gap-1 text-xs">
              <Tag className="w-3 h-3" />
              Deal
            </Badge>
          </div>
        )}

        {/* Favorite */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
          className={cn(
            "absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg",
            isFavorite
              ? "bg-red-500 text-white scale-110"
              : "bg-white/80 dark:bg-black/50 text-[hsl(var(--foreground))] hover:bg-white dark:hover:bg-black/70 backdrop-blur-sm"
          )}
        >
          <Heart className={cn("w-4 h-4", isFavorite && "fill-current")} />
        </button>

        {/* View arrow (on hover) */}
        <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0">
          <div className="w-8 h-8 rounded-full bg-white/90 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center">
            <ArrowUpRight className="w-4 h-4 text-[hsl(var(--foreground))]" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <h3 className="font-semibold text-[hsl(var(--foreground))] group-hover:text-[hsl(var(--primary))] transition-colors line-clamp-1 tracking-tight">
            {business.name}
          </h3>
        </div>

        <div className="flex items-center gap-2 mb-2.5">
          <span className={`inline-block w-2 h-2 rounded-full bg-gradient-to-r ${gradient}`} />
          <span className="text-xs font-medium text-[hsl(var(--muted-foreground))]">{business.category}</span>
          {business.distance !== undefined && (
            <>
              <span className="text-[hsl(var(--border))]">|</span>
              <div className="flex items-center gap-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                <MapPin className="w-3 h-3" />
                {business.distance.toFixed(1)} km
              </div>
            </>
          )}
        </div>

        <p className="text-sm text-[hsl(var(--muted-foreground))] mb-3 line-clamp-2 leading-relaxed">{business.description}</p>

        {/* Rating */}
        <div className="flex items-center gap-2 pt-3 border-t border-[hsl(var(--border))]/50">
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star
                key={i}
                className={cn(
                  "w-3.5 h-3.5",
                  i <= Math.round(rating)
                    ? "text-amber-500 fill-amber-400"
                    : "text-[hsl(var(--border))]"
                )}
              />
            ))}
          </div>
          <span className="text-sm font-semibold text-[hsl(var(--foreground))]">{rating.toFixed(1)}</span>
          <span className="text-xs text-[hsl(var(--muted-foreground))]">({reviewCount})</span>
        </div>
      </div>
    </div>
  )
}
