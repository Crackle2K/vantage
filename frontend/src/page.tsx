import { useState, useEffect, useRef } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { NeuralNetwork } from "@/components/NeuralNetwork"
import {
  MapPin, Store, TrendingUp, Star, Search, Tag, ArrowRight,
  Shield, Zap, Users, ChevronRight,
} from "lucide-react"

/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Scroll-reveal hook ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */
function useScrollReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect() } },
      { threshold }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return { ref, visible }
}

/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Scroll Y tracker for parallax ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */
function useScrollY() {
  const [y, setY] = useState(0)
  useEffect(() => {
    let raf = 0
    const handler = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setY(window.scrollY))
    }
    window.addEventListener("scroll", handler, { passive: true })
    return () => { window.removeEventListener("scroll", handler); cancelAnimationFrame(raf) }
  }, [])
  return y
}

export default function HomePage() {
  const navigate = useNavigate()
  const scrollY = useScrollY()
  const [hoveredFeature, setHoveredFeature] = useState<number | null>(null)

  const featuresReveal = useScrollReveal()
  const stepsReveal = useScrollReveal()
  const ctaReveal = useScrollReveal()

  const features = [
    { icon: MapPin,     title: "Location Discovery",  description: "Find businesses near you with precise geolocation and customizable search radius.", gradient: "from-[#4ade80] to-[#22c55e]" },
    { icon: Star,       title: "Trusted Reviews",      description: "Read authentic ratings and reviews from verified customers in your community.",      gradient: "from-[#052e16] to-[#4ade80]" },
    { icon: Tag,        title: "Exclusive Deals",      description: "Access special offers, discounts, and coupon codes from your favorite local spots.", gradient: "from-[#4ade80] to-[#22c55e]" },
    { icon: TrendingUp, title: "Business Analytics",   description: "Business owners get real-time insights on engagement, views, and growth.",            gradient: "from-[#052e16] to-[#22c55e]" },
  ]

  const steps = [
    { num: "01", icon: MapPin, title: "Set Your Location", desc: "Allow location access or manually set your city and preferred search radius." },
    { num: "02", icon: Search, title: "Browse & Filter",   desc: "Explore businesses by category, rating, distance, and special deals available." },
    { num: "03", icon: Star,   title: "Review & Save",     desc: "Write reviews, bookmark favorites, and grab exclusive deals and offers." },
  ]

  const stats = [
    { value: "1,200+", label: "Local Businesses", icon: Store },
    { value: "50+",    label: "Cities Covered",   icon: MapPin },
    { value: "15K+",   label: "Happy Users",      icon: Users },
    { value: "8K+",    label: "Reviews Written",   icon: Star },
  ]

  return (
    <div className="overflow-hidden">
      {/* ÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚Â HERO ÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚Â */}
      <section className="relative min-h-[92vh] flex items-center overflow-hidden bg-[hsl(var(--background))]">
        {/* Parallax background layers */}
        <div
          className="absolute inset-0 gradient-mesh parallax-layer"
          style={{ transform: `translateY(${scrollY * 0.25}px)` }}
        />
        <div
          className="absolute top-20 left-[8%] w-[500px] h-[500px] bg-[#4ade80]/[0.06] rounded-full blur-3xl parallax-layer"
          style={{ transform: `translateY(${scrollY * 0.35}px)` }}
        />
        <div
          className="absolute bottom-20 right-[8%] w-[400px] h-[400px] bg-[#052e16]/[0.04] rounded-full blur-3xl parallax-layer"
          style={{ transform: `translateY(${scrollY * 0.2}px)` }}
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-16 lg:py-24 w-full">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Left: Copy ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
            <div className="order-2 lg:order-1 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-8 rounded-full bg-[#4ade80]/30 dark:bg-[#4ade80]/25 text-[#22c55e] dark:text-[#4ade80] text-sm font-medium animate-fade-in border border-[#4ade80]/40">
                <Zap className="w-3.5 h-3.5" />
                <span className="font-mono text-xs tracking-wide uppercase">Your community, one tap away</span>
              </div>

              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6 animate-fade-in-up font-heading leading-[1.08]">
                <span className="!text-[#003d26] dark:!text-white">Discover </span>
                <span className="font-serif !text-[#003d26] dark:!text-white">Local</span>
                <br />
                <span className="!text-[#003d26] dark:!text-white">Businesses That </span>
                <span className="gradient-text font-serif">Matter</span>
              </h1>

              <p className="text-lg sm:text-xl text-[#2d5a47] dark:text-slate-400 max-w-xl mx-auto lg:mx-0 mb-10 leading-relaxed animate-fade-in-up" style={{ animationDelay: "0.15s" }}>
                Connect with incredible local businesses near you. Browse deals,
                read real reviews, and support the heart of your community.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start animate-fade-in-up" style={{ animationDelay: "0.3s" }}>
                <Button
                  size="lg"
                  className="text-base px-8 py-6 gradient-primary text-white border-0 shadow-lg shadow-[#22c55e]/30 hover:shadow-xl hover:shadow-[#22c55e]/50 transition-all duration-300 hover:-translate-y-1 rounded-xl btn-lift font-semibold"
                  onClick={() => navigate("/businesses")}
                >
                  <Search className="w-5 h-5 mr-2" />
                  Explore Now
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="text-base px-8 py-6 border-2 border-[#052e16]/15 dark:border-slate-700 hover:border-[#4ade80] hover:bg-[#4ade80]/10 transition-all duration-300 rounded-xl text-[#052e16] dark:text-white font-semibold"
                  onClick={() => navigate("/signup")}
                >
                  <Store className="w-5 h-5 mr-2" />
                  List Your Business
                </Button>
              </div>
            </div>

            {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Right: Canvas Neural Network ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
            <div className="order-1 lg:order-2 flex items-center justify-center relative animate-fade-in" style={{ animationDelay: "0.2s" }}>
              <div
                className="w-[380px] h-[380px] sm:w-[480px] sm:h-[480px] lg:w-[580px] lg:h-[580px] parallax-layer"
                style={{ transform: `translateY(${scrollY * 0.08}px)` }}
              >
                <NeuralNetwork />
              </div>
            </div>
          </div>

          {/* Stats row with parallax */}
          <div
            className="mt-20 grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-children parallax-layer"
            style={{ transform: `translateY(${scrollY * -0.04}px)` }}
          >
            {stats.map((stat) => {
              const Icon = stat.icon
              return (
                <div key={stat.label} className="glass-card rounded-2xl p-5 text-center hover:scale-[1.03] transition-transform duration-300">
                  <Icon className="w-5 h-5 text-[#22c55e] dark:text-[#22c55e] mx-auto mb-2" />
                  <div className="text-2xl sm:text-3xl font-bold text-[hsl(var(--foreground))] font-mono tracking-tight">{stat.value}</div>
                  <div className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">{stat.label}</div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚Â FEATURES (scroll-reveal) ÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚Â */}
      <section className="py-24 bg-white dark:bg-slate-900/50">
        <div
          ref={featuresReveal.ref}
          className={`max-w-7xl mx-auto px-4 sm:px-6 transition-all duration-1000 ${featuresReveal.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-16"}`}
        >
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#4ade80]/30 dark:bg-[#4ade80]/25 text-[#22c55e] dark:text-[#4ade80] text-xs font-semibold mb-4 border border-[#4ade80]/40 font-mono uppercase tracking-wider">
              <Shield className="w-3 h-3" />
              Why Vantage?
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 dark:text-white mb-4 font-heading">
              Everything you <span className="font-serif">need</span>
            </h2>
            <p className="text-lg text-slate-700 dark:text-slate-300 max-w-2xl mx-auto">
              Powerful tools to discover, connect with, and support local businesses
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feat, i) => {
              const Icon = feat.icon
              return (
                <div
                  key={i}
                  className="group relative"
                  style={{ transitionDelay: `${i * 100}ms` }}
                  onMouseEnter={() => setHoveredFeature(i)}
                  onMouseLeave={() => setHoveredFeature(null)}
                >
                  <div
                    className={`
                      p-6 rounded-2xl border bg-white dark:bg-[#22c55e]/10 dark:border-[#4ade80]/30
                      transition-all duration-500 cursor-pointer h-full
                      ${hoveredFeature === i
                        ? "shadow-xl -translate-y-2 border-[#4ade80]/60 dark:border-[#4ade80]/50 scale-[1.02]"
                        : "border-[#4ade80]/25 dark:border-[hsl(var(--border))] shadow-sm hover:shadow-md"}
                    `}
                  >
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feat.gradient} flex items-center justify-center mb-5 shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-500`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2 font-sub">{feat.title}</h3>
                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{feat.description}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚Â HOW IT WORKS (scroll-reveal + parallax) ÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚Â */}
      <section className="py-24 gradient-mesh relative overflow-hidden">
        {/* Subtle parallax background decoration */}
        <div
          className="absolute -top-32 right-[15%] w-[300px] h-[300px] bg-[#4ade80]/[0.05] rounded-full blur-3xl parallax-layer pointer-events-none"
          style={{ transform: `translateY(${Math.max(0, scrollY - 600) * 0.15}px)` }}
        />
        <div
          ref={stepsReveal.ref}
          className={`max-w-5xl mx-auto px-4 sm:px-6 transition-all duration-1000 relative ${stepsReveal.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-16"}`}
        >
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[hsl(var(--foreground))] mb-4 font-heading">
              Three <span className="font-serif">simple</span> steps
            </h2>
            <p className="text-lg text-[hsl(var(--muted-foreground))] max-w-2xl mx-auto">
              Get started in under a minute
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((step, i) => {
              const Icon = step.icon
              return (
                <div
                  key={i}
                  className="relative text-center group"
                  style={{ transitionDelay: `${i * 150}ms` }}
                >
                  {i < steps.length - 1 && (
                    <div className="hidden md:block absolute top-12 left-[60%] w-[80%] h-px border-t-2 border-dashed border-[hsl(var(--border))]" />
                  )}
                  <div className="relative inline-flex mb-6">
                    <div className="w-24 h-24 rounded-2xl bg-white dark:bg-slate-800 border border-[hsl(var(--border))] shadow-lg flex items-center justify-center group-hover:-translate-y-2 group-hover:shadow-xl transition-all duration-500">
                      <Icon className="w-10 h-10 text-[#22c55e] dark:text-[#22c55e]" />
                    </div>
                    <span className="absolute -top-2 -right-2 w-8 h-8 rounded-full gradient-primary text-white text-sm font-bold flex items-center justify-center shadow-md font-mono">
                      {step.num}
                    </span>
                  </div>
                  <h3 className="text-xl font-semibold text-[hsl(var(--foreground))] mb-2 font-sub">{step.title}</h3>
                  <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">{step.desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚Â CTA (scroll-reveal) ÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚ÂÃƒÂ¢Ã¢â‚¬Â¢Ã‚Â */}
      <section className="py-24">
        <div
          ref={ctaReveal.ref}
          className={`max-w-4xl mx-auto px-4 sm:px-6 transition-all duration-1000 ${ctaReveal.visible ? "opacity-100 scale-100" : "opacity-0 scale-95"}`}
        >
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#4ade80] via-[#22c55e] to-[#052e16] p-10 sm:p-16 text-center shadow-2xl shadow-[#22c55e]/25">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/3 animate-float" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/3 -translate-x-1/4 animate-float animation-delay-2000" />

            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4 font-heading text-glow">
                Ready to explore your <span className="font-serif">city</span>?
              </h2>
              <p className="text-lg text-white/85 mb-8 max-w-xl mx-auto text-shadow-sm">
                Join thousands of users discovering amazing businesses, exclusive deals, and vibrant local communities.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  size="lg"
                  className="bg-white text-[#052e16] hover:bg-white/90 px-8 py-6 text-base font-semibold rounded-xl shadow-lg hover:-translate-y-0.5 transition-all duration-300"
                  onClick={() => navigate("/signup")}
                >
                  Get Started Free
                  <ChevronRight className="w-5 h-5 ml-1" />
                </Button>
                <Link to="/businesses">
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-2 border-white/30 text-white hover:bg-white/10 px-8 py-6 text-base rounded-xl transition-all duration-300 bg-transparent"
                  >
                    Browse Businesses
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
