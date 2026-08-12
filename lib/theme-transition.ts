import { flushSync } from 'react-dom'

// The circle that expands from the click point when switching themes. The button on the login page and the "Switch theme" item in the sidebar menu after login
// share this implementation: both places should have this effect, and duplicating it below means hitting every pitfall twice.
//
// The percentage basis for the circle's center/radius and the light/dark z-index branches are used with the rules for
// ::view-transition-old/new(root) in app/globals.css.

/** Viewport coordinates of the trigger point */
export interface ThemeOrigin {
  x: number
  y: number
}

/** Toggle between light and dark. Both entry points only need this one line; everything else is below */
export function toggleThemeWithTransition(
  event: React.MouseEvent<HTMLElement>,
  resolvedTheme: string | undefined,
  setTheme: (theme: string) => void,
) {
  const next = resolvedTheme === 'dark' ? 'light' : 'dark'
  applyThemeWithTransition({
    origin: originFromEvent(event),
    next,
    apply: () => setTheme(next),
  })
}

// For keyboard-triggered clicks (pressing Enter on a Radix menu item also goes through click), detail is 0 and clientX/Y
// are also 0. Using them directly would place the circle at the top-left of the viewport, so fall back to the element center.
// currentTarget is cleared by React after the handler returns, so it must be read synchronously.
function originFromEvent(event: React.MouseEvent<HTMLElement>): ThemeOrigin {
  if (event.detail !== 0) return { x: event.clientX, y: event.clientY }
  const rect = event.currentTarget.getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

export function applyThemeWithTransition({
  origin,
  next,
  apply,
}: {
  /** Pass null when there's no trigger point (keyboard selection); the circle falls back to the center of the viewport */
  origin: ThemeOrigin | null
  /** The light/dark mode that actually takes effect after the switch. Determines whether the circle expands or contracts, and which snapshot layer to animate */
  next: 'light' | 'dark'
  /** The actual theme update is wrapped in flushSync */
  apply: () => void
}) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (reduced || typeof document.startViewTransition !== 'function') {
    apply()
    return
  }

  const x = origin?.x ?? window.innerWidth / 2
  const y = origin?.y ?? window.innerHeight / 2

  // Always use percentages for the circle's center and radius, never pixels. The content of ::view-transition-old/new(root) is a
  // snapshot at devicePixelRatio scale, so pixel lengths are resolved against the snapshot size and then scaled back to the viewport. At dPR=2, coordinates
  // are halved, shifting the center toward the top-left and leaving the radius too small to cover the screen. Percentages are resolved relative to the pseudo-element's own box, so they're unaffected.
  const cx = (x / window.innerWidth) * 100
  const cy = (y / window.innerHeight) * 100
  // The percentage radius basis for circle() is sqrt(w² + h²) / sqrt(2)
  const radiusRef =
    Math.hypot(window.innerWidth, window.innerHeight) / Math.SQRT2
  const endPct =
    (Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    ) /
      radiusRef) *
    100

  const transition = document.startViewTransition(() => {
    // setTheme only calls setState; applyTheme, which actually writes the class, runs in useEffect. Without flushSync,
    // when the callback returns, the DOM still has the old theme, so the old and new snapshots are identical and the animation effectively doesn't run. Also, if CSS uses
    // .dark to switch z-index, the delayed class update can cause the animated layer to end up underneath and be completely covered.
    flushSync(apply)
  })

  void transition.ready
    .then(() => {
      const clipPath = [
        `circle(0% at ${cx}% ${cy}%)`,
        `circle(${endPct}% at ${cx}% ${cy}%)`,
      ]
      const animation = document.documentElement.animate(
        {
          clipPath: next === 'dark' ? [...clipPath].reverse() : clipPath,
        },
        {
          duration: 400,
          easing: 'ease-out',
          fill: 'forwards',
          pseudoElement:
            next === 'dark'
              ? '::view-transition-old(root)'
              : '::view-transition-new(root)',
        },
      )
      // An animation with fill: 'forwards' doesn't disappear on its own when it ends; it stays attached to documentElement.
      // Each switch adds another one, and the same-named pseudo-element in the next transition keeps having its clip-path set by the previous one.
      void transition.finished.finally(() => animation.cancel())
    })
    // If the transition is interrupted (repeated clicks, route change), ready rejects with InvalidStateError.
    // The theme has already switched by then, so catch must be attached after then to handle the derived promise chain.
    .catch(() => {})
}
