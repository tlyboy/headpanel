'use client'

import { useLayoutEffect, useRef } from 'react'

// With cacheComponents, Next.js hides the page you navigate away from with <Activity> instead of unmounting it,
// so an open dialog would still be open on back/forward. Layout effect cleanup runs as the page is hidden.
export function useResetOnHide(reset: () => void) {
  const latest = useRef(reset)
  useLayoutEffect(() => {
    latest.current = reset
  })
  useLayoutEffect(() => () => latest.current(), [])
}
