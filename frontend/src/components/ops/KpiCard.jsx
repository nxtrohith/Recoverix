import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'

export function KpiCard({
  label,
  value,
  sub,
  icon,
  featured = false,
  tone = 'default',
  loading = false,
  className,
}) {
  const toneClass =
    tone === 'critical'
      ? 'bg-status-misplaced/10'
      : tone === 'warn'
        ? 'bg-status-delayed/15'
        : tone === 'ok'
          ? 'bg-status-delivered/10'
          : tone === 'accent'
            ? 'bg-main/15'
            : 'bg-secondary-background'

  return (
    <Card
      size="sm"
      className={cn(
        'transition-transform duration-200 hover:-translate-y-0.5',
        featured ? 'shadow-shadow' : 'shadow-none',
        toneClass,
        className,
      )}
    >
      <CardContent className="flex items-start gap-3">
        {icon ? (
          <div
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-base border-2 border-border bg-secondary-background',
              featured && 'bg-main',
            )}
            aria-hidden
          >
            {icon}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {label}
          </p>
          <p
            className={cn(
              'mt-1 font-mono font-bold tabular-nums tracking-tight text-foreground',
              featured ? 'text-3xl sm:text-4xl' : 'text-2xl',
            )}
          >
            {loading ? (
              <span className="inline-block h-8 w-16 animate-pulse rounded-sm bg-muted" />
            ) : (
              value
            )}
          </p>
          {sub ? (
            <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

export default KpiCard
