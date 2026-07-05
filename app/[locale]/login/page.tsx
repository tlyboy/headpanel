'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { login, type LoginState } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { LanguageToggle } from '@/components/language-toggle'
import { ModeToggle } from '@/components/mode-toggle'
import { GitHubLink } from '@/components/github-link'

const initial: LoginState = {}

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, initial)
  const t = useTranslations('auth')

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <GitHubLink />
        <LanguageToggle />
        <ModeToggle />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={action} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="username">{t('username')}</Label>
              <Input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                autoFocus
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">{t('password')}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            {state.error ? (
              <p className="text-destructive text-sm">{state.error}</p>
            ) : null}
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? t('pending') : t('submit')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
