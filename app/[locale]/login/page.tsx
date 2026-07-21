'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { CableIcon } from 'lucide-react'
import { login, type LoginState } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { LanguageToggle } from '@/components/language-toggle'
import { ModeToggle } from '@/components/mode-toggle'
import { GitHubLink } from '@/components/github-link'

const initial: LoginState = {}

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, initial)
  const t = useTranslations('auth')

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <GitHubLink />
        <LanguageToggle />
        <ModeToggle />
      </div>
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-2 self-center font-medium">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <CableIcon className="size-4" />
          </span>
          Headpanel
        </div>
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">{t('title')}</CardTitle>
            <CardDescription>{t('description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={action}>
              <FieldGroup>
                <Field data-invalid={Boolean(state.error)}>
                  <FieldLabel htmlFor="username">{t('username')}</FieldLabel>
                  <Input
                    id="username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    autoFocus
                    required
                    aria-invalid={Boolean(state.error)}
                  />
                </Field>
                <Field data-invalid={Boolean(state.error)}>
                  <FieldLabel htmlFor="password">{t('password')}</FieldLabel>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    aria-invalid={Boolean(state.error)}
                  />
                  {state.error ? <FieldError>{state.error}</FieldError> : null}
                </Field>
                <Field>
                  <Button type="submit" disabled={pending}>
                    {pending ? t('pending') : t('submit')}
                  </Button>
                </Field>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
