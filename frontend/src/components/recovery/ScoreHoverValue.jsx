import ScoreBreakdown from './ScoreBreakdown'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/**
 * Score value with hover/focus tooltip showing backend component scores.
 * Does not recalculate — displays API values only.
 */
export default function ScoreHoverValue({
  scoreLabel,
  score = null,
  componentScores = null,
  className,
}) {
  const label = scoreLabel ?? '—'
  const hasBreakdown =
    (componentScores && Object.keys(componentScores).length > 0) ||
    score != null

  if (!hasBreakdown) {
    return (
      <span className={cn('tabular-nums', className)}>{label}</span>
    )
  }

  return (
    <TooltipProvider delay={120}>
      <Tooltip>
        <TooltipTrigger
          className={cn(
            'score-hover-trigger inline-flex cursor-help items-baseline gap-1 border-b border-dotted border-foreground/40 tabular-nums outline-none',
            'focus-visible:ring-2 focus-visible:ring-ring',
            className,
          )}
          aria-label={`Score ${label}. Hover for component breakdown.`}
        >
          {label}
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="start"
          sideOffset={8}
          className="z-[80] max-w-xs border-2 border-border bg-background p-0 shadow-shadow"
        >
          <ScoreBreakdown
            componentScores={componentScores}
            totalScore={score}
            title="Score breakdown"
            className="score-breakdown--tooltip"
          />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/**
 * DetailField-compatible score cell for assign confirmation grids.
 */
export function ScoreDetailField({
  label = 'Score',
  scoreLabel,
  score = null,
  componentScores = null,
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold uppercase tracking-[0.08em] text-foreground">
        {label}
      </dt>
      <dd className="mt-1.5 text-sm font-medium leading-snug text-foreground/85">
        <ScoreHoverValue
          scoreLabel={scoreLabel}
          score={score}
          componentScores={componentScores}
        />
      </dd>
    </div>
  )
}
