"use client"

import { Button } from "@/components/ui/button"
import Image from "next/image"
import { Spotlight } from "@/components/ui/spotlight-new"
import { AnimatedGridPattern } from "@/components/ui/animated-grid-pattern"
import { BorderBeam } from "@/components/ui/border-beam"
import { Marquee } from "@/components/ui/marquee"
import { motion } from "motion/react"
import { cn } from "@/lib/utils"
import {
  Users,
  Target,
  MessageSquare,
  TrendingUp,
  BarChart3,
  Clock,
  Bot,
  Newspaper,
  Zap,
  Calendar,
  FileText,
  ArrowUpRight,
  LogIn,
} from "lucide-react"
import Link from "next/link"
import { InfoTooltip } from "@/components/landing/info-tooltip"

const features = [
  { icon: Users, label: "Multi-Agent Teams" },
  { icon: BarChart3, label: "Algo Strategies" },
  { icon: TrendingUp, label: "Prediction Markets" },
  { icon: MessageSquare, label: "Copy Trading" },
  { icon: Clock, label: "Time Travel Backtesting" },
  { icon: Bot, label: "Chatbot Algo Builder" },
  { icon: Newspaper, label: "News Opinion Scanner" },
  { icon: Zap, label: "Real-Time Signals" },
]

const sparklinePoints = "0,38 12,32 24,35 36,26 48,29 60,20 72,24 84,14 96,18 108,8 120,12 132,4"

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
}

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-white dark:bg-black/[0.96] antialiased">
      {/* Background effects */}
      <AnimatedGridPattern
        numSquares={40}
        maxOpacity={0.08}
        duration={3}
        className={cn(
          "text-primary [mask-image:radial-gradient(700px_circle_at_center,white,transparent)]",
          "inset-x-0 h-full skew-y-6",
        )}
      />
      <Spotlight />
      <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-emerald-500/20 blur-3xl animate-hero-orb" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full bg-violet-500/15 blur-3xl animate-hero-orb [animation-delay:-5s]" />

      <div className="mx-auto max-w-7xl px-6 pt-16 pb-8 lg:px-8 relative z-10 min-h-[85vh] flex flex-col justify-center">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left: copy + CTAs */}
          <div className="flex flex-col items-center lg:items-start text-center lg:text-left">
            <motion.div
              {...fadeUp}
              transition={{ duration: 0.5 }}
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 text-sm backdrop-blur-sm"
            >
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              <span className="text-muted-foreground">AI Agents for Stocks & Prediction Markets</span>
            </motion.div>

            <motion.h1
              {...fadeUp}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-balance text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl leading-tight"
            >
              <span className="block bg-gradient-to-br from-foreground via-foreground to-foreground/40 bg-clip-text text-transparent">
                Vibe-Trade Like a Boss
              </span>
              <span className="block bg-gradient-to-r from-primary via-emerald-400 to-teal-400 bg-clip-text text-transparent">
                Auto-Invest Like a Hedge Fund
              </span>
            </motion.h1>

            <motion.p
              {...fadeUp}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mt-6 max-w-md text-lg text-muted-foreground"
            >
              AI agents research, debate, and trade for you.{" "}
              <InfoTooltip>
                Teams of specialized AI agents gather data, hold bull-vs-bear debates, and execute
                trades across stocks and prediction markets — like a hedge fund research desk on
                autopilot.
              </InfoTooltip>
            </motion.p>

            <motion.div
              {...fadeUp}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="mt-8 flex flex-wrap items-center justify-center lg:justify-start gap-4"
            >
              <Link href="/login" rel="noopener noreferrer">
                <button className="relative inline-flex h-12 overflow-hidden rounded-full p-[1px] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background">
                  <span className="absolute inset-[-1000%] animate-[spin_2s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#34d399_0%,#065f46_50%,#34d399_100%)]" />
                  <span className="inline-flex h-full w-full cursor-pointer items-center justify-center rounded-full bg-green-600 dark:bg-green-700 px-6 text-sm font-medium text-white backdrop-blur-3xl space-x-2">
                    <LogIn className="h-5 w-5" />
                    <span>Start Trading</span>
                  </span>
                </button>
              </Link>

              <Button variant="outline" size="lg" asChild>
                <Link href="/survey">
                  <Calendar className="mr-2 h-5 w-5" />
                  Book a Demo
                </Link>
              </Button>
            </motion.div>

            <motion.div
              {...fadeUp}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="mt-6 flex flex-wrap items-center justify-center lg:justify-start gap-5"
            >
              <Link href="https://play.google.com/store/apps/details?id=com.autoinvestment.broker.app" target="_blank" rel="noopener noreferrer">
                <Image
                  src="/images/download-google-play.png"
                  alt="Get it on Google Play"
                  width={160}
                  height={48}
                  className="h-11 w-auto transition-all duration-300 hover:scale-105 hover:drop-shadow-[0_10px_10px_rgba(0,0,0,0.25)] active:scale-95"
                />
              </Link>
              <Link
                href="/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Target className="h-4 w-4" />
                Docs
                <ArrowUpRight className="h-3 w-3" />
              </Link>
              <Link
                href="https://drive.google.com/file/d/1QJqoy3on4Q34djAM2DgMW7udBRfSHuMg/view?usp=drive_link"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <FileText className="h-4 w-4" />
                Paper
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            </motion.div>
          </div>

          {/* Right: video + floating graphics */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative"
          >
            <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-border/50 bg-background/50 backdrop-blur-sm aspect-video">
              <iframe
                className="absolute inset-0 w-full h-full"
                src="https://www.youtube.com/embed/Sns0krBn5WA?autoplay=1&mute=1&controls=0&loop=1&playlist=Sns0krBn5WA&rel=0"
                title="Auto-invest Demo"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
              <BorderBeam size={80} duration={7} />
            </div>

            {/* Floating signal card */}
            <div className="absolute -top-6 -left-4 sm:-left-8 animate-hero-float">
              <div className="rounded-xl border border-border/60 bg-background/80 backdrop-blur-md px-4 py-3 shadow-lg">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                  Portfolio Manager
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-sm font-bold text-emerald-500">
                    BUY
                  </span>
                  <span className="text-sm font-semibold">NVDA</span>
                  <span className="text-xs text-emerald-500 font-medium">+2.4%</span>
                </div>
              </div>
            </div>

            {/* Floating sparkline card */}
            <div className="absolute -bottom-8 -right-2 sm:-right-6 animate-hero-float [animation-delay:-3s]">
              <div className="rounded-xl border border-border/60 bg-background/80 backdrop-blur-md px-4 py-3 shadow-lg">
                <div className="flex items-center justify-between gap-6 mb-1.5">
                  <span className="text-xs text-muted-foreground">Strategy P&L</span>
                  <span className="text-xs font-semibold text-emerald-500">+18.2%</span>
                </div>
                <svg width="132" height="42" viewBox="0 0 132 42" fill="none" aria-hidden="true">
                  <polyline
                    points={sparklinePoints}
                    stroke="oklch(0.7 0.17 155)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <polygon
                    points={`${sparklinePoints} 132,42 0,42`}
                    fill="url(#hero-sparkline-fill)"
                  />
                  <defs>
                    <linearGradient id="hero-sparkline-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.7 0.17 155)" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="oklch(0.7 0.17 155)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>

            {/* Floating debate chip */}
            <div className="absolute top-1/2 -right-3 sm:-right-10 animate-hero-float [animation-delay:-1.5s]">
              <div className="rounded-full border border-border/60 bg-background/80 backdrop-blur-md px-4 py-2 shadow-lg flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium">Bull vs Bear: 7 rounds</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Feature marquee — icons over text */}
        <motion.div
          {...fadeUp}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="relative mt-20"
        >
          <Marquee pauseOnHover className="[--duration:30s]">
            {features.map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-3 rounded-full border border-border/60 bg-card/50 px-5 py-2.5 backdrop-blur-sm"
              >
                <item.icon className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium whitespace-nowrap">{item.label}</span>
              </div>
            ))}
          </Marquee>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-white dark:from-black" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-white dark:from-black" />
        </motion.div>
      </div>
    </section>
  )
}
