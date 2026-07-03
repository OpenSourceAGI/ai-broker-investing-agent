import Image from "next/image"
import Link from "next/link"
import { cn } from "@/lib/utils"

interface FeatureStorySectionProps {
  id?: string
  eyebrow: string
  title: React.ReactNode
  description: string
  ctaLabel: string
  ctaHref: string
  imageSrc: string
  imageAlt: string
  /** Renders on a fixed dark "ink" band instead of the theme background */
  ink?: boolean
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
  ink = false,
  reverse = false,
}: FeatureStorySectionProps) {
  return (
    <section id={id} className={cn(ink ? "bg-ink text-cream" : "bg-background text-foreground")}>
      <div
        className={cn(
          "mx-auto grid max-w-[1400px] items-center gap-12 px-6 py-20 md:grid-cols-2 md:py-28",
          reverse && "md:[&>*:first-child]:order-2",
        )}
      >
        <div className="relative aspect-[4/3] overflow-hidden rounded-3xl">
          <Image
            src={imageSrc}
            alt={imageAlt}
            fill
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-cover"
          />
        </div>
        <div className="max-w-xl">
          <div
            className={cn(
              "text-xs uppercase tracking-[0.2em]",
              ink ? "text-emerald-400" : "text-bronze",
            )}
          >
            {eyebrow}
          </div>
          <h2 className="font-display mt-4 text-[clamp(2.25rem,4.5vw,4rem)] leading-[1.02] tracking-tight">
            {title}
          </h2>
          <p className={cn("mt-6 text-lg", ink ? "text-cream/70" : "text-muted-foreground")}>
            {description}
          </p>
          <Link
            href={ctaHref}
            className={cn(
              "mt-8 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium transition",
              ink
                ? "bg-emerald-400 text-ink hover:brightness-95"
                : "border border-foreground text-foreground hover:bg-foreground hover:text-background",
            )}
          >
            {ctaLabel} →
          </Link>
        </div>
      </div>
    </section>
  )
}
