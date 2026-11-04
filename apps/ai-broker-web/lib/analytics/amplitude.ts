import * as amplitude from '@amplitude/unified';

/**
 * Amplitude analytics + Session Replay for the browser.
 *
 * Uses the Unified SDK (`@amplitude/unified`), which bundles the Analytics
 * Browser SDK and the Session Replay plugin, so there is exactly one
 * integration and one `initAll` call per page load — re-initialising tears
 * down registered plugins.
 *
 * Configuration (public, inlined at build time):
 * - `NEXT_PUBLIC_AMPLITUDE_API_KEY` — project API key. Unset means every helper
 *   here is a silent no-op.
 * - `NEXT_PUBLIC_AMPLITUDE_REPLAY_SAMPLE_RATE` — fraction of sessions recorded,
 *   0–1. Defaults to 1 (every session).
 *
 * Identity: pass the better-auth `user.id`, never an email or a shared value.
 * Anonymous visitors keep only the SDK's generated device ID.
 */

const DEFAULT_REPLAY_SAMPLE_RATE = 1;

let initializationPromise: Promise<boolean> | undefined;

export function normalizeUserId(userId: unknown): string | undefined {
  if (userId === null || userId === undefined) return undefined;
  const id = String(userId).trim();
  return id === '' ? undefined : id;
}

export function getAmplitudeApiKey(): string | undefined {
  const key = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY?.trim();
  return key ? key : undefined;
}

export function getReplaySampleRate(
  raw: string | undefined = process.env.NEXT_PUBLIC_AMPLITUDE_REPLAY_SAMPLE_RATE,
): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_REPLAY_SAMPLE_RATE;
  const rate = Number(raw);
  if (!Number.isFinite(rate)) return DEFAULT_REPLAY_SAMPLE_RATE;
  return Math.min(1, Math.max(0, rate));
}

/**
 * Initialise Amplitude once. Resolves `true` when the SDK is live, `false`
 * when running on the server or without an API key. Passing a `userId` here
 * (when it is already known) lets the first autocaptured events carry it.
 */
export function initializeAnalytics(userId?: string | null): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);

  const apiKey = getAmplitudeApiKey();
  if (!apiKey) return Promise.resolve(false);

  if (!initializationPromise) {
    initializationPromise = (async () => {
      await amplitude.initAll(apiKey, {
        serverZone: 'US',
        analytics: {
          autocapture: true,
          userId: normalizeUserId(userId),
        },
        sessionReplay: {
          sampleRate: getReplaySampleRate(),
          // Mask every input and form value; this app shows balances, orders
          // and broker details, so recordings must not capture what users type.
          privacyConfig: { defaultMaskLevel: 'medium' },
        },
      });
      return true;
    })().catch((error) => {
      console.error('[amplitude] initialisation failed', error);
      initializationPromise = undefined;
      return false;
    });
  }

  return initializationPromise;
}

/** Attach the signed-in user's stable ID to this device's events and replays. */
export async function identifyUser(userId: string | null | undefined): Promise<void> {
  const id = normalizeUserId(userId);
  if (!id) return;
  if (!(await initializeAnalytics(id))) return;

  if (amplitude.getUserId() === id) return;
  amplitude.setUserId(id);
  amplitude.track('User Identified');
}

export async function trackEvent(
  eventName: string,
  properties: Record<string, unknown> = {},
): Promise<void> {
  if (!(await initializeAnalytics())) return;
  amplitude.track(eventName, properties);
}

/**
 * Forget the signed-in user on logout: clears the user ID and rotates the
 * device ID so the next person on a shared browser is not attributed to them.
 */
export async function clearUser(): Promise<void> {
  if (!(await initializeAnalytics())) return;
  if (!amplitude.getUserId()) return;
  amplitude.reset();
}

/** Test-only: forget the memoised initialisation. */
export function __resetAnalyticsForTests(): void {
  initializationPromise = undefined;
}
