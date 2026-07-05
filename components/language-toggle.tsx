'use client'

import { Languages } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { usePathname, useRouter } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const localeLabels = {
  en: 'English',
  zh: '中文',
} as const

export function LanguageToggle() {
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()
  const t = useTranslations('language')

  function switchLocale(nextLocale: keyof typeof localeLabels) {
    const href = `${pathname}${window.location.search}${window.location.hash}`
    router.replace(href, { locale: nextLocale })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          size="icon"
          className="size-8"
          title={t('toggle')}
          aria-label={t('toggle')}
        >
          <Languages className="size-4" />
          <span className="sr-only">{t('current')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {Object.entries(localeLabels).map(([key, label]) => (
          <DropdownMenuItem
            key={key}
            onClick={() => switchLocale(key as keyof typeof localeLabels)}
            className={locale === key ? 'font-medium' : ''}
          >
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
