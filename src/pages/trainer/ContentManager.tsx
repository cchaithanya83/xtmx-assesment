import * as React from 'react'
import {
  AlertTriangle,
  Check,
  FileText,
  Headphones,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import { content, type ContentPassage, type ContentPool } from '@/api/client'
import { useApi } from '@/hooks/useApi'
import { useAppStore } from '@/store/appStore'
import { TASKS } from '@/data/tasks'
import { EmptyState, PageHeader } from '@/components/shared'
import { Badge, Button, Card, Dialog, Input, Label, Select, Switch, Tabs, Textarea } from '@/components/ui'
import { cn } from '@/lib/utils'

const MIN_PASSAGE_CHARS = 120

/**
 * Admin content editor.
 *
 * Passages, data pools and the per-level field roster used to be TypeScript
 * constants, which meant a function redeploy to fix a typo. They now live in
 * the database and are edited here.
 *
 * The code constants remain the factory defaults — "Restore defaults" writes
 * them back, so an experiment is always reversible.
 */
export default function ContentManager() {
  const isAdmin = useAppStore((s) => s.isAdmin)()
  const data = useApi(() => content.get(), [])
  const [tab, setTab] = React.useState<'passages' | 'pools' | 'fields'>('passages')
  const [banner, setBanner] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const flash = React.useCallback((tone: 'ok' | 'error', text: string) => {
    setBanner({ tone, text })
    window.setTimeout(() => setBanner(null), 4000)
  }, [])

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Assessment Content" description="Administrator access is required." />
        <EmptyState
          icon={<ShieldCheck className="size-8" />}
          title="Administrator access required"
          description="Content changes alter what certification means, so they are restricted to administrators. Trainers can still adjust thresholds and difficulty from Configuration."
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        eyebrow="Trainer / Admin portal"
        title="Assessment Content"
        description="Typing passages, audio data pools and the per-level field roster. Changes apply to the next assessment started — attempts already in progress are unaffected."
      />

      {banner && (
        <p
          role="status"
          className={cn(
            'mb-4 rounded-md border px-3 py-2 text-[13px] font-medium',
            banner.tone === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-800',
          )}
        >
          {banner.text}
        </p>
      )}

      {data.error && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800"
        >
          {data.error}
        </p>
      )}

      <Tabs
        className="mb-4"
        value={tab}
        onChange={(v) => setTab(v as typeof tab)}
        items={[
          { value: 'passages', label: 'Typing passages', count: data.data?.passages.length },
          { value: 'pools', label: 'Audio data pools', count: data.data?.pools.length },
          { value: 'fields', label: 'Field roster', count: 5 },
        ]}
      />

      {data.loading && !data.data ? (
        <Card className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading content…
        </Card>
      ) : !data.data ? null : tab === 'passages' ? (
        <PassagesTab
          passages={data.data.passages}
          onChanged={data.refetch}
          flash={flash}
        />
      ) : tab === 'pools' ? (
        <PoolsTab pools={data.data.pools} onChanged={data.refetch} flash={flash} />
      ) : (
        <FieldsTab
          levelFields={data.data.levelFields}
          selectable={data.data.selectableFields}
          onChanged={data.refetch}
          flash={flash}
        />
      )}
    </div>
  )
}

type Flash = (tone: 'ok' | 'error', text: string) => void

/* -------------------------------------------------------------------------- */
/*  Passages                                                                   */
/* -------------------------------------------------------------------------- */

function PassagesTab({
  passages,
  onChanged,
  flash,
}: {
  passages: ContentPassage[]
  onChanged: () => void
  flash: Flash
}) {
  const [assignmentId, setAssignmentId] = React.useState(1)
  const [editing, setEditing] = React.useState<ContentPassage | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [removing, setRemoving] = React.useState<ContentPassage | null>(null)
  const [resetting, setResetting] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const forAssignment = passages.filter((p) => p.assignmentId === assignmentId)
  const activeCount = forAssignment.filter((p) => p.active).length
  const assignment = TASKS[0].assignments.find((a) => a.id === assignmentId)

  const act = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true)
    try {
      await fn()
      flash('ok', success)
      onChanged()
      setEditing(null)
      setCreating(false)
      setRemoving(null)
      setResetting(false)
    } catch (err) {
      flash('error', (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="assignment-pick">Assignment</Label>
              <Select
                id="assignment-pick"
                value={String(assignmentId)}
                onChange={(e) => setAssignmentId(Number(e.target.value))}
                className="mt-1 w-72"
              >
                {TASKS[0].assignments.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.id} — {a.title}
                  </option>
                ))}
              </Select>
            </div>
            <Badge variant={activeCount >= 3 ? 'success' : activeCount >= 2 ? 'warning' : 'danger'}>
              {activeCount} active
            </Badge>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setResetting(true)} disabled={busy}>
              <RotateCcw className="size-4" />
              Restore defaults
            </Button>
            <Button onClick={() => setCreating(true)} disabled={busy}>
              <Plus className="size-4" />
              Add passage
            </Button>
          </div>
        </div>

        <p className="mt-2 px-1 text-[11px] leading-relaxed text-muted-foreground">
          Passages rotate by attempt number, so a retry never repeats the previous text. Keep at
          least three active per assignment, and keep them similar in length and character mix —
          otherwise the same assignment gets easier or harder depending on which one is issued.
          {assignment && ` Time limit: ${Math.round(assignment.timeLimitSeconds / 60)} minutes.`}
        </p>
      </Card>

      {activeCount < 3 && (
        <p className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Only {activeCount} active passage{activeCount === 1 ? '' : 's'} for this assignment. With
          fewer than three, candidates will see repeated text within a few retries.
        </p>
      )}

      <div className="space-y-2">
        {forAssignment.length === 0 ? (
          <EmptyState
            icon={<FileText className="size-8" />}
            title="No passages for this assignment"
            action={<Button onClick={() => setCreating(true)}>Add the first one</Button>}
          />
        ) : (
          forAssignment.map((p) => (
            <Card key={p.id} className={cn('p-4', !p.active && 'opacity-60')}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-navy-900">{p.label}</h3>
                    <Badge variant="outline">{p.kind}</Badge>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {p.text.length.toLocaleString()} chars
                    </span>
                    {!p.active && <Badge variant="muted">Inactive</Badge>}
                  </div>
                  <p className="mt-1.5 line-clamp-2 whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-muted-foreground">
                    {p.text.slice(0, 220)}
                    {p.text.length > 220 ? '…' : ''}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span className="flex items-center gap-1.5">
                    <Switch
                      id={`active-${p.id}`}
                      checked={p.active}
                      disabled={busy}
                      onCheckedChange={(next) =>
                        void act(
                          () => content.updatePassage(p.id, { active: next }),
                          next ? 'Passage activated.' : 'Passage deactivated.',
                        )
                      }
                    />
                    <Label htmlFor={`active-${p.id}`} className="cursor-pointer">
                      Active
                    </Label>
                  </span>
                  <Button variant="outline" size="sm" onClick={() => setEditing(p)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete passage"
                    onClick={() => setRemoving(p)}
                  >
                    <Trash2 className="size-4 text-red-600" />
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      <PassageDialog
        open={creating}
        title="Add passage"
        assignmentId={assignmentId}
        busy={busy}
        onClose={() => setCreating(false)}
        onSave={(v) =>
          act(
            () =>
              content.createPassage({
                assignmentId,
                label: v.label,
                kind: v.kind,
                text: v.text,
              }),
            'Passage added.',
          )
        }
      />

      <PassageDialog
        open={editing !== null}
        title="Edit passage"
        assignmentId={assignmentId}
        initial={editing ?? undefined}
        busy={busy}
        onClose={() => setEditing(null)}
        onSave={(v) =>
          editing
            ? act(
                () =>
                  content.updatePassage(editing.id, {
                    label: v.label,
                    kind: v.kind,
                    text: v.text,
                  }),
                'Passage updated.',
              )
            : Promise.resolve()
        }
      />

      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Delete this passage?"
        description={`"${removing?.label}" will be removed permanently. Attempts that used it keep their own snapshot, so past scores are unaffected.`}
        footer={
          <>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                removing &&
                void act(() => content.deletePassage(removing.id), 'Passage deleted.')
              }
            >
              Delete
            </Button>
          </>
        }
      />

      <Dialog
        open={resetting}
        onClose={() => setResetting(false)}
        title="Restore the default passages?"
        description="This replaces ALL passages, for every assignment, with the set shipped in the release. Any you have added or edited will be lost. Past attempts keep their snapshots."
        footer={
          <>
            <Button variant="outline" onClick={() => setResetting(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void act(() => content.reset('passages'), 'Default passages restored.')}
            >
              Restore defaults
            </Button>
          </>
        }
      />
    </>
  )
}

function PassageDialog({
  open,
  title,
  assignmentId,
  initial,
  busy,
  onClose,
  onSave,
}: {
  open: boolean
  title: string
  assignmentId: number
  initial?: ContentPassage
  busy: boolean
  onClose: () => void
  onSave: (v: { label: string; kind: string; text: string }) => void | Promise<void>
}) {
  const [label, setLabel] = React.useState('')
  const [kind, setKind] = React.useState('prose')
  const [text, setText] = React.useState('')

  // Reset the form whenever the dialog opens on a different passage.
  React.useEffect(() => {
    if (!open) return
    setLabel(initial?.label ?? '')
    setKind(initial?.kind ?? 'prose')
    setText(initial?.text ?? '')
  }, [open, initial])

  const tooShort = text.trim().length > 0 && text.trim().length < MIN_PASSAGE_CHARS
  const valid = label.trim().length > 0 && text.trim().length >= MIN_PASSAGE_CHARS

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={`Assignment ${assignmentId}. Line breaks are part of the task — the candidate must type them.`}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid || busy} onClick={() => onSave({ label, kind, text })}>
            <Save className="size-4" />
            Save passage
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
          <div className="space-y-1.5">
            <Label htmlFor="passage-label">Label</Label>
            <Input
              id="passage-label"
              value={label}
              placeholder="e.g. Benefit Verification Note D"
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="passage-kind">Layout</Label>
            <Select id="passage-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="prose">Prose</option>
              <option value="structured">Structured</option>
              <option value="mixed">Mixed</option>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="passage-text">Passage text</Label>
            <span
              className={cn(
                'font-mono text-[11px]',
                tooShort ? 'text-red-600' : 'text-muted-foreground',
              )}
            >
              {text.length.toLocaleString()} chars
              {tooShort && ` · minimum ${MIN_PASSAGE_CHARS}`}
            </span>
          </div>
          <Textarea
            id="passage-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Exactly what the candidate must type…"
            className="h-72 resize-none font-mono text-[13px] leading-relaxed"
          />
          <p className="text-[11px] text-muted-foreground">
            Roughly {Math.max(1, Math.round(text.length / 5 / 30))} minute(s) of typing at 30 WPM.
          </p>
        </div>
      </div>
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */
/*  Data pools                                                                 */
/* -------------------------------------------------------------------------- */

function PoolsTab({
  pools,
  onChanged,
  flash,
}: {
  pools: ContentPool[]
  onChanged: () => void
  flash: Flash
}) {
  const [resetting, setResetting] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  return (
    <>
      <Card className="mb-3 flex flex-wrap items-center justify-between gap-3 p-3">
        <p className="max-w-3xl px-1 text-[12px] leading-relaxed text-muted-foreground">
          These feed the Task 2 scenario generator. Every attempt draws fresh values, so bigger
          pools mean less repetition across retries. Values are spoken aloud — numbers are
          verbalised ("one thousand five hundred dollars"), so enter them as plain digits.
        </p>
        <Button variant="outline" onClick={() => setResetting(true)} disabled={busy}>
          <RotateCcw className="size-4" />
          Restore defaults
        </Button>
      </Card>

      <div className="grid gap-3 xl:grid-cols-2">
        {pools.map((pool) => (
          <PoolEditor
            key={pool.key}
            pool={pool}
            onSaved={onChanged}
            flash={flash}
            onBusy={setBusy}
          />
        ))}
      </div>

      <Dialog
        open={resetting}
        onClose={() => setResetting(false)}
        title="Restore all default pools?"
        description="Every pool returns to the values shipped in the release. Your edits will be lost."
        footer={
          <>
            <Button variant="outline" onClick={() => setResetting(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setBusy(true)
                void content
                  .reset('pools')
                  .then(() => {
                    flash('ok', 'Default pools restored.')
                    onChanged()
                  })
                  .catch((e: Error) => flash('error', e.message))
                  .finally(() => {
                    setBusy(false)
                    setResetting(false)
                  })
              }}
            >
              Restore defaults
            </Button>
          </>
        }
      />
    </>
  )
}

function PoolEditor({
  pool,
  onSaved,
  flash,
  onBusy,
}: {
  pool: ContentPool
  onSaved: () => void
  flash: Flash
  onBusy: (b: boolean) => void
}) {
  // One value per line is the least fiddly way to edit a long list.
  const [draft, setDraft] = React.useState(pool.items.join('\n'))
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => setDraft(pool.items.join('\n')), [pool.items])

  const items = draft
    .split('\n')
    .map((v) => v.trim())
    .filter(Boolean)

  const dirty = items.join('\n') !== pool.items.join('\n')
  const badNumbers =
    pool.kind === 'number' ? items.filter((v) => !Number.isFinite(Number(v))) : []
  const valid = items.length > 0 && badNumbers.length === 0

  const save = () => {
    setSaving(true)
    onBusy(true)
    void content
      .updatePool(pool.key, items)
      .then(() => {
        flash('ok', `${pool.label} updated.`)
        onSaved()
      })
      .catch((e: Error) => flash('error', e.message))
      .finally(() => {
        setSaving(false)
        onBusy(false)
      })
  }

  return (
    <Card className="flex flex-col p-4">
      <div className="mb-1.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-bold text-navy-900">
            {pool.label}
            <Badge variant={pool.kind === 'number' ? 'accent' : 'outline'}>{pool.kind}</Badge>
          </h3>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{pool.hint}</p>
        </div>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
          {items.length} value{items.length === 1 ? '' : 's'}
        </span>
      </div>

      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        spellCheck={false}
        className="h-40 resize-none font-mono text-[12px] leading-relaxed"
        aria-label={`${pool.label} — one value per line`}
      />

      {badNumbers.length > 0 && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-red-600">
          <X className="size-3" />
          Not numeric: {badNumbers.slice(0, 4).join(', ')}
          {badNumbers.length > 4 ? ` +${badNumbers.length - 4} more` : ''}
        </p>
      )}
      {items.length === 0 && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-red-600">
          <X className="size-3" />
          A pool cannot be empty.
        </p>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">One value per line</span>
        <div className="flex gap-2">
          {dirty && (
            <Button variant="ghost" size="sm" onClick={() => setDraft(pool.items.join('\n'))}>
              Revert
            </Button>
          )}
          <Button size="sm" disabled={!dirty || !valid || saving} onClick={save}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            Save
          </Button>
        </div>
      </div>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/*  Field roster                                                               */
/* -------------------------------------------------------------------------- */

function FieldsTab({
  levelFields,
  selectable,
  onChanged,
  flash,
}: {
  levelFields: Record<string, string[]>
  selectable: { key: string; label: string; critical: boolean }[]
  onChanged: () => void
  flash: Flash
}) {
  const [drafts, setDrafts] = React.useState<Record<string, string[]>>(levelFields)
  const [saving, setSaving] = React.useState<number | null>(null)
  const [resetting, setResetting] = React.useState(false)

  React.useEffect(() => setDrafts(levelFields), [levelFields])

  const toggle = (level: number, key: string) => {
    setDrafts((prev) => {
      const current = prev[String(level)] ?? []
      return {
        ...prev,
        [String(level)]: current.includes(key)
          ? current.filter((k) => k !== key)
          : [...current, key],
      }
    })
  }

  const save = (level: number) => {
    setSaving(level)
    void content
      .updateLevelFields(level, drafts[String(level)] ?? [])
      .then(() => {
        flash('ok', `Level ${level} field roster updated.`)
        onChanged()
      })
      .catch((e: Error) => flash('error', e.message))
      .finally(() => setSaving(null))
  }

  return (
    <>
      <Card className="mb-3 flex flex-wrap items-center justify-between gap-3 p-3">
        <p className="max-w-3xl px-1 text-[12px] leading-relaxed text-muted-foreground">
          Which fields each audio level asks for. Level N drives Task 2 Assignment N. The order you
          select in is the <strong className="font-semibold">form</strong> order — from level 3
          onwards the spoken order is shuffled separately, which is the skill those assignments
          train. The list is trimmed to the field count set in Configuration, so keep it at least
          that long.
        </p>
        <Button variant="outline" onClick={() => setResetting(true)}>
          <RotateCcw className="size-4" />
          Restore defaults
        </Button>
      </Card>

      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((level) => {
          const chosen = drafts[String(level)] ?? []
          const dirty = chosen.join(',') !== (levelFields[String(level)] ?? []).join(',')
          const assignment = TASKS[1].assignments.find((a) => a.id === level)
          return (
            <Card key={level} className="p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Headphones className="size-4 text-brand-700" />
                  <h3 className="text-sm font-bold text-navy-900">
                    Level {level} — {assignment?.title}
                  </h3>
                  <Badge variant={chosen.length >= 4 ? 'outline' : 'danger'}>
                    {chosen.length} field{chosen.length === 1 ? '' : 's'}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  {dirty && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setDrafts((p) => ({ ...p, [String(level)]: levelFields[String(level)] ?? [] }))
                      }
                    >
                      Revert
                    </Button>
                  )}
                  <Button
                    size="sm"
                    disabled={!dirty || chosen.length < 4 || saving === level}
                    onClick={() => save(level)}
                  >
                    {saving === level ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Check className="size-3.5" />
                    )}
                    Save
                  </Button>
                </div>
              </div>

              {chosen.length < 4 && (
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-red-600">
                  <X className="size-3" />
                  A level must ask for at least four fields.
                </p>
              )}

              <div className="flex flex-wrap gap-1.5">
                {selectable.map((field) => {
                  const index = chosen.indexOf(field.key)
                  const on = index > -1
                  return (
                    <button
                      key={field.key}
                      onClick={() => toggle(level, field.key)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] font-medium transition-colors',
                        on
                          ? 'border-brand-600 bg-brand-600 text-white'
                          : 'border-border bg-card text-navy-700 hover:border-brand-300 hover:bg-brand-50',
                      )}
                    >
                      {on && (
                        <span className="font-mono text-[10px] opacity-80">{index + 1}</span>
                      )}
                      {field.label}
                      {field.critical && (
                        <span
                          title="Critical field — errors carry a heavier penalty"
                          className={cn('text-[9px] font-bold', on ? 'opacity-90' : 'text-brand-700')}
                        >
                          ●
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </Card>
          )
        })}
      </div>

      <Dialog
        open={resetting}
        onClose={() => setResetting(false)}
        title="Restore the default field roster?"
        description="All five levels return to the fields shipped in the release."
        footer={
          <>
            <Button variant="outline" onClick={() => setResetting(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                void content
                  .reset('levelFields')
                  .then(() => {
                    flash('ok', 'Default field roster restored.')
                    onChanged()
                  })
                  .catch((e: Error) => flash('error', e.message))
                  .finally(() => setResetting(false))
              }}
            >
              Restore defaults
            </Button>
          </>
        }
      />
    </>
  )
}
