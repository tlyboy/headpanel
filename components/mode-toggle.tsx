'use client'

import { SunMoon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { Button } from './ui/button'

export function ModeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const t = useTranslations('theme')

  function toggleDark(event: React.MouseEvent<HTMLButtonElement>) {
    const isAppearanceTransition = !window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches

    const newTheme = resolvedTheme === 'dark' ? 'light' : 'dark'

    if (
      !isAppearanceTransition ||
      typeof document.startViewTransition !== 'function'
    ) {
      setTheme(newTheme)
      return
    }

    const x = event.clientX
    const y = event.clientY
    const endRadius = Math.hypot(
      Math.max(x, innerWidth - x),
      Math.max(y, innerHeight - y),
    )

    const transition = document.startViewTransition(() => {
      setTheme(newTheme)
    })
    transition.ready.then(() => {
      const clipPath = [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${endRadius}px at ${x}px ${y}px)`,
      ]
      document.documentElement.animate(
        {
          clipPath: newTheme === 'dark' ? [...clipPath].reverse() : clipPath,
        },
        {
          duration: 400,
          easing: 'ease-out',
          fill: 'forwards',
          pseudoElement:
            newTheme === 'dark'
              ? '::view-transition-old(root)'
              : '::view-transition-new(root)',
        },
      )
    })
  }

  return (
    <Button
      variant="secondary"
      size="icon"
      className="size-8"
      title={t('toggle')}
      aria-label={t('toggle')}
      onClick={toggleDark}
    >
      <SunMoon className="size-4" />
    </Button>
  )
}
