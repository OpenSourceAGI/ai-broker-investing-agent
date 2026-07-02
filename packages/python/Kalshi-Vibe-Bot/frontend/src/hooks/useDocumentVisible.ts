import { useEffect, useState } from 'react'

function pageAllowsNetworkFetch(): boolean {
  if (typeof document === 'undefined') return true
  // ``prerender`` (Chromium) must allow fetches or the first paint never loads data.
  const vs = document.visibilityState as string
  return vs === 'visible' || vs === 'prerender'
}

/** True when the page is visible (not backgrounded / another tab). */
export function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(pageAllowsNetworkFetch)

  useEffect(() => {
    const onVis = () => setVisible(pageAllowsNetworkFetch())
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  return visible
}
