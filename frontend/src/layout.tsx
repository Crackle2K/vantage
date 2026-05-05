/**
 * @fileoverview Root layout component that wraps every page with a shared
 * header, footer, and minimum-height flex container.
 */

import type React from "react"
import { Header } from "@/components/header"
import { Link, useLocation } from "react-router-dom"

/**
 * Renders the application shell. Non-landing routes receive the shared
 * sticky header and footer; the landing route (`/`) renders its own
 * dedicated navigation and footer.
 *
 * @param {React.ReactNode} children - The page content to render.
 * @returns {JSX.Element} The full layout with header, content, and footer.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const currentLocation = useLocation()
  const isLandingPageRoute = currentLocation.pathname === "/"

  return (
    <div className="min-h-screen flex flex-col bg-[hsl(var(--background))]">
      {!isLandingPageRoute && <Header />}
      <main className={`flex-1 ${isLandingPageRoute ? "" : "pt-20 sm:pt-24"}`}>{children}</main>
      {!isLandingPageRoute && <footer className="border-t border-border/50 bg-[hsl(var(--card))]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 mb-6 sm:mb-8">
            <div className="col-span-2 md:col-span-1">
              <Link to="/" className="flex items-center gap-2.5 mb-3">
                <img 
                  src="/Images/Vantage.png" 
                  alt="Vantage Logo" 
                  className="w-8 h-8 object-contain"
                />
                <span className="font-bold text-body text-[hsl(var(--foreground))] font-heading">Vantage</span>
              </Link>
              <p className="text-ui text-[hsl(var(--muted-foreground))] leading-relaxed">
                Local discovery ranked by fresh, credible community activity.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-ui text-[hsl(var(--foreground))] mb-3 font-sub">Explore</h4>
              <ul className="space-y-2">
                <li><Link to="/businesses" className="text-ui text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors">Businesses</Link></li>
                <li><Link to="/activity" className="text-ui text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors">Activity Feed</Link></li>
                <li><Link to="/businesses" className="text-ui text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors">Deals</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-ui text-[hsl(var(--foreground))] mb-3 font-sub">For Business</h4>
              <ul className="space-y-2">
                <li><Link to="/claim" className="text-ui text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors">Claim Your Business</Link></li>
                <li><Link to="/pricing" className="text-ui text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors">Pricing</Link></li>
                <li><Link to="/dashboard" className="text-ui text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors">Dashboard</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-ui text-[hsl(var(--foreground))] mb-3 font-sub">Company</h4>
              <ul className="space-y-2">
                <li><a href="#" className="text-ui text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors">About</a></li>
                <li><a href="#" className="text-ui text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors">Privacy</a></li>
                <li><a href="#" className="text-ui text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors">Terms</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border/50 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-caption text-[hsl(var(--muted-foreground))]">
              &copy; {new Date().getFullYear()} Vantage. All rights reserved.
            </p>
          </div>
        </div>
      </footer>}
    </div>
  )
}
