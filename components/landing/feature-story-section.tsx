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
  imageClassName?: string
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
  reverse = false,
}: FeatureStorySectionProps) {
  return (
    <section id={id} className="bg-background text-foreground">
      <div
        className={cn(
          "mx-auto grid max-w-[1400px] items-center gap-12 px-6 py-20 md:grid-cols-2 md:py-28",
          reverse && "md:[&>*:first-child]:order-2",
        )}
      >
        <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-border bg-card/60">
          <Image
            src={imageSrc}
            alt={imageAlt}
            fill
            sizes="(min-width: 768px) 50vw, 100vw"
            className={imageClassName}
          />
        </div>
        <div className="max-w-xl">
          <div className="text-xs uppercase tracking-[0.2em] text-bronze">
            {eyebrow}
          </div>
          <h2 className="font-display mt-4 text-[clamp(2.25rem,4.5vw,4rem)] leading-[1.02] tracking-tight">
            {title}
          </h2>
          <p className="mt-6 text-lg text-muted-foreground">{description}</p>
          <Link
            href={ctaHref}
            className="mt-8 inline-flex items-center gap-2 rounded-full border border-foreground px-6 py-3 text-sm font-medium text-foreground transition hover:bg-foreground hover:text-background"
          >
            {ctaLabel} →
          </Link>
        </div>
      </div>
    </section>
  )
}
