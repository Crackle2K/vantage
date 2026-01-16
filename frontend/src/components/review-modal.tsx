"use client"

import { useState } from "react"
import { Star, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"

interface Business {
  id: string
  name: string
  category: string
  rating: number
  reviews: number
  image: string
  description: string
  hasDeal: boolean
  dealText?: string
}

interface ReviewModalProps {
  business: Business
  isOpen: boolean
  onClose: () => void
}

export function ReviewModal({ business, isOpen, onClose }: ReviewModalProps) {
  const [rating, setRating] = useState(0)
  const [hoveredRating, setHoveredRating] = useState(0)
  const [review, setReview] = useState("")
  const [verified, setVerified] = useState(false)
  const [verificationCode, setVerificationCode] = useState("")
  const [step, setStep] = useState<"review" | "verify">("review")

  const handleSubmit = () => {
    if (step === "review") {
      setStep("verify")
    } else {
      // Submit review logic here
      alert(`Review submitted for ${business.name}!\nRating: ${rating} stars\nReview: ${review}`)
      onClose()
      // Reset state
      setRating(0)
      setReview("")
      setVerified(false)
      setVerificationCode("")
      setStep("review")
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{step === "review" ? `Review ${business.name}` : "Verify You're Human"}</DialogTitle>
          <DialogDescription>
            {step === "review"
              ? "Share your experience with this business"
              : "Complete verification to submit your review"}
          </DialogDescription>
        </DialogHeader>

        {step === "review" ? (
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">Your Rating</Label>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoveredRating(star)}
                    onMouseLeave={() => setHoveredRating(0)}
                    className="p-1"
                  >
                    <Star
                      className={cn(
                        "w-7 h-7 transition-colors",
                        star <= (hoveredRating || rating) ? "text-chart-3 fill-chart-3" : "text-muted-foreground",
                      )}
                    />
                  </button>
                ))}
                {rating > 0 && (
                  <span className="ml-2 text-sm text-muted-foreground">
                    {rating === 1 && "Poor"}
                    {rating === 2 && "Fair"}
                    {rating === 3 && "Good"}
                    {rating === 4 && "Very Good"}
                    {rating === 5 && "Excellent"}
                  </span>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="review" className="text-sm font-medium mb-2 block">
                Your Review
              </Label>
              <Textarea
                id="review"
                placeholder="Tell others about your experience..."
                value={review}
                onChange={(e) => setReview(e.target.value)}
                rows={4}
              />
            </div>

            <Button onClick={handleSubmit} disabled={rating === 0 || review.length < 10} className="w-full">
              Continue to Verification
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary">
              <ShieldCheck className="w-8 h-8 text-primary" />
              <div>
                <p className="text-sm font-medium text-foreground">Bot Prevention</p>
                <p className="text-xs text-muted-foreground">This helps us maintain authentic reviews</p>
              </div>
            </div>

            <div>
              <Label htmlFor="code" className="text-sm font-medium mb-2 block">
                Enter the code: <span className="font-mono text-primary">7B3X9</span>
              </Label>
              <Input
                id="code"
                placeholder="Enter code here"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.toUpperCase())}
                className="font-mono"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox id="terms" checked={verified} onCheckedChange={(checked) => setVerified(checked as boolean)} />
              <label htmlFor="terms" className="text-sm text-muted-foreground">
                I confirm this review is based on a genuine experience
              </label>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("review")} className="flex-1">
                Back
              </Button>
              <Button onClick={handleSubmit} disabled={verificationCode !== "7B3X9" || !verified} className="flex-1">
                Submit Review
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
