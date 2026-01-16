"use client"

import { Tag, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"

const deals = [
  { business: "Sunny Café", offer: "20% off all drinks", expires: "2 days left", color: "bg-chart-3" },
  { business: "Fresh Cuts Salon", offer: "Free styling with any haircut", expires: "5 days left", color: "bg-chart-2" },
  { business: "Tech Repair Pro", offer: "$15 off screen repairs", expires: "This week only", color: "bg-chart-1" },
]

export function DealsSection() {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Tag className="w-5 h-5 text-accent" />
          <h2 className="text-lg font-semibold text-foreground">Special Deals & Coupons</h2>
        </div>
        <Button variant="ghost" size="sm" className="text-primary">
          View All <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {deals.map((deal, index) => (
          <div
            key={index}
            className="relative overflow-hidden rounded-xl border border-border bg-card p-4 hover:shadow-md transition-shadow cursor-pointer"
          >
            <div className={`absolute top-0 left-0 w-1.5 h-full ${deal.color}`} />
            <h3 className="font-semibold text-foreground mb-1">{deal.business}</h3>
            <p className="text-sm text-muted-foreground mb-2">{deal.offer}</p>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-accent/10 text-accent">
              {deal.expires}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
