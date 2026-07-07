"use client"

import Image from "next/image"
import Link from "next/link"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

interface FeatureStorySectionProps {
  id?: string
  eyebrow: string
  title: React.ReactNode
  description: string
  ctaLabel?: string
  ctaHref?: string
  imageSrc: string
  imageAlt: string
  imageClassName?: string
  imageContainerClassName?: string
  imagePriority?: boolean
  imageZoomable?: boolean
  imageWide?: boolean
  /** Puts the image on the right on desktop */
  reverse?: boolean
}

export function FeatureStorySection({
  id,
  eyebrow,
  title,
  description,
  ctaLabel,
  ctaHref,
  imageSrc,
  imageAlt,
  imageClassName = "object-cover",
  imageContainerClassName,
  imagePriority = false,
  imageZoomable = false,
  imageWide = false,
  reverse = false,
}: FeatureStorySectionProps) {
  const imageCard = (
    <div
      className={cn(
        "relative aspect-[4/3] overflow-hidden rounded-3xl border border-border bg-card/60",
        imageZoomable &&
          "cursor-zoom-in transition duration-300 hover:border-bronze/70 hover:shadow-2xl hover:shadow-bronze/10",
        imageContainerClassName,
      )}
    >
      <Image
        src={imageSrc}
        alt={imageAlt}
        fill
        sizes={
          imageWide
            ? "(min-width: 768px) 62vw, 100vw"
            : "(min-width: 768px) 50vw, 100vw"
        }
        priority={imagePriority}
        className={imageClassName}
      />
      {imageZoomable && (
        <span className="absolute bottom-4 right-4 rounded-full bg-background/85 px-3 py-1 text-xs font-medium text-foreground shadow-sm backdrop-blur">
          Click to zoom
        </span>
      )}
    </div>
  )

  return (
    <section id={id} className="bg-background text-foreground">
      <div
        className={cn(
          "mx-auto grid max-w-[1400px] items-center gap-12 px-6 py-20 md:grid-cols-2 md:py-28",
          imageWide && "max-w-[1600px] md:grid-cols-[1.25fr_0.75fr]",
          reverse && "md:[&>*:first-child]:order-2",
        )}
      >
        {imageZoomable ? (
          <Dialog>
            <DialogTrigger asChild>
              <button
                type="button"
                className="group block text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-bronze focus-visible:ring-offset-4 focus-visible:ring-offset-background"
                aria-label={`Open larger view of ${imageAlt}`}
              >
                {imageCard}
              </button>
            </DialogTrigger>
            <DialogContent
              className="max-h-[92vh] max-w-[min(96vw,1400px)] overflow-hidden border-border bg-background/95 p-3"
              showCloseButton
            >
              <DialogTitle className="sr-only">{imageAlt}</DialogTitle>
              <div className="relative h-[82vh] w-full">
                <Image
                  src={imageSrc}
                  alt={imageAlt}
                  fill
                  sizes="96vw"
                  className="object-contain"
                />
              </div>
            </DialogContent>
          </Dialog>
        ) : (
          imageCard
        )}
        <div className="max-w-xl">
          <div className="text-xs uppercase tracking-[0.2em] text-bronze">
            {eyebrow}
          </div>
          <h2 className="font-display mt-4 text-[clamp(2.25rem,4.5vw,4rem)] leading-[1.02] tracking-tight">
            {title}
          </h2>
          <p className="mt-6 text-lg text-muted-foreground">{description}</p>
          {ctaLabel && ctaHref && (
            <Link
              href={ctaHref}
              className="mt-8 inline-flex items-center gap-2 rounded-full border border-foreground px-6 py-3 text-sm font-medium text-foreground transition hover:bg-foreground hover:text-background"
            >
              {ctaLabel} →
            </Link>
          )}
        </div>
      </div>
    </section>
  )
}
