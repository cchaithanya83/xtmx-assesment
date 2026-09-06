import * as React from 'react'
import {
  Database,
  Gauge,
  Headphones,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Volume2,
} from 'lucide-react'
import type { AudioLevelConfig, TrainerSettings as Settings, WpmScoreBand } from '@/types'
import { DEFAULT_SETTINGS } from '@/data/settings'
import { BrowserTTSProvider, resolveTTSProvider, type TTSVoice } from '@/audio/tts'
import { adapterLabel } from '@/persistence'
import { useAppStore } from '@/store/appStore'
import { PageHeader } from '@/components/shared'
import { Badge, Button, Card, Dialog, Input, Label, Select, Switch } from '@/components/ui'
import { clamp } from '@/lib/utils'

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
  const resetSettings = useAppStore((s) => s.resetSettings)
  const deleteDemoData = useAppStore((s) => s.deleteDemoData)
  const reseedDemoData = useAppStore((s) => s.reseedDemoData)
  const candidates = useAppStore((s) => s.candidates)

  const [draft, setDraft] = React.useState<Settings>(settings)
  const [saved, setSaved] = React.useState(false)
  const [voices, setVoices] = React.useState<TTSVoice[]>([])
  const [confirm, setConfirm] = React.useState<'defaults' | 'demo' | null>(null)

  React.useEffect(() => setDraft(settings), [settings])

  React.useEffect(() => {
    void resolveTTSProvider().listVoices().then(setVoices)
  }, [])

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings)
  const demoCount = candidates.filter((c) => c.isDemo).length

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const num =
    <K extends keyof Settings>(key: K, min: number, max: number) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const parsed = Number(e.target.value)
      set(key, clamp(Number.isFinite(parsed) ? parsed : min, min, max) as Settings[K])
    }

  const save = () => {
    updateSettings(draft)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2200)
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
            <Button onClick={save} disabled={!dirty}>
              <Save className="size-4" />
              {saved ? 'Saved' : 'Save changes'}
            </Button>
          </>
        }
      />

      <div className="space-y-4">
        {/* ---- Typing requirements ---- */}
        <Section
          icon={<Gauge className="size-4" />}
          title="Typing requirements"
          description="Gates applied to every Task 1 assignment and to final certification."
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <NumberField
              label="Minimum WPM"
              value={draft.minWpm}
              onChange={num('minWpm', 5, 120)}
              hint="Net WPM required to pass"
            />
            <NumberField
              label="Minimum accuracy (%)"
              value={draft.minAccuracy}
              onChange={num('minAccuracy', 50, 100)}
              hint="Keystroke accuracy"
            />
            <NumberField
              label="Passing score"
              value={draft.passingScore}
              onChange={num('passingScore', 40, 100)}
              hint="Out of 100, per assignment"
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
                        <Input
                          type="number"
                          value={band.minWpm}
                          onChange={(e) =>
                            setBand(i, { minWpm: clamp(Number(e.target.value) || 0, 0, 200) })
                          }
                          className="h-8 font-mono"
                        />
                      </td>
                      <td>
                        <Input
                          type="number"
                          value={band.points}
                          onChange={(e) =>
                            setBand(i, { points: clamp(Number(e.target.value) || 0, 0, 30) })
                          }
                          className="h-8 font-mono"
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
              onChange={num('pauseThresholdMs', 500, 15000)}
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
              onChange={num('minDataAccuracy', 50, 100)}
            />
            <NumberField
              label="Minimum critical accuracy (%)"
              value={draft.minCriticalAccuracy}
              onChange={num('minCriticalAccuracy', 50, 100)}
            />
            <NumberField
              label="Playback speed"
              value={draft.playbackSpeed}
              step={0.05}
              onChange={(e) =>
                set('playbackSpeed', clamp(Number(e.target.value) || 1, 0.5, 2))
              }
              hint="1.0 = normal"
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
                      <Input
                        type="number"
                        value={level.wpmMin}
                        onChange={(e) =>
                          setLevel(level.level, { wpmMin: clamp(Number(e.target.value) || 80, 60, 220) })
                        }
                        className="h-8 font-mono"
                      />
                    </td>
                    <td>
                      <Input
                        type="number"
                        value={level.wpmMax}
                        onChange={(e) =>
                          setLevel(level.level, { wpmMax: clamp(Number(e.target.value) || 90, 60, 240) })
                        }
                        className="h-8 font-mono"
                      />
                    </td>
                    <td>
                      <Input
                        type="number"
                        value={level.fieldCount}
                        onChange={(e) =>
                          setLevel(level.level, { fieldCount: clamp(Number(e.target.value) || 4, 3, 15) })
                        }
                        className="h-8 font-mono"
                      />
                    </td>
                    <td>
                      <Input
                        type="number"
                        value={level.corrections}
                        onChange={(e) =>
                          setLevel(level.level, { corrections: clamp(Number(e.target.value) || 0, 0, 5) })
                        }
                        className="h-8 font-mono"
                      />
                    </td>
                    <td>
                      <Input
                        type="number"
                        value={level.verificationPrompts}
                        onChange={(e) =>
                          setLevel(level.level, {
                            verificationPrompts: clamp(Number(e.target.value) || 0, 0, 5),
                          })
                        }
                        className="h-8 font-mono"
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
              onChange={num('minMultitaskingScore', 40, 100)}
            />
            <NumberField
              label="Verification prompts in Assignment 5"
              value={draft.verificationPromptFrequency}
              onChange={num('verificationPromptFrequency', 0, 5)}
              hint="Overrides the level 5 prompt count"
            />
          </div>
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
              onChange={num('maxAttempts', 1, 20)}
              disabled={draft.unlimitedRetries}
            />
            <NumberField
              label="Lockout after failure (seconds)"
              value={draft.lockoutSeconds}
              onChange={num('lockoutSeconds', 0, 3600)}
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
              onChange={num('flagBlurThreshold', 1, 20)}
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
            <Badge variant="accent">{adapterLabel()}</Badge>
            <Badge variant="muted">{candidates.length} candidates</Badge>
            <Badge variant="muted">{demoCount} demo records</Badge>
          </div>
          <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">
            Data is stored via the active persistence adapter. Set{' '}
            <code className="font-mono">VITE_SUPABASE_URL</code> and{' '}
            <code className="font-mono">VITE_SUPABASE_ANON_KEY</code> to switch from local browser
            storage to Supabase — the schema and row-level-security policies are in{' '}
            <code className="font-mono">supabase/schema.sql</code>.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={reseedDemoData}>
              <Sparkles className="size-4" />
              Regenerate demo candidates
            </Button>
            <Button variant="destructive" onClick={() => setConfirm('demo')} disabled={!demoCount}>
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
              <Button onClick={save}>
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
            ? `This removes ${demoCount} seeded demo candidates and all of their attempts. Real candidate records are not affected.`
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
                  deleteDemoData()
                } else {
                  resetSettings()
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
  onChange,
  hint,
  step,
  disabled,
}: {
  label: string
  value: number
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  hint?: string
  step?: number
  disabled?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type="number"
        value={value}
        step={step}
        onChange={onChange}
        disabled={disabled}
        className="font-mono tabular"
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
