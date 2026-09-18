import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

const bounceIn = {
  initial: { opacity: 0, y: 36, scale: 0.98 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 420,
      damping: 22,
      mass: 0.75,
    },
  },
  exit: {
    opacity: 0,
    y: 16,
    transition: { duration: 0.18 },
  },
}

/**
 * Single recovery flow step — springs up from below when revealed.
 */
export default function RecoveryFlowStep({
  step,
  title,
  children,
  className,
  accent = false,
}) {
  return (
    <motion.div
      layout
      variants={bounceIn}
      initial="initial"
      animate="animate"
      exit="exit"
      className={cn(
        'rounded-base border-2 border-border bg-secondary-background p-4',
        accent && 'bg-main/15 shadow-shadow',
        className,
      )}
    >
      {(step != null || title) && (
        <div className="mb-3 flex items-center gap-2 border-b-2 border-border pb-2">
          {step != null ? (
            <span className="font-mono text-xs font-bold tabular-nums text-foreground">
              {String(step).padStart(2, '0')}
            </span>
          ) : null}
          {title ? (
            <h3 className="text-sm font-heading tracking-tight">{title}</h3>
          ) : null}
        </div>
      )}
      {children}
    </motion.div>
  )
}

export { bounceIn }
