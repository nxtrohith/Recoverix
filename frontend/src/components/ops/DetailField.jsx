import { cn } from '@/lib/utils'

export function DetailField({ label, value, className, mono = false }) {
  const display =
    value == null || value === '' ? '—' : String(value)

  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-xs font-bold uppercase tracking-[0.08em] text-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          'mt-1.5 break-words text-sm font-medium leading-snug text-foreground/85',
          mono && 'font-mono text-[0.8rem] tabular-nums',
        )}
      >
        {display}
      </dd>
    </div>
  )
}

export function DetailGrid({ children, className }) {
  return (
    <dl
      className={cn(
        'grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2',
        className,
      )}
    >
      {children}
    </dl>
  )
}

export function DetailSection({ title, children, className }) {
  return (
    <section className={cn('space-y-3', className)}>
      {title ? (
        <h3 className="border-b-2 border-border pb-2 text-sm font-heading tracking-tight">
          {title}
        </h3>
      ) : null}
      {children}
    </section>
  )
}

export default DetailField
