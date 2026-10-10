'use client';

import { useEffect } from 'react';
import { initAll } from '@amplitude/unified';

export function Amplitude() {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY;
    if (!key) {
      console.error('[amplitude] NEXT_PUBLIC_AMPLITUDE_API_KEY is not set — no events will be sent');
      return;
    }
    initAll(key, {
      serverZone: 'US',
      analytics: { autocapture: true },
      sessionReplay: { sampleRate: 1 },
    });
  }, []);
  return null;
}