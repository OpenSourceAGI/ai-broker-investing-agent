import type { Metadata } from "next";
import { title } from "@/lib/layout.shared";

export function createMetadata(override: Metadata): Metadata {
  return {
    ...override,
    openGraph: {
      title: override.title ?? undefined,
      description: override.description ?? undefined,
      url: "https://fumadocsstarter.vercel.app",
      images: "/banner.png",
      siteName: title,
      ...override.openGraph,
    },
    twitter: {
      card: "summary_large_image",
      creator: "@AnirudhWith",
      title: override.title ?? undefined,
      description: override.description ?? undefined,
      images: "/banner.png",
      ...override.twitter,
    },
  };
}

export function getPageImage(page: any) {
  const segments = [...page.slugs, "image.webp"];
  return {
    segments,
    url: `/og/${segments.join("/")}`,
  };
}

export const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
