import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { 
  Info, DollarSign, Star, 
  ChevronLeft, ChevronRight, ArrowRight, Mail
} from "lucide-react"

function useTypewriter(words: string[], typingSpeed = 100, deletingSpeed = 50, pauseDuration = 3000) {
  const [displayText, setDisplayText] = useState('')
  const [wordIndex, setWordIndex] = useState(0)
  const [isDeleting, setIsDeleting] = useState(false)
  const [charIndex, setCharIndex] = useState(0)

  useEffect(() => {
    const currentWord = words[wordIndex]
    
    if (!isDeleting && charIndex < currentWord.length) {
      
      const timeout = setTimeout(() => {
        setDisplayText(currentWord.substring(0, charIndex + 1))
        setCharIndex(charIndex + 1)
      }, typingSpeed)
      return () => clearTimeout(timeout)
    } else if (!isDeleting && charIndex === currentWord.length) {
      
      const timeout = setTimeout(() => {
        setIsDeleting(true)
      }, pauseDuration)
      return () => clearTimeout(timeout)
    } else if (isDeleting && charIndex > 0) {
      
      const timeout = setTimeout(() => {
        setDisplayText(currentWord.substring(0, charIndex - 1))
        setCharIndex(charIndex - 1)
      }, deletingSpeed)
      return () => clearTimeout(timeout)
    } else if (isDeleting && charIndex === 0) {

      setIsDeleting(false)
      setWordIndex((wordIndex + 1) % words.length)
    }
  }, [charIndex, isDeleting, wordIndex, words, typingSpeed, deletingSpeed, pauseDuration])

  return displayText
}

function VideoPlaylist({ videoSources, posterSrc }: { videoSources: string[], posterSrc: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [hasError, setHasError] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)
  const [isFading, setIsFading] = useState(false)

  const handleTimeUpdate = () => {
    const video = videoRef.current
    if (video && video.duration && video.currentTime) {
      
      const timeRemaining = video.duration - video.currentTime
      if (timeRemaining <= 0.5 && timeRemaining > 0 && !isFading) {
        setIsFading(true)
      }
    }
  }

  const handleVideoEnd = () => {
    setCurrentIndex((prev) => (prev + 1) % videoSources.length)
    
    setTimeout(() => setIsFading(false), 50)
  }

  const handleVideoError = () => {
    setHasError(true)
  }

  useEffect(() => {
    
    setHasError(false)
    setIsLoaded(false)
    setIsFading(false)

    if (videoRef.current) {
      videoRef.current.load()
    }
  }, [currentIndex])

  const handleVideoLoad = () => {
    setIsLoaded(true)
  }

  if (hasError) {
    return (
      <img 
        src={posterSrc}
        alt="Background"
        className="absolute inset-0 w-full h-full object-cover"
      />
    )
  }

  return (
    <>
      {}
      <div className="absolute inset-0 bg-scrim-dark" />
      
      {}
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

export default function HomePage() {
  const navigate = useNavigate()

  const [isMobile, setIsMobile] = useState(false)
  
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const animatedWord = useTypewriter(
    ['adventure', 'local gem', 'favorite spot', 'hidden treasure', 'experience'],
    100,  
    50,   
    5000  
  )

  const [testimonialIndex, setTestimonialIndex] = useState(0)
  const [email, setEmail] = useState("")
  const [activeTab, setActiveTab] = useState(0)

  const testimonials = [
    { quote: "Vantage has transformed how I discover local businesses. The deals are incredible and the reviews are trustworthy!", name: "Sarah Mitchell", title: "Local Explorer" },
    { quote: "As a business owner, Vantage gave us the visibility we needed. Our customer engagement has tripled!", name: "James Rodriguez", title: "Business Owner" },
    { quote: "I love supporting local businesses through Vantage. It's so easy to find exactly what I'm looking for nearby.", name: "Emily Chen", title: "Community Advocate" },
  ]

  const tabFeatures = [
    {
      id: 0,
      name: "Claim & Conversion",
      icon: DollarSign,
      title: "Claim & Conversion",
      description: "Owners claim listings, launch deals, and turn discovery into real foot traffic.",
      image: "/Images/feature-claim-conversion.svg"
    },
    {
      id: 1,
      name: "Verified Trust System",
      icon: Star,
      title: "Verified Trust System",
      description: "We rank businesses using verified check-ins, credibility-weighted reviews, and live activity signals. This eliminates fake or inactive listings and makes results genuinely trustworthy.",
      image: "/Images/feature-verified-trust.svg"
    },
    {
      id: 2,
      name: "Community Engagement Feed",
      icon: Info,
      title: "Community Engagement Feed ",
      description: "Users engage with real local activity (verified check-ins, likes, comments, active-today signals), turning Vantage from a one-time search into a habit-forming local community platform.",
      image: "/Images/feature-community-feed.svg"
    }
  ]

  const instagramImages = [
    "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4",
    "https://images.unsplash.com/photo-1555396273-367ea4eb4db5",
    "https://images.unsplash.com/photo-1414235077428-338989a2e8c0",
    "https://images.unsplash.com/photo-1551218808-94e220e084d2",
    "https://images.unsplash.com/photo-1493770348161-369560ae357d",
    "https://images.unsplash.com/photo-1559339352-11d035aa65de",
    "https://images.unsplash.com/photo-1529417305485-480f579e1c7c",
    "https://images.unsplash.com/photo-1526367790999-0150786686a2",
  ]

  const nextTestimonial = () => setTestimonialIndex((prev) => (prev + 1) % testimonials.length)
  const prevTestimonial = () => setTestimonialIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length)

  const handleNewsletterSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    navigate("/")
    setEmail("")
  }

  return (
    <div className="overflow-hidden">
      
      {}
      <section className="relative h-screen overflow-hidden bg-surface">
        {}
        {!isMobile ? (
          <VideoPlaylist 
            videoSources={[
              "/videos/hero1.mp4",
              "/videos/hero2.mp4",
              "/videos/hero3.mp4"
            ]}
            posterSrc="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4"
          />
        ) : (
          <img 
            src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4"
            alt="Hero background"
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        
        {}
        <div className="absolute inset-0 bg-black/60 z-1" />

        {}
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

              {}
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

      {}
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

          {}
          <h3 className="text-heading md:text-display font-bold text-left mb-8 font-heading text-[hsl(var(--foreground))]">
            Our Top Picks
          </h3>

          {}
          <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_2fr] gap-6">
            {}
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

            {}
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

            {}
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

      {}
      <section className="py-32 bg-surface-elevated dark:bg-surface/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <h2 className="text-heading md:text-display font-bold text-center mb-8 font-heading text-[hsl(var(--foreground))]">
            "Turning real community support into <br></br>authentic local visibility"
          </h2>
          <p className="text-center text-body text-[hsl(var(--muted-foreground))] mb-16 max-w-2xl mx-auto">
            Our mission statement
          </p>

          {}
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

          {}
          <div 
            key={activeTab}
            className="grid md:grid-cols-2 gap-16 items-center animate-fade-in-up"
          >
            {}
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

            {}
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

      {}
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

      {}
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

      {}
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
