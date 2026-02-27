import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { 
  MapPin, Info, DollarSign, Star, 
  ChevronLeft, ChevronRight, ArrowRight, Mail
} from "lucide-react"


// Typewriter animation hook - cycles through words with typing effect
function useTypewriter(words: string[], typingSpeed = 100, deletingSpeed = 50, pauseDuration = 3000) {
  const [displayText, setDisplayText] = useState('')
  const [wordIndex, setWordIndex] = useState(0)
  const [isDeleting, setIsDeleting] = useState(false)
  const [charIndex, setCharIndex] = useState(0)

  useEffect(() => {
    const currentWord = words[wordIndex]
    
    if (!isDeleting && charIndex < currentWord.length) {
      // Typing characters
      const timeout = setTimeout(() => {
        setDisplayText(currentWord.substring(0, charIndex + 1))
        setCharIndex(charIndex + 1)
      }, typingSpeed)
      return () => clearTimeout(timeout)
    } else if (!isDeleting && charIndex === currentWord.length) {
      // Pause at end of word
      const timeout = setTimeout(() => {
        setIsDeleting(true)
      }, pauseDuration)
      return () => clearTimeout(timeout)
    } else if (isDeleting && charIndex > 0) {
      // Deleting characters
      const timeout = setTimeout(() => {
        setDisplayText(currentWord.substring(0, charIndex - 1))
        setCharIndex(charIndex - 1)
      }, deletingSpeed)
      return () => clearTimeout(timeout)
    } else if (isDeleting && charIndex === 0) {
      // Move to next word
      setIsDeleting(false)
      setWordIndex((wordIndex + 1) % words.length)
    }
  }, [charIndex, isDeleting, wordIndex, words, typingSpeed, deletingSpeed, pauseDuration])

  return displayText
}

// Video lazy loading hook
function useVideoLazyLoad() {
  const videoRef = useRef<HTMLDivElement>(null)
  const [shouldLoad, setShouldLoad] = useState(false)
  
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setShouldLoad(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1, rootMargin: '200px' }
    )
    
    if (videoRef.current) observer.observe(videoRef.current)
    return () => observer.disconnect()
  }, [])
  
  return { videoRef, shouldLoad }
}

// Video playlist component - cycles through multiple videos with fade transitions
function VideoPlaylist({ videoSources, posterSrc }: { videoSources: string[], posterSrc: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [hasError, setHasError] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)
  const [isFading, setIsFading] = useState(false)
  
  // Handle video time update - start fade transition before video ends
  const handleTimeUpdate = () => {
    const video = videoRef.current
    if (video && video.duration && video.currentTime) {
      // Start fading out 0.5 seconds before video ends
      const timeRemaining = video.duration - video.currentTime
      if (timeRemaining <= 0.5 && timeRemaining > 0 && !isFading) {
        setIsFading(true)
      }
    }
  }
  
  // Handle video end - move to next video in playlist
  const handleVideoEnd = () => {
    setCurrentIndex((prev) => (prev + 1) % videoSources.length)
    // Fade back in after switching
    setTimeout(() => setIsFading(false), 50)
  }
  
  // Handle video error - show poster as fallback
  const handleVideoError = () => {
    setHasError(true)
  }
  
  // Reset states when video source changes
  useEffect(() => {
    setHasError(false)
    setIsLoaded(false)
    setIsFading(false)
    
    // Force video to load the new source
    if (videoRef.current) {
      videoRef.current.load()
    }
  }, [currentIndex])
  
  // Handle successful video load
  const handleVideoLoad = () => {
    setIsLoaded(true)
  }
  
  // Show poster only if video permanently failed
  if (hasError) {
    return (
      <img 
        src={posterSrc}
        alt="Background"
        className="absolute inset-0 w-full h-full object-cover"
      />
    )
  }
  
  // Black background behind video for seamless transitions
  return (
    <>
      {/* Pure black background - always visible behind video */}
      <div className="absolute inset-0 bg-scrim-dark" />
      
      {/* Video with fade transitions */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        preload="auto"
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleVideoEnd}
        onError={handleVideoError}
        onLoadedData={handleVideoLoad}
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
          isFading || !isLoaded ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <source src={videoSources[currentIndex]} type="video/mp4" />
      </video>
    </>
  )
}

// Lazy video component - reused across sections
function LazyVideoComponent({ videoSrc, posterSrc }: { videoSrc: string, posterSrc: string }) {
  const { videoRef, shouldLoad } = useVideoLazyLoad()
  const [hasError, setHasError] = useState(false)
  
  return (
    <div ref={videoRef} className="absolute inset-0">
      {shouldLoad && !hasError ? (
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="none"
          poster={posterSrc}
          onError={() => setHasError(true)}
          className="absolute inset-0 w-full h-full object-cover"
        >
          <source src={videoSrc} type="video/mp4" />
        </video>
      ) : (
        <img 
          src={posterSrc}
          alt="Loading"
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
    </div>
  )
}

export default function HomePage() {
  const navigate = useNavigate()
  
  // Mobile detection for video optimization
  const [isMobile, setIsMobile] = useState(false)
  
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])
  
  // Typewriter animation for hero text
  const animatedWord = useTypewriter(
    ['adventure', 'local gem', 'favorite spot', 'hidden treasure', 'experience'],
    100,  // typing speed
    50,   // deleting speed  
    5000  // pause duration (3 seconds)
  )
  
  // State for carousel and testimonials
  const [carouselIndex, setCarouselIndex] = useState(0)
  const [testimonialIndex, setTestimonialIndex] = useState(0)
  const [email, setEmail] = useState("")
  const [activeTab, setActiveTab] = useState(0)

  /* ═══════════════════════════════════════════
     MOCK DATA
     ═══════════════════════════════════════════ */

  // Mock data for businesses
  const businesses = [
    { name: "Mountain View Cafe", location: "Denver, CO", price: 12, image: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=400&h=300&fit=crop" },
    { name: "Valley Restaurant", location: "Boulder, CO", price: 45, image: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&h=300&fit=crop" },
    { name: "Summit Sports", location: "Aspen, CO", price: 30, image: "https://images.unsplash.com/photo-1556740749-887f6717d7e4?w=400&h=300&fit=crop" },
    { name: "Creek Side Bakery", location: "Vail, CO", price: 15, image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&h=300&fit=crop" },
  ]

  // Mock data for testimonials
  const testimonials = [
    { quote: "Vantage has transformed how I discover local businesses. The deals are incredible and the reviews are trustworthy!", name: "Sarah Mitchell", title: "Local Explorer" },
    { quote: "As a business owner, Vantage gave us the visibility we needed. Our customer engagement has tripled!", name: "James Rodriguez", title: "Business Owner" },
    { quote: "I love supporting local businesses through Vantage. It's so easy to find exactly what I'm looking for nearby.", name: "Emily Chen", title: "Community Advocate" },
  ]

  // Tab features data
  const tabFeatures = [
    {
      id: 0,
      name: "Claim & Conversion",
      icon: DollarSign,
      title: "Claim & Conversion",
      description: "Owners claim listings, launch deals, and turn discovery into real foot traffic.",
      image: "/images/feature1.webp"
    },
    {
      id: 1,
      name: "Verified Trust System",
      icon: Star,
      title: "Verified Trust System",
      description: "We rank businesses using verified check-ins, credibility-weighted reviews, and live activity signals. This eliminates fake or inactive listings and makes results genuinely trustworthy.",
      image: "/images/feature2.webp"
    },
    {
      id: 2,
      name: "Community Engagement Feed",
      icon: Info,
      title: "Community Engagement Feed ",
      description: "Users engage with real local activity (verified check-ins, likes, comments, active-today signals), turning Vantage from a one-time search into a habit-forming local community platform.",
      image: "/images/feature3.webp"
    }
  ]

  // Instagram images
  const instagramImages = [
    "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=300&h=300&fit=crop",
    "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=300&h=300&fit=crop",
    "https://images.unsplash.com/photo-1556740749-887f6717d7e4?w=300&h=300&fit=crop",
    "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=300&h=300&fit=crop",
    "https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=300&h=300&fit=crop",
    "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=300&h=300&fit=crop",
    "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=300&h=300&fit=crop",
    "https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=300&h=300&fit=crop",
  ]

  /* ═══════════════════════════════════════════
     EVENT HANDLERS
     ═══════════════════════════════════════════ */

  // Carousel navigation
  const nextBusiness = () => setCarouselIndex((prev) => (prev + 1) % businesses.length)
  const prevBusiness = () => setCarouselIndex((prev) => (prev - 1 + businesses.length) % businesses.length)

  // Testimonial navigation
  const nextTestimonial = () => setTestimonialIndex((prev) => (prev + 1) % testimonials.length)
  const prevTestimonial = () => setTestimonialIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length)

  // Newsletter submission - navigates to homepage
  const handleNewsletterSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    navigate("/")
    setEmail("")
  }

  return (
    <div className="overflow-hidden">
      
      {/* ═══════════════════════════════════════════
          HERO SECTION - Full viewport with cycling video playlist
          ═══════════════════════════════════════════ */}
      <section className="relative h-screen overflow-hidden bg-surface">
        {/* Video Playlist - Cycles through 3 videos */}
        {!isMobile ? (
          <VideoPlaylist 
            videoSources={[
              "/videos/hero1.mp4",
              "/videos/hero2.mp4",
              "/videos/hero3.mp4"
            ]}
            posterSrc="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&h=1080&fit=crop"
          />
        ) : (
          <img 
            src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&h=1080&fit=crop"
            alt="Hero background"
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        
        {/* Dark overlay for text readability */}
        <div className="absolute inset-0 bg-black/60 z-1" />

        {/* Content - Left-aligned */}
        <div className="absolute inset-0 flex items-center z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 w-full">
            <div className="max-w-5xl">
              <h1 className="text-title md:text-[5rem] lg:text-[6rem] leading-tight font-bold text-on-primary mb-6 font-heading">
                Find your next
                <br />
                <span className="text-hero-typed">{animatedWord}<span className="animate-pulse">|</span></span>
              </h1>
              <p className="text-heading md:text-heading text-on-primary mb-10">
                Building real trust for local discovery
              </p>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4">
                <Button 
                  size="lg"
                  className="gradient-primary !text-white hover:!text-white px-10 py-7 text-body rounded-xl hover:opacity-90 transition-opacity shadow-2xl"
                  onClick={() => navigate("/businesses")}
                >
                  Explore Businesses
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
                <Button 
                  size="lg"
                  variant="outline"
                  className="brand-primary backdrop-blur-sm border-2 border-outline-variant !text-white hover:!text-white px-10 py-7 text-body rounded-xl hover:bg-surface/20 transition-colors shadow-2xl"
                  onClick={() => navigate("/pricing")}
                >
                  For Business Owners
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          PURPOSE SECTION - Alternating layout
          ═══════════════════════════════════════════ */}
      <section className="py-24 bg-surface dark:bg-surface">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-left mb-20">
            <h2 className="text-display md:text-display font-bold text-left font-subheading">
              The Online-to-Offline platform for all
            </h2>
            <p className="text-heading md:text-subheading mt-4 ">
              <span className="cursor-pointer inline text-gradient-green-hover" onClick={() => navigate("/businesses")}>
                Find local businesses and global favorites.
              </span>
              <span className="cursor-pointer inline text-gradient-green-hover" onClick={() => navigate("/businesses")}>
                {" "}Explore on the go or from your couch.
              </span>
              <span className="cursor-pointer inline text-gradient-green-hover" onClick={() => navigate("/businesses")}>
                {" "}Support neighborhood shops and city gems.
              </span>
            </p>
          </div>

          {/* Section Title */}
          <h3 className="text-heading md:text-display font-bold text-left mb-8 font-heading text-[hsl(var(--foreground))]">
            Our Top Picks
          </h3>

          {/* 3-Column Image Card Grid */}
          <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_2fr] gap-6">
            {/* Card 1: Thick */}
            <div 
              className="group relative h-96 rounded-xl overflow-hidden cursor-pointer"
              onClick={() => navigate("/businesses")}
            >
              <img 
                src="/Images/volosgreekcuisine.webp"
                alt="Brand 1"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <p className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-xl font-bold text-white">
                  Volos Greek Cuisine
                </p>
                <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-lg font-semibold text-white">
                  133 Richmond St W, Toronto, ON M5H 2L3
                </p>
              </div>
            </div>

            {/* Card 2: Thin */}
            <div 
              className="group relative h-96 rounded-xl overflow-hidden cursor-pointer"
              onClick={() => navigate("/businesses")}
            >
              <img 
                src="/Images/laperlasalon&spa.webp"
                alt="La Perla Salon & Spa"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <p className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-xl font-bold text-white">
                  La Perla Salon & Spa
                </p>
                <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-lg font-semibold text-white">
                  112 Elizabeth St, Toronto, ON M5G 1P5
                </p>
              </div>
            </div>

            {/* Card 3: Thick */}
            <div 
              className="group relative h-96 rounded-xl overflow-hidden cursor-pointer"
              onClick={() => navigate("/businesses")}
            >
              <img 
                src="/Images/dineencoffeeco.webp"
                alt="Dineen Coffee Co"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <p className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-xl font-bold text-white">
                  Dineen Coffee Co
                </p>
                <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-lg font-semibold text-white">
                   311 York Mills Rd, North York, ON M2L 1L3
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          TABBED FEATURES SECTION - Interactive tabs with content switching
          ═══════════════════════════════════════════ */}
      <section className="py-32 bg-surface-elevated dark:bg-surface/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <h2 className="text-heading md:text-display font-bold text-center mb-8 font-heading text-[hsl(var(--foreground))]">
            "Turning real community support into <br></br>authentic local visibility"
          </h2>
          <p className="text-center text-body text-[hsl(var(--muted-foreground))] mb-16 max-w-2xl mx-auto">
            Our mission statement
          </p>

          {/* Tab Buttons */}
          <div className="flex flex-wrap justify-center gap-4 mb-16">
            {tabFeatures.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex flex-col items-center p-6 rounded-xl transition-all duration-200 cursor-pointer border-2 min-w-[180px] ${
                    isActive
                      ? 'bg-surface-elevated border-brand shadow-lg'
                      : 'bg-surface border-transparent hover:bg-surface-elevated hover:shadow-md'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${
                    isActive ? 'bg-brand' : 'bg-surface-elevated'
                  }`}>
                    <Icon className={`w-6 h-6 ${isActive ? 'text-brand-on-primary' : 'text-[hsl(var(--foreground))]'}`} />
                  </div>
                  <span className={`text-body font-semibold ${
                    isActive ? 'text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]'
                  }`}>
                    {tab.name}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Content Area */}
          <div 
            key={activeTab}
            className="grid md:grid-cols-2 gap-16 items-center animate-fade-in-up"
          >
            {/* Left Column - Text Content */}
            <div>
              <h3 className="text-heading md:text-display font-bold mb-8 font-heading text-[hsl(var(--foreground))]">
                {tabFeatures[activeTab].title}
              </h3>
              <p className="text-body md:text-subheading text-[hsl(var(--muted-foreground))] leading-relaxed mb-10">
                {tabFeatures[activeTab].description}
              </p>
              <Button
                size="lg"
                className="gradient-primary text-on-primary px-8 py-6 text-body rounded-xl hover:opacity-90 transition-opacity"
                onClick={() => navigate("/businesses")}
              >
                Learn more
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>

            {/* Right Column - Image */}
            <div className="rounded-2xl overflow-hidden shadow-2xl min-h-[500px]">
              <img
                src={tabFeatures[activeTab].image}
                alt={tabFeatures[activeTab].title}
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          BUSINESS CAROUSEL - Horizontal scroll
          ═══════════════════════════════════════════ */}
      <section className="py-24 bg-surface dark:bg-surface">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex justify-between items-end mb-12">
            <div>
              <h2 className="text-heading md:text-display font-bold mb-4 font-heading text-[hsl(var(--foreground))]">
                Fresh journeys<br />for your tour
              </h2>
            </div>
            <div className="flex gap-2">
              <button
                onClick={prevBusiness}
                className="w-12 h-12 rounded-full bg-brand-light text-on-primary flex items-center justify-center hover:bg-brand transition-colors"
                aria-label="Previous"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                onClick={nextBusiness}
                className="w-12 h-12 rounded-full bg-brand-light text-on-primary flex items-center justify-center hover:bg-brand transition-colors"
                aria-label="Next"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>
          </div>

          <div className="overflow-hidden">
            <div 
              className="flex gap-6 transition-transform duration-500 ease-out"
              style={{ transform: `translateX(-${carouselIndex * (100 / businesses.length)}%)` }}
            >
              {businesses.map((business, i) => (
                <div 
                  key={i} 
                  className="min-w-[calc(100%-1.5rem)] sm:min-w-[calc(50%-0.75rem)] lg:min-w-[calc(25%-1.125rem)] rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-shadow duration-300 cursor-pointer"
                  onClick={() => navigate("/businesses")}
                >
                  <div className="relative h-64">
                    <img 
                      src={business.image} 
                      alt={business.name} 
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-4 right-4 bg-surface px-3 py-1 rounded-full text-ui font-bold text-brand-dark">
                      ${business.price}
                    </div>
                  </div>
                  <div className="p-6 bg-surface dark:bg-surface-elevated">
                    <h3 className="text-subheading font-bold mb-2 font-sub text-[hsl(var(--foreground))]">
                      {business.name}
                    </h3>
                    <p className="text-[hsl(var(--muted-foreground))] flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      {business.location}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          TESTIMONIAL SECTION - Large quote card
          ═══════════════════════════════════════════ */}
      <section className="py-24 bg-surface-elevated dark:bg-surface/50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <h2 className="text-heading md:text-display font-bold text-center mb-16 font-heading text-[hsl(var(--foreground))]">
            Your trusted partner in tour
          </h2>

          <div className="rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-12 shadow-lg md:p-16">
            <div className="text-[hsl(var(--foreground))]">
              <p className="text-subheading md:text-heading font-serif italic mb-8 leading-relaxed">
                "{testimonials[testimonialIndex].quote}"
              </p>
              <div className="flex items-center justify-between">
                <div>
                    <p className="text-subheading font-bold mb-1">{testimonials[testimonialIndex].name}</p>
                    <p className="text-secondary">{testimonials[testimonialIndex].title}</p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={prevTestimonial}
                    className="w-12 h-12 rounded-full bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] flex items-center justify-center hover:bg-[hsl(var(--accent))] transition-colors"
                    aria-label="Previous testimonial"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button
                    onClick={nextTestimonial}
                    className="w-12 h-12 rounded-full bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] flex items-center justify-center hover:bg-[hsl(var(--accent))] transition-colors"
                    aria-label="Next testimonial"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          CTA SECTION - Full-width background video
          ═══════════════════════════════════════════ */}
      <section className="relative h-[500px] overflow-hidden">
        {!isMobile ? (
          <LazyVideoComponent 
            videoSrc="/videos/cta.mp4"
            posterSrc="https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=1920&h=500&fit=crop"
          />
        ) : (
          <img 
            src="https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=1920&h=500&fit=crop"
            alt="CTA background"
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-scrim-dark/50" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-on-primary px-4">
            <h2 className="text-heading md:text-display font-bold mb-6 font-heading">
              Ready to explore?<br />Start your adventure today!
            </h2>
            <Button 
              size="lg"
              className="gradient-primary text-on-primary px-10 py-7 text-body rounded-xl hover:opacity-90 transition-opacity shadow-2xl"
              onClick={() => navigate("/businesses")}
            >
              Get Started
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          INSTAGRAM SECTION - 4-column grid
          ═══════════════════════════════════════════ */}
      <section className="py-24 bg-surface dark:bg-surface">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <h2 className="text-heading md:text-display font-bold text-center mb-4 font-heading text-[hsl(var(--foreground))]">
            Connect with us on<br />Instagram
          </h2>
          <p className="text-center text-body text-[hsl(var(--muted-foreground))] mb-12">
            Follow us to see the latest from our community
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {instagramImages.map((img, i) => (
              <a
                key={i}
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-2xl overflow-hidden aspect-square hover:scale-105 transition-transform duration-300 shadow-md hover:shadow-xl"
              >
                <img 
                  src={img} 
                  alt={`Instagram ${i + 1}`} 
                  className="w-full h-full object-cover"
                />
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          NEWSLETTER SECTION - Email signup
          ═══════════════════════════════════════════ */}
      <section className="py-20 bg-[hsl(var(--card))] border-t border-[hsl(var(--border))]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-heading md:text-heading font-bold text-[hsl(var(--foreground))] mb-4 font-heading">
            Stay updated with local deals
          </h2>
          <p className="text-body text-[hsl(var(--muted-foreground))] mb-8">
            Get exclusive offers and discover new businesses delivered to your inbox every week.
          </p>

          <form onSubmit={handleNewsletterSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <div className="flex-1 flex items-center gap-3 px-5 py-4 bg-surface rounded-xl">
              <Mail className="w-5 h-5 text-muted" />
              <input 
                type="email" 
                placeholder="Your email address" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-transparent border-none outline-none w-full text-default placeholder-gray-500"
              />
            </div>
            <Button 
              type="submit"
              size="lg"
              className="bg-brand-dark hover:bg-brand-dark/90 text-on-primary px-8 py-4 rounded-xl transition-colors"
            >
              Subscribe
            </Button>
          </form>
        </div>
      </section>
    </div>
  )
}
