import { useState, useEffect } from "react"
import { Tag, ArrowRight, Clock, Percent, DollarSign } from "lucide-react"
import type { Deal } from "@/types"
import { api } from "@/api"

const colorPalette = [
  "from-[#4ade80] to-[#22c55e]",
  "from-[#052e16] to-[#4ade80]",
  "from-[#22c55e] to-[#4ade80]",
  "from-[#4ade80] to-[#052e16]",
  "from-[#052e16] to-[#22c55e]",
]

export function DealsSection() {
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getDeals()
      .then(data => setDeals(data.filter(d => d.is_active).slice(0, 4)))
      .catch(() => setDeals([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Tag className="w-5 h-5 text-[#4ade80]" />
          <h2 className="text-lg font-semibold text-[hsl(var(--foreground))] font-heading">Hot <span className="font-serif">Deals</span></h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-28 rounded-xl skeleton" />)}
        </div>
      </div>
    )
  }

  if (deals.length === 0) return null

  return (
    <div className="mb-8 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#4ade80]/15 dark:bg-[#4ade80]/20 flex items-center justify-center">
            <Tag className="w-4 h-4 text-[#4ade80] dark:text-[#4ade80]" />
          </div>
          <h2 className="text-lg font-semibold text-[hsl(var(--foreground))] font-heading">Hot <span className="font-serif">Deals</span></h2>
        </div>
        <button className="flex items-center gap-1 text-sm font-medium text-[hsl(var(--primary))] hover:underline">
          View All <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {deals.map((deal, index) => {
          const gradient = colorPalette[index % colorPalette.length]
          const daysLeft = Math.max(0, Math.ceil((new Date(deal.valid_until).getTime() - Date.now()) / 86400000))

          return (
            <div
              key={deal.id || deal._id}
              className="group relative overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
            >
              {/* Gradient accent bar */}
              <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${gradient}`} />

              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center flex-shrink-0 shadow-lg shadow-[#22c55e]/10`}>
                  {deal.discount_type === 'percentage' ? (
                    <Percent className="w-5 h-5 text-white" />
                  ) : (
                    <DollarSign className="w-5 h-5 text-white" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm text-[hsl(var(--foreground))] truncate">{deal.title}</h3>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5 truncate">{deal.business_name || deal.description}</p>
                </div>
              </div>

              <div className="flex items-center justify-between mt-3 pt-3 border-t border-[hsl(var(--border))]/50">
                <span className="text-lg font-bold text-[#4ade80] dark:text-[#4ade80]">
                  {deal.discount_type === 'percentage' ? `${deal.discount_value}% OFF` : `$${deal.discount_value} OFF`}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                  <Clock className="w-2.5 h-2.5" />
                  {daysLeft}d left
                </span>
              </div>

              {deal.code && (
                <div className="mt-2 px-2.5 py-1 rounded-lg bg-[hsl(var(--secondary))] text-center">
                  <span className="text-xs font-mono text-[hsl(var(--muted-foreground))]">Code: <span className="font-semibold text-[hsl(var(--foreground))]">{deal.code}</span></span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
