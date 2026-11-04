import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => {
  let userId: string | undefined;
  return {
    initAll: vi.fn(async (_key: string, opts?: { analytics?: { userId?: string } }) => {
      userId = opts?.analytics?.userId;
    }),
    setUserId: vi.fn((id: string | undefined) => {
      userId = id;
    }),
    getUserId: vi.fn(() => userId),
    reset: vi.fn(() => {
      userId = undefined;
    }),
    track: vi.fn(),
    _clear: () => {
      userId = undefined;
    },
  };
});

vi.mock('@amplitude/unified', () => sdk);

import {
  __resetAnalyticsForTests,
  clearUser,
  getReplaySampleRate,
  identifyUser,
  initializeAnalytics,
  normalizeUserId,
  trackEvent,
} from '../amplitude';

describe('amplitude analytics', () => {
  beforeEach(() => {
    __resetAnalyticsForTests();
    sdk._clear();
    for (const fn of [sdk.initAll, sdk.setUserId, sdk.getUserId, sdk.reset, sdk.track]) fn.mockClear();
    vi.stubGlobal('window', {});
    vi.stubEnv('NEXT_PUBLIC_AMPLITUDE_API_KEY', 'test-key');
  });

  it('is a no-op on the server', async () => {
    vi.stubGlobal('window', undefined);
    expect(await initializeAnalytics()).toBe(false);
    expect(sdk.initAll).not.toHaveBeenCalled();
  });

  it('is a no-op without an API key', async () => {
    vi.stubEnv('NEXT_PUBLIC_AMPLITUDE_API_KEY', '');
    await identifyUser('usr_12345');
    await trackEvent('Anything');
    await clearUser();
    expect(sdk.initAll).not.toHaveBeenCalled();
    expect(sdk.track).not.toHaveBeenCalled();
  });

  it('initialises once with replay and masking enabled', async () => {
    await Promise.all([initializeAnalytics(), initializeAnalytics(), trackEvent('A')]);
    expect(sdk.initAll).toHaveBeenCalledTimes(1);
    const [key, opts] = sdk.initAll.mock.calls[0];
    expect(key).toBe('test-key');
    expect(opts).toMatchObject({
      analytics: { autocapture: true },
      sessionReplay: { sampleRate: 1, privacyConfig: { defaultMaskLevel: 'medium' } },
    });
  });

  it('passes a known user ID at init and identifies once', async () => {
    await identifyUser('usr_8f39a21c');
    expect(sdk.initAll.mock.calls[0][1]).toMatchObject({ analytics: { userId: 'usr_8f39a21c' } });
    // Already set at init, so no duplicate setUserId / event.
    expect(sdk.setUserId).not.toHaveBeenCalled();

    await identifyUser('usr_other_1');
    expect(sdk.setUserId).toHaveBeenCalledWith('usr_other_1');
    expect(sdk.track).toHaveBeenCalledWith('User Identified');
  });

  it('ignores empty IDs', async () => {
    await identifyUser('  ');
    await identifyUser(null);
    expect(sdk.initAll).not.toHaveBeenCalled();
  });

  it('resets on logout only when a user is set', async () => {
    await clearUser();
    expect(sdk.reset).not.toHaveBeenCalled();

    await identifyUser('usr_8f39a21c');
    await clearUser();
    expect(sdk.reset).toHaveBeenCalledTimes(1);
    expect(sdk.getUserId()).toBeUndefined();
  });

  it('parses and clamps the replay sample rate', () => {
    expect(getReplaySampleRate(undefined)).toBe(1);
    expect(getReplaySampleRate('')).toBe(1);
    expect(getReplaySampleRate('0.1')).toBe(0.1);
    expect(getReplaySampleRate('5')).toBe(1);
    expect(getReplaySampleRate('-1')).toBe(0);
    expect(getReplaySampleRate('nope')).toBe(1);
  });

  it('normalises user IDs to strings', () => {
    expect(normalizeUserId(42)).toBe('42');
    expect(normalizeUserId(undefined)).toBeUndefined();
  });
});
