import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'

const OUTCOME_STYLES = {
  accepted: 'bg-status-delivered/20 text-foreground',
  rejected: 'bg-status-misplaced/20 text-foreground',
  info: 'bg-secondary-background text-foreground',
  skipped: 'bg-status-delayed/20 text-foreground',
}

/**
 * Operator-facing Recoverix explanation trace (code + TypeSafe Jev).
 */
export default function ExplanationTrace({ analysis, loading }) {
  const steps = analysis?.explanationTrace || []

  if (loading && !steps.length) {
    return (
      <Card className="shadow-shadow">
        <CardHeader className="border-b-2 border-border">
          <CardTitle className="text-base">Decision trace</CardTitle>
        </CardHeader>
        <CardContent className="pt-4 text-sm text-muted-foreground">
          Building explainable recovery steps…
        </CardContent>
      </Card>
    )
  }

  if (!steps.length) {
    return null
  }

  return (
    <Card className="shadow-shadow">
      <CardHeader className="border-b-2 border-border">
        <CardTitle className="text-base">Decision trace</CardTitle>
        <p className="text-xs text-muted-foreground">
          Accept / reject reasons for each Recoverix pipeline step
          {analysis?.scoringConfig?.weights
            ? ' · score weights included when scored'
            : ''}
        </p>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        <ol className="space-y-3">
          {steps.map((step) => (
            <li
              key={step.id}
              className="rounded-base border-2 border-border bg-secondary-background/40 p-3"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{step.title}</span>
                <Badge
                  variant="neutral"
                  className={cn(
                    'uppercase tracking-[0.06em]',
                    OUTCOME_STYLES[step.outcome] || OUTCOME_STYLES.info,
                  )}
                >
                  {step.outcome}
                </Badge>
                {step.source ? (
                  <Badge variant="neutral" className="bg-main/15 uppercase">
                    {step.source}
                  </Badge>
                ) : null}
              </div>
              <p className="text-sm leading-snug">{step.summary}</p>
              {Array.isArray(step.judgments) && step.judgments.length > 0 ? (
                <div className="mt-2 space-y-1 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                  {step.judgments.map((j) => (
                    <div key={`${step.id}-${j.questionId}`}>
                      <span className="font-mono">{j.questionId}</span>
                      {': '}
                      <strong>{String(j.value)}</strong>
                      {j.confidence != null
                        ? ` · confidence ${Number(j.confidence).toFixed(2)}`
                        : ''}
                    </div>
                  ))}
                </div>
              ) : null}
              {step.details?.excludedCount > 0 ||
              step.details?.skippedCount > 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {step.details.excludedCount > 0
                    ? `${step.details.excludedCount} vehicle(s) excluded in context. `
                    : ''}
                  {step.details.skippedCount > 0
                    ? `${step.details.skippedCount} skipped during generation.`
                    : ''}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}
