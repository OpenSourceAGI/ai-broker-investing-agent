/**
 * Tracks which async request is the latest, so a slow response that arrives
 * after a newer request (or after its inputs changed) can be ignored instead
 * of overwriting fresher state.
 */
export function createLatestRequest() {
  let current = 0
  return {
    /** Begin a request; returns its id. */
    start: () => ++current,
    /** Whether `id` is still the latest request. */
    isCurrent: (id: number) => id === current,
    /** Make every in-flight request stale (e.g. when its inputs changed). */
    invalidate: () => {
      current++
    },
  }
}
