import { useState } from 'react'
import { ArrowLeftRight, Loader2 } from 'lucide-react'
import { switchDemoCase } from '../api/client'

/**
 * Compact demo scenario switcher.
 * Floats inside the map card header so the presenter can cycle between:
 *   Case 1 — at_node      (Ramesh, Telugu)
 *   Case 2 — detour       (Priya,  Hindi)
 *   Case 3 — pass_through (Arjun,  English)
 *
 * @param {{ activeDemoCase: number, setActiveDemoCase: (n:number)=>void, onSwitch: ()=>void }} props
 */
export default function DemoCaseSwitcher({ activeDemoCase = 1, setActiveDemoCase, onSwitch }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const CASES = [
    {
      num: 1,
      label: 'Case 1',
      sublabel: 'at_node',
      description: 'Truck already at the wrong hub — direct piggyback, zero detour',
      driver: 'Ramesh',
      language: 'Telugu',
      langColor: '#3b82f6',   // blue
      icon: '📍',
    },
    {
      num: 2,
      label: 'Case 2',
      sublabel: 'detour',
      description: 'Nearest truck must divert off-route to collect the package',
      driver: 'Priya',
      language: 'Hindi',
      langColor: '#f97316',   // orange
      icon: '↩️',
    },
    {
      num: 3,
      label: 'Case 3',
      sublabel: 'pass_through',
      description: "Truck's planned route naturally passes the pickup hub",
      driver: 'Arjun',
      language: 'English',
      langColor: '#22c55e',   // green
      icon: '➡️',
    },
  ]

  const active = CASES.find((c) => c.num === activeDemoCase) || CASES[0]

  const handleSwitch = async (caseNum) => {
    if (caseNum === activeDemoCase && !open) {
      setOpen(true)
      return
    }
    setOpen(false)
    if (loading) return

    setLoading(true)
    setError(null)
    try {
      await switchDemoCase(caseNum)
      setActiveDemoCase?.(caseNum)
      await onSwitch?.()
    } catch (err) {
      setError(err?.message || 'Failed to switch demo case')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {/* Trigger button */}
      <button
        type="button"
        id="demo-case-switcher-btn"
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        title="Switch demo scenario"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          borderRadius: '8px',
          border: '2px solid var(--border, #e2e8f0)',
          background: 'var(--secondary-background, #f8fafc)',
          cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: '0.78rem',
          fontWeight: 600,
          color: 'var(--foreground)',
          transition: 'all 0.15s',
          boxShadow: open ? '0 0 0 2px #6366f1' : 'none',
        }}
      >
        {loading ? (
          <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />
        ) : (
          <ArrowLeftRight style={{ width: 14, height: 14 }} />
        )}
        <span style={{ color: active.langColor }}>{active.icon}</span>
        <span>{active.label} · {active.sublabel}</span>
      </button>

      {/* Dropdown panel */}
      {open && !loading && (
        <>
          {/* Backdrop */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 49 }}
            onClick={() => setOpen(false)}
            aria-hidden
          />

          <div
            role="listbox"
            aria-label="Demo scenario selector"
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              zIndex: 50,
              minWidth: 310,
              borderRadius: 12,
              border: '2px solid var(--border, #e2e8f0)',
              background: 'var(--background, #fff)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
              padding: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <p style={{
              fontSize: '0.65rem',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--muted-foreground)',
              padding: '4px 8px 2px',
            }}>
              Demo Scenarios
            </p>

            {CASES.map((c) => {
              const isActive = c.num === activeDemoCase
              return (
                <button
                  key={c.num}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  id={`demo-case-option-${c.num}`}
                  onClick={() => handleSwitch(c.num)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 2,
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: isActive ? `2px solid ${c.langColor}` : '2px solid transparent',
                    background: isActive ? `${c.langColor}14` : 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.12s',
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--secondary-background)' }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                    <span style={{ fontSize: '1rem' }}>{c.icon}</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--foreground)' }}>
                      {c.label}
                    </span>
                    <span style={{
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: 12,
                      background: `${c.langColor}22`,
                      color: c.langColor,
                      border: `1px solid ${c.langColor}44`,
                      fontFamily: 'monospace',
                    }}>
                      {c.sublabel}
                    </span>
                    <span style={{
                      marginLeft: 'auto',
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      padding: '1px 7px',
                      borderRadius: 10,
                      background: '#f1f5f9',
                      color: '#475569',
                    }}>
                      {c.language}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.73rem', color: 'var(--muted-foreground)', margin: 0, paddingLeft: 26 }}>
                    {c.description}
                  </p>
                  <p style={{ fontSize: '0.68rem', color: c.langColor, margin: 0, paddingLeft: 26, fontWeight: 600 }}>
                    Driver: {c.driver}
                  </p>
                </button>
              )
            })}
          </div>
        </>
      )}

      {error && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          right: 0,
          background: '#fef2f2',
          border: '1px solid #fca5a5',
          borderRadius: 6,
          padding: '4px 10px',
          fontSize: '0.72rem',
          color: '#dc2626',
          whiteSpace: 'nowrap',
          zIndex: 50,
        }}>
          {error}
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
