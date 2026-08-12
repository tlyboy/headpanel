'use client'

import { SunMoon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { toggleThemeWithTransition } from '@/lib/theme-transition'
import { Button } from './ui/button'

export function ModeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const t = useTranslations('theme')

  return (
    <Button
      variant="secondary"
      size="icon"
      className="size-8"
      title={t('toggle')}
      aria-label={t('toggle')}
      onClick={(e) => toggleThemeWithTransition(e, resolvedTheme, setTheme)}
    >
      <SunMoon className="size-4" />
    </Button>
  )
}
