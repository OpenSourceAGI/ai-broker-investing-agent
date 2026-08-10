"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Share2 } from "lucide-react"
import { toast } from "sonner"

interface ShareDialogProps {
  itemType: "stock_alert" | "debate_report" | "signal" | "strategy"
  itemId: string
  symbol?: string
  title?: string
  defaultMessage?: string
  children?: React.ReactNode
}

export function ShareDialog({
  itemType,
  itemId,
  symbol,
  title,
  defaultMessage,
  children,
}: ShareDialogProps) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [emailError, setEmailError] = useState("")
  const [message, setMessage] = useState(defaultMessage || "")
  const [loading, setLoading] = useState(false)

  const validateEmail = () => {
    if (!email) {
      setEmailError("") // Optional: or "Email is required"
      return false
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setEmailError("Please enter a valid email address")
      return false
    }
    setEmailError("")
    return true
  }

  const handleShare = async () => {
    if (!email) {
      toast.error("Please enter an email address")
      return
    }

    if (!validateEmail()) {
      toast.error("Please enter a valid email address")
      return
    }

    setLoading(true)

    try {
      const response = await fetch("/api/share", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          itemType,
          itemId,
          symbol,
          title,
          message,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        toast.success("Shared successfully!")
        setEmail("")
        setMessage(defaultMessage || "")
        setOpen(false)
      } else {
        toast.error(data.error || "Failed to share")
      }
    } catch (error) {
      console.error("Error sharing:", error)
      toast.error("Failed to share. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" size="sm">
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Share {itemType.replace("_", " ")}
            {symbol && ` - ${symbol}`}
          </DialogTitle>
          <DialogDescription>
            Share this {itemType.replace("_", " ")} with someone via email. They'll receive a
            notification and can view it in the app.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              placeholder="colleague@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (emailError) setEmailError("")
              }}
              onBlur={validateEmail}
              className={emailError ? "border-red-500" : ""}
            />
            {emailError && <p className="text-sm text-red-500">{emailError}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="message">Message (optional)</Label>
            <Textarea
              id="message"
              placeholder="Add a message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleShare} disabled={loading}>
            {loading ? "Sharing..." : "Share"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
