import { siGithub } from 'simple-icons'
import { Button } from '@/components/ui/button'

export function GitHubLink() {
  return (
    <Button
      asChild
      variant="secondary"
      size="icon"
      className="size-8"
      title="GitHub"
      aria-label="GitHub"
    >
      <a
        href="https://github.com/tlyboy/headpanel"
        target="_blank"
        rel="noreferrer"
      >
        <svg
          aria-hidden="true"
          className="size-4 fill-current"
          role="img"
          viewBox="0 0 24 24"
        >
          <path d={siGithub.path} />
        </svg>
      </a>
    </Button>
  )
}
