import type React from "react"
import { Header } from "@/components/header"
import { Link } from "react-router-dom"
import { Heart } from "lucide-react"

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-[hsl(var(--background))]">
      <Header />
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border/50 bg-[hsl(var(--card))]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div className="col-span-2 md:col-span-1">
              <Link to="/" className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
                  <span className="text-white font-bold text-sm">V</span>
                </div>
                <span className="font-bold text-lg text-[hsl(var(--foreground))] font-heading">Vantage</span>
              </Link>
              <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
                Discover and support amazing local businesses in your community.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-sm text-[hsl(var(--foreground))] mb-3 font-sub">Explore</h4>
              <ul className="space-y-2">
                <li><Link to="/businesses" className="text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors">Businesses</Link></li>
                <li><Link to="/activity" className="text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors">Activity Feed</Link></li>
                <li><Link to="/businesses" className="text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors">Deals</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-sm text-[hsl(var(--foreground))] mb-3 font-sub">For Business</h4>
              <ul className="space-y-2">
                <li><Link to="/claim" className="text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors">Claim Your Business</Link></li>
                <li><Link to="/pricing" className="text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors">Pricing</Link></li>
                <li><Link to="/dashboard" className="text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors">Dashboard</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-sm text-[hsl(var(--foreground))] mb-3 font-sub">Company</h4>
              <ul className="space-y-2">
                <li><a href="#" className="text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors">About</a></li>
                <li><a href="#" className="text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors">Privacy</a></li>
                <li><a href="#" className="text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors">Terms</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border/50 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              &copy; {new Date().getFullYear()} Vantage. All rights reserved.
            </p>
            <p className="text-xs text-[hsl(var(--muted-foreground))] flex items-center gap-1">
              Made with <Heart className="w-3 h-3 text-red-500 fill-red-500" /> for local communities
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
