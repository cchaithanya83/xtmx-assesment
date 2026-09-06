import * as React from 'react'
import type { IntegrityLog } from '@/types'

/**
 * Assessment-integrity monitor.
 *
 * Records window blur/focus, paste and copy attempts during certification mode
 * so a trainer can review them afterwards. Deliberately observational: a single
 * blur never fails an attempt (per the integrity rules), it only raises a flag
 * once the trainer-configured threshold is crossed.
 */

export interface IntegrityOptions {
  enabled: boolean
  trackTabSwitching: boolean
  flagBlurThreshold: number
}

export interface IntegrityApi {
  log: IntegrityLog
  /** Attach to inputs to record (and optionally block) paste. */
  recordPaste: () => void
  recordCopy: () => void
  recordEvent: (type: string, detail?: string) => void
  reset: () => void
}

const EMPTY: IntegrityLog = {
  blurCount: 0,
  focusCount: 0,
  pasteAttempts: 0,
  copyAttempts: 0,
  events: [],
  flagged: false,
}

export function useIntegrityMonitor({
  enabled,
  trackTabSwitching,
  flagBlurThreshold,
}: IntegrityOptions): IntegrityApi {
  const [log, setLog] = React.useState<IntegrityLog>(EMPTY)

  const push = React.useCallback(
    (patch: (prev: IntegrityLog) => IntegrityLog) => {
      setLog((prev) => {
        const next = patch(prev)
        return { ...next, flagged: next.blurCount >= flagBlurThreshold || next.pasteAttempts > 0 }
      })
    },
    [flagBlurThreshold],
  )

  const recordEvent = React.useCallback(
    (type: string, detail?: string) => {
      push((prev) => ({
        ...prev,
        // Cap the event log so a long assessment cannot grow unbounded.
        events: [...prev.events.slice(-99), { at: new Date().toISOString(), type, detail }],
      }))
    },
    [push],
  )

  React.useEffect(() => {
    if (!enabled || !trackTabSwitching) return

    const onBlur = () => {
      push((prev) => ({
        ...prev,
        blurCount: prev.blurCount + 1,
        events: [
          ...prev.events.slice(-99),
          { at: new Date().toISOString(), type: 'window-blur' },
        ],
      }))
    }
    const onFocus = () => {
      push((prev) => ({ ...prev, focusCount: prev.focusCount + 1 }))
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onBlur()
    }

    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enabled, trackTabSwitching, push])

  const recordPaste = React.useCallback(() => {
    push((prev) => ({
      ...prev,
      pasteAttempts: prev.pasteAttempts + 1,
      events: [
        ...prev.events.slice(-99),
        { at: new Date().toISOString(), type: 'paste-blocked' },
      ],
    }))
  }, [push])

  const recordCopy = React.useCallback(() => {
    push((prev) => ({
      ...prev,
      copyAttempts: prev.copyAttempts + 1,
      events: [
        ...prev.events.slice(-99),
        { at: new Date().toISOString(), type: 'copy-blocked' },
      ],
    }))
  }, [push])

  const reset = React.useCallback(() => setLog(EMPTY), [])

  return { log, recordPaste, recordCopy, recordEvent, reset }
}

/**
 * Handlers that block clipboard use in certification mode.
 * Spread onto the typing textarea / structured inputs.
 */
export function clipboardGuards(blockPaste: boolean, onPaste: () => void, onCopy: () => void) {
  if (!blockPaste) return {}
  return {
    onPaste: (e: React.ClipboardEvent) => {
      e.preventDefault()
      onPaste()
    },
    onCopy: (e: React.ClipboardEvent) => {
      e.preventDefault()
      onCopy()
    },
    onCut: (e: React.ClipboardEvent) => {
      e.preventDefault()
      onCopy()
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      onPaste()
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    autoComplete: 'off' as const,
    autoCorrect: 'off' as const,
    autoCapitalize: 'off' as const,
    spellCheck: false,
  }
}
