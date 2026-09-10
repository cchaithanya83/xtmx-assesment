import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Award, Lock, Printer } from 'lucide-react'
import logoUrl from '@/assests/image.png'
import type { Certification } from '@/types'
import { ASSESSMENT_TITLE, ORG_NAME, ORG_SHORT } from '@/data/settings'
import { useAppStore, useCurrentCandidate } from '@/store/appStore'
import { GateList, PageHeader } from '@/components/shared'
import { Button, Card } from '@/components/ui'
import { cn, formatDate, round } from '@/lib/utils'

const COMPETENCIES = [
  'Typing Speed',
  'Typing Accuracy',
  'Active Listening',
  'Structured Data Entry',
  'Critical Data Capture',
  'Correction Handling',
  'Multitasking',
]

/**
 * Certificate view + PDF export.
 *
 * The certificate is locked until every certification gate passes
 * (product rule #6); when locked, the outstanding gates are shown instead so
 * the candidate knows exactly what remains.
 */
export default function CertificatePage() {
  const navigate = useNavigate()
  const candidate = useCurrentCandidate()
  const result = useAppStore((s) => s.result)
  const certification = useAppStore((s) => s.certification)
  const refreshProgress = useAppStore((s) => s.refreshProgress)

  React.useEffect(() => {
    void refreshProgress()
  }, [refreshProgress])

  // Still used for the on-screen certificate and the browser Print route.
  const sheetRef = React.useRef<HTMLDivElement | null>(null)
  // const [generating, setGenerating] = React.useState(false)
  // const [error, setError] = React.useState<string | null>(null)

  if (!candidate || !result) return null

  // const downloadPdf = async () => {
  //   if (!certification) return
  //   setGenerating(true)
  //   setError(null)
  //   try {
  //     // Drawn as vectors from the certificate data — no DOM, no CSS parsing.
  //     // The old html2canvas route failed with "unsupported color function
  //     // oklch" because it walks every stylesheet in the document, so a browser
  //     // extension could break a candidate's certificate.
  //     const { buildCertificatePdf, certificateFilename } = await import('@/lib/certificatePdf')
  //     const doc = await buildCertificatePdf({ certification, candidate })
  //     doc.save(certificateFilename(certification, candidate))
  //   } catch (err) {
  //     setError(
  //       `Could not generate the PDF (${(err as Error).message}). Use Print instead and choose "Save as PDF".`,
  //     )
  //   } finally {
  //     setGenerating(false)
  //   }
  // }

  /* ---- Locked state ---- */
  if (!certification) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader
          title="Certificate"
          description="Your certificate unlocks once every certification requirement is met."
        />
        <Card className="p-6">
          <div className="mb-5 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <Lock className="size-5 shrink-0 text-amber-700" />
            <div>
              <p className="text-sm font-bold text-amber-900">Certificate locked</p>
              <p className="text-[13px] text-amber-800">
                {result.assignmentsPassed} of {result.totalAssignments} assignments passed. All
                mandatory gates below must be satisfied.
              </p>
            </div>
          </div>
          <h2 className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Certification requirements
          </h2>
          <GateList gates={result.gates} />
          <Button className="mt-5 w-full" onClick={() => navigate('/dashboard')}>
            Return to dashboard
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1120px]">
      <PageHeader
        eyebrow="Certification complete"
        title="Certificate of Completion"
        description={`Issued ${formatDate(certification.issuedAt, { year: 'numeric', month: 'long', day: 'numeric' })} · ${certification.certificateId}`}
        actions={
          <div className="no-print flex gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="size-4" />
              Print
            </Button>
            {/* <Button onClick={downloadPdf} disabled={generating}>
              {generating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              Download Certificate PDF
            </Button> */}
          </div>
        }
      />

      {/* {error && (
        <p className="no-print mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {error}
        </p>
      )} */}

      <CertificateSheet ref={sheetRef} certification={certification} />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  The printable certificate                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Styling note: this is the on-screen and PRINT rendering. The downloaded PDF is
 * drawn separately as vectors in lib/certificatePdf.ts, so the two are
 * intentionally independent — this node uses plain
 * colours and avoids CSS features the rasteriser handles poorly (backdrop
 * filters, CSS variables in gradients, `oklch`).
 */
export const CertificateSheet = React.forwardRef<
  HTMLDivElement,
  { certification: Certification }
>(function CertificateSheet({ certification: c }, ref) {
  return (
    <div
      ref={ref}
      className="print-sheet mx-auto w-full overflow-hidden rounded-lg bg-white shadow-panel"
      style={{ border: '1px solid #e2e8f0' }}
    >
      {/* Outer rule */}
      <div style={{ padding: 10, backgroundColor: '#0f1c33' }}>
        <div
          style={{
            border: '1px solid #2b3f60',
            padding: 2,
          }}
        >
          <div style={{ backgroundColor: '#ffffff', padding: '36px 44px 30px' }}>
            {/* ---- Header ---- */}
            <div className="flex items-start justify-between gap-6">
              <div className="flex items-center gap-3">
                <img
                  src={logoUrl}
                  alt=""
                  width={48}
                  height={48}
                  style={{ width: 48, height: 48, objectFit: 'contain' }}
                />
                <div>
                  <p
                    className="text-[15px] font-extrabold leading-tight tracking-tight"
                    style={{ color: '#0f1c33' }}
                  >
                    {ORG_NAME}
                  </p>
                  <p
                    className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.18em]"
                    style={{ color: '#0b4899' }}
                  >
                    AI Operator Readiness &amp; Certification Platform
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p
                  className="text-[9px] font-bold uppercase tracking-[0.18em]"
                  style={{ color: '#64748b' }}
                >
                  Certificate ID
                </p>
                <p
                  className="font-mono text-[13px] font-bold tabular"
                  style={{ color: '#0f1c33' }}
                >
                  {c.certificateId}
                </p>
              </div>
            </div>

            <div className="my-6 h-px w-full" style={{ backgroundColor: '#e2e8f0' }} />

            {/* ---- Body ---- */}
            <div className="text-center">
              <h1
                className="text-[26px] font-extrabold uppercase tracking-[0.22em]"
                style={{ color: '#0f1c33' }}
              >
                Certificate of Completion
              </h1>
              <p className="mt-5 text-[13px]" style={{ color: '#64748b' }}>
                This certifies that
              </p>
              <p
                className="mt-2 text-[38px] font-extrabold leading-tight tracking-tight"
                style={{ color: '#0f1c33' }}
              >
                {c.candidateName}
              </p>
              <div
                className="mx-auto mt-3 h-[2px] w-40"
                style={{ backgroundColor: '#0b4899' }}
              />
              <p className="mt-4 text-[13px]" style={{ color: '#64748b' }}>
                has successfully completed the
              </p>
              <p
                className="mx-auto mt-1.5 max-w-2xl text-[17px] font-bold leading-snug"
                style={{ color: '#0f1c33' }}
              >
                {ASSESSMENT_TITLE}
              </p>
              <p className="mt-3 text-[13px]" style={{ color: '#64748b' }}>
                and demonstrated competency in
              </p>
              <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5">
                {COMPETENCIES.map((comp) => (
                  <span
                    key={comp}
                    className="rounded px-2.5 py-1 text-[11px] font-semibold"
                    style={{
                      backgroundColor: '#eef4fc',
                      color: '#0b4899',
                      border: '1px solid #d8e6f8',
                    }}
                  >
                    {comp}
                  </span>
                ))}
              </div>
            </div>

            {/* ---- Headline metrics ---- */}
            <div className="mt-7 grid grid-cols-3 gap-3">
              <BigMetric value={`${c.wpm}`} unit="WPM" label="Typing Speed" />
              <BigMetric value={`${round(c.accuracy)}%`} unit="" label="Typing Accuracy" />
              <BigMetric
                value={`${round(c.finalScore, 1)}`}
                unit="/100"
                label="Overall Score"
                highlight
              />
            </div>

            {/* ---- Secondary metrics ---- */}
            <div
              className="mt-3 grid grid-cols-4 gap-3 rounded-md px-4 py-3"
              style={{ backgroundColor: '#f7f9fc', border: '1px solid #e2e8f0' }}
            >
              <SmallMetric label="Listening Accuracy" value={`${round(c.listeningAccuracy, 1)}%`} />
              <SmallMetric
                label="Critical Data Accuracy"
                value={`${round(c.criticalDataAccuracy, 1)}%`}
              />
              <SmallMetric label="Multitasking Score" value={`${round(c.multitaskingScore, 1)}%`} />
              <SmallMetric
                label="Assignments Completed"
                value={`${c.assignmentsCompleted}/10`}
              />
            </div>

            {/* ---- Footer ---- */}
            <div className="mt-7 flex items-end justify-between gap-6">
              <div>
                <p
                  className="text-[9px] font-bold uppercase tracking-[0.18em]"
                  style={{ color: '#64748b' }}
                >
                  Performance Classification
                </p>
                <p
                  className="mt-1 text-[15px] font-extrabold uppercase tracking-wide"
                  style={{ color: '#0b4899' }}
                >
                  {c.performanceLevel}
                </p>
              </div>

              <div className="text-center">
                <div className="w-44 border-b pb-1" style={{ borderColor: '#94a3b8' }}>
                  <img
                    src={`${import.meta.env.BASE_URL}image.png`}
                    alt="Authorised signatory signature"
                    className="h-14 w-full object-contain"
                  />
                </div>
                <p
                  className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.18em]"
                  style={{ color: '#64748b' }}
                >
                  Authorised Signatory
                </p>
                <p className="text-[10px]" style={{ color: '#0f1c33' }}>
                  Training &amp; Quality, {ORG_SHORT}
                </p>
              </div>

              <div className="text-right">
                <p
                  className="text-[9px] font-bold uppercase tracking-[0.18em]"
                  style={{ color: '#64748b' }}
                >
                  Date of Certification
                </p>
                <p
                  className="mt-1 font-mono text-[13px] font-bold tabular"
                  style={{ color: '#0f1c33' }}
                >
                  {formatDate(c.issuedAt, { year: 'numeric', month: 'short', day: '2-digit' })}
                </p>
              </div>
            </div>

            <p className="mt-5 text-center text-[9px]" style={{ color: '#94a3b8' }}>
              This certificate is issued electronically by {ORG_NAME} and is verifiable against
              certificate ID {c.certificateId}. Certification requires all ten assignments to be
              individually passed, with a minimum overall score of 75, 30 WPM typing speed, 85%
              typing accuracy, 85% critical-data accuracy and a 75% multitasking score.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
})

function BigMetric({
  value,
  unit,
  label,
  highlight,
}: {
  value: string
  unit: string
  label: string
  highlight?: boolean
}) {
  return (
    <div
      className="rounded-md px-4 py-3 text-center"
      style={{
        backgroundColor: highlight ? '#0f1c33' : '#f7f9fc',
        border: `1px solid ${highlight ? '#0f1c33' : '#e2e8f0'}`,
      }}
    >
      <p
        className={cn('font-mono text-[30px] font-bold leading-none tabular')}
        style={{ color: highlight ? '#ffffff' : '#0f1c33' }}
      >
        {value}
        {unit && (
          <span
            className="ml-1 text-[13px] font-semibold"
            style={{ color: highlight ? '#a1b3ca' : '#64748b' }}
          >
            {unit}
          </span>
        )}
      </p>
      <p
        className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.16em]"
        style={{ color: highlight ? '#a1b3ca' : '#64748b' }}
      >
        {label}
      </p>
    </div>
  )
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="font-mono text-[16px] font-bold tabular" style={{ color: '#0f1c33' }}>
        {value}
      </p>
      <p
        className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.14em]"
        style={{ color: '#64748b' }}
      >
        {label}
      </p>
    </div>
  )
}

export { Award }
