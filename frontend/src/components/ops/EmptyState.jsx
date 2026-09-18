import { cn } from '@/lib/utils'

export function EmptyState({ icon, title, description, className }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-16 text-center',
        className,
      )}
    >
      {icon ? (
        <div
          className="flex size-12 items-center justify-center rounded-base border-2 border-border bg-secondary-background shadow-shadow"
          aria-hidden
        >
          {icon}
        </div>
      ) : null}
      <div>
        <h2 className="text-base font-heading tracking-tight">{title}</h2>
        {description ? (
          <p className="mt-1 max-w-[36ch] text-sm text-muted-foreground text-pretty">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  )
}

export default EmptyState
