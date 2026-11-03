const TOKENS = [
  'foreground',
  'muted',
  'muted-foreground',
  'border',
  'primary',
  'success',
  'destructive',
] as const

export type TwinColors = Record<(typeof TOKENS)[number], string>

// Theme tokens are oklch, which THREE.Color cannot parse. A 2D canvas converts them to sRGB.
function readColors(): TwinColors {
  const style = getComputedStyle(document.documentElement)
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  const toRgb = (token: string) => {
    if (!ctx) return '#888888'
    ctx.fillStyle = style.getPropertyValue(`--${token}`).trim()
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
    return `rgb(${r}, ${g}, ${b})`
  }
  return Object.fromEntries(TOKENS.map((t) => [t, toRgb(t)])) as TwinColors
}

let cachedTheme: string | null = null
let cachedColors: TwinColors | null = null

export function getThemeColors(): TwinColors {
  const theme = document.documentElement.className
  if (!cachedColors || cachedTheme !== theme) {
    cachedTheme = theme
    cachedColors = readColors()
  }
  return cachedColors
}

export function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}
