import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

const STATUS_MAP = {
  active: {
    label: 'Active',
    className: 'bg-status-active/15 border-border text-foreground',
  },
  in_transit: {
    label: 'In transit',
    className: 'bg-status-transit/15 border-border text-foreground',
  },
  intransit: {
    label: 'In transit',
    className: 'bg-status-transit/15 border-border text-foreground',
  },
  delivered: {
    label: 'Delivered',
    className: 'bg-status-delivered/20 border-border text-foreground',
  },
  delayed: {
    label: 'Delayed',
    className: 'bg-status-delayed/25 border-border text-foreground',
  },
  misplaced: {
    label: 'Misplaced',
    className: 'bg-status-misplaced/15 border-border text-foreground',
  },
  exception: {
    label: 'Exception',
    className: 'bg-status-misplaced/15 border-border text-foreground',
  },
  recovering: {
    label: 'Recovering',
    className: 'bg-status-recovering/15 border-border text-foreground',
  },
  recovery_assigned: {
    label: 'Recovering',
    className: 'bg-status-recovering/15 border-border text-foreground',
  },
  pickup_confirmed: {
    label: 'Recovering',
    className: 'bg-status-recovering/15 border-border text-foreground',
  },
  recovered: {
    label: 'Recovered',
    className: 'bg-status-recovered/20 border-border text-foreground',
  },
  critical: {
    label: 'Critical',
    className: 'bg-status-critical text-white border-border',
  },
  available: {
    label: 'Available',
    className: 'bg-status-delivered/20 border-border text-foreground',
  },
  loading: {
    label: 'Loading',
    className: 'bg-status-delayed/25 border-border text-foreground',
  },
  offline: {
    label: 'Offline',
    className: 'bg-muted border-border text-foreground',
  },
  maintenance: {
    label: 'Maintenance',
    className: 'bg-muted border-border text-foreground',
  },
  normal: {
    label: 'Active',
    className: 'bg-secondary-background border-border text-foreground',
  },
}

function normalize(status) {
  return String(status || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
}

export function StatusBadge({ status, className, children }) {
  if (!status && !children) return null
  const key = normalize(status)
  const meta = STATUS_MAP[key] || {
    label: String(status || '').replace(/_/g, ' '),
    className: 'bg-secondary-background border-border text-foreground',
  }

  return (
    <Badge
      variant="neutral"
      className={cn(
        'gap-1.5 uppercase tracking-[0.06em] text-[0.65rem] font-semibold',
        meta.className,
        className,
      )}
    >
      <span
        className="size-1.5 shrink-0 rounded-[1px] bg-foreground"
        aria-hidden
      />
      {children || meta.label}
    </Badge>
  )
}

export default StatusBadge
