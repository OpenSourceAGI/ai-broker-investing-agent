"use client"

import { Play } from "lucide-react"
import { useState } from "react"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

interface VideoLightboxProps {
  /** YouTube video id, e.g. "N5cHK6K50Ds" */
  videoId: string
  title: string
  /** Short label rendered under the thumbnail */
  caption?: string
  className?: string
}

/**
 * Small click-to-expand video thumbnail. Opens the full video in a large
 * lightbox so it is actually watchable without leaving the page.
 */
export function VideoLightbox({
  videoId,
  title,
  caption,
  className,
}: VideoLightboxProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Play video: ${title}`}
        className={cn(
          "group relative block w-full overflow-hidden rounded-2xl border border-border bg-card/60 text-left transition-all hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          className
        )}
      >
        <span className="relative block aspect-video overflow-hidden">
          <img
            src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-primary/90 text-primary-foreground shadow-lg transition-transform duration-300 group-hover:scale-110">
              <Play className="ml-0.5 h-5 w-5 fill-current" />
            </span>
          </span>
        </span>
        <span className="flex items-center justify-between gap-2 px-4 py-3 text-xs">
          <span className="font-medium text-foreground">{caption ?? title}</span>
          <span className="text-muted-foreground">Watch</span>
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="w-[calc(100%-1.5rem)] max-w-5xl overflow-hidden border-border bg-black p-0 sm:max-w-5xl [&>button]:z-10 [&>button]:text-white"
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <div className="aspect-video w-full">
            {open ? (
              <iframe
                className="h-full w-full"
                src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&playsinline=1`}
                title={title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
