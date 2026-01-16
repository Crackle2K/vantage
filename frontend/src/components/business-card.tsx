"use client"

import { useState } from "react"
import { Star, Heart, Tag } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ReviewModal } from "@/components/review-modal"

interface Business {
  id: string
  name: string
  category: string
  rating: number
  reviews: number
  image: string
  description: string
  hasDeal: boolean
  dealText?: string
}

interface BusinessCardProps {
  business: Business
  isFavorite: boolean
  onToggleFavorite: () => void
}

export function BusinessCard({ business, isFavorite, onToggleFavorite }: BusinessCardProps) {
  const [showReviewModal, setShowReviewModal] = useState(false)

  return (
    <>
      <div className="group relative rounded-xl border border-border bg-card overflow-hidden hover:shadow-lg transition-all duration-200">
        <div className="relative aspect-[3/2] overflow-hidden">
          <img
            src={business.image || "/placeholder.svg"}
            alt={business.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          {business.hasDeal && (
            <div className="absolute top-3 left-3">
              <Badge className="bg-accent text-accent-foreground">
                <Tag className="w-3 h-3 mr-1" />
                Deal
              </Badge>
            </div>
          )}
          <button
            onClick={onToggleFavorite}
            className={cn(
              "absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition-colors",
              isFavorite ? "bg-destructive text-destructive-foreground" : "bg-card/80 text-foreground hover:bg-card",
            )}
          >
            <Heart className={cn("w-4 h-4", isFavorite && "fill-current")} />
          </button>
        </div>

        <div className="p-4">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                {business.name}
              </h3>
              <p className="text-sm text-muted-foreground">{business.category}</p>
            </div>
          </div>

          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{business.description}</p>

          {business.hasDeal && business.dealText && (
            <div className="mb-3 p-2 rounded-lg bg-accent/10 border border-accent/20">
              <p className="text-xs font-medium text-accent">{business.dealText}</p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <div className="flex items-center">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={cn(
                      "w-4 h-4",
                      i < Math.floor(business.rating) ? "text-chart-3 fill-chart-3" : "text-muted-foreground",
                    )}
                  />
                ))}
              </div>
              <span className="text-sm font-medium text-foreground ml-1">{business.rating}</span>
              <span className="text-sm text-muted-foreground">({business.reviews})</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowReviewModal(true)}>
              Review
            </Button>
          </div>
        </div>
      </div>

      <ReviewModal business={business} isOpen={showReviewModal} onClose={() => setShowReviewModal(false)} />
    </>
  )
}
