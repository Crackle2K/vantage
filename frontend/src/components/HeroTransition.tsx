import { useEffect, useRef, useState } from "react"
import { gsap } from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

// ─── Types ────────────────────────────────────────────────────────────────────

interface FeatureCard {
  name: string
  description: string
  image: string
}

// ─── Video Component ──────────────────────────────────────────────────────────

function CyclingVideo({ sources, posterSrc }: { sources: string[]; posterSrc: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isLoaded, setIsLoaded] = useState(false)
  const [isFading, setIsFading] = useState(false)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    setHasError(false)
    setIsLoaded(false)
    setIsFading(false)
    videoRef.current?.load()
  }, [currentIndex])

  if (hasError) {
    return (
      <img
        src={posterSrc}
        alt="Hero background"
        className="absolute inset-0 h-full w-full object-cover"
      />
    )
  }

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      preload="auto"
      onTimeUpdate={() => {
        const v = videoRef.current
        if (v?.duration && v.duration - v.currentTime <= 0.5 && !isFading) {
          setIsFading(true)
        }
      }}
      onEnded={() => {
        setCurrentIndex((p) => (p + 1) % sources.length)
        setTimeout(() => setIsFading(false), 50)
      }}
      onLoadedData={() => setIsLoaded(true)}
      onError={() => setHasError(true)}
      className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
        isFading || !isLoaded ? "opacity-0" : "opacity-100"
      }`}
    >
      <source src={sources[currentIndex]} type="video/mp4" />
    </video>
  )
}

// ─── Feature card (side slots) ────────────────────────────────────────────────

function SideCard({ card }: { card: FeatureCard }) {
  return (
    <div
      className="relative overflow-hidden rounded-[22px] aspect-4/5 min-h-80"
      style={{ boxShadow: "0 22px 48px -28px hsl(var(--shadow-soft) / 0.82)" }}
    >
      <img
        src={card.image}
        alt={card.name}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-black/70 via-black/20 to-transparent" />
      <div className="absolute bottom-0 inset-x-0 px-4 pb-4">
        <p className="font-semibold leading-tight text-white text-[1.1rem] font-heading">
          {card.name}
        </p>
        <p className="text-caption text-white/75 mt-0.5 line-clamp-2">{card.description}</p>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

const VIDEO_SOURCES = ["/videos/hero1.mp4", "/videos/hero2.mp4", "/videos/hero3.mp4"]
const POSTER = "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4"

const LEFT_CARD: FeatureCard = {
  name: "Verified Trust",
  description: "Credibility-weighted rankings with real check-ins",
  image: "/Images/Explore.png",
}

const RIGHT_CARD: FeatureCard = {
  name: "Claim & Convert",
  description: "Turn discovery into real foot traffic",
  image: "/Images/Pricing.png",
}

export function HeroTransition() {

  // ── Refs ──────────────────────────────────────────────────────────────────
  const outerRef    = useRef<HTMLDivElement>(null) // 250vh scroll container
  const videoWrapRef = useRef<HTMLDivElement>(null) // clip-path target
  const scrimRef    = useRef<HTMLDivElement>(null) // gradient overlay fades out
  const textTopRef  = useRef<HTMLDivElement>(null) // line 1 — slides right
  const textBotRef  = useRef<HTMLDivElement>(null) // line 2 — slides left
  const cardLeftRef = useRef<HTMLDivElement>(null)
  const cardRightRef = useRef<HTMLDivElement>(null)
  const centerLabelRef = useRef<HTMLDivElement>(null) // label inside video wrapper
  const centerCardRef  = useRef<HTMLDivElement>(null) // measures clip-path target
  const bgRef       = useRef<HTMLDivElement>(null) // page-bg colour layer

  // ── Mobile check ──────────────────────────────────────────────────────────
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  )
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  // ── Clip-path calculator ──────────────────────────────────────────────────
  function buildEndClip(): string {
    const card = centerCardRef.current
    if (!card) return "inset(10% 33% 10% 33% round 22px)"
    const rect = card.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const t = ((rect.top    / vh) * 100).toFixed(3)
    const r = (((vw - rect.right)  / vw) * 100).toFixed(3)
    const b = (((vh - rect.bottom) / vh) * 100).toFixed(3)
    const l = ((rect.left   / vw) * 100).toFixed(3)
    return `inset(${t}% ${r}% ${b}% ${l}% round 22px)`
  }

  // ── GSAP animation builder ─────────────────────────────────────────────────
  // Extracted so the resize handler can tear down and rebuild cleanly.
  function buildAnimation() {
    // ── Initial states (set BEFORE ScrollTrigger scrub has any chance to run)
    gsap.set(videoWrapRef.current,  { clipPath: "inset(0% 0% 0% 0% round 0px)" })
    gsap.set(cardLeftRef.current,   { x: "-15%", opacity: 0 })
    gsap.set(cardRightRef.current,  { x: "15%",  opacity: 0 })
    gsap.set(centerLabelRef.current,{ opacity: 0 })
    gsap.set(bgRef.current,         { opacity: 0 })
    gsap.set(textTopRef.current,    { x: 0 })
    gsap.set(textBotRef.current,    { x: 0 })

    // Measure the clip endpoint now that DOM is laid out
    const endClip = buildEndClip()

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: outerRef.current,
        start: "top top",
        end: "bottom bottom",
        scrub: 1.2,
      },
    })

    // Phase 1 (0 → 0.35): text splits — top right, bottom left; scrim fades
    tl.to(textTopRef.current,  { x: "120vw",  ease: "power2.inOut", duration: 0.35 }, 0)
    tl.to(textBotRef.current,  { x: "-120vw", ease: "power2.inOut", duration: 0.35 }, 0)
    tl.to(scrimRef.current,    { opacity: 0,  ease: "none",         duration: 0.30 }, 0)

    // Phase 2 (0.15 → 0.72): video collapses into center card; page bg reveals
    tl.to(videoWrapRef.current,
      { clipPath: endClip, ease: "power3.inOut", duration: 0.57 }, 0.15)
    tl.to(bgRef.current,
      { opacity: 1, ease: "none", duration: 0.57 }, 0.15)

    // Phase 3 (0.52 → 0.80): side cards slide in
    tl.to(cardLeftRef.current,
      { x: "0%", opacity: 1, ease: "power2.out", duration: 0.28 }, 0.52)
    tl.to(cardRightRef.current,
      { x: "0%", opacity: 1, ease: "power2.out", duration: 0.28 }, 0.52)

    // Phase 4 (0.72 → 0.90): center card label fades in
    tl.to(centerLabelRef.current,
      { opacity: 1, ease: "none", duration: 0.18 }, 0.72)
  }

  // ── GSAP effect — mount + debounced resize rebuild ────────────────────────
  useEffect(() => {
    if (isMobile) return

    let ctx = gsap.context(buildAnimation, outerRef)
    ScrollTrigger.refresh()

    let resizeTimer: ReturnType<typeof setTimeout>
    const onResize = () => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        ctx.revert()
        ctx = gsap.context(buildAnimation, outerRef)
        ScrollTrigger.refresh()
      }, 250)
    }

    window.addEventListener("resize", onResize)
    return () => {
      ctx.revert()
      window.removeEventListener("resize", onResize)
      clearTimeout(resizeTimer)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile])

  // ── Mobile render ─────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <section className="relative bg-surface">
        <div className="relative h-[55vh] overflow-hidden">
          <img
            src={POSTER}
            alt="Hero background"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.42) 45%, transparent 80%)" }}
          />
          <div className="absolute inset-x-0 bottom-0 px-6 pb-10">
            <h1 className="text-[2.4rem] leading-tight font-bold text-white font-heading">
              Powered by people.<br />
              Proven by presence.
            </h1>
          </div>
        </div>
        <div className="px-4 py-12 flex flex-col gap-6">
          <SideCard card={LEFT_CARD} />
          <div
            className="relative overflow-hidden rounded-[22px] aspect-4/5 min-h-80"
            style={{ boxShadow: "0 22px 48px -28px hsl(var(--shadow-soft) / 0.82)" }}
          >
            <img src={POSTER} alt="Explore Vantage" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-black/70 via-black/20 to-transparent" />
            <div className="absolute bottom-0 inset-x-0 px-4 pb-4">
              <p className="font-semibold text-white text-[1.1rem] font-heading">Explore Vantage</p>
              <p className="text-caption text-white/75 mt-0.5">Your next local discovery</p>
            </div>
          </div>
          <SideCard card={RIGHT_CARD} />
        </div>
      </section>
    )
  }

  // ── Desktop render ────────────────────────────────────────────────────────
  return (
    // Outer: 250vh provides the scroll distance for the pinned animation
    <div ref={outerRef} style={{ height: "250vh", position: "relative" }}>

      {/* Sticky viewport — stays fixed in place for all 250vh of scroll */}
      <div style={{ position: "sticky", top: 0, height: "100vh", overflow: "hidden" }}>

        {/* Layer 0 — page background colour (opacity 0→1 as video collapses) */}
        <div
          ref={bgRef}
          className="absolute inset-0"
          style={{ backgroundColor: "hsl(var(--background))", opacity: 0, zIndex: 0 }}
        />

        {/* Layer 1 — cards grid, always at final resting position */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ zIndex: 1 }}
        >
          <div className="w-full max-w-5xl px-8 grid grid-cols-3 gap-6 items-end">

            {/* Left card — starts offset left, fades in */}
            <div ref={cardLeftRef}>
              <SideCard card={LEFT_CARD} />
            </div>

            {/* Center card — measurement target for clip-path; raised 40px */}
            <div
              ref={centerCardRef}
              className="relative rounded-[22px] aspect-4/5 min-h-80 bg-black/10"
              style={{ transform: "translateY(-40px)" }}
            />

            {/* Right card — starts offset right, fades in */}
            <div ref={cardRightRef}>
              <SideCard card={RIGHT_CARD} />
            </div>

          </div>
        </div>

        {/* Layer 2 — video wrapper; clip-path animates from fullscreen → card slot */}
        <div
          ref={videoWrapRef}
          className="absolute inset-0"
          style={{ zIndex: 10, clipPath: "inset(0% 0% 0% 0% round 0px)" }}
        >
          {/* solid black bg so clip edges look clean during transition */}
          <div className="absolute inset-0 bg-black" />
          <CyclingVideo sources={VIDEO_SOURCES} posterSrc={POSTER} />

          {/* Center card label — lives inside the video wrapper so it clips with it */}
          <div
            ref={centerLabelRef}
            className="absolute inset-x-0 bottom-0"
            style={{ opacity: 0, zIndex: 20 }}
          >
            <div className="absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-black/70 via-black/20 to-transparent" />
            <div className="absolute bottom-0 inset-x-0 px-4 pb-4">
              <p className="font-semibold text-white text-[1.1rem] font-heading leading-tight">
                Explore Vantage
              </p>
              <p className="text-caption text-white/75 mt-0.5">Your next local discovery</p>
            </div>
          </div>
        </div>

        {/* Layer 3 — gradient scrim; fades out as text departs */}
        <div
          ref={scrimRef}
          className="absolute inset-0"
          style={{
            zIndex: 20,
            background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.42) 45%, transparent 80%)",
          }}
        />

        {/* Layer 4 — stacked text block, lower-left; each line splits on scroll */}
        <div
          className="absolute bottom-1/3 left-0 w-full px-8 sm:px-12 lg:px-16"
          style={{ zIndex: 30 }}
        >
          {/* Line 1 — slides RIGHT */}
          <div ref={textTopRef}>
            <h1 className="text-[3.5rem] md:text-[5rem] lg:text-[6rem] leading-none font-bold text-white font-heading">
              Powered by people.
            </h1>
          </div>

          {/* Line 2 — slides LEFT */}
          <div ref={textBotRef}>
            <h1 className="text-[3.5rem] md:text-[5rem] lg:text-[6rem] leading-none font-bold text-white font-heading">
              Proven by presence.
            </h1>
          </div>
        </div>

      </div>
    </div>
  )
}
