import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, Flag, Keyboard, ShieldAlert } from 'lucide-react'
import { getAssignment } from '@/data/tasks'
import {
  applyInput,
  buildComparison,
  computeMetrics,
  createTypingState,
  type TypingState,
} from '@/engine/typingEngine'
import { useAppStore } from '@/store/appStore'
import { assessments } from '@/api/client'
import { AssessmentShell, DesktopRecommendedNotice } from '@/components/layout/AppShell'
import { ComparisonLegend, TextComparison } from '@/components/typing/TextComparison'
import { AssessmentProgressBar, LiveMetrics } from '@/components/typing/LiveMetrics'
import { DifficultyBadge } from '@/components/shared'
import { Badge, Button, Card, Dialog, Textarea } from '@/components/ui'
import { clipboardGuards, useIntegrityMonitor } from '@/hooks/useIntegrityMonitor'
import { cn, formatDuration } from '@/lib/utils'

/**
 * Task 1 assessment runner.
 *
 * Owns the countdown, the typing engine state and the live metric loop. The
 * textarea is uncontrolled-by-design in spirit — React holds the value, but the
 * engine reduces from the raw string, so no keystroke is ever dropped or
 * re-ordered on long passages.
 */
export default function Task1Runner() {
  const { assignmentId: rawId } = useParams()
  const assignmentId = Number(rawId ?? 1)
  const navigate = useNavigate()

  const activeSession = useAppStore((s) => s.activeSession)
  const settings = useAppStore((s) => s.settings)
  const submitAttempt = useAppStore((s) => s.submitAttempt)
  const abandonSession = useAppStore((s) => s.abandonSession)

  const assignment = getAssignment(1, assignmentId)
  const source = activeSession?.passage?.text ?? ''
  const isCertification = activeSession?.mode === 'certification'

  const [state, setState] = React.useState<TypingState>(() => createTypingState(source))
  const [typed, setTyped] = React.useState('')
  const [started, setStarted] = React.useState(false)
  const [elapsed, setElapsed] = React.useState(0)
  const [confirmExit, setConfirmExit] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  /* Set synchronously at the start of submission. `submitting` state is not
     reliable here: the Zustand write that clears `activeSession` can trigger a
     render before the React state update is flushed, which would let the guard
     below bounce the candidate off the result screen. */
  const submittedRef = React.useRef(false)

  const startRef = React.useRef<number | null>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)
  /** Mirrors `typed` so a timeout submission always sends the latest text. */
  const typedRef = React.useRef('')

  const integrity = useIntegrityMonitor({
    enabled: Boolean(isCertification),
    trackTabSwitching: settings.trackTabSwitching,
    flagBlurThreshold: settings.flagBlurThreshold,
  })

  /* ---- Guard: no session (e.g. deep link / refresh) ---------------------
     Skipped once submission has started: submitting clears `activeSession`,
     and without this the guard would race the navigation to the result screen. */
  React.useEffect(() => {
    if (submittedRef.current) return
    if (!activeSession || activeSession.taskId !== 1) {
      navigate('/task/1', { replace: true })
    }
  }, [activeSession, navigate])
  /**
   * Release the session if the candidate leaves without submitting.
   *
   * Covers the closed tab, the browser back button and an unmount from any
   * other cause. `keepalive` lets the request outlive the page. The server also
   * expires sessions that overrun their time limit, so a missed call self-heals
   * — this just makes the trainer's live view accurate immediately.
   */
  React.useEffect(() => {
    const sessionId = activeSession?.sessionId
    if (!sessionId) return

    const release = () => {
      if (submittedRef.current) return
      void assessments.abandon(sessionId, true)
    }

    window.addEventListener('pagehide', release)
    return () => {
      window.removeEventListener('pagehide', release)
      // Unmounting without having submitted means they navigated away.
      release()
    }
  }, [activeSession?.sessionId])


  /* ---- Reset engine when the passage changes --------------------------- */
  React.useEffect(() => {
    setState(createTypingState(source))
    setTyped('')
    typedRef.current = ''
  }, [source])

  /* ---- Countdown ------------------------------------------------------- */
  React.useEffect(() => {
    if (!started || state.finished) return
    const id = window.setInterval(() => {
      if (startRef.current === null) return
      setElapsed((performance.now() - startRef.current) / 1000)
    }, 200)
    return () => window.clearInterval(id)
  }, [started, state.finished])

  const remaining = Math.max(0, assignment.timeLimitSeconds - elapsed)
  const metrics = React.useMemo(
    () => computeMetrics(state, Math.max(elapsed, state.startedAt ? elapsed : 0)),
    [state, elapsed],
  )
  const cells = React.useMemo(() => buildComparison(state), [state])

  /* ---- Submission ------------------------------------------------------ */
  /**
   * Submits the typed text. Nothing about the outcome is decided here — the
   * server replays the text against the passage it issued, measures elapsed
   * time from its own clock, and returns the graded attempt.
   */
  const handleSubmit = React.useCallback(
    async (reason: 'completed' | 'time' | 'manual') => {
      if (submittedRef.current || !activeSession) return
      submittedRef.current = true
      setSubmitting(true)
      setSubmitError(null)

      try {
        await submitAttempt({
          sessionId: activeSession.sessionId,
          typedText: typedRef.current,
          integrity: {
            ...integrity.log,
            events: [
              ...integrity.log.events,
              { at: new Date().toISOString(), type: `submitted:${reason}` },
            ],
          },
        })
        navigate('/result', { replace: true })
      } catch (err) {
        // Allow a retry rather than losing the candidate's work to a blip.
        submittedRef.current = false
        setSubmitting(false)
        setSubmitError((err as Error).message)
      }
    },
    [activeSession, integrity.log, submitAttempt, navigate],
  )

  /* ---- Auto-submit on completion or timeout ---------------------------- */
  React.useEffect(() => {
    if (started && state.finished && !submittedRef.current) void handleSubmit('completed')
  }, [started, state.finished, handleSubmit])

  React.useEffect(() => {
    if (started && remaining <= 0 && !submittedRef.current) void handleSubmit('time')
  }, [started, remaining, handleSubmit])

  /* ---- Input ----------------------------------------------------------- */
  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!started) return
    const value = e.target.value
    typedRef.current = value
    setTyped(value)
    setState((prev) => applyInput(prev, value, { pauseThresholdMs: settings.pauseThresholdMs }))
  }

  const begin = () => {
    startRef.current = performance.now()
    setStarted(true)
    setElapsed(0)
    // Focus after paint so the caret lands in the textarea reliably.
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const exit = () => {
    if (started && !state.finished) {
      setConfirmExit(true)
    } else {
      void abandonSession()
      navigate('/task/1')
    }
  }

  if (!activeSession || activeSession.taskId !== 1) return null


  return (
    <AssessmentShell
      onExit={exit}
      header={
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          <div className="flex min-w-0 items-center gap-2">
            <Keyboard className="size-4 shrink-0 text-brand-700" />
            <span className="truncate text-sm font-bold text-navy-900">
              Task 1 · Assignment {assignmentId} — {assignment.title}
            </span>
          </div>
          <DifficultyBadge difficulty={assignment.difficulty} />
          {activeSession.mode === 'practice' ? (
            <Badge variant="accent">Practice</Badge>
          ) : (
            <Badge variant="muted">Certification</Badge>
          )}
          <Badge variant="outline">Attempt {activeSession.attemptNumber}</Badge>
          {activeSession.passage && (
            <span className="hidden font-mono text-[11px] text-muted-foreground xl:inline">
              Set: {activeSession.passage.label}
            </span>
          )}
          <span
            className={cn(
              'ml-auto metric-value text-base',
              remaining <= 30 ? 'text-red-700' : 'text-navy-900',
            )}
          >
            {formatDuration(remaining)}
          </span>
        </div>
      }
    >
      <DesktopRecommendedNotice />

      {!started ? (
        <StartPanel
          title={assignment.title}
          description={assignment.description}
          objectives={assignment.objectives}
          timeLimit={assignment.timeLimitSeconds}
          characters={source.length}
          mode={activeSession.mode}
          minWpm={settings.minWpm}
          minAccuracy={settings.minAccuracy}
          passingScore={settings.passingScore}
          onStart={begin}
        />
      ) : (
        <>
          <LiveMetrics
            metrics={metrics}
            remainingSeconds={remaining}
            minWpm={settings.minWpm}
            minAccuracy={settings.minAccuracy}
          />
          <AssessmentProgressBar
            completion={metrics.completionPercentage}
            timeRatio={(elapsed / assignment.timeLimitSeconds) * 100}
          />

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            {/* ---- Source ---- */}
            <div className="flex min-w-0 flex-col">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Source text
                </h2>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {state.typed.length} / {source.length}
                </span>
              </div>
              <TextComparison cells={cells} className="h-[46vh] min-h-[280px] xl:h-[54vh]" />
              <ComparisonLegend className="mt-2" />
            </div>

            {/* ---- Typing area ---- */}
            <div className="flex min-w-0 flex-col">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Your typing
                </h2>
                {isCertification && settings.blockPaste && (
                  <span className="flex items-center gap-1 text-[11px] font-medium text-amber-700">
                    <ShieldAlert className="size-3" />
                    Paste disabled
                  </span>
                )}
              </div>
              <Textarea
                ref={textareaRef}
                value={typed}
                onChange={onChange}
                placeholder="Begin typing the source text exactly as shown…"
                className="h-[46vh] min-h-[280px] resize-none font-mono text-[15px] leading-[1.9] tracking-tight xl:h-[54vh]"
                {...clipboardGuards(
                  Boolean(isCertification) && settings.blockPaste,
                  integrity.recordPaste,
                  integrity.recordCopy,
                )}
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-[11px] text-muted-foreground">
                  Errors are marked in the source as you type. Use backspace to correct — corrections
                  are tracked separately from clean keystrokes.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={submitting}
                  onClick={() => void handleSubmit('manual')}
                >
                  <Flag className="size-3.5" />
                  Submit
                </Button>
              </div>
              {submitError && (
                <div className="mt-2 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-900">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    {submitError} Your work is still here — press Submit to try again.
                  </span>
                </div>
              )}
              {integrity.log.flagged && isCertification && (
                <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    Focus loss recorded ({integrity.log.blurCount}). This is logged for trainer
                    review and does not automatically fail the attempt.
                  </span>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <Dialog
        open={confirmExit}
        onClose={() => setConfirmExit(false)}
        title="Abandon this attempt?"
        description="Nothing will be recorded and this attempt will not count against your history. You can restart the assignment at any time."
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmExit(false)}>
              Keep typing
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                void abandonSession()
                navigate('/task/1')
              }}
            >
              Abandon attempt
            </Button>
          </>
        }
      />
    </AssessmentShell>
  )
}

/* -------------------------------------------------------------------------- */
/*  Pre-flight panel                                                           */
/* -------------------------------------------------------------------------- */

function StartPanel({
  title,
  description,
  objectives,
  timeLimit,
  characters,
  mode,
  minWpm,
  minAccuracy,
  passingScore,
  onStart,
}: {
  title: string
  description: string
  objectives: string[]
  timeLimit: number
  characters: number
  mode: string
  minWpm: number
  minAccuracy: number
  passingScore: number
  onStart: () => void
}) {
  return (
    <Card className="mx-auto max-w-3xl p-6 sm:p-8">
      <p className="text-[11px] font-bold uppercase tracking-widest text-brand-700">
        {mode === 'practice' ? 'Practice run — not recorded for certification' : 'Certification attempt'}
      </p>
      <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-navy-900">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            What is measured
          </h3>
          <ul className="space-y-1.5">
            {objectives.map((o) => (
              <li key={o} className="flex gap-2 text-sm text-navy-800">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-600" />
                {o}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-border bg-muted/40 p-4">
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Passing standard
          </h3>
          <dl className="space-y-1.5 text-sm">
            <Row label="Minimum score" value={`${passingScore} / 100`} />
            <Row label="Minimum speed" value={`${minWpm} WPM`} />
            <Row label="Minimum accuracy" value={`${minAccuracy}%`} />
            <Row label="Time limit" value={formatDuration(timeLimit)} />
            <Row label="Passage length" value={`${characters} characters`} />
          </dl>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p className="font-semibold">Before you begin</p>
        <p className="mt-1 leading-relaxed">
          The timer starts the moment you press Start. Copy and paste are disabled, and leaving this
          screen is recorded for trainer review. Type the source text exactly as shown, including
          punctuation, capitalisation and line breaks.
        </p>
      </div>

      <Button size="xl" className="mt-6 w-full" onClick={onStart}>
        Start assessment
      </Button>
    </Card>
  )
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline justify-between gap-4">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="metric-value text-sm text-navy-900">{value}</dd>
  </div>
)
