"use client"

import * as React from "react"
import { useState, useEffect } from "react"
import { useTheme } from "next-themes"
import {
  Brain,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  Key,
  Monitor,
  Moon,
  Palette,
  Save,
  Sun,
  TrendingUp,
  Users,
  Copy,
  RefreshCw,
  ShieldCheck,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  SlidersHorizontal,
} from "lucide-react"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import { TeamsManager } from "@/components/settings/teams-manager"
import { PremiumUpgrade } from "@/components/settings/premium-upgrade"
import { ThirdPartySyncTab } from "@/components/investing/tabs/third-party-sync-tab"
import { useTickerConfig, defaultTickerConfig, type TickerConfig } from "@/lib/ui-config"
import { Checkbox } from "@/components/ui/checkbox"
import { Slider } from "@/components/ui/slider"

const LLM_PROVIDERS = [
  {
    name: "XAI",
    models: "Grok, Grok Vision",
    docs: "https://docs.x.ai/docs#models",
    keys: "https://console.x.ai/",
    field: "xaiApiKey",
  },
  {
    name: "Groq",
    models: "Llama, DeepSeek, Gemini, Mistral",
    docs: "https://console.groq.com/docs/overview",
    keys: "https://console.groq.com/keys",
    field: "groqApiKey",
  },
  {
    name: "Ollama",
    models: "llama, mistral, mixtral, vicuna, gemma, qwen, deepseek",
    docs: "https://ollama.com/docs",
    keys: "https://ollama.com/settings/keys",
    field: "ollamaEndpoint",
    isEndpoint: true,
  },
  {
    name: "OpenAI",
    models: "o1, o1-mini, o4, gpt-4, gpt-4-turbo, gpt-4-omni",
    docs: "https://platform.openai.com/docs/overview",
    keys: "https://platform.openai.com/api-keys",
    field: "openaiApiKey",
  },
  {
    name: "Anthropic",
    models: "Claude Sonnet, Claude Opus, Claude Haiku",
    docs: "https://docs.anthropic.com/en/docs/welcome",
    keys: "https://console.anthropic.com/settings/keys",
    field: "anthropicApiKey",
  },
  {
    name: "TogetherAI",
    models: "Llama, Mistral, Mixtral, Qwen, Gemma, WizardLM",
    docs: "https://docs.together.ai/docs/quickstart",
    keys: "https://api.together.xyz/settings/api-keys",
    field: "togetheraiApiKey",
  },
  {
    name: "Perplexity",
    models: "Sonar, Sonar Deep Research",
    docs: "https://docs.perplexity.ai/models/model-cards",
    keys: "https://www.perplexity.ai/account/api/keys",
    field: "perplexityApiKey",
  },
  {
    name: "Cloudflare",
    models: "Llama, Gemma, Mistral, Phi, Qwen, DeepSeek",
    docs: "https://developers.cloudflare.com/workers-ai/",
    keys: "https://dash.cloudflare.com/profile/api-tokens",
    field: "cloudflareApiKey",
  },
  {
    name: "Google",
    models: "Gemini",
    docs: "https://cloud.google.com/vertex-ai/generative-ai/docs/learn/models",
    keys: "https://cloud.google.com/vertex-ai/generative-ai/docs/start/express-mode/overview#api-keys",
    field: "googleApiKey",
  },
]

const BROKERS = [
  {
    name: "Alpaca",
    fields: ["alpacaApiKey", "alpacaApiSecret", "alpacaPaper"],
    docs: "https://alpaca.markets/docs/",
    keys: "https://app.alpaca.markets/paper/dashboard/overview",
  },
  {
    name: "Webull",
    fields: ["webullUsername", "webullPassword", "webullDeviceId"],
    docs: "https://www.webull.com/api",
    keys: "https://app.webull.com/",
  },
  {
    name: "Robinhood",
    fields: ["robinhoodUsername", "robinhoodPassword"],
    docs: "https://robinhood.com/us/en/support/",
    keys: "https://robinhood.com/account",
  },
  {
    name: "Interactive Brokers",
    fields: ["ibkrUsername", "ibkrPassword"],
    docs: "https://www.interactivebrokers.com/api/",
    keys: "https://www.interactivebrokers.com/",
  }
]

const DATA_PROVIDERS = [
  {
    name: "Alpha Vantage",
    field: "alphaVantageApiKey",
    docs: "https://www.alphavantage.co/documentation/",
    keys: "https://www.alphavantage.co/support/#api-key",
  },
  {
    name: "Finnhub",
    field: "finnhubApiKey",
    docs: "https://finnhub.io/docs/api",
    keys: "https://finnhub.io/dashboard",
  },
  {
    name: "Polygon.io",
    field: "polygonApiKey",
    docs: "https://polygon.io/docs",
    keys: "https://polygon.io/dashboard/api-keys",
  },
]

const themeNames = [
  "modern-minimal",
  "pink-lemonade",
  "twitter",
  "mocha-mousse",
  "bubblegum",
  "amethyst-haze",
  "notebook",
  "doom-64",
  "catppuccin",
  "graphite",
  "perpetuity",
  "kodama-grove",
  "cosmic-night",
  "tangerine",
  "quantum-rose",
  "nature",
  "bold-tech",
  "elegant-luxury",
  "amber-minimal",
  "supabase",
  "neo-brutalism",
  "solar-dusk",
  "claymorphism",
  "cyberpunk",
  "pastel-dreams"
]

const themeColors: Record<string, { primary: string; secondary: string }> = {
  "modern-minimal": { primary: "#3b82f6", secondary: "#f3f4f6" },
  "pink-lemonade": { primary: "#a84370", secondary: "#f1c4e6" },
  "twitter": { primary: "#1e9df1", secondary: "#0f1419" },
  "mocha-mousse": { primary: "#A37764", secondary: "#BAAB92" },
  "bubblegum": { primary: "#d04f99", secondary: "#8acfd1" },
  "amethyst-haze": { primary: "#8a79ab", secondary: "#dfd9ec" },
  "notebook": { primary: "#606060", secondary: "#dedede" },
  "doom-64": { primary: "#b71c1c", secondary: "#556b2f" },
  "catppuccin": { primary: "#8839ef", secondary: "#ccd0da" },
  "graphite": { primary: "#606060", secondary: "#e0e0e0" },
  "perpetuity": { primary: "#06858e", secondary: "#d9eaea" },
  "kodama-grove": { primary: "#8d9d4f", secondary: "#decea0" },
  "cosmic-night": { primary: "#6e56cf", secondary: "#e4dfff" },
  "tangerine": { primary: "#e05d38", secondary: "#f3f4f6" },
  "quantum-rose": { primary: "#e6067a", secondary: "#ffd6ff" },
  "nature": { primary: "#2e7d32", secondary: "#e8f5e9" },
  "bold-tech": { primary: "#8b5cf6", secondary: "#f3f0ff" },
  "elegant-luxury": { primary: "#9b2c2c", secondary: "#fdf2d6" },
  "amber-minimal": { primary: "#f59e0b", secondary: "#f3f4f6" },
  "supabase": { primary: "#72e3ad", secondary: "#fdfdfd" },
  "neo-brutalism": { primary: "#ff3333", secondary: "#ffff00" },
  "solar-dusk": { primary: "#B45309", secondary: "#E4C090" },
  "claymorphism": { primary: "#6366f1", secondary: "#d6d3d1" },
  "cyberpunk": { primary: "#ff00c8", secondary: "#f0f0ff" },
  "pastel-dreams": { primary: "#a78bfa", secondary: "#e9d8fd" }
}

const navItems = [
  { name: "General", icon: Key, value: "general" },
  { name: "Config UI", icon: SlidersHorizontal, value: "configui" },
  { name: "LLM", icon: Brain, value: "llm" },
  { name: "Brokers", icon: TrendingUp, value: "brokers" },
  { name: "Data", icon: Database, value: "data" },
  { name: "Teams", icon: Users, value: "teams" },
  { name: "Third-Party Sync", icon: Database, value: "sync" },
]

export function SettingsDialog({
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [internalOpen, setInternalOpen] = React.useState(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen
  const setOpen = isControlled ? (onOpenChange ?? (() => {})) : setInternalOpen
  const [activeSection, setActiveSection] = React.useState("general")
  const [settings, setSettings] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [apiKey, setApiKey] = useState("")
  const [showApiKey, setShowApiKey] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [colorTheme, setColorTheme] = useState("modern-minimal")
  const [previewTheme, setPreviewTheme] = useState<string | null>(null)
  const [kycStatus, setKycStatus] = useState<string>("not_started")
  const [kycVerifiedAt, setKycVerifiedAt] = useState<Date | null>(null)
  const [startingKyc, setStartingKyc] = useState(false)
  const { tickerConfig, updateTickerConfig, saving: savingTickerConfig, saveConfig: saveTickerConfig } = useTickerConfig()

  useEffect(() => {
    const saved = localStorage.getItem("color-theme")
    if (saved && themeNames.includes(saved)) {
      setColorTheme(saved)
    }
  }, [])

  const handleThemeChange = (newTheme: string) => {
    setColorTheme(newTheme)
    localStorage.setItem("color-theme", newTheme)
    document.cookie = `color-theme=${newTheme}; path=/; max-age=31536000`
    themeNames.forEach(t => document.documentElement.classList.remove(`theme-${t}`))
    document.documentElement.classList.add(`theme-${newTheme}`)
    setPreviewTheme(null)
    toast.success(`Theme changed to ${newTheme}`)
  }

  const handleThemePreview = (themeName: string) => {
    setPreviewTheme(themeName)
    themeNames.forEach(t => document.documentElement.classList.remove(`theme-${t}`))
    document.documentElement.classList.add(`theme-${themeName}`)
  }

  const handlePreviewEnd = () => {
    if (previewTheme) {
      themeNames.forEach(t => document.documentElement.classList.remove(`theme-${t}`))
      document.documentElement.classList.add(`theme-${colorTheme}`)
      setPreviewTheme(null)
    }
  }

  const formatThemeName = (name: string) => {
    return name.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
  }

  useEffect(() => {
    setMounted(true)
    if (open) {
      fetchSettings()
      fetchKycStatus()
    }
  }, [open])

  const fetchSettings = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/user/settings")
      if (response.ok) {
        const data = await response.json()
        setSettings(data || {})
        setApiKey(data?.apiKey || "")
      }
    } catch (error) {
      console.error("Failed to fetch settings:", error)
      toast.error("Failed to load settings")
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const response = await fetch("/api/user/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })

      if (response.ok) {
        toast.success("Settings saved successfully")
      } else {
        toast.error("Failed to save settings")
      }
    } catch (error) {
      console.error("Failed to save settings:", error)
      toast.error("Failed to save settings")
    } finally {
      setSaving(false)
    }
  }

  const updateField = (field: string, value: any) => {
    setSettings((prev: any) => ({ ...prev, [field]: value }))
  }

  const toggleShowKey = (field: string) => {
    setShowKeys((prev) => ({ ...prev, [field]: !prev[field] }))
  }

  const copyApiKey = () => {
    navigator.clipboard.writeText(apiKey)
    toast.success("API key copied to clipboard")
  }

  const regenerateApiKey = async () => {
    setRegenerating(true)
    try {
      const response = await fetch("/api/user/api-key/regenerate", {
        method: "POST",
      })

      if (response.ok) {
        const data = await response.json()
        setApiKey(data.apiKey)
        toast.success("API key regenerated successfully")
      } else {
        toast.error("Failed to regenerate API key")
      }
    } catch (error) {
      console.error("Failed to regenerate API key:", error)
      toast.error("Failed to regenerate API key")
    } finally {
      setRegenerating(false)
    }
  }

  const fetchKycStatus = async () => {
    try {
      const response = await fetch("/api/kyc/start")
      if (response.ok) {
        const data = await response.json()
        setKycStatus(data.status || "not_started")
        if (data.verifiedAt) {
          setKycVerifiedAt(new Date(data.verifiedAt))
        }
      }
    } catch (error) {
      console.error("Failed to fetch KYC status:", error)
    }
  }

  const startKycVerification = async () => {
    setStartingKyc(true)
    try {
      const response = await fetch("/api/kyc/start", {
        method: "POST",
      })

      if (response.ok) {
        const data = await response.json()
        // Open Didit verification flow in a new window
        window.open(data.url, "_blank", "width=800,height=900")
        setKycStatus("pending")
        toast.success("KYC verification started. Please complete the process in the new window.")

        // Poll for status updates every 5 seconds
        const pollInterval = setInterval(async () => {
          const statusResponse = await fetch("/api/kyc/start")
          if (statusResponse.ok) {
            const statusData = await statusResponse.json()
            if (statusData.status !== "pending") {
              setKycStatus(statusData.status)
              if (statusData.verifiedAt) {
                setKycVerifiedAt(new Date(statusData.verifiedAt))
              }
              clearInterval(pollInterval)

              if (statusData.status === "approved") {
                toast.success("KYC verification approved!")
              } else if (statusData.status === "rejected") {
                toast.error("KYC verification was rejected. Please contact support.")
              }
            }
          }
        }, 5000)

        // Stop polling after 30 minutes
        setTimeout(() => clearInterval(pollInterval), 30 * 60 * 1000)
      } else {
        const error = await response.json()
        toast.error(error.error || "Failed to start KYC verification")
      }
    } catch (error) {
      console.error("Failed to start KYC verification:", error)
      toast.error("Failed to start KYC verification")
    } finally {
      setStartingKyc(false)
    }
  }

  const getKycStatusBadge = () => {
    switch (kycStatus) {
      case "approved":
        return (
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="h-5 w-5" />
            <span className="font-medium">Verified</span>
          </div>
        )
      case "rejected":
        return (
          <div className="flex items-center gap-2 text-red-600">
            <XCircle className="h-5 w-5" />
            <span className="font-medium">Rejected</span>
          </div>
        )
      case "pending":
      case "in_review":
        return (
          <div className="flex items-center gap-2 text-yellow-600">
            <Clock className="h-5 w-5" />
            <span className="font-medium">Under Review</span>
          </div>
        )
      case "abandoned":
        return (
          <div className="flex items-center gap-2 text-gray-600">
            <AlertCircle className="h-5 w-5" />
            <span className="font-medium">Incomplete</span>
          </div>
        )
      case "expired":
        return (
          <div className="flex items-center gap-2 text-gray-600">
            <AlertCircle className="h-5 w-5" />
            <span className="font-medium">Expired</span>
          </div>
        )
      default:
        return (
          <div className="flex items-center gap-2 text-gray-600">
            <AlertCircle className="h-5 w-5" />
            <span className="font-medium">Not Started</span>
          </div>
        )
    }
  }

  const renderGeneralSection = () => (
    <div className="space-y-6">
      <PremiumUpgrade />

      {/* KYC Verification Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              <CardTitle>KYC Verification</CardTitle>
            </div>
            {getKycStatusBadge()}
          </div>
          <CardDescription>
            Verify your identity to unlock advanced features and higher trading limits
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {kycStatus === "approved" && kycVerifiedAt && (
            <div className="rounded-lg bg-green-50 dark:bg-green-950/20 p-4 text-sm">
              <p className="text-green-800 dark:text-green-200">
                Your identity has been verified on{" "}
                {new Date(kycVerifiedAt).toLocaleDateString()}
              </p>
            </div>
          )}

          {kycStatus === "rejected" && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/20 p-4 text-sm">
              <p className="text-red-800 dark:text-red-200">
                Your verification was not approved. You can resubmit your documents below, or contact support for more information.
              </p>
            </div>
          )}

          {kycStatus === "pending" || kycStatus === "in_review" ? (
            <div className="rounded-lg bg-yellow-50 dark:bg-yellow-950/20 p-4 text-sm">
              <p className="text-yellow-800 dark:text-yellow-200">
                Your verification is currently being reviewed. This typically takes 1-2 business days.
              </p>
            </div>
          ) : null}

          {kycStatus === "abandoned" && (
            <div className="rounded-lg bg-gray-50 dark:bg-gray-950/20 p-4 text-sm">
              <p className="text-gray-800 dark:text-gray-200">
                Your previous verification was not completed. Please start a new verification.
              </p>
            </div>
          )}

          {kycStatus === "expired" && (
            <div className="rounded-lg bg-gray-50 dark:bg-gray-950/20 p-4 text-sm">
              <p className="text-gray-800 dark:text-gray-200">
                Your previous verification session expired. Please start a new verification.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <h4 className="font-medium text-sm">What you'll need:</h4>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Government-issued ID (passport, driver's license, or national ID)</li>
              <li>A device with a camera for selfie verification</li>
              <li>5-10 minutes to complete the process</li>
            </ul>
          </div>

          {kycStatus !== "approved" && kycStatus !== "pending" && kycStatus !== "in_review" && (
            <Button
              onClick={startKycVerification}
              disabled={startingKyc}
              className="w-full"
            >
              {startingKyc ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Starting Verification...
                </>
              ) : ["rejected", "abandoned", "expired"].includes(kycStatus) ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Resubmit KYC Verification
                </>
              ) : (
                <>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Start KYC Verification
                </>
              )}
            </Button>
          )}

          <p className="text-xs text-muted-foreground">
            KYC verification is powered by{" "}
            <a
              href="https://didit.me"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Didit.me
            </a>
            , a secure identity verification platform.
          </p>
        </CardContent>
      </Card>

      {/* API Key Section */}
      <Card>
        <CardHeader>
          <CardTitle>API Key</CardTitle>
          <CardDescription>
            Use this key as Bearer to authenticate requests to the AI Broker API
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="apiKey">Your API Key</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="apiKey"
                  type={showApiKey ? "text" : "password"}
                  value={apiKey || "No API key generated yet"}
                  readOnly
                  className="pr-10 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={copyApiKey}
                disabled={!apiKey}
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                onClick={regenerateApiKey}
                disabled={regenerating}
              >
                {regenerating ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Regenerating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Regenerate
                  </>
                )}
              </Button>
            </div>
            <h4 className="font-medium mb-2">
              <a target="_blank" href="/api/docs">API Documentation</a>
            </h4>
          </div>
        </CardContent>
      </Card>

      {/* Appearance Section */}
      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
          <CardDescription>
            Choose your preferred color scheme
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <button
              onClick={() => setTheme("light")}
              className={`relative flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors hover:bg-accent ${theme === "light" ? "border-primary" : "border-muted"
                }`}
            >
              <Sun className="h-8 w-8" />
              <span className="font-medium">Light</span>
              {theme === "light" && (
                <div className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary" />
              )}
            </button>

            <button
              onClick={() => setTheme("dark")}
              className={`relative flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors hover:bg-accent ${theme === "dark" ? "border-primary" : "border-muted"
                }`}
            >
              <Moon className="h-8 w-8" />
              <span className="font-medium">Dark</span>
              {theme === "dark" && (
                <div className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary" />
              )}
            </button>

            <button
              onClick={() => setTheme("system")}
              className={`relative flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors hover:bg-accent ${theme === "system" ? "border-primary" : "border-muted"
                }`}
            >
              <Monitor className="h-8 w-8" />
              <span className="font-medium">System</span>
              {theme === "system" && (
                <div className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary" />
              )}
            </button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="colorTheme">Color Theme</Label>
            <DropdownMenu onOpenChange={(open) => !open && handlePreviewEnd()}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <div
                        className="w-3 h-3 rounded-full border border-black/10"
                        style={{ backgroundColor: themeColors[colorTheme]?.primary }}
                      />
                      <div
                        className="w-3 h-3 rounded-full border border-black/10"
                        style={{ backgroundColor: themeColors[colorTheme]?.secondary }}
                      />
                    </div>
                    <span>{formatThemeName(colorTheme)}</span>
                  </div>
                  <Palette className="h-4 w-4 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[400px] max-h-[400px] overflow-y-auto">
                {themeNames.map((themeName) => {
                  const colors = themeColors[themeName];
                  return (
                    <DropdownMenuItem
                      key={themeName}
                      onClick={() => handleThemeChange(themeName)}
                      onMouseEnter={() => handleThemePreview(themeName)}
                      onMouseLeave={handlePreviewEnd}
                      className={`cursor-pointer ${colorTheme === themeName ? "bg-accent" : ""
                        }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <div
                              className="w-3 h-3 rounded-full border border-black/10"
                              style={{ backgroundColor: colors.primary }}
                            />
                            <div
                              className="w-3 h-3 rounded-full border border-black/10"
                              style={{ backgroundColor: colors.secondary }}
                            />
                          </div>
                          <span>{formatThemeName(themeName)}</span>
                        </div>
                        {colorTheme === themeName && (
                          <span className="text-xs">✓</span>
                        )}
                      </div>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
            <p className="text-sm text-muted-foreground">
              Select a color palette for the application. Hover to preview.
            </p>
          </div>

          <p className="text-sm text-muted-foreground">
            {theme === "system"
              ? "Your theme will match your system preferences"
              : `Currently using ${theme} mode`}
          </p>
        </CardContent>
      </Card>
    </div>
  )

  const renderLLMSection = () => (
    <Card>
      <CardHeader>
        <CardTitle>LLM API Keys</CardTitle>
        <CardDescription>
          Configure your API keys for various LLM providers. These will be used for AI-powered analysis.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Provider Comparison Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 w-[15%]">Provider</th>
                <th className="text-left py-2 w-[30%]">API Key</th>
                <th className="text-left py-2 w-[25%]">Models</th>
                <th className="text-left py-2 w-[15%]">Links</th>
              </tr>
            </thead>
            <tbody>
              {LLM_PROVIDERS.map((provider) => (
                <tr key={provider.name} className="border-b hover:bg-muted/50">
                  <td className="py-3 font-medium align-middle">{provider.name}</td>
                  <td className="py-3 align-middle pr-4">
                    <div className="relative">
                      <Input
                        id={provider.field}
                        type={showKeys[provider.field] ? "text" : "password"}
                        placeholder={provider.isEndpoint ? "http://localhost:11434" : "sk-..."}
                        value={settings[provider.field] || ""}
                        onChange={(e) => updateField(provider.field, e.target.value)}
                        className="h-9"
                      />
                      <button
                        type="button"
                        onClick={() => toggleShowKey(provider.field)}
                        className="absolute right-2 top-1/2 -translate-y-1/2"
                      >
                        {showKeys[provider.field] ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                    </div>
                  </td>
                  <td className="py-3 text-muted-foreground text-xs align-middle">
                    {provider.models}
                  </td>
                  <td className="py-3 align-middle">
                    <div className="flex flex-col gap-1">
                      <a
                        href={provider.docs}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline flex items-center gap-1 text-xs"
                      >
                        Docs <ExternalLink className="h-3 w-3" />
                      </a>
                      <a
                        href={provider.keys}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline flex items-center gap-1 text-xs"
                      >
                        Get Key <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Preferred Provider */}
        <div className="pt-4 border-t">
          <Label htmlFor="preferredProvider">Preferred LLM Provider</Label>
          <select
            id="preferredProvider"
            className="w-full mt-2 p-2 border rounded-md bg-background"
            value={settings.preferredProvider || "groq"}
            onChange={(e) => updateField("preferredProvider", e.target.value)}
          >
            {LLM_PROVIDERS.map((provider) => (
              <option key={provider.field} value={provider.field.replace("ApiKey", "").replace("Endpoint", "")}>
                {provider.name}
              </option>
            ))}
          </select>
        </div>
      </CardContent>
    </Card>
  )

  const renderBrokersSection = () => (
    <div className="grid gap-6">
      {BROKERS.map((broker) => (
        <Card key={broker.name}>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>{broker.name}</CardTitle>
                <CardDescription>Configure your {broker.name} connection</CardDescription>
              </div>
              <div className="flex gap-2">
                <a href={broker.docs} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Docs
                  </Button>
                </a>
                <a href={broker.keys} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Get Keys
                  </Button>
                </a>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {broker.fields.map((field) => (
              <div key={field} className="space-y-2">
                <Label htmlFor={field}>
                  {field
                    .replace(/([A-Z])/g, " $1")
                    .replace(/^./, (str) => str.toUpperCase())
                    .trim()}
                </Label>
                {field === "alpacaPaper" ? (
                  <div className="flex items-center space-x-2">
                    <Switch
                      id={field}
                      checked={settings[field] !== false}
                      onCheckedChange={(checked) => updateField(field, checked)}
                    />
                    <Label htmlFor={field} className="font-normal">
                      Use Paper Trading
                    </Label>
                  </div>
                ) : (
                  <div className="relative">
                    <Input
                      id={field}
                      type={showKeys[field] ? "text" : "password"}
                      placeholder={field.includes("Key") || field.includes("Secret") ? "••••••••" : ""}
                      value={settings[field] || ""}
                      onChange={(e) => updateField(field, e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => toggleShowKey(field)}
                      className="absolute right-2 top-1/2 -translate-y-1/2"
                    >
                      {showKeys[field] ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )

  const renderDataSection = () => (
    <Card>
      <CardHeader>
        <CardTitle>Data Provider API Keys</CardTitle>
        <CardDescription>
          Configure API keys for market data providers
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {DATA_PROVIDERS.map((provider) => (
          <div key={provider.field} className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor={provider.field}>{provider.name}</Label>
              <div className="flex gap-2">
                <a href={provider.docs} target="_blank" rel="noopener noreferrer">
                  <Button variant="ghost" size="sm">
                    <ExternalLink className="mr-1 h-3 w-3" />
                    Docs
                  </Button>
                </a>
                <a href={provider.keys} target="_blank" rel="noopener noreferrer">
                  <Button variant="ghost" size="sm">
                    <ExternalLink className="mr-1 h-3 w-3" />
                    Keys
                  </Button>
                </a>
              </div>
            </div>
            <div className="relative">
              <Input
                id={provider.field}
                type={showKeys[provider.field] ? "text" : "password"}
                placeholder="API Key"
                value={settings[provider.field] || ""}
                onChange={(e) => updateField(provider.field, e.target.value)}
              />
              <button
                type="button"
                onClick={() => toggleShowKey(provider.field)}
                className="absolute right-2 top-1/2 -translate-y-1/2"
              >
                {showKeys[provider.field] ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )

  const renderTeamsSection = () => <TeamsManager />

  const renderSyncSection = () => <ThirdPartySyncTab />

  const handleSaveTickerConfig = async () => {
    try {
      await saveTickerConfig()
      toast.success("Ticker settings saved successfully")
    } catch (error) {
      toast.error("Failed to save ticker settings")
    }
  }

  const renderConfigUISection = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Stock Ticker Display</CardTitle>
          <CardDescription>
            Configure how the stock ticker displays information in the header
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Display Options */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Display Options</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="showIcon"
                  checked={tickerConfig.showIcon}
                  onCheckedChange={(checked) => updateTickerConfig({ showIcon: !!checked })}
                />
                <Label htmlFor="showIcon" className="font-normal">Show Icon</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="showSymbol"
                  checked={tickerConfig.showSymbol}
                  onCheckedChange={(checked) => updateTickerConfig({ showSymbol: !!checked })}
                />
                <Label htmlFor="showSymbol" className="font-normal">Show Symbol</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="showName"
                  checked={tickerConfig.showName}
                  onCheckedChange={(checked) => updateTickerConfig({ showName: !!checked })}
                />
                <Label htmlFor="showName" className="font-normal">Show Name</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="showPriceStock"
                  checked={tickerConfig.showPriceStock}
                  onCheckedChange={(checked) => updateTickerConfig({ showPriceStock: !!checked })}
                />
                <Label htmlFor="showPriceStock" className="font-normal">Show Stock Price</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="showPriceIndex"
                  checked={tickerConfig.showPriceIndex}
                  onCheckedChange={(checked) => updateTickerConfig({ showPriceIndex: !!checked })}
                />
                <Label htmlFor="showPriceIndex" className="font-normal">Show Index Price</Label>
              </div>
            </div>
          </div>

          {/* Time Intervals */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Time Intervals</h4>
            <p className="text-xs text-muted-foreground">Select which time periods to show change indicators for</p>
            <div className="flex gap-4">
              {(["d", "w", "m", "y"] as const).map((interval) => (
                <div key={interval} className="flex items-center space-x-2">
                  <Checkbox
                    id={`interval-${interval}`}
                    checked={tickerConfig.enabledIntervals.includes(interval)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        updateTickerConfig({
                          enabledIntervals: [...tickerConfig.enabledIntervals, interval],
                        })
                      } else {
                        updateTickerConfig({
                          enabledIntervals: tickerConfig.enabledIntervals.filter((i) => i !== interval),
                        })
                      }
                    }}
                  />
                  <Label htmlFor={`interval-${interval}`} className="font-normal uppercase">
                    {interval === "d" ? "Daily" : interval === "w" ? "Weekly" : interval === "m" ? "Monthly" : "Yearly"}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Change Display Options */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Change Display Options</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="orderHistorical"
                  checked={tickerConfig.orderHistorical}
                  onCheckedChange={(checked) => updateTickerConfig({ orderHistorical: !!checked })}
                />
                <Label htmlFor="orderHistorical" className="font-normal">
                  Order Historical (Y, M, W, D)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="showMinusSign"
                  checked={tickerConfig.showMinusSign}
                  onCheckedChange={(checked) => updateTickerConfig({ showMinusSign: !!checked })}
                />
                <Label htmlFor="showMinusSign" className="font-normal">Show Minus Sign</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="showDeltaSymbols"
                  checked={tickerConfig.showDeltaSymbols}
                  onCheckedChange={(checked) => updateTickerConfig({ showDeltaSymbols: !!checked })}
                />
                <Label htmlFor="showDeltaSymbols" className="font-normal">Show Delta Symbols (▲/▼)</Label>
              </div>
            </div>
          </div>

          {/* Neutral Magnitude Threshold */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium">Neutral Magnitude Threshold</h4>
                <p className="text-xs text-muted-foreground">
                  Changes below this percentage are shown as neutral (no color)
                </p>
              </div>
              <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
                {tickerConfig.setNeutralMagnitude}%
              </span>
            </div>
            <Slider
              value={[tickerConfig.setNeutralMagnitude]}
              onValueChange={([value]) => updateTickerConfig({ setNeutralMagnitude: value })}
              min={0}
              max={20}
              step={1}
              className="w-full"
            />
          </div>

          {/* Reset to Defaults */}
          <div className="flex justify-between pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => updateTickerConfig(defaultTickerConfig)}
            >
              Reset to Defaults
            </Button>
            <Button
              onClick={handleSaveTickerConfig}
              disabled={savingTickerConfig}
            >
              <Save className="mr-2 h-4 w-4" />
              {savingTickerConfig ? "Saving..." : "Save Ticker Settings"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )

  const renderContent = () => {
    if (loading || !mounted) {
      return <div className="flex items-center justify-center h-full">Loading...</div>
    }

    switch (activeSection) {
      case "general":
        return renderGeneralSection()
      case "configui":
        return renderConfigUISection()
      case "llm":
        return renderLLMSection()
      case "brokers":
        return renderBrokersSection()
      case "data":
        return renderDataSection()
      case "teams":
        return renderTeamsSection()
      case "sync":
        return renderSyncSection()
      default:
        return renderGeneralSection()
    }
  }

  const activeSectionName = navItems.find(item => item.value === activeSection)?.name || "Settings"

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && (
        <DialogTrigger asChild>
          {trigger}
        </DialogTrigger>
      )}
      <DialogContent className="overflow-hidden p-0 md:max-h-[600px] md:max-w-[900px] lg:max-w-[1000px]">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Customize your settings here.
        </DialogDescription>
        <SidebarProvider className="items-start">
          <Sidebar collapsible="none" className="hidden md:flex">
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {navItems.map((item) => (
                      <SidebarMenuItem key={item.name}>
                        <SidebarMenuButton
                          onClick={() => setActiveSection(item.value)}
                          isActive={activeSection === item.value}
                        >
                          <item.icon />
                          <span>{item.name}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>
          <main className="flex h-[600px] flex-1 flex-col overflow-hidden">
            <header className="flex shrink-0 flex-col border-b">
              <div className="flex h-14 items-center gap-2 px-4">
                <div className="flex items-center justify-between w-full">
                  <Breadcrumb>
                    <BreadcrumbList>
                      <BreadcrumbItem className="hidden md:block">
                        <BreadcrumbLink href="#">Settings</BreadcrumbLink>
                      </BreadcrumbItem>
                      <BreadcrumbSeparator className="hidden md:block" />
                      <BreadcrumbItem>
                        <BreadcrumbPage>{activeSectionName}</BreadcrumbPage>
                      </BreadcrumbItem>
                    </BreadcrumbList>
                  </Breadcrumb>
                  <Button onClick={handleSave} disabled={saving} size="sm">
                    <Save className="mr-2 h-4 w-4" />
                    {saving ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
              {/* Mobile navigation tabs */}
              <div className="flex md:hidden overflow-x-auto px-2 pb-2 gap-1">
                {navItems.map((item) => (
                  <button
                    key={item.value}
                    onClick={() => setActiveSection(item.value)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                      activeSection === item.value
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted hover:bg-muted/80"
                    }`}
                  >
                    <item.icon className="h-3.5 w-3.5" />
                    {item.name}
                  </button>
                ))}
              </div>
            </header>
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
              {renderContent()}
            </div>
          </main>
        </SidebarProvider>
      </DialogContent>
    </Dialog>
  )
}
