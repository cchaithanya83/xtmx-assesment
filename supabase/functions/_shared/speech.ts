import { PHONETIC } from './pools.ts'

/**
 * Text → natural spoken-English helpers used by the audio script generator.
 *
 * The goal is speech that sounds like a real benefits representative reading
 * from a screen, not a machine reading a database row. Numbers become words,
 * dates become "April seventeenth, nineteen ninety-one", and identifiers are
 * spelled out digit-by-digit or phonetically depending on difficulty level.
 */

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
]
const TENS = [
  '', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety',
]
const ORDINALS: Record<string, string> = {
  1: 'first', 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth', 6: 'sixth',
  7: 'seventh', 8: 'eighth', 9: 'ninth', 10: 'tenth', 11: 'eleventh',
  12: 'twelfth', 13: 'thirteenth', 14: 'fourteenth', 15: 'fifteenth',
  16: 'sixteenth', 17: 'seventeenth', 18: 'eighteenth', 19: 'nineteenth',
  20: 'twentieth', 21: 'twenty-first', 22: 'twenty-second', 23: 'twenty-third',
  24: 'twenty-fourth', 25: 'twenty-fifth', 26: 'twenty-sixth', 27: 'twenty-seventh',
  28: 'twenty-eighth', 29: 'twenty-ninth', 30: 'thirtieth', 31: 'thirty-first',
}
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** 1750 → "one thousand seven hundred and fifty" */
export function numberToWords(n: number): string {
  if (n === 0) return 'zero'
  if (n < 0) return `minus ${numberToWords(-n)}`

  const parts: string[] = []

  if (n >= 1_000_000) {
    parts.push(`${numberToWords(Math.floor(n / 1_000_000))} million`)
    n %= 1_000_000
  }
  if (n >= 1000) {
    parts.push(`${numberToWords(Math.floor(n / 1000))} thousand`)
    n %= 1000
  }
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} hundred`)
    n %= 100
    if (n > 0) parts.push('and')
  }
  if (n >= 20) {
    const tens = TENS[Math.floor(n / 10)]
    const ones = n % 10
    parts.push(ones ? `${tens}-${ONES[ones]}` : tens)
  } else if (n > 0) {
    parts.push(ONES[n])
  }

  return parts.join(' ')
}

/** 1500 → "one thousand five hundred dollars" */
export function currencyToWords(amount: number): string {
  const whole = Math.floor(amount)
  const cents = Math.round((amount - whole) * 100)
  const base = `${numberToWords(whole)} dollar${whole === 1 ? '' : 's'}`
  return cents ? `${base} and ${numberToWords(cents)} cents` : base
}

/** "20%" → "twenty percent" */
export function percentToWords(value: string): string {
  const n = Number(value.replace(/[^\d.]/g, ''))
  return `${numberToWords(n)} percent`
}

/** 1991 → "nineteen ninety-one"; 2026 → "twenty twenty-six" */
export function yearToWords(year: number): string {
  if (year >= 2000 && year < 2010) return `two thousand ${year % 10 ? ONES[year % 10] : ''}`.trim()
  const hi = Math.floor(year / 100)
  const lo = year % 100
  if (lo === 0) return `${numberToWords(hi)} hundred`
  return `${numberToWords(hi)} ${lo < 10 ? `oh ${ONES[lo]}` : numberToWords(lo)}`
}

/** "04/17/1991" → "April seventeenth, nineteen ninety-one" */
export function dateToWords(mmddyyyy: string): string {
  const [m, d, y] = mmddyyyy.split('/').map((p) => Number(p))
  const month = MONTHS[(m || 1) - 1]
  const day = ORDINALS[String(d)] ?? numberToWords(d)
  return `${month} ${day}, ${yearToWords(y)}`
}

/** "2145550187" → "two one four, five five five, zero one eight seven" */
export function phoneToWords(digits: string): string {
  const clean = digits.replace(/\D/g, '')
  const area = clean.slice(0, 3).split('').map(digitWord).join(' ')
  const mid = clean.slice(3, 6).split('').map(digitWord).join(' ')
  const last = clean.slice(6).split('').map(digitWord).join(' ')
  return `${area}, ${mid}, ${last}`
}

export function digitWord(d: string): string {
  return d === '0' ? 'zero' : ONES[Number(d)] ?? d
}

/**
 * Spells an identifier digit-by-digit / letter-by-letter.
 * `phonetic: true` renders letters as "T as in Tango" (levels 4–5).
 */
export function idToWords(id: string, phonetic: boolean): string {
  const chars = id.toUpperCase().split('')
  const out: string[] = []
  let digitRun: string[] = []

  const flushDigits = () => {
    if (!digitRun.length) return
    out.push(digitRun.map(digitWord).join(' '))
    digitRun = []
  }

  for (const ch of chars) {
    if (/\d/.test(ch)) {
      digitRun.push(ch)
    } else if (/[A-Z]/.test(ch)) {
      flushDigits()
      out.push(phonetic ? `${ch} as in ${PHONETIC[ch] ?? ch}` : ch)
    } else if (ch === '-') {
      flushDigits()
      out.push('dash')
    }
  }
  flushDigits()
  return out.join(', ')
}

/**
 * Rough spoken duration in seconds for a body of text at a given WPM.
 * Used to size the audio progress bar before playback begins and to pace the
 * simulated timeline when the Web Speech API is unavailable.
 */
export function estimateSpeechSeconds(text: string, wpm: number): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return (words / Math.max(60, wpm)) * 60
}
