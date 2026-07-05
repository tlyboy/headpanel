import { useCallback, useEffect, useRef, useState } from 'react'

/** Copy to the clipboard and briefly show "Copied"; clear the timer on another copy or on unmount to avoid calling setState on an unmounted component. */
export function useCopy(resetMs = 1500) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const copy = useCallback(
    (text: string) => {
      navigator.clipboard.writeText(text)
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), resetMs)
    },
    [resetMs],
  )

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  return { copied, copy }
}
