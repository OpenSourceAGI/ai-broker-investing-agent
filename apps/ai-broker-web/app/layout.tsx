import type React from "react"
import type { Metadata, Viewport } from "next"
import { Instrument_Serif } from "next/font/google"
import { cookies } from "next/headers"
import { ThemeProvider } from "@/components/theme/theme-provider"
import { UIConfigProvider } from "@/lib/ui-config"
import "./globals.css"
import "@/components/theme/themes-shadcn.css"
import { ConditionalLayoutWrapper } from "@/components/layout/conditional-layout-wrapper"

const instrumentSerif = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-instrument-serif",
})

export const metadata: Metadata = {
  title: "AI Broker - LLM Agents Debate Stocks & Events",
  description:
    "AI multi-agent stock & event markets system with next-day price predictions and comprehensive trading insights",
  icons: {
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const cookieStore = await cookies()
  const theme = cookieStore.get("color-theme")?.value || "modern-minimal"

  return (
    <html lang="en" suppressHydrationWarning className={`theme-${theme}`}>
      <body className={`font-sans antialiased ${instrumentSerif.variable}`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <UIConfigProvider>
            <ConditionalLayoutWrapper>
              {children}
            </ConditionalLayoutWrapper>
          </UIConfigProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
