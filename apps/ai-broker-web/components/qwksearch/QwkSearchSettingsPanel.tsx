"use client"

/**
 * Settings → QwkSearch Account (the QwkSearch account the research agent
 * runs as) and Settings → Research Agent (the agent's own settings).
 *
 * The account is linked through "Sign in with QwkSearch" or by pasting a
 * QwkSearch API key, and is managed apart from AI Broker's own API key and
 * LLM keys (see ./connect-auth.ts). The agent settings come from
 * research-agent-ui (see ./preferences.ts).
 */
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { ExternalLink, Key, Loader2, LogOut, RefreshCw, Save, Search, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { QWKSEARCH_ORIGIN } from "./base-url"
import {
  connectQwkSearch,
  disconnectQwkSearch,
  linkQwkSearchApiKey,
  loadQwkSearchSession,
  useQwkSearchSession,
} from "./connect-auth"
import {
  applyLocalPreferences,
  defaultPreferenceValue,
  fetchSavedPreferences,
  qwksearchPreferenceFields,
  readLocalPreferences,
  savePreferences,
  type QwkSearchPreferences,
} from "./preferences"

const planLabel = (plan?: string | null) => (plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : "Free")

export function QwkSearchAccountCard() {
  const { session, isPending } = useQwkSearchSession()
  const [apiKey, setApiKey] = useState("")
  const [busy, setBusy] = useState<"link" | "refresh" | "unlink" | null>(null)

  // Coming back from an upgrade on QwkSearch: re-read the plan.
  useEffect(() => {
    const onFocus = () => {
      if (session.connected) void loadQwkSearchSession(true)
    }
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [session.connected])

  const linkKey = async () => {
    setBusy("link")
    try {
      await linkQwkSearchApiKey(apiKey.trim())
      setApiKey("")
      toast.success("QwkSearch account linked.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not link that QwkSearch API key.")
    } finally {
      setBusy(null)
    }
  }

  const refresh = async () => {
    setBusy("refresh")
    try {
      const next = await loadQwkSearchSession(true)
      if (!next.connected) toast.info("Your QwkSearch account was unlinked because its API key changed. Sign in again.")
    } finally {
      setBusy(null)
    }
  }

  const unlink = async () => {
    setBusy("unlink")
    try {
      await disconnectQwkSearch()
      toast.success("Signed out of QwkSearch.")
    } catch {
      toast.error("Failed to sign out of QwkSearch.")
    } finally {
      setBusy(null)
    }
  }

  const { user, plan, upgradeUrl } = session
  const connected = session.connected && !!user
  const isFree = !plan || plan === "free"

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          <CardTitle>QwkSearch Account</CardTitle>
        </div>
        <CardDescription>
          The Research Agent runs on QwkSearch. Sign in to your QwkSearch account to save research chats and use
          your QwkSearch plan. Its API key is kept separately from your AI Broker keys.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isPending ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : connected ? (
          <>
            <div className="flex items-center gap-3">
              {user.image ? (
                <img src={user.image} alt="" className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted font-medium text-muted-foreground">
                  {user.name?.[0]?.toUpperCase() ?? "?"}
                </div>
              )}
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{user.name || user.email}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {user.email ? `${user.email} · ` : ""}QwkSearch {planLabel(plan)}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {isFree && upgradeUrl && (
                <Button asChild size="sm">
                  <a href={upgradeUrl} target="_blank" rel="noopener noreferrer">
                    <Sparkles className="mr-2 h-4 w-4" />
                    Upgrade QwkSearch
                  </a>
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={refresh} disabled={busy !== null}>
                {busy === "refresh" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Refresh plan
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={`${QWKSEARCH_ORIGIN}/settings`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Manage on QwkSearch
                </a>
              </Button>
              <Button variant="outline" size="sm" onClick={unlink} disabled={busy !== null}>
                {busy === "unlink" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
                Sign out of QwkSearch
              </Button>
            </div>
          </>
        ) : (
          <>
            <Button onClick={() => connectQwkSearch()} className="w-full">
              <Search className="mr-2 h-4 w-4" />
              Sign in with QwkSearch
            </Button>
            <div className="space-y-2">
              <Label htmlFor="qwksearch-api-key">Or paste a QwkSearch API key</Label>
              <div className="flex gap-2">
                <Input
                  id="qwksearch-api-key"
                  type="password"
                  autoComplete="off"
                  placeholder="From qwksearch.com → Settings → Account"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  className="font-mono text-sm"
                />
                <Button variant="outline" onClick={linkKey} disabled={!apiKey.trim() || busy !== null}>
                  {busy === "link" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Key className="mr-2 h-4 w-4" />}
                  Link
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              You approve the link on {new URL(QWKSEARCH_ORIGIN).host}, and can create a QwkSearch account there if you
              don&apos;t have one. Without one, the Research Agent runs as a guest.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function QwkSearchPreferencesCard() {
  const [values, setValues] = useState<QwkSearchPreferences | null>(null)
  const [saving, setSaving] = useState(false)

  // Start from this browser's values, then take the account's saved ones.
  useEffect(() => {
    setValues(readLocalPreferences())
    let cancelled = false
    void fetchSavedPreferences().then((saved) => {
      if (cancelled || !saved || !Object.keys(saved).length) return
      applyLocalPreferences(saved)
      setValues(readLocalPreferences())
    })
    return () => {
      cancelled = true
    }
  }, [])

  const update = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }))

  const save = async () => {
    if (!values) return
    setSaving(true)
    try {
      applyLocalPreferences(values)
      const synced = await savePreferences(values)
      if (synced) toast.success("Research Agent settings saved")
      else toast.info("Saved in this browser. Sign in to keep them on your account.")
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    setValues(Object.fromEntries(qwksearchPreferenceFields.map((field) => [field.key, defaultPreferenceValue(field)])))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Research Agent Settings</CardTitle>
        <CardDescription>
          How the QwkSearch Research Agent answers: follow-up questions, instructions, voice, and the weather and news
          widgets. Search servers and model providers are managed on{" "}
          <a href={`${QWKSEARCH_ORIGIN}/settings`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
            QwkSearch
          </a>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!values ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          qwksearchPreferenceFields.map((field) => {
            const id = `qwksearch-${field.key}`
            const value = values[field.key] ?? defaultPreferenceValue(field)
            if (field.type === "switch") {
              return (
                <div key={field.key} className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label htmlFor={id}>{field.name}</Label>
                    <p className="text-xs text-muted-foreground">{field.description}</p>
                  </div>
                  <Switch
                    id={id}
                    checked={value === "true"}
                    onCheckedChange={(checked) => update(field.key, String(checked))}
                  />
                </div>
              )
            }
            return (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={id}>{field.name}</Label>
                <p className="text-xs text-muted-foreground">{field.description}</p>
                {field.type === "select" ? (
                  <Select value={value} onValueChange={(next) => update(field.key, next)}>
                    <SelectTrigger id={id} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(field.options ?? []).map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : field.type === "textarea" ? (
                  <Textarea
                    id={id}
                    rows={field.rows ?? 4}
                    placeholder={field.placeholder}
                    value={value}
                    onChange={(event) => update(field.key, event.target.value)}
                  />
                ) : (
                  <Input
                    id={id}
                    type={field.type === "password" ? "password" : "text"}
                    placeholder={field.placeholder}
                    value={value}
                    onChange={(event) => update(field.key, event.target.value)}
                  />
                )}
              </div>
            )
          })
        )}
        <div className="flex justify-between border-t pt-4">
          <Button variant="outline" onClick={reset} disabled={!values}>
            Reset to Defaults
          </Button>
          <Button onClick={save} disabled={!values || saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving..." : "Save Research Settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/** Both cards, as one settings section. */
export default function QwkSearchSettingsPanel() {
  return (
    <div className="space-y-6">
      <QwkSearchAccountCard />
      <QwkSearchPreferencesCard />
    </div>
  )
}
