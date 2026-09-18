import { cn } from '@/lib/utils'

export function PageHeader({
  kicker,
  title,
  description,
  actions,
  className,
}) {
  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex min-h-20 shrink-0 items-center justify-between gap-4 border-b-2 border-border bg-secondary-background/90 px-4 py-4 backdrop-blur-sm sm:px-6 lg:px-8',
        className,
      )}
    >
      <div className="min-w-0">
        {kicker ? (
          <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {kicker}
          </p>
        ) : null}
        <h1 className="truncate text-xl font-heading tracking-tight sm:text-2xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-[62ch] text-sm text-muted-foreground text-pretty">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  )
}

export default PageHeader
