'use client';

import { useEffect, useRef } from 'react';
import { useSession } from '@/lib/auth/client';
import { clearUser, identifyUser, initializeAnalytics } from '@/lib/analytics/amplitude';

/**
 * Boots Amplitude (analytics + Session Replay) once the better-auth session
 * has resolved, so a restored login is attached from the first event, and
 * keeps the Amplitude user ID in step with sign-in and sign-out.
 */
export function Amplitude() {
  const { data: session, isPending } = useSession();
  const userId = session?.user?.id;
  const previousUserId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (isPending) return;

    const previous = previousUserId.current;
    if (userId) {
      // Switching accounts without an observed sign-out: rotate the device
      // first so the new account doesn't inherit the old one's history.
      void (previous && previous !== userId ? clearUser() : Promise.resolve())
        .then(() => identifyUser(userId));
    } else if (previous) {
      void clearUser();
    } else {
      void initializeAnalytics();
    }
    previousUserId.current = userId;
  }, [isPending, userId]);

  return null;
}
