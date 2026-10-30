// A card that starts collapsed: for help text and rarely used tools that shouldn't push the main content down
export function Fold({
  title,
  summary,
  children,
}: {
  title: string
  summary?: string
  children: React.ReactNode
}) {
  return (
    <details className="rounded-xl border bg-card">
      <summary className="cursor-pointer px-6 py-4 text-sm font-medium select-none">
        {title}
        {summary && <span className="ml-2 font-normal text-muted-foreground">{summary}</span>}
      </summary>
      <div className="flex flex-col gap-6 border-t p-6">{children}</div>
    </details>
  )
}
