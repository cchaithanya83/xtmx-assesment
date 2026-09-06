import * as React from 'react'
import { ClipboardCheck } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'

/**
 * Inline verification prompt (Task 2, Assignment 5).
 *
 * Appears *while the audio keeps playing* — that is the multitasking load being
 * measured. The audio is only paused when the trainer has enabled pausing.
 */
/**
 * The prompt shape the client receives. The correct answer is deliberately not
 * part of it — grading happens on the server when the attempt is submitted.
 */
export interface ClientVerificationPrompt {
  id: string
  question: string
  options: string[]
  triggerAtProgress: number
}

export function VerificationPromptCard({
  prompt,
  onAnswer,
  audioContinues,
  className,
}: {
  prompt: ClientVerificationPrompt
  onAnswer: (answer: string) => void
  audioContinues: boolean
  className?: string
}) {
  const [selected, setSelected] = React.useState<string | null>(null)

  return (
    <div
      className={cn(
        'animate-in-up rounded-lg border-2 border-brand-300 bg-brand-50/70 p-4 shadow-panel',
        className,
      )}
      role="alertdialog"
      aria-label="Verification required"
    >
      <div className="flex items-center gap-2">
        <ClipboardCheck className="size-4 text-brand-700" />
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-brand-800">
          Verification Required
        </h3>
        {audioContinues && (
          <span className="ml-auto flex items-center gap-1.5 text-[11px] font-semibold text-brand-800">
            <span className="inline-flex size-1.5 animate-pulse-soft rounded-full bg-brand-600" />
            Audio still playing
          </span>
        )}
      </div>

      <p className="mt-2 text-sm font-semibold text-navy-900">{prompt.question}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {prompt.options.map((option) => (
          <button
            key={option}
            onClick={() => setSelected(option)}
            className={cn(
              'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
              selected === option
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-brand-200 bg-card text-navy-800 hover:border-brand-400 hover:bg-brand-50',
            )}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[11px] text-brand-900/70">
          Answer without stopping your data entry — both are scored.
        </p>
        <Button
          size="sm"
          variant="accent"
          disabled={!selected}
          onClick={() => selected && onAnswer(selected)}
        >
          Confirm
        </Button>
      </div>
    </div>
  )
}
