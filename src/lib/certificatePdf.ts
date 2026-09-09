import type { jsPDF } from 'jspdf'
import type { Candidate, Certification } from '@/types'
import { ASSESSMENT_TITLE, ORG_NAME, ORG_SHORT } from '@/data/settings'
import { formatDate, round } from '@/lib/utils'

/**
 * Draws the certificate as vector graphics, straight onto a jsPDF page.
 *
 * The previous implementation rasterised the on-screen certificate with
 * html2canvas. That failed outright with "unsupported color function oklch" —
 * html2canvas walks every stylesheet in the document and cannot parse modern
 * colour syntax, so a browser extension or UA stylesheet using `oklch()` broke
 * a candidate's certificate through no fault of the app.
 *
 * Drawing directly removes that whole class of failure: there is no CSS to
 * parse, no DOM to clone, and nothing a browser extension can interfere with.
 * It also produces real vector text — sharp at any zoom, selectable, and a
 * fraction of the file size of a 2x PNG.
 *
 * All geometry is in millimetres on landscape A4 (297 x 210).
 */

const PAGE = { w: 297, h: 210 }

const INK = [15, 28, 51] as const // navy 900
const MUTED = [100, 116, 139] as const
const ACCENT = [24, 131, 134] as const // brand 700
const RULE = [200, 211, 226] as const
const GOLD = [161, 128, 46] as const

const COMPETENCIES = [
  'Typing Speed',
  'Typing Accuracy',
  'Active Listening',
  'Structured Data Entry',
  'Critical Data Capture',
  'Correction Handling',
  'Multitasking',
]

type Doc = jsPDF

const setInk = (doc: Doc, c: readonly number[]) => doc.setTextColor(c[0], c[1], c[2])
const setDraw = (doc: Doc, c: readonly number[]) => doc.setDrawColor(c[0], c[1], c[2])
const setFill = (doc: Doc, c: readonly number[]) => doc.setFillColor(c[0], c[1], c[2])

/** Centres text on the page, returning the baseline used. */
function centred(doc: Doc, text: string, y: number): number {
  doc.text(text, PAGE.w / 2, y, { align: 'center' })
  return y
}

export interface CertificateInput {
  certification: Certification
  candidate: Candidate
  trainerName?: string
}

export function drawCertificate(doc: Doc, { certification: c, candidate }: CertificateInput): void {
  /* ---- Border: a double rule, the way a printed certificate is set ------ */
  setDraw(doc, INK)
  doc.setLineWidth(1.2)
  doc.rect(10, 10, PAGE.w - 20, PAGE.h - 20)
  setDraw(doc, ACCENT)
  doc.setLineWidth(0.3)
  doc.rect(13.5, 13.5, PAGE.w - 27, PAGE.h - 27)

  /* ---- Issuing organisation -------------------------------------------- */
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  setInk(doc, ACCENT)
  doc.setCharSpace(1.6)
  centred(doc, ORG_NAME.toUpperCase(), 27)
  doc.setCharSpace(0)

  /* ---- Title ------------------------------------------------------------ */
  doc.setFont('times', 'normal')
  doc.setFontSize(30)
  setInk(doc, INK)
  doc.setCharSpace(2.2)
  centred(doc, 'CERTIFICATE OF COMPLETION', 41)
  doc.setCharSpace(0)

  setDraw(doc, GOLD)
  doc.setLineWidth(0.5)
  doc.line(PAGE.w / 2 - 32, 46, PAGE.w / 2 + 32, 46)

  /* ---- Recipient -------------------------------------------------------- */
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  setInk(doc, MUTED)
  centred(doc, 'This certifies that', 56)

  doc.setFont('times', 'bold')
  doc.setFontSize(28)
  setInk(doc, INK)
  // Long names would otherwise run into the border, so shrink to fit.
  let nameSize = 28
  while (doc.getTextWidth(c.candidateName) > PAGE.w - 70 && nameSize > 14) {
    nameSize -= 1
    doc.setFontSize(nameSize)
  }
  centred(doc, c.candidateName, 70)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  setInk(doc, MUTED)
  centred(doc, `Candidate ID ${candidate.candidateId}   ·   Batch ${candidate.batch || '—'}`, 76.5)

  doc.setFontSize(10)
  centred(doc, 'has successfully completed the', 86)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  setInk(doc, INK)
  // Wrap the assessment title rather than let it overflow.
  const titleLines = doc.splitTextToSize(ASSESSMENT_TITLE, PAGE.w - 90) as string[]
  titleLines.forEach((line, i) => centred(doc, line, 94 + i * 6))

  const afterTitle = 94 + titleLines.length * 6

  /* ---- Competencies ----------------------------------------------------- */
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  setInk(doc, MUTED)
  centred(doc, 'and demonstrated competency in', afterTitle + 4)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  setInk(doc, INK)
  centred(doc, COMPETENCIES.join('   ·   '), afterTitle + 10)

  /* ---- Headline metrics ------------------------------------------------- */
  const metricsY = afterTitle + 20
  const headline: [string, string][] = [
    [`${round(c.wpm)}`, 'WPM'],
    [`${round(c.accuracy, 1)}%`, 'ACCURACY'],
    [`${round(c.finalScore, 1)}`, 'OVERALL / 100'],
  ]
  const colWidth = 62
  const startX = PAGE.w / 2 - colWidth
  headline.forEach(([value, label], i) => {
    const x = startX + i * colWidth
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(22)
    setInk(doc, ACCENT)
    doc.text(value, x, metricsY, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    setInk(doc, MUTED)
    doc.setCharSpace(0.8)
    doc.text(label, x, metricsY + 5.5, { align: 'center' })
    doc.setCharSpace(0)
    // Divider between columns.
    if (i < headline.length - 1) {
      setDraw(doc, RULE)
      doc.setLineWidth(0.2)
      doc.line(x + colWidth / 2, metricsY - 7, x + colWidth / 2, metricsY + 6)
    }
  })

  /* ---- Secondary metrics ------------------------------------------------ */
  const secondaryY = metricsY + 16
  const secondary: [string, string][] = [
    ['Listening accuracy', `${round(c.listeningAccuracy, 1)}%`],
    ['Critical-data accuracy', `${round(c.criticalDataAccuracy, 1)}%`],
    ['Multitasking', `${round(c.multitaskingScore, 1)}%`],
    ['Assignments completed', `${c.assignmentsCompleted} / 10`],
  ]
  const secWidth = (PAGE.w - 80) / secondary.length
  secondary.forEach(([label, value], i) => {
    const x = 40 + secWidth * i + secWidth / 2
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    setInk(doc, MUTED)
    doc.text(label.toUpperCase(), x, secondaryY, { align: 'center' })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    setInk(doc, INK)
    doc.text(value, x, secondaryY + 5.5, { align: 'center' })
  })

  /* ---- Performance classification --------------------------------------- */
  const bandY = secondaryY + 15
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  const bandLabel = c.performanceLevel.toUpperCase()
  const bandWidth = doc.getTextWidth(bandLabel) + 14
  setFill(doc, [239, 246, 245])
  setDraw(doc, ACCENT)
  doc.setLineWidth(0.3)
  doc.roundedRect(PAGE.w / 2 - bandWidth / 2, bandY - 5, bandWidth, 8, 1.5, 1.5, 'FD')
  setInk(doc, ACCENT)
  centred(doc, bandLabel, bandY)

  /* ---- Footer ----------------------------------------------------------- */
  setDraw(doc, RULE)
  doc.setLineWidth(0.2)
  doc.line(30, PAGE.h - 40, PAGE.w - 30, PAGE.h - 40)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  setInk(doc, MUTED)

  doc.text('CERTIFICATE ID', 30, PAGE.h - 33)
  doc.setFont('courier', 'bold')
  doc.setFontSize(9)
  setInk(doc, INK)
  doc.text(c.certificateId, 30, PAGE.h - 28)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  setInk(doc, MUTED)
  doc.text('DATE OF ISSUE', PAGE.w - 30, PAGE.h - 33, { align: 'right' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  setInk(doc, INK)
  doc.text(
    formatDate(c.issuedAt, { year: 'numeric', month: 'long', day: 'numeric' }),
    PAGE.w - 30,
    PAGE.h - 28,
    { align: 'right' },
  )

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  setInk(doc, MUTED)
  const note = `Issued electronically by ${ORG_NAME} and verifiable against the certificate ID above. Certification requires all ten assignments to be passed individually.`
  const noteLines = doc.splitTextToSize(note, PAGE.w - 80) as string[]
  noteLines.forEach((line, i) => centred(doc, line, PAGE.h - 20 + i * 3.2))
}

/** Builds the finished document, metadata included. */
export async function buildCertificatePdf(input: CertificateInput): Promise<jsPDF> {
  // Loaded on demand — jsPDF is only needed on this route.
  const { jsPDF: JsPdf } = await import('jspdf')
  const doc = new JsPdf({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })

  drawCertificate(doc, input)

  doc.setProperties({
    title: `${ORG_SHORT} Certificate — ${input.certification.candidateName}`,
    subject: ASSESSMENT_TITLE,
    author: ORG_NAME,
    creator: ORG_NAME,
    keywords: input.certification.certificateId,
  })
  return doc
}

export function certificateFilename(c: Certification, candidate: Candidate): string {
  return `${c.certificateId}-${candidate.candidateId}.pdf`
}
