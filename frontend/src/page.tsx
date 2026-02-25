import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { 
  MapPin, Info, DollarSign, Star, Shield, 
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

  // Features data
  const features = [
    { icon: Info, title: "Comprehensive Information", description: "Access detailed business profiles, hours, services, and customer reviews all in one place." },
    { icon: DollarSign, title: "Price Transparency", description: "Compare prices and access exclusive deals and discounts from local businesses." },
    { icon: Star, title: "Best Services", description: "Discover top-rated businesses based on verified customer reviews and ratings." },
    { icon: Shield, title: "Verified Businesses", description: "Every business is verified and monitored to ensure quality and authenticity." },
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
                <span className="text-brand-light">{animatedWord}<span className="animate-pulse">|</span></span>
              </h1>
              <p className="text-heading md:text-heading text-on-primary/90 mb-10">
                Building real trust for local discovery
              </p>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4">
                <Button 
                  size="lg"
                  className="gradient-primary text-on-primary px-10 py-7 text-body rounded-xl hover:opacity-90 transition-opacity shadow-2xl"
                  onClick={() => navigate("/businesses")}
                >
                  Explore Businesses
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
                <Button 
                  size="lg"
                  variant="outline"
                  className="brand-primary backdrop-blur-sm border-2 border-outline-variant text-on-primary px-10 py-7 text-body rounded-xl hover:bg-surface/20 transition-colors shadow-2xl"
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

          {/* Subsection 1: Image left, text right */}
          <div className="grid md:grid-cols-2 gap-12 mb-24 items-center">
            <div className="rounded-3xl overflow-hidden">
              <img 
                src="https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?w=800&h=600&fit=crop" 
                alt="Explore community" 
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <p className="text-ui uppercase tracking-wider text-brand font-semibold mb-3">Step — 01</p>
              <h3 className="text-heading font-bold mb-4 font-sub text-[hsl(var(--foreground))]">
                Explore Your Community
              </h3>
              <p className="text-body text-[hsl(var(--muted-foreground))] leading-relaxed mb-6">
                Discover hidden gems and local favorites in your neighborhood. From cozy cafes to unique boutiques, find businesses that make your community special.
              </p>
              <p className="text-body text-[hsl(var(--muted-foreground))] leading-relaxed">
                Our platform connects you with authentic local experiences, helping you build meaningful relationships with business owners who care about their community.
              </p>
            </div>
          </div>

          {/* Subsection 2: Text left, image right */}
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="order-2 md:order-1">
              <p className="text-ui uppercase tracking-wider text-brand font-semibold mb-3">Step — 02</p>
              <h3 className="text-heading font-bold mb-4 font-sub text-[hsl(var(--foreground))]">
                Support Local Businesses
              </h3>
              <p className="text-body text-[hsl(var(--muted-foreground))] leading-relaxed mb-6">
                Every purchase you make helps your neighbors thrive. Access exclusive deals and promotions while supporting entrepreneurs who bring life to your area.
              </p>
              <p className="text-body text-[hsl(var(--muted-foreground))] leading-relaxed">
                Read honest reviews, share your experiences, and become part of a community that values quality, authenticity, and local pride.
              </p>
            </div>
            <div className="rounded-3xl overflow-hidden order-1 md:order-2">
              <img 
                src="https://images.unsplash.com/photo-1551632811-561732d1e306?w=800&h=600&fit=crop" 
                alt="Support local" 
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          LARGE FEATURE SECTION - Full-width video with overlay
          ═══════════════════════════════════════════ */}
      <section className="relative h-[600px] overflow-hidden">
        {!isMobile ? (
          <LazyVideoComponent 
            videoSrc="/videos/feature.mp4"
            posterSrc="https://images.unsplash.com/photo-1519904981063-b0cf448d479e?w=1920&h=600&fit=crop"
          />
        ) : (
          <img 
            src="https://images.unsplash.com/photo-1519904981063-b0cf448d479e?w=1920&h=600&fit=crop"
            alt="Feature background"
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/40 to-transparent" />
        <div className="absolute inset-0 flex items-center justify-center md:justify-start">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 w-full">
            <div className="max-w-xl text-brand-on-primary">
              <p className="text-body md:text-subheading leading-relaxed">
                Join thousands of community members discovering, reviewing, and celebrating local businesses that make our neighborhoods vibrant and unique.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          FEATURES GRID - 4 feature cards
          ═══════════════════════════════════════════ */}
      <section className="py-24 bg-surface-elevated dark:bg-surface/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <h2 className="text-heading md:text-display font-bold text-center mb-6 font-heading text-[hsl(var(--foreground))]">
            Your comfort and safety are<br />always our priority.
          </h2>
          <p className="text-center text-body text-[hsl(var(--muted-foreground))] mb-16 max-w-2xl mx-auto">
            We verify every business and ensure you have all the information you need to make confident decisions.
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, i) => {
              const Icon = feature.icon
              return (
                <div 
                  key={i} 
                  className="bg-surface dark:bg-surface-elevated rounded-2xl p-8 shadow-sm hover:shadow-xl transition-shadow duration-300"
                >
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-brand-light to-brand flex items-center justify-center mb-6">
                    <Icon className="w-7 h-7 text-brand-on-primary" />
                  </div>
                  <h3 className="text-subheading font-bold mb-3 font-sub text-[hsl(var(--foreground))]">
                    {feature.title}
                  </h3>
                  <p className="text-[hsl(var(--muted-foreground))] leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              )
            })}
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

          <div className="bg-gradient-to-br from-brand-light to-brand rounded-3xl p-12 md:p-16 shadow-2xl">
            <div className="text-brand-on-primary">
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
                    className="w-12 h-12 rounded-full bg-surface/20 backdrop-blur-sm text-on-primary flex items-center justify-center hover:bg-surface/30 transition-colors"
                    aria-label="Previous testimonial"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button
                    onClick={nextTestimonial}
                    className="w-12 h-12 rounded-full bg-surface/20 backdrop-blur-sm text-on-primary flex items-center justify-center hover:bg-surface/30 transition-colors"
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
      <section className="py-20 bg-gradient-to-br from-brand-light to-brand">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-heading md:text-heading font-bold text-on-primary mb-4 font-heading">
            Stay updated with local deals
          </h2>
          <p className="text-body text-on-primary/90 mb-8">
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
