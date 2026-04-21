import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  ChevronLeft, ChevronRight, Mail
} from "lucide-react"
import { HeroTransition } from "@/components/HeroTransition"
import { FeatureShowcase } from "@/components/FeatureShowcase"


export default function HomePage() {
  const [testimonialIndex, setTestimonialIndex] = useState(0)
  const [email, setEmail] = useState("")

  const testimonials = [
    { quote: "Vantage has transformed how I discover local businesses. They helped me find my favorite local spots!", name: "Richard Liu", title: "High School Student" },
    { quote: "Vantage gave me new insights on local businesses and helped me connect with my community.", name: "Charlie Shao", title: "Student at MMHS" },
    { quote: "I love supporting local businesses through Vantage. It's so easy to find exactly what I'm looking for nearby.", name: "Michael H.", title: "Aspiring Surgeon" },
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
    setEmail("")
  }

  return (
    <div className="overflow-x-clip">

      <HeroTransition />

      <FeatureShowcase />

      <section className="py-24 bg-surface dark:bg-surface">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <h2 className="text-heading md:text-display font-bold text-center mb-4 font-heading text-[hsl(var(--foreground))]">
            Connect with us!<br />
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

      <section className="py-24 bg-surface-elevated dark:bg-surface/50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <h2 className="text-heading md:text-display font-bold text-center mb-16 font-heading text-[hsl(var(--foreground))]">
            Our Reviews!
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

      <section className="py-20 bg-[hsl(var(--card))] border-t border-[hsl(var(--border))]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-heading md:text-heading font-bold text-[hsl(var(--foreground))] mb-4 font-heading">
            Stay updated with local deals
          </h2>
          <p className="text-body text-[hsl(var(--muted-foreground))] mb-8">
            Get exclusive offers and discover new businesses delivered to your inbox every week.
          </p>

          <form onSubmit={handleNewsletterSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <div className="flex-1 flex items-center gap-3 px-5 py-4 bg-[hsl(var(--secondary))] rounded">
              <Mail className="w-5 h-5 text-[hsl(var(--muted-foreground))]" />
              <input
                type="email"
                placeholder="Your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-transparent border-none outline-none w-full text-[hsl(var(--foreground))] placeholder-[hsl(var(--muted-foreground))]"
              />
            </div>
            <Button
              type="submit"
              size="lg"
              className="bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/90 text-white px-8 py-4 rounded transition-colors"
            >
              Subscribe
            </Button>
          </form>
        </div>
      </section>
    </div>
  )
}