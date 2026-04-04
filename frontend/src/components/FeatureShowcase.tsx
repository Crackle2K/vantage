import { useEffect, useRef, useState } from "react"
import { Check, Users, MapPin, Shield } from "lucide-react"

// Custom hook for scroll-triggered animations
function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
        }
      },
      { threshold: 0.2, rootMargin: "0px 0px -100px 0px" }
    )

    if (ref.current) {
      observer.observe(ref.current)
    }

    return () => observer.disconnect()
  }, [])

  return { ref, isVisible }
}

// Animated demo component that shows user flows
function AnimatedDemo({ type }: { type: "checkin" | "trust" | "community" }) {
  const [step, setStep] = useState(0)
  const [hasCompleted, setHasCompleted] = useState(false)

  useEffect(() => {
    if (hasCompleted) return

    const interval = setInterval(() => {
      setStep((s) => {
        if (s >= 3) {
          setHasCompleted(true)
          return s
        }
        return s + 1
      })
    }, 1800)
    return () => clearInterval(interval)
  }, [hasCompleted])

  return (
    <div className="relative w-full aspect-[3/5] bg-[#0a0a0a] rounded-2xl overflow-hidden border border-[#1a1a1a] shadow-2xl">
      {/* Subtle grid background */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute inset-0" style={{
          backgroundImage: `linear-gradient(rgba(0,255,136,0.03) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(0,255,136,0.03) 1px, transparent 1px)`,
          backgroundSize: '40px 40px'
        }} />
      </div>

      {/* Glow effect */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-[#00ff88] opacity-10 blur-[100px] rounded-full" />

      {/* Demo content based on type */}
      {type === "checkin" && <CheckInDemo step={step} />}
      {type === "trust" && <TrustDemo step={step} />}
      {type === "community" && <CommunityDemo step={step} />}
    </div>
  )
}

function CheckInDemo({ step }: { step: number }) {
  return (
    <div className="relative z-10 p-8 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#00ff88]/20 flex items-center justify-center">
            <MapPin className="w-5 h-5 text-[#00ff88]" />
          </div>
          <div>
            <div className="text-white font-semibold">Local Café</div>
            <div className="text-[#666] text-sm">0.2 mi away</div>
          </div>
        </div>
        <div className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-500 ${
          step >= 2 ? 'bg-[#00ff88] text-black' : 'bg-[#1a1a1a] text-[#666]'
        }`}>
          {step >= 2 ? '✓ Verified' : 'Tap to check in'}
        </div>
      </div>

      {/* Check-in animation */}
      <div className="flex-1 flex items-center justify-center">
        <div className={`relative transition-all duration-500 ${
          step === 1 ? 'scale-110' : step >= 2 ? 'scale-100' : 'scale-100'
        }`}>
          <div className={`w-24 h-24 rounded-full border-4 transition-all duration-500 ${
            step >= 2 ? 'border-[#00ff88] bg-[#00ff88]/20' : 'border-[#333]'
          }`}>
            <div className={`absolute inset-0 rounded-full transition-all duration-500 ${
              step === 1 ? 'bg-[#00ff88]/30 scale-125' : 'scale-100'
            }`} />
            {step >= 2 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Check className="w-10 h-10 text-[#00ff88] animate-scale-in" />
              </div>
            )}
          </div>

          {/* Pulse rings */}
          {step === 1 && (
            <>
              <div className="absolute inset-0 rounded-full border-2 border-[#00ff88] animate-ping" />
              <div className="absolute inset-0 rounded-full border-2 border-[#00ff88] animate-ping" style={{ animationDelay: '0.2s' }} />
            </>
          )}
        </div>
      </div>

      {/* Bottom stats */}
      <div className={`flex justify-center gap-8 transition-all duration-500 ${
        step >= 3 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}>
        <div className="text-center">
          <div className="text-[#00ff88] font-bold text-xl">+50</div>
          <div className="text-[#666] text-xs">points</div>
        </div>
        <div className="text-center">
          <div className="text-white font-bold text-xl">127</div>
          <div className="text-[#666] text-xs">check-ins</div>
        </div>
      </div>
    </div>
  )
}

function TrustDemo({ step }: { step: number }) {
  const stages = [
    { label: 'Search', icon: '🔍' },
    { label: 'Verify', icon: '✓' },
    { label: 'Rank', icon: '📊' },
    { label: 'Trust', icon: '⭐' }
  ]

  return (
    <div className="relative z-10 p-8 h-full flex flex-col">
      {/* Title */}
      <div className="text-center mb-8">
        <div className="text-white font-semibold text-lg mb-1">Trust Score</div>
        <div className="text-[#666] text-sm">Real-time verification</div>
      </div>

      {/* Central visualization */}
      <div className="flex-1 flex items-center justify-center">
        <div className="relative w-48 h-48">
          {/* Outer ring */}
          <svg className="absolute inset-0 w-full h-full -rotate-90">
            <circle
              cx="96" cy="96" r="88"
              fill="none"
              stroke="#1a1a1a"
              strokeWidth="8"
            />
            <circle
              cx="96" cy="96" r="88"
              fill="none"
              stroke="#00ff88"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={553}
              strokeDashoffset={553 - (553 * (step + 1) * 0.92) / 4}
              className="transition-all duration-1000 ease-out"
            />
          </svg>

          {/* Center content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-[#00ff88] font-bold text-4xl transition-all duration-1000 ease-out">
              {step === 0 ? '0' : step === 1 ? '31' : step === 2 ? '64' : '92'}
            </div>
            <div className="text-[#666] text-sm">trust score</div>
          </div>
        </div>
      </div>

      {/* Stage indicators */}
      <div className="flex justify-center gap-4">
        {stages.map((stage, i) => (
          <div
            key={i}
            className={`flex flex-col items-center gap-1 transition-all duration-300 ${
              i <= step ? 'opacity-100' : 'opacity-30'
            }`}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-all duration-300 ${
              i <= step ? 'bg-[#00ff88]/20 border border-[#00ff88]/50' : 'bg-[#1a1a1a]'
            }`}>
              {stage.icon}
            </div>
            <div className={`text-xs transition-colors ${
              i <= step ? 'text-[#00ff88]' : 'text-[#666]'
            }`}>
              {stage.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CommunityDemo({ step }: { step: number }) {
  const activities = [
    { type: 'checkin', user: 'Roy', business: 'Brew & Bites', time: '2m ago' },
    { type: 'review', user: 'Dinesh', business: 'Corner Store', time: '5m ago' },
    { type: 'like', user: 'Affan', business: 'Green Café', time: '8m ago' }
  ]

  return (
    <div className="relative z-10 p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-white font-semibold">Activity Feed</div>
        <div className="flex items-center gap-1 text-[#00ff88]">
          <div className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse" />
          <span className="text-xs">Live</span>
        </div>
      </div>

      {/* Activity cards */}
      <div className="flex-1 space-y-3">
        {activities.map((activity, i) => (
          <div
            key={i}
            className={`p-3 rounded-xl bg-[#111] border border-[#222] transition-all duration-500 ${
              step >= i + 1 ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'
            }`}
            style={{ transitionDelay: `${i * 150}ms` }}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#00ff88]/30 to-[#00ff88]/10 flex items-center justify-center text-sm">
                {activity.type === 'checkin' && '📍'}
                {activity.type === 'review' && '⭐'}
                {activity.type === 'like' && '❤️'}
              </div>
              <div className="flex-1">
                <div className="text-white text-sm">
                  <span className="text-[#00ff88]">{activity.user}</span>
                  {' '}checked in at{' '}
                  <span className="text-white">{activity.business}</span>
                </div>
                <div className="text-[#666] text-xs">{activity.time}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Engagement stats */}
      <div className={`flex justify-around pt-4 border-t border-[#222] transition-all duration-500 ${
        step >= 3 ? 'opacity-100' : 'opacity-0'
      }`}>
        <div className="text-center">
          <div className="text-[#00ff88] font-bold">2.4k</div>
          <div className="text-[#666] text-xs">active users</div>
        </div>
        <div className="text-center">
          <div className="text-white font-bold">847</div>
          <div className="text-[#666] text-xs">check-ins today</div>
        </div>
        <div className="text-center">
          <div className="text-[#00ff88] font-bold">98%</div>
          <div className="text-[#666] text-xs">verified</div>
        </div>
      </div>
    </div>
  )
}

export function FeatureShowcase() {
  const { ref, isVisible } = useScrollReveal()

  const features = [
    {
      title: "One-tap verified check-ins",
      description: "Real visits, real trust.",
      demoType: "checkin" as const
    },
    {
      title: "Trust scores that matter",
      description: "Ranked by community engagement.",
      demoType: "trust" as const
    },
    {
      title: "Live local activity",
      description: "See what's happening now.",
      demoType: "community" as const
    }
  ]

  return (
    <section className="relative bg-[#050505] py-32 overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0">
        {/* Subtle gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a] via-[#050505] to-[#050505]" />

        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-30" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(0,255,136,0.03) 1px, transparent 0)`,
          backgroundSize: '48px 48px'
        }} />

        {/* Glow orbs */}
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-[#00ff88] opacity-[0.02] blur-[150px] rounded-full" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-[#00ff88] opacity-[0.03] blur-[120px] rounded-full" />
      </div>

      <div ref={ref} className="relative z-10 max-w-7xl mx-auto px-6">
        {/* Header */}
        <div className={`text-center mb-20 transition-all duration-1000 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}>

          <h2 className="text-5xl md:text-7xl font-bold text-white mb-6 tracking-tight">
            Built for <span className="text-[#00ff88]">local trust</span>
          </h2>
        </div>

        {/* Feature cards side by side */}
        <div className="grid md:grid-cols-3 gap-8">
          {features.map((feature, i) => (
            <div
              key={i}
              className={`transition-all duration-700 ${
                isVisible
                  ? 'opacity-100 translate-y-0'
                  : 'opacity-0 translate-y-12'
              }`}
              style={{ transitionDelay: `${i * 150}ms` }}
            >
              {/* Demo card */}
              <AnimatedDemo type={feature.demoType} />

              {/* Title and description below */}
              <div className="mt-6">
                <h3 className="text-xl font-bold text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-[#666]">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}