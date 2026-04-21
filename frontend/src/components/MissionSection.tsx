/**
 * @fileoverview Mission statement section for the landing page. Presents
 * Vantage's mission with a tabbed feature explorer showing "Claim &
 * Conversion", "Verified Trust System", and "Community Engagement Feed"
 * with screenshots and descriptions.
 */

import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Info, DollarSign, Star, ArrowRight } from "lucide-react"

/**
 * Renders the mission statement section with a three-tab feature switcher.
 * Each tab shows a title, description, and product screenshot, with a
 * "Learn more" CTA that navigates to the explore page.
 *
 * @returns {JSX.Element} The mission section with tabbed feature display.
 */
export function MissionSection() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState(0)

  const tabFeatures = [
    {
      id: 0,
      name: "Claim & Conversion",
      icon: DollarSign,
      title: "Claim & Conversion",
      description: "Owners claim listings, launch deals, and turn discovery into real foot traffic.",
      image: "/Images/Pricing.png"
    },
    {
      id: 1,
      name: "Verified Trust System",
      icon: Star,
      title: "Verified Trust System",
      description: "We rank businesses using verified check-ins, credibility-weighted reviews, and live activity signals. This eliminates fake or inactive listings and makes results genuinely trustworthy.",
      image: "/Images/Explore.png"
    },
    {
      id: 2,
      name: "Community Engagement Feed",
      icon: Info,
      title: "Community Engagement Feed",
      description: "Users engage with real local activity (verified check-ins, likes, comments, active-today signals), turning Vantage from a one-time search into a habit-forming local community platform.",
      image: "/Images/Activity.png"
    }
  ]

  return (
    <section className="relative py-32 md:py-48 overflow-hidden">
      {/* Refined gradient mesh background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--background))] via-[hsl(var(--card)/0.5)] to-[hsl(var(--background))]" />

      {/* Subtle animated gradient orbs */}
      <div
        className="absolute top-1/4 left-1/4 w-96 h-96 bg-[hsl(var(--primary)/0.08)] rounded-full animate-pulse"
        style={{ animationDuration: '8s' }}
      />
      <div
        className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-[hsl(var(--accent)/0.12)] rounded-full animate-pulse"
        style={{ animationDuration: '10s', animationDelay: '2s' }}
      />

      {/* Content container */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6">
        {/* Refined quote section with editorial typography */}
        <div className="text-center mb-20 md:mb-28">
          <div className="inline-flex items-center gap-3 mb-8 px-5 py-2.5 rounded-full bg-[hsl(var(--primary)/0.08)] border border-[hsl(var(--primary)/0.15)]">
            <div className="w-2 h-2 rounded-full bg-[hsl(var(--primary))] animate-pulse" />
            <span className="text-ui font-medium text-[hsl(var(--primary))] tracking-wide">OUR MISSION</span>
          </div>

          <h2 className="text-heading-xl md:text-[4.5rem] lg:text-[5.5rem] font-bold leading-[1.05] tracking-[-0.04em] text-[hsl(var(--foreground))] max-w-5xl mx-auto font-heading">
            <span className="block mb-3 md:mb-4">Turning real community</span>
            <span className="block bg-gradient-to-r from-[hsl(var(--primary))] via-[hsl(var(--primary)/0.85)] to-[hsl(var(--primary)/0.7)] bg-clip-text text-transparent">
              support into
            </span>
            <span className="block mt-3 md:mt-4">authentic local visibility</span>
          </h2>

          <p className="mt-8 text-subheading text-[hsl(var(--muted-foreground))] max-w-2xl mx-auto leading-relaxed">
            Where genuine connections meet local discovery. Every check-in, review, and interaction builds trust that matters.
          </p>
        </div>

        {/* Modern tab navigation with refined aesthetics */}
        <div className="flex flex-wrap justify-center gap-3 md:gap-4 mb-16">
          {tabFeatures.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`group relative flex flex-col items-center p-5 md:p-6 rounded-2xl transition-all duration-300 cursor-pointer border min-w-[160px] md:min-w-[180px] ${
                  isActive
                    ? 'bg-[hsl(var(--card))] border-[hsl(var(--primary)/0.3)] shadow-xl shadow-[hsl(var(--primary)/0.08)]'
                    : 'bg-[hsl(var(--card)/0.5)] border-[hsl(var(--border)/0.5)] hover:bg-[hsl(var(--card))] hover:border-[hsl(var(--border))] hover:shadow-lg'
                }`}
              >
                {/* Active indicator glow */}
                {isActive && (
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[hsl(var(--primary)/0.05)] to-transparent" />
                )}

                <div className={`relative w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-all duration-300 ${
                  isActive
                    ? 'bg-[hsl(var(--primary))] shadow-lg shadow-[hsl(var(--primary)/0.25)]'
                    : 'bg-[hsl(var(--muted)/0.5)] group-hover:bg-[hsl(var(--muted))]'
                }`}>
                  <Icon className={`w-6 h-6 transition-colors duration-300 ${
                    isActive ? 'text-[hsl(var(--primary-foreground))]' : 'text-[hsl(var(--muted-foreground))]'
                  }`} />
                </div>

                <span className={`relative text-sm md:text-body font-semibold transition-colors duration-300 ${
                  isActive ? 'text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]'
                }`}>
                  {tab.name}
                </span>
              </button>
            )
          })}
        </div>

        {/* Feature content with smooth transitions */}
        <div
          key={activeTab}
          className="grid md:grid-cols-2 gap-12 md:gap-16 items-center animate-fade-in-up"
        >
          {/* Text content */}
          <div className="order-2 md:order-1">
            <div className="inline-flex items-center gap-2 mb-6">
              <div className="w-1 h-8 bg-gradient-to-b from-[hsl(var(--primary))] to-[hsl(var(--primary)/0.3)] rounded-full" />
              <span className="text-ui font-medium text-[hsl(var(--primary))] tracking-wide uppercase">
                Feature
              </span>
            </div>

            <h3 className="text-heading md:text-[2.75rem] font-bold mb-6 font-heading text-[hsl(var(--foreground))] leading-tight">
              {tabFeatures[activeTab].title}
            </h3>

            <p className="text-body md:text-subheading text-[hsl(var(--muted-foreground))] leading-relaxed mb-10">
              {tabFeatures[activeTab].description}
            </p>

            <Button
              size="lg"
              className="group relative overflow-hidden bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] px-8 py-6 text-body rounded-xl font-semibold shadow-lg shadow-[hsl(var(--primary)/0.2)] hover:shadow-xl hover:shadow-[hsl(var(--primary)/0.3)] transition-all duration-300"
              onClick={() => navigate("/businesses")}
            >
              <span className="relative z-10 flex items-center gap-2">
                Learn more
                <ArrowRight className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
              </span>
            </Button>
          </div>

          {/* Image with refined styling */}
          <div className="order-1 md:order-2 relative">
            <div className="absolute -inset-4 bg-gradient-to-r from-[hsl(var(--primary)/0.1)] to-[hsl(var(--accent)/0.1)] rounded-3xl opacity-60" />
            <div className="relative rounded-2xl overflow-hidden shadow-2xl aspect-[16/9] w-full border border-[hsl(var(--border)/0.5)]">
              <img
                src={tabFeatures[activeTab].image}
                alt={tabFeatures[activeTab].title}
                className="w-full h-full object-cover transition-transform duration-700 hover:scale-[1.02]"
              />
              {/* Subtle gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-[hsl(var(--background)/0.1)] to-transparent" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}