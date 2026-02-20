import { Star, Heart, Tag, MapPin, ArrowUpRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

interface Business {
  id?: string
  _id?: string
  name: string
  category: string
  rating: number
  review_count?: number
  reviews?: number
  image_url?: string
  image?: string
  description: string
  has_deals?: boolean
  hasDeal?: boolean
  dealText?: string
  distance?: number
}

interface BusinessCardProps {
  business: Business
  isFavorite: boolean
  onToggleFavorite: () => void
  onViewDetails?: () => void
}

const categoryColors: Record<string, string> = {
  food: "from-[#4ade80] to-[#22c55e]",
  retail: "from-[#052e16] to-[#4ade80]",
  services: "from-[#052e16] to-[#22c55e]",
  entertainment: "from-[#22c55e] to-[#4ade80]",
  health: "from-[#4ade80] to-[#052e16]",
  "Food & Dining": "from-[#4ade80] to-[#22c55e]",
  "Retail": "from-[#052e16] to-[#4ade80]",
  "Beauty & Spa": "from-[#4ade80] to-[#052e16]",
  "Services": "from-[#052e16] to-[#22c55e]",
  "Coffee & Bakery": "from-[#4ade80] to-[#22c55e]",
  "Fitness": "from-[#22c55e] to-[#4ade80]",
  "Hair & Salon": "from-[#052e16] to-[#4ade80]",
}

export function BusinessCard({ business, isFavorite, onToggleFavorite, onViewDetails }: BusinessCardProps) {
  const rating = business.rating || 0
  const reviewCount = business.review_count || business.reviews || 0
  const imageUrl = business.image_url || business.image || ''
  const hasDeal = business.has_deals || business.hasDeal
  const gradient = categoryColors[business.category] || "from-[#4ade80] to-[#22c55e]"

  return (
    <div
      className="group glass-card rounded-2xl overflow-hidden cursor-pointer"
      onClick={onViewDetails}
    >
      {/* Image */}
      <div className="relative aspect-[16/10] overflow-hidden bg-[hsl(var(--secondary))]">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={business.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${gradient} flex items-center justify-center`}>
            <span className="text-4xl font-bold text-white/80">{business.name[0]}</span>
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Deal badge */}
        {hasDeal && (
          <div className="absolute top-3 left-3">
            <Badge className="bg-[#22c55e] hover:bg-[#052e16] text-white border-0 shadow-lg shadow-[#22c55e]/25 gap-1">
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
          <h3 className="font-semibold text-[hsl(var(--foreground))] group-hover:text-[hsl(var(--primary))] transition-colors line-clamp-1 font-heading tracking-tight">
            {business.name}
          </h3>
        </div>

        <div className="flex items-center gap-2 mb-2.5">
          <span className={`inline-block w-2 h-2 rounded-full bg-gradient-to-r ${gradient}`} />
          <span className="text-xs font-medium text-[hsl(var(--muted-foreground))] capitalize font-mono">{business.category}</span>
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

        {business.dealText && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-[#4ade80]/10 dark:bg-[#4ade80]/15 border border-[#4ade80]/25 dark:border-[#4ade80]/20">
            <p className="text-xs font-medium text-[#052e16] dark:text-[#4ade80]">{business.dealText}</p>
          </div>
        )}

        {/* Rating */}
        <div className="flex items-center gap-2 pt-3 border-t border-[hsl(var(--border))]/50">
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star
                key={i}
                className={cn(
                  "w-3.5 h-3.5",
                  i <= Math.round(rating)
                    ? "text-amber-400 fill-amber-400"
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
