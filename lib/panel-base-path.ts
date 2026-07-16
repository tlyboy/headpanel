import 'server-only'

export function normalizePanelBasePath(value: string | undefined): string {
  const basePath = value?.trim() ?? ''
  if (!basePath) return ''
  if (!basePath.startsWith('/') || basePath === '/' || basePath.endsWith('/')) {
    throw new Error(
      'HEADPANEL_BASE_PATH must start with / and must not end with /',
    )
  }
  return basePath
}

export function getPanelBasePath(): string {
  return normalizePanelBasePath(process.env.HEADPANEL_BASE_PATH)
}
