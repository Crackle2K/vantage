import { useEffect, useRef, useState } from "react"
import { gsap } from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

/**
 * HeroTransition Component
 *
 * A scroll-triggered hero animation that transitions from full-screen video
 * to an iPhone-shaped card, followed by a final content reveal stage.
 *
 * Animation Flow:
 * 1. Full-screen video with text overlay
 * 2. Text splits apart as user scrolls
 * 3. Video collapses into iPhone-shaped card
 * 4. Final stage fades in with title, description, and floating posts
 *
 * Layout:
 * - Left: Large title text
 * - Center: iPhone-shaped card (from transition)
 * - Right: Description + CTA button
 * - Floating posts: Positioned at edges, scroll with page flow
 */

// ─── Type Definitions ────────────────────────────────────────────────────────

interface FeatureCard {
  name: string
  description: string
  image: string
}


// ─── Video Component ──────────────────────────────────────────────────────────

/**
 * CyclingVideo - Loops through multiple video sources with smooth transitions
 */
function CyclingVideo({ sources, posterSrc }: { sources: string[]; posterSrc: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isLoaded, setIsLoaded] = useState(false)
  const [isFading, setIsFading] = useState(false)
  const [hasError, setHasError] = useState(false)

  // Reset state when video source changes
  useEffect(() => {
    setHasError(false)
    setIsLoaded(false)
    setIsFading(false)
    videoRef.current?.load()
  }, [currentIndex])

  // Fallback to poster image if video fails to load
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
        // Start fade 0.5s before video ends
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

// ─── Feature Card Component ────────────────────────────────────────────────────

/**
 * SideCard - Mobile feature card with overlay text
 * Used in mobile view for displaying feature cards
 */
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

// ─── Constants ────────────────────────────────────────────────────────────────

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

// ─── Photobooth Strip Constants ───────────────────────────────────────────────

const PHOTOBOOTH_IMAGES = [
  "/Images/dineencoffeeco.webp",
  "/Images/laperlasalon&spa.webp",
  "/Images/volosgreekcuisine.webp",
]

function makeStrip(offset: number, count = 12, step = 1): string[] {
  const imageCount = PHOTOBOOTH_IMAGES.length
  return Array.from({ length: count }, (_, i) => {
    const index = ((offset + i * step) % imageCount + imageCount) % imageCount
    return PHOTOBOOTH_IMAGES[index]
  })
}

const STRIP_A = makeStrip(0)
const STRIP_B = makeStrip(0, 12, -1)
const STRIP_C = makeStrip(1)
const STRIP_D = makeStrip(2, 12, -1)

// ─── Photobooth Strip Sub-Component ──────────────────────────────────────────

function PhotoStrip({
  images,
  stripRef,
  style,
}: {
  images: string[]
  stripRef: React.RefObject<HTMLDivElement | null>
  style: React.CSSProperties
}) {
  return (
    <div
      ref={stripRef}
      style={{
        pointerEvents: "none",
        overflow: "visible",
        ...style,
      }}
    >
      {images.map((src, i) => (
        <div
          key={i}
          style={{
            width: "190px",
            height: "190px",
            borderRadius: "20px",
            overflow: "hidden",
            marginBottom: "28px",
            boxShadow: "0 6px 24px rgba(0,0,0,0.12)",
          }}
        >
          <img
            src={src}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </div>
      ))}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function HeroTransition() {

  // ── Refs ──────────────────────────────────────────────────────────────────
  const outerRef = useRef<HTMLDivElement>(null) // 680vh scroll container
  const videoWrapRef = useRef<HTMLDivElement>(null) // Video wrapper for clip-path animation
  const textTopRef = useRef<HTMLDivElement>(null) // Top text line
  const textBotRef = useRef<HTMLDivElement>(null) // Bottom text line
  const centerLabelRef = useRef<HTMLDivElement>(null) // Label inside collapsed video
  const centerCardRef = useRef<HTMLDivElement>(null) // Measurement target for clip-path
  const bgRef = useRef<HTMLDivElement>(null) // Page background color layer
  const finalStageRef = useRef<HTMLDivElement>(null) // Final content container
  const leftContentRef = useRef<HTMLDivElement>(null) // Left title content
  const rightContentRef = useRef<HTMLDivElement>(null) // Right description content

  // Photobooth strip refs
  const stripARef = useRef<HTMLDivElement>(null) // Leftmost column
  const stripBRef = useRef<HTMLDivElement>(null) // Second-from-left column
  const stripCRef = useRef<HTMLDivElement>(null) // Second-from-right column
  const stripDRef = useRef<HTMLDivElement>(null) // Rightmost column

  // ── Mobile Detection ───────────────────────────────────────────────────────
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  )

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  /**
   * Calculates the final clip-path that shrinks the video to iPhone card dimensions
   * @returns CSS clip-path string with inset values
   */
  function buildEndClip(): string {
    const card = centerCardRef.current
    if (!card) return "inset(10% 33% 10% 33% round 44px)"

    const rect = card.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    // Calculate inset percentages based on card position
    const t = ((rect.top / vh) * 100).toFixed(3)
    const r = (((vw - rect.right) / vw) * 100).toFixed(3)
    const b = (((vh - rect.bottom) / vh) * 100).toFixed(3)
    const l = ((rect.left / vw) * 100).toFixed(3)

    return `inset(${t}% ${r}% ${b}% ${l}% round 44px)`
  }

  /**
   * Builds the GSAP scroll-triggered animation timeline
   *
   * Animation phases:
   * Phase 1 (0-35%): Text splits apart
   * Phase 2 (15-65%): Video collapses into iPhone shape
   * Phase 3 (65-80%): Center card label fades in
   * Phase 4 (80-100%): Final stage content reveals
   */
  function buildAnimation() {
    // Set initial states
    gsap.set(videoWrapRef.current, { clipPath: "inset(0% 0% 0% 0% round 0px)" })
    gsap.set(centerLabelRef.current,{ opacity: 0 })
    gsap.set(bgRef.current, { opacity: 0 })
    gsap.set(textTopRef.current, { x: 0 })
    gsap.set(textBotRef.current, { x: 0 })
    gsap.set(finalStageRef.current, { opacity: 0 })
    gsap.set(leftContentRef.current, { opacity: 0, y: 30 })
    gsap.set(rightContentRef.current, { opacity: 0, y: 30 })
    // Photo strips — start invisible, positioned for scroll
    gsap.set(stripARef.current, { y: 0, opacity: 0 })
    gsap.set(stripBRef.current, { y: -310, opacity: 0 })
    gsap.set(stripCRef.current, { y: -155, opacity: 0 })
    gsap.set(stripDRef.current, { y: -465, opacity: 0 })

    const endClip = buildEndClip()

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: outerRef.current,
        start: "top top",
        end: "bottom bottom",
        scrub: 1.2,
      },
    })

    // Phase 1: Text splits apart
    tl.to(textTopRef.current, { x: "120vw", ease: "power2.inOut", duration: 0.35 }, 0)
    tl.to(textBotRef.current, { x: "-120vw", ease: "power2.inOut", duration: 0.35 }, 0)

    // Phase 2: Video collapses to iPhone shape
    tl.to(videoWrapRef.current,
      { clipPath: endClip, ease: "power3.inOut", duration: 0.50 }, 0.15)
    tl.to(bgRef.current,
      { opacity: 1, ease: "none", duration: 0.50 }, 0.15)

    // Phase 3: Center card label appears
    tl.to(centerLabelRef.current,
      { opacity: 1, ease: "none", duration: 0.15 }, 0.65)

    // Phase 4: Final stage content reveals
    tl.to(finalStageRef.current,
      { opacity: 1, ease: "power2.out", duration: 0.20 }, 0.80)
    tl.to(leftContentRef.current,
      { opacity: 1, y: 0, ease: "power3.out", duration: 0.15 }, 0.82)
    tl.to(rightContentRef.current,
      { opacity: 1, y: 0, ease: "power3.out", duration: 0.15 }, 0.85)

    // Photo strips — fade in once clip-path starts revealing the flanks (at ~25%)
    tl.to(stripARef.current, { opacity: 1, ease: "power2.out", duration: 0.12 }, 0.25)
    tl.to(stripBRef.current, { opacity: 1, ease: "power2.out", duration: 0.12 }, 0.28)
    tl.to(stripCRef.current, { opacity: 1, ease: "power2.out", duration: 0.12 }, 0.26)
    tl.to(stripDRef.current, { opacity: 1, ease: "power2.out", duration: 0.12 }, 0.27)

    // Photo strip scroll — starts at 0.25, outer strips faster, inner strips slower
    tl.to(stripARef.current, { y: -2600, ease: "none", duration: 0.75 }, 0.25) // outer left — fast
    tl.to(stripBRef.current, { y: -2100, ease: "none", duration: 0.75 }, 0.25) // inner left — slow
    tl.to(stripCRef.current, { y: -2000, ease: "none", duration: 0.75 }, 0.25) // inner right — slow
    tl.to(stripDRef.current, { y: -2800, ease: "none", duration: 0.75 }, 0.25) // outer right — fast

    // Hold the final frame — empty tween extends timeline so scrub dwells here
    tl.to({}, { duration: 0.25 }, 1)
  }

  // ── Animation Setup & Resize Handler ───────────────────────────────────────
  useEffect(() => {
    if (isMobile) return

    let ctx = gsap.context(buildAnimation, outerRef)
    ScrollTrigger.refresh()

    // Rebuild animation on resize (debounced)
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

  // ── Mobile Render ───────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <section className="relative bg-surface" style={{ marginTop: "-80px" }}>
        <div className="relative h-[65vh] overflow-hidden">
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

  // ── Desktop Render ──────────────────────────────────────────────────────────
  return (
    <div ref={outerRef} style={{ height: "680vh", position: "relative", marginTop: "-96px" }}>

      {/* Sticky viewport - remains fixed during scroll */}
      <div style={{ position: "sticky", top: 0, height: "100vh", overflow: "hidden" }}>

        {/* Background layer - fades in as video collapses */}
        <div
          ref={bgRef}
          className="absolute inset-0"
          style={{ backgroundColor: "hsl(var(--background))", opacity: 0, zIndex: 0 }}
        />

        {/* Photobooth strips — z:5, hidden behind full-screen video, revealed as clip-path shrinks */}
        <PhotoStrip
          images={STRIP_A}
          stripRef={stripARef}
          style={{ position: "absolute", top: "-120vh", left: "20px", width: "180px", zIndex: 5 }}
        />
        <PhotoStrip
          images={STRIP_B}
          stripRef={stripBRef}
          style={{ position: "absolute", top: "-120vh", left: "350px", width: "180px", zIndex: 5 }}
        />
        <PhotoStrip
          images={STRIP_C}
          stripRef={stripCRef}
          style={{ position: "absolute", top: "-120vh", right: "350px", width: "180px", zIndex: 5 }}
        />
        <PhotoStrip
          images={STRIP_D}
          stripRef={stripDRef}
          style={{ position: "absolute", top: "-120vh", right: "20px", width: "180px", zIndex: 5 }}
        />

        {/* Measurement target for clip-path calculation */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ zIndex: 1 }}
        >
          <div
            ref={centerCardRef}
            className="relative aspect-[9/16] h-[700px]"
          />
        </div>

        {/* Video wrapper - clip-path animates from full-screen to iPhone shape */}
        <div
          ref={videoWrapRef}
          className="absolute inset-0"
          style={{ zIndex: 10, clipPath: "inset(0% 0% 0% 0% round 0px)" }}
        >
          <CyclingVideo sources={VIDEO_SOURCES} posterSrc={POSTER} />

          {/* Label inside collapsed video card */}
          <div
            ref={centerLabelRef}
            className="absolute inset-x-0 bottom-0"
            style={{ opacity: 0, zIndex: 20 }}
          >
            <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
            <div className="absolute bottom-0 inset-x-0 px-6 pb-6">
              <p className="font-semibold text-white text-lg font-heading leading-tight">
                Explore Vantage
              </p>
              <p className="text-sm text-white/70 mt-1">Your next local discovery</p>
            </div>
          </div>
        </div>

        {/* Gradient scrim overlay removed — clean video on load */}

        {/* Hero text - splits apart on scroll */}
        <div
          className="absolute bottom-1/3 left-0 w-full px-8 sm:px-12 lg:px-16"
          style={{ zIndex: 30 }}
        >
          <div ref={textTopRef}>
            <h1 className="text-[2.5rem] sm:text-[3.5rem] md:text-[5rem] lg:text-[6rem] leading-none font-bold text-white font-heading">
              Powered by people.
            </h1>
          </div>

          <div ref={textBotRef}>
            <h1 className="text-[2.5rem] sm:text-[3.5rem] md:text-[5rem] lg:text-[6rem] leading-none font-bold text-white font-heading">
              Proven by presence.
            </h1>
          </div>
        </div>

        {/* Final stage - title and description */}
        <div
          ref={finalStageRef}
          className="absolute inset-0 flex items-center justify-between px-6 sm:px-10 md:px-16 lg:px-24"
          style={{ opacity: 0, zIndex: 50 }}
        >
          {/* Left - Title */}
          <div ref={leftContentRef} className="max-w-lg text-left relative" style={{ zIndex: 60 }}>
            <h2 className="font-heading font-bold tracking-tight mb-4" style={{
              fontSize: "clamp(2.4rem, 4.5vw, 3.8rem)",
              lineHeight: "1.05",
              color: "hsl(var(--foreground))"
            }}>
              Real trust.<br />
              Real places.<br />
              <span style={{ color: "hsl(var(--primary))" }}>Real people.</span>
            </h2>
          </div>

          {/* Center - iPhone card placeholder (maintains spacing) */}
          <div className="relative" style={{ width: "280px" }} />

          {/* Right - Description and CTA */}
          <div ref={rightContentRef} className="max-w-sm text-left relative" style={{ zIndex: 60 }}>
            <p className="text-lg lg:text-xl font-normal leading-relaxed mb-6" style={{
              color: "hsl(var(--muted-foreground))"
            }}>
              Discover local businesses through verified reviews and authentic community presence—not paid placements.
            </p>
            <button
              className="px-7 py-3 rounded-full font-semibold text-base font-heading inline-flex items-center gap-2 transition-colors duration-200 border-2 border-[hsl(var(--foreground))] text-[hsl(var(--foreground))] bg-transparent hover:bg-[hsl(var(--foreground))] hover:text-[hsl(var(--background))]"
              style={{ letterSpacing: "0.01em" }}
            >
              Try Now
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}