import type { ScriptSegment } from '@/types'

/**
 * Text-to-speech abstraction.
 *
 * The assessment never talks to a concrete speech engine directly — it talks to
 * a `TTSProvider`. That keeps the browser fallback and any future hosted AI
 * voice interchangeable, and means scenario audio is *generated*, never a bank
 * of pre-recorded files.
 *
 * ---------------------------------------------------------------------------
 * SECURITY: never put a provider API key in this bundle.
 * ---------------------------------------------------------------------------
 * `OpenAITTSProvider` and `ElevenLabsProvider` below deliberately call a
 * server-side proxy (`VITE_TTS_PROXY_URL`) rather than the vendor API. The
 * proxy holds the secret key. See `docs/TTS_INTEGRATION.md` for the reference
 * Supabase Edge Function.
 */

export interface TTSOptions {
  voice?: string
  /** 1 = normal. Providers clamp to their own supported range. */
  speed?: number
  pitch?: number
}

export interface TTSProvider {
  readonly id: string
  readonly label: string
  /** True when the provider can actually run in this browser/session. */
  isAvailable(): boolean
  /**
   * Returns a playable audio URL for `text`.
   * `BrowserTTSProvider` synthesises live and returns an empty string — callers
   * should prefer `speak()` when `streamsDirectly` is true.
   */
  generateSpeech(text: string, options?: TTSOptions): Promise<string>
  /** True when the provider speaks directly rather than producing a file. */
  readonly streamsDirectly: boolean
  listVoices(): Promise<TTSVoice[]>
}

export interface TTSVoice {
  id: string
  name: string
  lang: string
  isDefault?: boolean
}

/* -------------------------------------------------------------------------- */
/*  Browser TTS — Web Speech API (default, zero configuration)                 */
/* -------------------------------------------------------------------------- */

export class BrowserTTSProvider implements TTSProvider {
  readonly id = 'browser'
  readonly label = 'Browser Speech Synthesis'
  readonly streamsDirectly = true

  isAvailable(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window
  }

  async generateSpeech(): Promise<string> {
    // The Web Speech API cannot hand back an audio buffer; playback goes
    // through `speak()` on the engine instead.
    return ''
  }

  async listVoices(): Promise<TTSVoice[]> {
    if (!this.isAvailable()) return []
    const load = () =>
      window.speechSynthesis.getVoices().map((v) => ({
        id: v.voiceURI,
        name: v.name,
        lang: v.lang,
        isDefault: v.default,
      }))

    const immediate = load()
    if (immediate.length) return immediate

    // Chrome populates voices asynchronously on first call.
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(load()), 1200)
      window.speechSynthesis.onvoiceschanged = () => {
        clearTimeout(timeout)
        resolve(load())
      }
    })
  }
}

/* -------------------------------------------------------------------------- */
/*  Hosted providers — server proxy adapters (integration points)              */
/* -------------------------------------------------------------------------- */

interface ProxyConfig {
  /** e.g. https://<project>.supabase.co/functions/v1/tts */
  proxyUrl: string
}

/**
 * OpenAI TTS adapter.
 *
 * Wire-up (server side, NOT here):
 *   POST {proxyUrl}  { provider: "openai", text, voice, speed }
 *   → the function calls POST https://api.openai.com/v1/audio/speech
 *     with `model: "gpt-4o-mini-tts"` and the secret key from env
 *   → returns audio/mpeg bytes, which we wrap in an object URL.
 */
export class OpenAITTSProvider implements TTSProvider {
  readonly id = 'openai'
  readonly label = 'OpenAI Voice'
  readonly streamsDirectly = false

  constructor(private config: ProxyConfig) {}

  isAvailable(): boolean {
    return Boolean(this.config.proxyUrl)
  }

  async generateSpeech(text: string, options: TTSOptions = {}): Promise<string> {
    if (!this.isAvailable()) throw new Error('OpenAI TTS proxy URL is not configured')
    const res = await fetch(this.config.proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'openai',
        text,
        voice: options.voice ?? 'alloy',
        speed: options.speed ?? 1,
      }),
    })
    if (!res.ok) throw new Error(`TTS proxy responded ${res.status}`)
    return URL.createObjectURL(await res.blob())
  }

  async listVoices(): Promise<TTSVoice[]> {
    return ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'].map((v) => ({
      id: v,
      name: v[0].toUpperCase() + v.slice(1),
      lang: 'en-US',
    }))
  }
}

/**
 * ElevenLabs adapter — same proxy contract, different `provider` discriminator.
 *   POST {proxyUrl}  { provider: "elevenlabs", text, voice, speed }
 */
export class ElevenLabsProvider implements TTSProvider {
  readonly id = 'elevenlabs'
  readonly label = 'ElevenLabs Voice'
  readonly streamsDirectly = false

  constructor(private config: ProxyConfig) {}

  isAvailable(): boolean {
    return Boolean(this.config.proxyUrl)
  }

  async generateSpeech(text: string, options: TTSOptions = {}): Promise<string> {
    if (!this.isAvailable()) throw new Error('ElevenLabs TTS proxy URL is not configured')
    const res = await fetch(this.config.proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'elevenlabs',
        text,
        voice: options.voice ?? 'Rachel',
        speed: options.speed ?? 1,
      }),
    })
    if (!res.ok) throw new Error(`TTS proxy responded ${res.status}`)
    return URL.createObjectURL(await res.blob())
  }

  async listVoices(): Promise<TTSVoice[]> {
    return ['Rachel', 'Adam', 'Bella', 'Antoni', 'Elli'].map((v) => ({
      id: v,
      name: v,
      lang: 'en-US',
    }))
  }
}

/* -------------------------------------------------------------------------- */
/*  Provider resolution                                                        */
/* -------------------------------------------------------------------------- */

const proxyUrl = (import.meta.env.VITE_TTS_PROXY_URL as string | undefined) ?? ''
const configured = (import.meta.env.VITE_TTS_PROVIDER as string | undefined) ?? 'browser'

/**
 * Returns the configured provider, falling back to the browser engine whenever
 * a hosted provider has not been wired up. An assessment must never be blocked
 * by a missing API integration.
 */
export function resolveTTSProvider(): TTSProvider {
  const browser = new BrowserTTSProvider()
  if (configured === 'openai') {
    const p = new OpenAITTSProvider({ proxyUrl })
    if (p.isAvailable()) return p
  }
  if (configured === 'elevenlabs') {
    const p = new ElevenLabsProvider({ proxyUrl })
    if (p.isAvailable()) return p
  }
  return browser
}

/* -------------------------------------------------------------------------- */
/*  Segment-aware speech engine                                                */
/* -------------------------------------------------------------------------- */

export interface SpeechEngineEvents {
  onSegmentStart?: (index: number, segment: ScriptSegment) => void
  onProgress?: (progress: number, elapsedSeconds: number) => void
  onEnd?: () => void
  onError?: (error: Error) => void
}

/**
 * Plays an ordered list of `ScriptSegment`s with realistic inter-segment pauses,
 * and reports normalised progress (0–1) on a fixed tick.
 *
 * Progress is driven by a wall-clock timer rather than by speech events because
 * the Web Speech API's boundary events are inconsistent across browsers, and the
 * assessment needs a stable timeline to stamp field-entry telemetry against.
 */
export class SegmentSpeechEngine {
  private provider: TTSProvider
  private segments: ScriptSegment[] = []
  private index = 0
  private timer: number | null = null
  private tick: number | null = null
  private startedAt = 0
  private pausedAt: number | null = null
  private pausedTotal = 0
  private durationMs = 1
  private events: SpeechEngineEvents = {}
  private options: TTSOptions = {}
  private audio: HTMLAudioElement | null = null
  private stopped = false

  constructor(provider: TTSProvider = resolveTTSProvider()) {
    this.provider = provider
  }

  get isPlaying(): boolean {
    return this.startedAt > 0 && this.pausedAt === null && !this.stopped
  }

  get elapsedSeconds(): number {
    if (!this.startedAt) return 0
    const now = this.pausedAt ?? performance.now()
    return (now - this.startedAt - this.pausedTotal) / 1000
  }

  get progress(): number {
    return Math.min(1, (this.elapsedSeconds * 1000) / this.durationMs)
  }

  load(segments: ScriptSegment[], estimatedDurationSeconds: number, options: TTSOptions = {}) {
    this.stop()
    this.segments = segments
    this.durationMs = Math.max(1000, estimatedDurationSeconds * 1000)
    this.options = options
    this.index = 0
    this.stopped = false
  }

  play(events: SpeechEngineEvents = {}) {
    this.events = { ...this.events, ...events }
    if (this.pausedAt !== null) {
      // Resume
      this.pausedTotal += performance.now() - this.pausedAt
      this.pausedAt = null
      if (this.provider.streamsDirectly && 'speechSynthesis' in window) {
        window.speechSynthesis.resume()
      } else {
        void this.audio?.play()
      }
      this.startTicking()
      return
    }
    if (this.startedAt) return // already playing

    this.startedAt = performance.now()
    this.stopped = false
    this.startTicking()
    void this.speakNext()
  }

  pause() {
    if (!this.isPlaying) return
    this.pausedAt = performance.now()
    if (this.provider.streamsDirectly && 'speechSynthesis' in window) {
      window.speechSynthesis.pause()
    } else {
      this.audio?.pause()
    }
    this.stopTicking()
  }

  /** Full reset — used by replay (practice mode) and on unmount. */
  stop() {
    this.stopped = true
    this.stopTicking()
    if (this.timer !== null) {
      window.clearTimeout(this.timer)
      this.timer = null
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    if (this.audio) {
      this.audio.pause()
      this.audio = null
    }
    this.startedAt = 0
    this.pausedAt = null
    this.pausedTotal = 0
    this.index = 0
  }

  private startTicking() {
    this.stopTicking()
    this.tick = window.setInterval(() => {
      this.events.onProgress?.(this.progress, this.elapsedSeconds)
      if (this.progress >= 1 && this.index >= this.segments.length) {
        this.stopTicking()
      }
    }, 200)
  }

  private stopTicking() {
    if (this.tick !== null) {
      window.clearInterval(this.tick)
      this.tick = null
    }
  }

  private async speakNext(): Promise<void> {
    if (this.stopped || this.index >= this.segments.length) {
      if (!this.stopped) {
        this.stopTicking()
        this.events.onProgress?.(1, this.elapsedSeconds)
        this.events.onEnd?.()
      }
      return
    }

    const segment = this.segments[this.index]
    this.events.onSegmentStart?.(this.index, segment)

    const advance = () => {
      if (this.stopped) return
      this.index += 1
      this.timer = window.setTimeout(
        () => void this.speakNext(),
        segment.pauseAfterMs / (this.options.speed ?? 1),
      )
    }

    try {
      if (this.provider.streamsDirectly) {
        await this.speakWithBrowser(segment.text, advance)
      } else {
        const url = await this.provider.generateSpeech(segment.text, this.options)
        const audio = new Audio(url)
        this.audio = audio
        audio.playbackRate = this.options.speed ?? 1
        audio.onended = advance
        audio.onerror = () => advance()
        await audio.play()
      }
    } catch (err) {
      this.events.onError?.(err instanceof Error ? err : new Error(String(err)))
      // Never strand the candidate on a TTS failure — keep the timeline moving.
      advance()
    }
  }

  private speakWithBrowser(text: string, onDone: () => void): Promise<void> {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) {
        onDone()
        resolve()
        return
      }
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = this.options.speed ?? 1
      utterance.pitch = this.options.pitch ?? 1
      if (this.options.voice) {
        const match = window.speechSynthesis
          .getVoices()
          .find((v) => v.voiceURI === this.options.voice)
        if (match) utterance.voice = match
      }
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        onDone()
        resolve()
      }
      utterance.onend = finish
      utterance.onerror = finish
      window.speechSynthesis.speak(utterance)
    })
  }
}
