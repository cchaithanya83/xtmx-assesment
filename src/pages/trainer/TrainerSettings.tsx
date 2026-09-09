import * as React from 'react'
import {
  Database,
  Gauge,
  Headphones,
  Lock,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Volume2,
} from 'lucide-react'
import type { AudioLevelConfig, TrainerSettings as Settings, WpmScoreBand } from '@/types'
import { DEFAULT_SETTINGS } from '@/data/settings'
import { SPELLABLE_FIELDS } from '@shared/content.ts'
import { BrowserTTSProvider, resolveTTSProvider, type TTSVoice } from '@/audio/tts'
import { useAppStore } from '@/store/appStore'
import { admin } from '@/api/client'
import { PageHeader } from '@/components/shared'
import { cn } from '@/lib/utils'
import {
  Badge,
  Button,
  Card,
  Dialog,
  Label,
  NumberInput,
  Select,
  Switch,
} from '@/components/ui'

/**
 * Trainer / Admin configuration.
 *
 * Every threshold, scoring band and difficulty parameter used by the scoring and
 * scenario engines is editable here. Changes apply to future attempts; historic
 * attempts keep the gates they were scored against, which is why `Attempt.gates`
 * is stored per-attempt rather than recomputed.
 */
export default function TrainerSettingsPage() {
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const refreshMe = useAppStore((s) => s.refreshMe)
  const isAdmin = useAppStore((s) => s.isAdmin)()
  const [busy, setBusy] = React.useState(false)
  const [banner, setBanner] = React.useState<string | null>(null)

  const [draft, setDraft] = React.useState<Settings>(settings)
  const [saved, setSaved] = React.useState(false)
  const [voices, setVoices] = React.useState<TTSVoice[]>([])
  const [confirm, setConfirm] = React.useState<'defaults' | 'demo' | null>(null)

  React.useEffect(() => setDraft(settings), [settings])

  React.useEffect(() => {
    void resolveTTSProvider().listVoices().then(setVoices)
  }, [])

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings)

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const save = async () => {
    setBusy(true)
    setBanner(null)
    try {
      await updateSettings(draft)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2200)
    } catch (err) {
      setBanner((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /** Demo data lives in the database now, so seeding is a server operation. */
  const demoData = async (action: 'seed' | 'clear') => {
    setBusy(true)
    setBanner(null)
    try {
      const res = await admin.demoData(action)
      setBanner(
        action === 'seed'
          ? `Seeded ${res.candidates} demo candidates.`
          : 'Demo data removed.',
      )
      await refreshMe()
    } catch (err) {
      setBanner((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const setBand = (index: number, patch: Partial<WpmScoreBand>) => {
    const bands = draft.wpmBands.map((b, i) => (i === index ? { ...b, ...patch } : b))
    set('wpmBands', bands)
  }

  const setLevel = (level: number, patch: Partial<AudioLevelConfig>) => {
    set(
      'audioLevels',
      draft.audioLevels.map((l) => (l.level === level ? { ...l, ...patch } : l)),
    )
  }

  const previewVoice = () => {
    const provider = new BrowserTTSProvider()
    if (!provider.isAvailable()) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(
      'The member ID is B as in Bravo, C as in Charlie, seven eight four five nine two. The deductible is one thousand five hundred dollars.',
    )
    u.rate = draft.playbackSpeed
    if (draft.voiceURI) {
      const match = window.speechSynthesis.getVoices().find((v) => v.voiceURI === draft.voiceURI)
      if (match) u.voice = match
    }
    window.speechSynthesis.speak(u)
  }

  return (
    <div className="mx-auto max-w-5xl pb-24">
      <PageHeader
        eyebrow="Trainer / Admin portal"
        title="Assessment Configuration"
        description="Thresholds, scoring bands, audio difficulty and retry policy. Changes apply to future attempts."
        actions={
          <>
            <Button variant="outline" onClick={() => setConfirm('defaults')}>
              <RotateCcw className="size-4" />
              Restore defaults
            </Button>
            <Button onClick={() => void save()} disabled={!dirty || busy}>
              <Save className="size-4" />
              {saved ? 'Saved' : 'Save changes'}
            </Button>
          </>
        }
      />

      {banner && (
        <p className="mb-4 rounded-md border border-border bg-muted/50 px-3 py-2 text-[13px] font-medium text-navy-800">
          {banner}
        </p>
      )}

      <div className="space-y-4">
        {/* ---- Typing requirements ---- */}
        <Section
          icon={<Gauge className="size-4" />}
          title="Typing requirements"
          description="Gates applied to every Task 1 assignment and to final certification."
        >
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <NumberField
              label="Minimum WPM"
              value={draft.minWpm}
              min={5}
              max={120}
              onValueChange={(v) => set('minWpm', v)}
              hint="Per attempt — the floor"
            />
            <NumberField
              label="Task 1 average WPM"
              value={draft.minAverageWpm}
              min={5}
              max={120}
              onValueChange={(v) => set('minAverageWpm', v)}
              hint="Averaged across Task 1"
            />
            <NumberField
              label="Minimum accuracy (%)"
              value={draft.minAccuracy}
              min={50}
              max={100}
              onValueChange={(v) => set('minAccuracy', v)}
              hint="Keystroke accuracy"
            />
            <NumberField
              label="Passing score"
              value={draft.passingScore}
              min={40}
              max={100}
              onValueChange={(v) => set('passingScore', v)}
              hint="Out of 100, per assignment"
            />
            <NumberField
              label="Minimum completion (%)"
              value={draft.minCompletion}
              min={50}
              max={100}
              onValueChange={(v) => set('minCompletion', v)}
              hint="Share of the passage that must be transcribed"
            />
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <Label>Typing speed score bands (30 points available)</Label>
              <Badge variant="muted">Highest matching band wins</Badge>
            </div>
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="data-grid">
                <thead>
                  <tr>
                    <th>Band</th>
                    <th className="w-40">Minimum WPM</th>
                    <th className="w-40">Points awarded</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.wpmBands.map((band, i) => (
                    <tr key={i}>
                      <td className="text-[13px] font-medium text-navy-800">
                        {i === draft.wpmBands.length - 1
                          ? `Below ${draft.wpmBands[i - 1]?.minWpm ?? band.minWpm} WPM`
                          : `${band.minWpm}+ WPM`}
                      </td>
                      <td>
                        <NumberInput
                          value={band.minWpm}
                          min={0}
                          max={200}
                          onValueChange={(v) => setBand(i, { minWpm: v })}
                          className="h-8"
                        />
                      </td>
                      <td>
                        <NumberInput
                          value={band.points}
                          min={0}
                          max={30}
                          onValueChange={(v) => setBand(i, { points: v })}
                          className="h-8"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <NumberField
              label="Long-pause threshold (ms)"
              value={draft.pauseThresholdMs}
              min={500}
              max={15000}
              onValueChange={(v) => set('pauseThresholdMs', v)}
              hint="Idle gaps longer than this are recorded"
            />
          </div>
        </Section>

        {/* ---- Audio requirements ---- */}
        <Section
          icon={<Headphones className="size-4" />}
          title="Audio & listening requirements"
          description="Gates and playback policy for Task 2."
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <NumberField
              label="Minimum data accuracy (%)"
              value={draft.minDataAccuracy}
              min={50}
              max={100}
              onValueChange={(v) => set('minDataAccuracy', v)}
            />
            <NumberField
              label="Minimum critical accuracy (%)"
              value={draft.minCriticalAccuracy}
              min={50}
              max={100}
              onValueChange={(v) => set('minCriticalAccuracy', v)}
            />
            <div className="space-y-1.5">
              <Label htmlFor="name-spelling">Spell member names in the audio</Label>
              <Select
                id="name-spelling"
                value={draft.nameSpelling}
                onChange={(e) =>
                  set('nameSpelling', e.target.value as typeof draft.nameSpelling)
                }
              >
                <option value="none">Not spelled — spoken once, at pace</option>
                <option value="letters">Letter by letter — "J-E-N-N-I-F-E-R"</option>
                <option value="phonetic">Phonetic — "J as in Juliet, E as in Echo"</option>
              </Select>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Without spelling, a candidate has to guess how an unfamiliar name is written, which
                measures luck rather than listening. Real benefits calls spell unusual words
                routinely. Hyphens and apostrophes are named too, since the candidate has to
                reproduce them.
              </p>
            </div>

            {draft.nameSpelling !== 'none' && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Which fields get spelled</Label>
                <div className="flex flex-wrap gap-1.5">
                  {SPELLABLE_FIELDS.map((field) => {
                    const on = draft.spellFields.includes(field.key)
                    return (
                      <button
                        key={field.key}
                        type="button"
                        onClick={() =>
                          set(
                            'spellFields',
                            on
                              ? draft.spellFields.filter((k) => k !== field.key)
                              : [...draft.spellFields, field.key],
                          )
                        }
                        title={field.note}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] font-medium transition-colors',
                          on
                            ? 'border-brand-600 bg-brand-600 text-white'
                            : 'border-border bg-card text-navy-700 hover:border-brand-300 hover:bg-brand-50',
                        )}
                      >
                        {field.label}
                        {field.note && (
                          <span className={cn('text-[9px]', on ? 'opacity-80' : 'text-amber-600')}>
                            ●
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Identifiers are always read character by character, so they are not listed here —
                  adding one would spell it twice. Fields marked ● are long: spelling
                  &ldquo;North Valley Medical Center&rdquo; is 21 letters and roughly doubles that
                  line of audio.
                </p>
              </div>
            )}

            <NumberField
              label="Playback speed"
              value={draft.playbackSpeed}
              min={0.25}
              max={2}
              step={0.05}
              onValueChange={(v) => set('playbackSpeed', v)}
              hint="1.0 = normal · 0.25 = quarter speed"
            />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <ToggleRow
              label="Allow replay in certification mode"
              description="Practice mode always allows replay. Default: off."
              checked={draft.replayAllowed}
              onChange={(v) => set('replayAllowed', v)}
            />
            <ToggleRow
              label="Show live transcript"
              description="Displays each line as it is spoken, so a candidate can re-read a value they have already heard. Only spoken lines appear — never upcoming ones, which would be the answer key. On by default; turn it off for a cohort being assessed on recall. Practice mode always shows it."
              checked={draft.showTranscript}
              onChange={(v) => set('showTranscript', v)}
            />
            <ToggleRow
              label="Allow seeking during assessment"
              description="Lets a candidate scrub the audio in certification mode. Off by default — someone who can jump back over a line is no longer being measured on real-time listening. Practice mode always allows it."
              checked={draft.seekAllowed}
              onChange={(v) => set('seekAllowed', v)}
            />
            <ToggleRow
              label="Allow speed control during assessment"
              description="Lets a candidate change playback rate in certification mode. Off by default, for the same reason. Practice mode always allows it."
              checked={draft.speedControlAllowed}
              onChange={(v) => set('speedControlAllowed', v)}
            />
            <ToggleRow
              label="Allow pause during assessment"
              description="When off, the call runs continuously — including during verification prompts."
              checked={draft.pauseAllowed}
              onChange={(v) => set('pauseAllowed', v)}
            />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label>Voice</Label>
              <Select
                value={draft.voiceURI ?? ''}
                onChange={(e) => set('voiceURI', e.target.value || null)}
              >
                <option value="">System default</option>
                {voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </Select>
            </div>
            <Button variant="outline" onClick={previewVoice}>
              <Volume2 className="size-4" />
              Preview voice
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Provider: <strong className="font-semibold">{resolveTTSProvider().label}</strong>. Set{' '}
            <code className="font-mono">VITE_TTS_PROVIDER</code> and{' '}
            <code className="font-mono">VITE_TTS_PROXY_URL</code> to route audio through a hosted AI
            voice — see <code className="font-mono">docs/TTS_INTEGRATION.md</code>.
          </p>
        </Section>

        {/* ---- Difficulty engine ---- */}
        <Section
          icon={<Sparkles className="size-4" />}
          title="Audio scenario difficulty engine"
          description="Level N drives scenario generation for Task 2 Assignment N. Every attempt regenerates a new scenario at these settings."
        >
          <div className="overflow-x-auto">
            <table className="data-grid min-w-[840px]">
              <thead>
                <tr>
                  <th>Level</th>
                  <th className="w-24">WPM min</th>
                  <th className="w-24">WPM max</th>
                  <th className="w-24">Fields</th>
                  <th className="w-24">Corrections</th>
                  <th className="w-24">Prompts</th>
                  <th className="w-28">Out of order</th>
                  <th className="w-28">Phonetic IDs</th>
                </tr>
              </thead>
              <tbody>
                {draft.audioLevels.map((level) => (
                  <tr key={level.level}>
                    <td>
                      <span className="metric-value text-sm">L{level.level}</span>
                    </td>
                    <td>
                      <NumberInput
                        value={level.wpmMin}
                        min={60}
                        max={220}
                        onValueChange={(v) => setLevel(level.level, { wpmMin: v })}
                        className="h-8"
                      />
                    </td>
                    <td>
                      <NumberInput
                        value={level.wpmMax}
                        min={60}
                        max={240}
                        onValueChange={(v) => setLevel(level.level, { wpmMax: v })}
                        className="h-8"
                      />
                    </td>
                    <td>
                      <NumberInput
                        value={level.fieldCount}
                        min={3}
                        max={15}
                        onValueChange={(v) => setLevel(level.level, { fieldCount: v })}
                        className="h-8"
                      />
                    </td>
                    <td>
                      <NumberInput
                        value={level.corrections}
                        min={0}
                        max={5}
                        onValueChange={(v) => setLevel(level.level, { corrections: v })}
                        className="h-8"
                      />
                    </td>
                    <td>
                      <NumberInput
                        value={level.verificationPrompts}
                        min={0}
                        max={5}
                        onValueChange={(v) =>
                          setLevel(level.level, { verificationPrompts: v })
                        }
                        className="h-8"
                      />
                    </td>
                    <td>
                      <Switch
                        checked={level.outOfOrder}
                        onCheckedChange={(v) => setLevel(level.level, { outOfOrder: v })}
                      />
                    </td>
                    <td>
                      <Switch
                        checked={level.phoneticIds}
                        onCheckedChange={(v) => setLevel(level.level, { phoneticIds: v })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* ---- Multitasking ---- */}
        <Section
          icon={<ShieldCheck className="size-4" />}
          title="Multitasking"
          description="Applied to Task 2 Assignment 5 and to final certification."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              label="Minimum multitasking score (%)"
              value={draft.minMultitaskingScore}
              min={40}
              max={100}
              onValueChange={(v) => set('minMultitaskingScore', v)}
            />
            <NumberField
              label="Verification prompts in Assignment 5"
              value={draft.verificationPromptFrequency}
              min={0}
              max={5}
              onValueChange={(v) => set('verificationPromptFrequency', v)}
              hint="Overrides the level 5 prompt count"
            />
          </div>
        </Section>

        {/* ---- Progression ---- */}
        <Section
          icon={<Lock className="size-4" />}
          title="Progression"
          description="Whether assignments must be completed in order."
        >
          <ToggleRow
            label="Require assignments to be passed in order"
            description="On: Assignment 2 stays locked until Assignment 1 is passed, and so on through both tasks. Off: every assignment is available immediately, so a candidate stuck on one can keep working and a trainer can diagnose across the whole assessment. This governs advancement only — certification still requires all ten assignments passed."
            checked={draft.requireSequentialUnlock}
            onChange={(v) => set('requireSequentialUnlock', v)}
          />
          <ToggleRow
            label="Require Task 1 before Task 2"
            description="Holds all of Task 2 until Task 1 is complete: all five assignments passed AND the Task 1 average WPM at or above the threshold above. Off by default, since typing and listening are separate competencies and are often assessed in the same session."
            checked={draft.requireTask1BeforeTask2}
            onChange={(v) => set('requireTask1BeforeTask2', v)}
          />
          {!draft.requireSequentialUnlock && (
            <p className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              Sequential unlocking is off. Candidates can attempt any assignment, including the
              Task 2 multitasking simulation, without having passed the ones before it. Scores are
              recorded exactly as normal, and all ten are still required to certify.
            </p>
          )}
        </Section>

        {/* ---- Retry policy ---- */}
        <Section
          icon={<RotateCcw className="size-4" />}
          title="Retry policy"
          description="Default is unlimited retries — candidates practise until they meet the standard."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <ToggleRow
              label="Unlimited retries"
              description="When off, the maximum attempt count below applies."
              checked={draft.unlimitedRetries}
              onChange={(v) => set('unlimitedRetries', v)}
            />
            <ToggleRow
              label="Require practice before retry"
              description="Candidate must complete a practice run before another certification attempt."
              checked={draft.requirePracticeBeforeRetry}
              onChange={(v) => set('requirePracticeBeforeRetry', v)}
            />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <NumberField
              label="Maximum attempts per assignment"
              value={draft.maxAttempts}
              min={1}
              max={20}
              onValueChange={(v) => set('maxAttempts', v)}
              disabled={draft.unlimitedRetries}
            />
            <NumberField
              label="Lockout after failure (seconds)"
              value={draft.lockoutSeconds}
              min={0}
              max={3600}
              onValueChange={(v) => set('lockoutSeconds', v)}
              hint="0 = retry immediately"
            />
          </div>
        </Section>

        {/* ---- Integrity ---- */}
        <Section
          icon={<ShieldCheck className="size-4" />}
          title="Assessment integrity"
          description="Observational only — these signals never fail an attempt automatically."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <ToggleRow
              label="Block copy & paste"
              description="Disables paste, copy, cut and drop in assessment inputs."
              checked={draft.blockPaste}
              onChange={(v) => set('blockPaste', v)}
            />
            <ToggleRow
              label="Track tab switching"
              description="Records window blur/focus and visibility changes."
              checked={draft.trackTabSwitching}
              onChange={(v) => set('trackTabSwitching', v)}
            />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <NumberField
              label="Flag for review after N focus losses"
              value={draft.flagBlurThreshold}
              min={1}
              max={20}
              onValueChange={(v) => set('flagBlurThreshold', v)}
            />
          </div>
        </Section>

        {/* ---- Workspace ---- */}
        <Section
          icon={<Database className="size-4" />}
          title="Workspace & data"
          description="Persistence backend and demo data management."
        >
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge variant="accent">Supabase · secure API</Badge>
            <Badge variant="muted">Row Level Security: deny-all</Badge>
          </div>
          <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">
            All data is served by the <code className="font-mono">api</code> Edge Function, which
            authorises every request against your login. The browser holds no database credentials
            — Row Level Security denies direct access outright. Schema and policies live in{' '}
            <code className="font-mono">supabase/schema.sql</code>.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void demoData('seed')}>
              <Sparkles className="size-4" />
              Regenerate demo candidates
            </Button>
            <Button variant="destructive" onClick={() => setConfirm('demo')} disabled={!isAdmin || busy}>
              <Trash2 className="size-4" />
              Delete demo data
            </Button>
          </div>
        </Section>
      </div>

      {/* ---- Sticky save bar ---- */}
      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 py-3 backdrop-blur-sm">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <p className="text-sm font-medium text-navy-800">You have unsaved configuration changes.</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDraft(settings)}>
                Discard
              </Button>
              <Button onClick={() => void save()} disabled={busy}>
                <Save className="size-4" />
                Save changes
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === 'demo' ? 'Delete demo data?' : 'Restore default configuration?'}
        description={
          confirm === 'demo'
            ? 'This removes every seeded demo candidate and all of their attempts. Real candidate records are not affected.'
            : 'All thresholds, scoring bands and difficulty settings return to the platform defaults.'
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirm === 'demo') {
                  void demoData('clear')
                } else {
                  void updateSettings(DEFAULT_SETTINGS)
                  setDraft(DEFAULT_SETTINGS)
                }
                setConfirm(null)
              }}
            >
              Confirm
            </Button>
          </>
        }
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start gap-2.5">
        <span className="mt-0.5 text-brand-700">{icon}</span>
        <div>
          <h2 className="text-sm font-bold text-navy-900">{title}</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </Card>
  )
}

function NumberField({
  label,
  value,
  min,
  max,
  onValueChange,
  hint,
  step,
  disabled,
}: {
  label: string
  value: number
  min: number
  max: number
  onValueChange: (value: number) => void
  hint?: string
  step?: number
  disabled?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <NumberInput
        value={value}
        min={min}
        max={max}
        step={step}
        onValueChange={onValueChange}
        disabled={disabled}
      />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-navy-900">{label}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
