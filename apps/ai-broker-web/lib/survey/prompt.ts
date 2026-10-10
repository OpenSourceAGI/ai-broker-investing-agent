/**
 * Client helpers for the onboarding survey prompt.
 *
 * A signed-in user is auto-sent to /survey at most once: the redirect itself
 * records the survey as dismissed, so leaving the page without submitting
 * never brings it back. The flag lives in localStorage (immediate, works
 * offline) and on the user record via /api/user/dismiss-survey (holds across
 * devices). After that the survey is only reachable from Settings.
 */

export const SURVEY_DISMISSED_KEY = "ai-broker:survey-dismissed"

function readLocalDismissed(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(SURVEY_DISMISSED_KEY) === "1"
  } catch {
    return false
  }
}

function writeLocalDismissed() {
  try {
    window.localStorage.setItem(SURVEY_DISMISSED_KEY, "1")
  } catch {
    // Storage blocked (private mode); the server-side flag still applies.
  }
}

/** Marks the survey dismissed for this browser and, when signed in, the account. */
export function dismissSurvey(): Promise<void> {
  writeLocalDismissed()
  return fetch("/api/user/dismiss-survey", { method: "POST", keepalive: true })
    .then(() => undefined)
    .catch(() => undefined)
}

/**
 * Whether to send the signed-in user to the survey now. Returns true only if
 * they have neither completed nor dismissed it, and records the prompt as
 * dismissed so it is never auto-shown again. Any failure returns false.
 */
export function consumeSurveyPrompt(): Promise<boolean> {
  // Sign-in flows can check twice for one sign-in (a session effect and the
  // login handler); both must get the same answer or they race to redirect.
  const now = Date.now()
  if (recent && now - recent.at < SHARED_CHECK_MS) return recent.result
  recent = { at: now, result: checkAndConsume() }
  return recent.result
}

const SHARED_CHECK_MS = 5_000
let recent: { at: number; result: Promise<boolean> } | null = null

async function checkAndConsume(): Promise<boolean> {
  if (readLocalDismissed()) return false
  try {
    const response = await fetch("/api/user/check-survey")
    if (!response.ok) return false
    const data = await response.json()
    if (data.shouldShowSurvey !== true) {
      if (data.hasDismissedSurvey) writeLocalDismissed()
      return false
    }
    void dismissSurvey()
    return true
  } catch {
    return false
  }
}
