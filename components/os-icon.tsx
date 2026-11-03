import { siAndroid, siApple, siFreebsd, siLinux } from 'simple-icons'

// simple-icons no longer ships a Windows logo
const WINDOWS_PATH =
  'M0 0h11.4v11.4H0zM12.6 0H24v11.4H12.6zM0 12.6h11.4V24H0zM12.6 12.6H24V24H12.6z'

const OS_LOGOS: Record<string, { label: string; path: string }> = {
  linux: { label: 'Linux', path: siLinux.path },
  windows: { label: 'Windows', path: WINDOWS_PATH },
  macos: { label: 'macOS', path: siApple.path },
  ios: { label: 'iOS', path: siApple.path },
  android: { label: 'Android', path: siAndroid.path },
  freebsd: { label: 'FreeBSD', path: siFreebsd.path },
}

/** The name the client reported, spelled the usual way. An OS not listed here is shown exactly as reported. */
export const osLabel = (os: string) => OS_LOGOS[os.toLowerCase()]?.label ?? os

/** The SVG path of the logo, on a 24 x 24 grid. Null for an OS with no logo here. */
export const osLogoPath = (os: string | null) => (os && OS_LOGOS[os.toLowerCase()]?.path) || null

export function OsIcon({ os, className }: { os: string; className?: string }) {
  const logo = OS_LOGOS[os.toLowerCase()]
  if (!logo) return null
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d={logo.path} />
    </svg>
  )
}
