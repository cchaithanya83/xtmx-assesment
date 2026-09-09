import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, Flag, Headphones, ShieldAlert } from 'lucide-react'
import type { AudioAttemptTelemetry, AudioField, FieldTelemetry } from '@/types'
import { getAssignment } from '@/data/tasks'
import { SegmentSpeechEngine, resolveTTSProvider } from '@/audio/tts'
import { useAppStore } from '@/store/appStore'
import { assessments } from '@/api/client'
import type { PublicScenario } from '@/api/client'
import { AssessmentShell, DesktopRecommendedNotice } from '@/components/layout/AppShell'
import { AudioPlayer } from '@/components/audio/AudioPlayer'
import { CaptureSummary, ScenarioForm } from '@/components/audio/ScenarioForm'
import { Transcript } from '@/components/audio/Transcript'
import { NotesPad } from '@/components/audio/NotesPad'
import { VerificationPromptCard } from '@/components/audio/VerificationPromptCard'
import { DifficultyBadge } from '@/components/shared'
import { Badge, Button, Card, Dialog, Progress } from '@/components/ui'
import { clipboardGuards, useIntegrityMonitor } from '@/hooks/useIntegrityMonitor'
import { cn, formatDuration } from '@/lib/utils'

/** A verification prompt as the API returns it — no correct answer attached. */
type ClientPrompt = PublicScenario['verificationPrompts'][number]

/**
 * Task 2 assessment runner.
 *
 * Orchestrates the generated audio, the structured capture form, inline
 * verification prompts and the full interaction telemetry that Task 2 scoring
 * depends on (time per field, entry timing relative to audio progress,
 * correction counts, navigation counts, skipped fields).
 */
export default function Task2Runner() {
  const { assignmentId: rawId } = useParams()
  const assignmentId = Number(rawId ?? 1)
  const navigate = useNavigate()

  const activeSession = useAppStore((s) => s.activeSession)
  const settings = useAppStore((s) => s.settings)
  const submitAttempt = useAppStore((s) => s.submitAttempt)
  const abandonSession = useAppStore((s) => s.abandonSession)

  const assignment = getAssignment(2, assignmentId)
  const scenario = activeSession?.scenario
  const isCertification = activeSession?.mode === 'certification'
  const isFinal = assignmentId === 5

  // Practice mode always allows replay; certification follows the trainer setting.
  const replayAllowed = activeSession?.mode === 'practice' || settings.replayAllowed
  const pauseAllowed = activeSession?.mode === 'practice' || settings.pauseAllowed
  const seekAllowed = activeSession?.mode === 'practice' || settings.seekAllowed
  const speedControlAllowed =
    activeSession?.mode === 'practice' || settings.speedControlAllowed
  const transcriptShown = activeSession?.mode === 'practice' || settings.showTranscript
  const notesShown = activeSession?.mode === 'practice' || settings.allowNotes

  /* ---- State ------------------------------------------------------------ */
  const [values, setValues] = React.useState<Record<string, string>>({})
  const [progress, setProgress] = React.useState(0)
  const [elapsedAudio, setElapsedAudio] = React.useState(0)
  const [isPlaying, setIsPlaying] = React.useState(false)
  const [hasStarted, setHasStarted] = React.useState(false)
  const [ended, setEnded] = React.useState(false)
  const [started, setStarted] = React.useState(false)
  const [sessionElapsed, setSessionElapsed] = React.useState(0)
  const [replaysUsed, setReplaysUsed] = React.useState(0)
  const [speed, setSpeed] = React.useState(settings.playbackSpeed)
  const [segmentMarkers, setSegmentMarkers] = React.useState<number[]>([])
  const [seeksUsed, setSeeksUsed] = React.useState(0)
  /**
   * How many segments have started. Drives the transcript, and is deliberately
   * derived from playback rather than from the scenario, so the transcript can
   * never show a line before it is spoken.
   */
  const [spokenCount, setSpokenCount] = React.useState(0)
  const [notes, setNotes] = React.useState('')
  /** Mirrors `notes` so a timeout submission sends the latest text. */
  const notesRef = React.useRef('')
  const [confirmExit, setConfirmExit] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  /* Set synchronously at the start of submission. `submitting` state is not
     reliable here: the Zustand write that clears `activeSession` can trigger a
     render before the React state update is flushed, which would let the guard
     below bounce the candidate off the result screen. */
  const submittedRef = React.useRef(false)
  const [ttsWarning, setTtsWarning] = React.useState<string | null>(null)

  const [activePrompt, setActivePrompt] = React.useState<ClientPrompt | null>(null)
  const [answeredPrompts, setAnsweredPrompts] = React.useState<
    AudioAttemptTelemetry['verificationAnswers']
  >([])

  /* ---- Refs (telemetry must not trigger re-renders) --------------------- */
  const engineRef = React.useRef<SegmentSpeechEngine | null>(null)
  const telemetryRef = React.useRef<Record<string, FieldTelemetry>>({})
  const navCountRef = React.useRef(0)
  const firedPromptsRef = React.useRef<Set<string>>(new Set())
  const progressRef = React.useRef(0)
  const startRef = React.useRef<number | null>(null)
  /** Mirrors `values` so a timeout submission always sends the latest capture. */
  const valuesRef = React.useRef<Record<string, string>>({})

  const integrity = useIntegrityMonitor({
    enabled: Boolean(isCertification),
    trackTabSwitching: settings.trackTabSwitching,
    flagBlurThreshold: settings.flagBlurThreshold,
  })

  /* ---- Guard ------------------------------------------------------------
     Skipped once submission has started: submitting clears `activeSession`,
     and without this the guard would race the navigation to the result screen. */
  React.useEffect(() => {
    if (submittedRef.current) return
    if (!activeSession || activeSession.taskId !== 2) {
      navigate('/task/2', { replace: true })
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


  /* ---- Initialise telemetry for the scenario's fields ------------------- */
  React.useEffect(() => {
    if (!scenario) return
    const init: Record<string, FieldTelemetry> = {}
    for (const field of scenario.fields) {
      init[field.key] = {
        key: field.key as FieldTelemetry['key'],
        firstInputAt: null,
        lastEditAt: null,
        timeOnFieldMs: 0,
        corrections: 0,
        visits: 0,
        audioProgressAtEntry: null,
        audioProgressAtLastEdit: null,
        finalValue: '',
        skipped: true,
        correct: false,
      }
    }
    telemetryRef.current = init
    valuesRef.current = {}
    setValues({})
  }, [scenario])

  /* ---- Speech engine ---------------------------------------------------- */
  React.useEffect(() => {
    const engine = new SegmentSpeechEngine(resolveTTSProvider())
    engineRef.current = engine
    return () => engine.stop()
  }, [])

  React.useEffect(() => {
    if (!scenario || !engineRef.current) return
    engineRef.current.load(scenario.segments, scenario.estimatedDurationSeconds, {
      speed: settings.playbackSpeed,
      voice: settings.voiceURI ?? undefined,
    })
    setSegmentMarkers(engineRef.current.segmentMarkers)
    setSpeed(settings.playbackSpeed)
  }, [scenario, settings.playbackSpeed, settings.voiceURI])

  /* ---- Session timer ---------------------------------------------------- */
  React.useEffect(() => {
    if (!started || submitting) return
    const id = window.setInterval(() => {
      if (startRef.current !== null) {
        setSessionElapsed((performance.now() - startRef.current) / 1000)
      }
    }, 250)
    return () => window.clearInterval(id)
  }, [started, submitting])

  const remaining = Math.max(0, assignment.timeLimitSeconds - sessionElapsed)

  /* ---- Verification prompt scheduling ----------------------------------- */
  const handleProgress = React.useCallback(
    (p: number, elapsed: number) => {
      progressRef.current = p
      setProgress(p)
      setElapsedAudio(elapsed)

      if (!scenario) return
      // Fire the first unfired prompt whose trigger point has been reached.
      const due = scenario.verificationPrompts.find(
        (vp) => !firedPromptsRef.current.has(vp.id) && p >= vp.triggerAtProgress,
      )
      if (due) {
        firedPromptsRef.current.add(due.id)
        setActivePrompt(due)
        // Audio only pauses if the trainer configured it to — the default is
        // that the call keeps running while the candidate answers.
        if (pauseAllowed && settings.pauseAllowed) {
          engineRef.current?.pause()
          setIsPlaying(false)
        }
      }
    },
    [scenario, pauseAllowed, settings.pauseAllowed],
  )

  const playAudio = () => {
    if (!engineRef.current) return
    setHasStarted(true)
    setIsPlaying(true)
    engineRef.current.play({
      onSegmentStart: (index) => setSpokenCount(index + 1),
      onProgress: handleProgress,
      onEnd: () => {
        setIsPlaying(false)
        setEnded(true)
        setProgress(1)
        progressRef.current = 1
      },
      onError: (err) =>
        setTtsWarning(
          `Speech synthesis reported an issue (${err.message}). The transcript timeline will continue.`,
        ),
    })
  }

  const pauseAudio = () => {
    engineRef.current?.pause()
    setIsPlaying(false)
  }

  /**
   * Seeking snaps to a segment boundary — browser speech synthesis cannot jump
   * mid-utterance. Recorded so a trainer can see how much the candidate leaned
   * on it.
   */
  const seekAudio = (p: number) => {
    if (!engineRef.current || !seekAllowed) return
    setSeeksUsed((n) => n + 1)
    // Prompts already fired stay fired: re-triggering them on every scrub would
    // let a candidate farm the same question repeatedly.
    engineRef.current.seek(p, {
      onSegmentStart: (index) => setSpokenCount(index + 1),
      onProgress: handleProgress,
    })
    // Seeking back must not leave later lines on screen.
    const segmentCount = scenario?.segments.length ?? 0
    setSpokenCount((current) => Math.min(current, Math.ceil(p * segmentCount)))
    setEnded(false)
  }

  const changeSpeed = (next: number) => {
    if (!engineRef.current || !speedControlAllowed) return
    setSpeed(next)
    engineRef.current.setSpeed(next)
  }

  const replayAudio = () => {
    if (!engineRef.current || !scenario) return
    setReplaysUsed((n) => n + 1)
    firedPromptsRef.current.clear()
    engineRef.current.stop()
    engineRef.current.load(scenario.segments, scenario.estimatedDurationSeconds, {
      speed: settings.playbackSpeed,
      voice: settings.voiceURI ?? undefined,
    })
    setEnded(false)
    setProgress(0)
    progressRef.current = 0
    setSpokenCount(0)
    setHasStarted(false)
    // Next tick so the engine's internal reset lands before replay.
    requestAnimationFrame(playAudio)
  }

  /* ---- Field interaction ------------------------------------------------ */
  const onFocusField = React.useCallback((key: string) => {
    const t = telemetryRef.current[key]
    if (!t) return
    t.visits += 1
    navCountRef.current += 1
  }, [])

  const onChangeField = React.useCallback((key: string, value: string) => {
    const now = performance.now()
    const t = telemetryRef.current[key]
    if (t) {
      if (t.firstInputAt === null) {
        t.firstInputAt = now
        t.audioProgressAtEntry = progressRef.current
      } else if (t.finalValue && value !== t.finalValue) {
        // Any edit after the first committed value is a correction.
        t.corrections += 1
      }
      t.lastEditAt = now
      t.audioProgressAtLastEdit = progressRef.current
      t.timeOnFieldMs = now - (t.firstInputAt ?? now)
      t.finalValue = value
      t.skipped = value.trim() === ''
    }
    valuesRef.current = { ...valuesRef.current, [key]: value }
    setValues((prev) => ({ ...prev, [key]: value }))
  }, [])

  const answerPrompt = (answer: string) => {
    if (!activePrompt) return
    setAnsweredPrompts((prev) => [
      ...prev,
      {
        promptId: activePrompt.id,
        answer,
        // Graded server-side; this flag is ignored by the API.
        correct: false,
        answeredAtProgress: progressRef.current,
      },
    ])
    setActivePrompt(null)
    if (!isPlaying && !ended && pauseAllowed && settings.pauseAllowed) {
      engineRef.current?.play({ onProgress: handleProgress })
      setIsPlaying(true)
    }
  }

  /* ---- Submission ------------------------------------------------------- */
  /**
   * Submits the captured answers and the interaction telemetry.
   *
   * No score is computed here and none is sent. The server holds the answer key
   * for this session, re-grades the verification prompts itself, and returns
   * the finished attempt.
   */
  const handleSubmit = React.useCallback(
    async (reason: 'manual' | 'time') => {
      if (submittedRef.current || !activeSession || !scenario) return
      submittedRef.current = true
      setSubmitting(true)
      setSubmitError(null)
      engineRef.current?.stop()

      const telemetry: Partial<AudioAttemptTelemetry> = {
        fields: telemetryRef.current,
        fieldNavigationCount: navCountRef.current,
        totalPauseMs: 0,
        // Seeks are counted alongside replays: both are listening aids, and a
        // trainer should be able to see how much help an attempt needed.
        replaysUsed: replaysUsed + seeksUsed,
        verificationAnswers: answeredPrompts,
        blurCount: integrity.log.blurCount,
        pasteAttempts: integrity.log.pasteAttempts,
        notes: notesRef.current.trim() || undefined,
      }

      try {
        await submitAttempt({
          sessionId: activeSession.sessionId,
          answers: valuesRef.current,
          telemetry,
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
        submittedRef.current = false
        setSubmitting(false)
        setSubmitError((err as Error).message)
      }
    },
    [
      activeSession,
      scenario,
      answeredPrompts,
      integrity.log,
      replaysUsed,
      seeksUsed,
      submitAttempt,
      navigate,
    ],
  )

  React.useEffect(() => {
    if (started && remaining <= 0 && !submittedRef.current) void handleSubmit('time')
  }, [started, remaining, handleSubmit])

  const begin = () => {
    startRef.current = performance.now()
    setStarted(true)
  }

  const exit = () => {
    if (started) {
      setConfirmExit(true)
    } else {
      void abandonSession()
      navigate('/task/2')
    }
  }

  if (!activeSession || activeSession.taskId !== 2 || !scenario) return null

  // `ScenarioForm` renders from the full field shape; the server withholds
  // `expected`, so fill it with an empty string the UI never reads.
  const formFields: AudioField[] = scenario.fields.map((f) => ({
    key: f.key as AudioField['key'],
    label: f.label,
    type: f.type as AudioField['type'],
    expected: '',
    critical: f.critical,
    placeholder: f.placeholder,
    options: f.options,
    hint: f.hint,
  }))

  const guards = clipboardGuards(
    Boolean(isCertification) && settings.blockPaste,
    integrity.recordPaste,
    integrity.recordCopy,
  )

  return (
    <AssessmentShell
      onExit={exit}
      header={
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          <div className="flex min-w-0 items-center gap-2">
            <Headphones className="size-4 shrink-0 text-brand-700" />
            <span className="truncate text-sm font-bold text-navy-900">
              Task 2 · Assignment {assignmentId} — {assignment.title}
            </span>
          </div>
          <DifficultyBadge difficulty={assignment.difficulty} />
          {activeSession.mode === 'practice' ? (
            <Badge variant="accent">Practice</Badge>
          ) : (
            <Badge variant="muted">Certification</Badge>
          )}
          <Badge variant="outline">Attempt {activeSession.attemptNumber}</Badge>
          <Badge variant="outline">Level {scenario.level}</Badge>
          <span
            className={cn(
              'ml-auto metric-value text-base',
              remaining <= 45 ? 'text-red-700' : 'text-navy-900',
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
          assignmentTitle={assignment.title}
          description={assignment.description}
          objectives={assignment.objectives}
          fieldCount={scenario.fields.length}
          criticalCount={scenario.fields.filter((f) => f.critical).length}
          duration={scenario.estimatedDurationSeconds}
          timeLimit={assignment.timeLimitSeconds}
          wpm={scenario.wordsPerMinute}
          corrections={scenario.hasCorrections ? 1 : 0}
          prompts={scenario.verificationPrompts.length}
          outOfOrder={scenario.outOfOrder}
          replayAllowed={replayAllowed}
          pauseAllowed={pauseAllowed}
          mode={activeSession.mode}
          settings={{
            passingScore: settings.passingScore,
            minDataAccuracy: settings.minDataAccuracy,
            minCriticalAccuracy: settings.minCriticalAccuracy,
            minMultitaskingScore: settings.minMultitaskingScore,
          }}
          isFinal={isFinal}
          onStart={begin}
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          {/* ---- Left: audio + status ---- */}
          <div className="flex flex-col gap-3">
            <AudioPlayer
              progress={progress}
              elapsedSeconds={elapsedAudio}
              durationSeconds={scenario.estimatedDurationSeconds}
              isPlaying={isPlaying}
              hasStarted={hasStarted}
              ended={ended}
              pauseAllowed={pauseAllowed}
              replayAllowed={replayAllowed}
              replaysUsed={replaysUsed}
              wordsPerMinute={scenario.wordsPerMinute}
              onPlay={playAudio}
              onPause={pauseAudio}
              onReplay={replayAudio}
              seekAllowed={seekAllowed}
              onSeek={seekAudio}
              segmentMarkers={segmentMarkers}
              speedControlAllowed={speedControlAllowed}
              speed={speed}
              onSpeedChange={changeSpeed}
            />

            {transcriptShown && (
              <Transcript segments={scenario.segments} spokenCount={spokenCount} />
            )}

            {notesShown && (
              <NotesPad
                value={notes}
                onChange={(v) => {
                  notesRef.current = v
                  setNotes(v)
                }}
              />
            )}

            {activePrompt && (
              <VerificationPromptCard
                prompt={activePrompt}
                onAnswer={answerPrompt}
                audioContinues={isPlaying}
              />
            )}

            <Card className="p-4">
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Session status
              </h3>
              <CaptureSummary fields={formFields} values={values} className="mb-3" />
              <div className="space-y-2">
                <div>
                  <div className="mb-1 flex items-baseline justify-between text-[11px] text-muted-foreground">
                    <span>Time used</span>
                    <span className="tabular text-navy-800">
                      {formatDuration(sessionElapsed)} / {formatDuration(assignment.timeLimitSeconds)}
                    </span>
                  </div>
                  <Progress
                    value={(sessionElapsed / assignment.timeLimitSeconds) * 100}
                    size="sm"
                    tone={remaining <= 45 ? 'red' : 'navy'}
                  />
                </div>
                {(seekAllowed || speedControlAllowed) && (
                  <div className="flex items-baseline justify-between text-[11px] text-muted-foreground">
                    <span>Listening aids used</span>
                    <span className="tabular text-navy-800">
                      {replaysUsed + seeksUsed}
                    </span>
                  </div>
                )}
                {scenario.verificationPrompts.length > 0 && (
                  <div className="flex items-baseline justify-between text-[11px] text-muted-foreground">
                    <span>Verification prompts answered</span>
                    <span className="tabular text-navy-800">
                      {answeredPrompts.length}/{scenario.verificationPrompts.length}
                    </span>
                  </div>
                )}
              </div>

              {isCertification && settings.blockPaste && (
                <p className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-amber-700">
                  <ShieldAlert className="size-3" />
                  Paste disabled for this attempt
                </p>
              )}
              {ttsWarning && (
                <p className="mt-2 flex items-start gap-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                  {ttsWarning}
                </p>
              )}
              {integrity.log.flagged && isCertification && (
                <p className="mt-2 flex items-start gap-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                  Focus loss recorded ({integrity.log.blurCount}). Logged for trainer review.
                </p>
              )}

              {submitError && (
                <p className="mt-2 flex items-start gap-1.5 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-900">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                  {submitError} Your capture is still here — press Submit to try again.
                </p>
              )}

              <Button
                className="mt-4 w-full"
                disabled={submitting}
                onClick={() => void handleSubmit('manual')}
              >
                <Flag className="size-4" />
                Submit capture
              </Button>
            </Card>
          </div>

          {/* ---- Right: capture form ---- */}
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Verification form
              </h2>
              {scenario.outOfOrder && (
                <Badge variant="warning">Information may arrive out of order</Badge>
              )}
              {scenario.hasCorrections && (
                <Badge variant="warning">Listen for spoken corrections</Badge>
              )}
            </div>
            <ScenarioForm
              fields={formFields}
              values={values}
              onChange={onChangeField}
              onFocusField={onFocusField}
              guards={guards}
            />
          </div>
        </div>
      )}

      <Dialog
        open={confirmExit}
        onClose={() => setConfirmExit(false)}
        title="Abandon this attempt?"
        description="Nothing will be recorded. A new randomised scenario will be generated when you restart."
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmExit(false)}>
              Continue attempt
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                engineRef.current?.stop()
                void abandonSession()
                navigate('/task/2')
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

function StartPanel(props: {
  assignmentTitle: string
  description: string
  objectives: string[]
  fieldCount: number
  criticalCount: number
  duration: number
  timeLimit: number
  wpm: number
  corrections: number
  prompts: number
  outOfOrder: boolean
  replayAllowed: boolean
  pauseAllowed: boolean
  mode: string
  isFinal: boolean
  settings: {
    passingScore: number
    minDataAccuracy: number
    minCriticalAccuracy: number
    minMultitaskingScore: number
  }
  onStart: () => void
}) {
  return (
    <Card className="mx-auto max-w-3xl p-6 sm:p-8">
      <p className="text-[11px] font-bold uppercase tracking-widest text-brand-700">
        {props.mode === 'practice'
          ? 'Practice run — not recorded for certification'
          : 'Certification attempt'}
      </p>
      <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-navy-900">
        {props.assignmentTitle}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{props.description}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            What is measured
          </h3>
          <ul className="space-y-1.5">
            {props.objectives.map((o) => (
              <li key={o} className="flex gap-2 text-sm text-navy-800">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-600" />
                {o}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-border bg-muted/40 p-4">
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            This scenario
          </h3>
          <dl className="space-y-1.5 text-sm">
            <Row label="Fields to capture" value={String(props.fieldCount)} />
            <Row label="Critical fields" value={String(props.criticalCount)} />
            <Row label="Speaking pace" value={`${props.wpm} WPM`} />
            <Row label="Audio length" value={`≈ ${formatDuration(props.duration)}`} />
            <Row label="Time limit" value={formatDuration(props.timeLimit)} />
            {props.corrections > 0 && (
              <Row label="Spoken corrections" value={String(props.corrections)} />
            )}
            {props.prompts > 0 && (
              <Row label="Verification prompts" value={String(props.prompts)} />
            )}
          </dl>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <Badge variant={props.replayAllowed ? 'accent' : 'muted'}>
          {props.replayAllowed ? 'Replay allowed' : 'No replay'}
        </Badge>
        <Badge variant={props.pauseAllowed ? 'accent' : 'muted'}>
          {props.pauseAllowed ? 'Pause allowed' : 'Pause disabled'}
        </Badge>
        <Badge variant="muted">No rewind</Badge>
        <Badge variant="muted">No skip forward</Badge>
        {props.outOfOrder && <Badge variant="warning">Out-of-order information</Badge>}
        {props.corrections > 0 && <Badge variant="warning">Spoken corrections</Badge>}
      </div>

      <div className="mt-5 rounded-lg border border-border bg-card p-4">
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Passing standard
        </h3>
        <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          <Row label="Minimum score" value={`${props.settings.passingScore} / 100`} />
          <Row label="Data accuracy" value={`${props.settings.minDataAccuracy}%`} />
          <Row label="Critical-data accuracy" value={`${props.settings.minCriticalAccuracy}%`} />
          {props.isFinal && (
            <Row label="Multitasking score" value={`${props.settings.minMultitaskingScore}%`} />
          )}
        </dl>
      </div>

      <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p className="font-semibold">Before you begin</p>
        <p className="mt-1 leading-relaxed">
          Put your headset on and confirm your volume. The audio is generated fresh for this attempt
          — no two attempts use the same values. Once the call starts you cannot rewind or skip, so
          capture information as you hear it.
        </p>
      </div>

      <Button size="xl" className="mt-6 w-full" onClick={props.onStart}>
        Enter assessment
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
