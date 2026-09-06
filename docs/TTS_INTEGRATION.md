# AI Audio (TTS) Integration

Task 2 audio is **generated**, never a bank of recorded files. A scenario
generator produces structured JSON, a script generator turns it into natural
spoken English, and a `TTSProvider` speaks it.

That last step is an interface, so the voice engine is swappable without
touching the assessment.

```
AudioScenario  →  ScriptSegment[]  →  TTSProvider  →  SegmentSpeechEngine
 (generator)       (speech.ts)        (tts.ts)        (playback + timeline)
```

---

## Default: browser speech (no configuration)

`BrowserTTSProvider` uses the Web Speech API. It needs no keys, no network and
no server, which is why it is the default and the fallback.

Trainers pick the voice and speed in **Configuration → Audio & listening
requirements**; the list is populated from the voices installed on the machine.

**Limitations to be aware of:**

- Voice quality and availability vary by OS and browser.
- The API cannot hand back an audio buffer, so playback is live-only —
  `generateSpeech()` returns `''` and `streamsDirectly` is `true`.
- Boundary events are inconsistent across browsers, which is why
  `SegmentSpeechEngine` drives progress from a wall clock rather than from
  speech events. The assessment needs a stable timeline to stamp field-entry
  telemetry against.

---

## Upgrading to a hosted AI voice

`OpenAITTSProvider` and `ElevenLabsProvider` are implemented in
[`src/audio/tts.ts`](../src/audio/tts.ts). Both call a **server-side proxy**
rather than the vendor API directly.

> **Never put a provider API key in this app.** Everything prefixed `VITE_` is
> compiled into the JavaScript bundle and readable by anyone who opens the page.
> The proxy exists so the secret stays on a server.

### 1. Deploy the proxy

A Supabase Edge Function is the shortest path. Create
`supabase/functions/tts/index.ts`:

```ts
// Deno runtime. Deploy: supabase functions deploy tts --no-verify-jwt
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    })
  }

  const { provider, text, voice, speed } = await req.json()

  // Guard rails: this endpoint speaks assessment scripts, nothing else.
  if (typeof text !== 'string' || text.length > 4000) {
    return new Response('Invalid text', { status: 400 })
  }

  let upstream: Response

  if (provider === 'elevenlabs') {
    const voiceId = ELEVENLABS_VOICE_IDS[voice] ?? ELEVENLABS_VOICE_IDS.Rachel
    upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': Deno.env.get('ELEVENLABS_API_KEY')!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      },
    )
  } else {
    upstream = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        voice: voice ?? 'alloy',
        speed: speed ?? 1,
        input: text,
      }),
    })
  }

  if (!upstream.ok) {
    return new Response(await upstream.text(), { status: upstream.status })
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  })
})

const ELEVENLABS_VOICE_IDS: Record<string, string> = {
  Rachel: '21m00Tcm4TlvDq8ikWAM',
  // …add the voice ids from your ElevenLabs account
}
```

Set the secrets (they never reach the browser):

```bash
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set ELEVENLABS_API_KEY=...
supabase functions deploy tts --no-verify-jwt
```

### 2. Point the app at it

In `.env.local`:

```bash
VITE_TTS_PROVIDER=openai          # or: elevenlabs
VITE_TTS_PROXY_URL=https://<project-ref>.supabase.co/functions/v1/tts
```

Restart the dev server. `resolveTTSProvider()` picks the hosted provider up
automatically, and **falls back to the browser engine** if the proxy URL is
missing — an assessment is never blocked by a missing integration.

---

## Cost and latency

Hosted TTS is billed per character and adds a network round trip **per segment**
(a level-5 scenario is roughly 25 segments). Two things worth doing before a
large rollout:

1. **Pre-generate on scenario creation.** Call `generateSpeech()` for every
   segment when the scenario is built rather than at playback time, and hold the
   object URLs. `SegmentSpeechEngine.load()` is the natural place to accept them.
2. **Cache by script hash.** Identical text produces identical audio. Store the
   MP3 in Supabase Storage keyed by a hash of the segment text and check the
   bucket before calling the vendor. Randomised scenarios still differ per
   attempt, but conversational filler and intro/outro lines repeat constantly.

---

## Adding a different provider

Implement the interface and add a branch to `resolveTTSProvider()`:

```ts
export class AzureSpeechProvider implements TTSProvider {
  readonly id = 'azure'
  readonly label = 'Azure Speech'
  readonly streamsDirectly = false

  constructor(private config: { proxyUrl: string }) {}

  isAvailable() {
    return Boolean(this.config.proxyUrl)
  }

  async generateSpeech(text: string, options: TTSOptions = {}) {
    const res = await fetch(this.config.proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'azure', text, ...options }),
    })
    if (!res.ok) throw new Error(`TTS proxy responded ${res.status}`)
    return URL.createObjectURL(await res.blob())
  }

  async listVoices() {
    return [{ id: 'en-US-JennyNeural', name: 'Jenny', lang: 'en-US' }]
  }
}
```

Nothing else in the app changes — `Task2Runner` only knows about
`SegmentSpeechEngine`, and the engine only knows about `TTSProvider`.

---

## How the spoken script is built

[`src/engine/speech.ts`](../src/engine/speech.ts) converts structured values into
speech a person would actually produce:

| Value | Spoken as |
|---|---|
| `1750` (currency) | "one thousand seven hundred and fifty dollars" |
| `04/17/1991` | "April seventeenth, nineteen ninety-one" |
| `2145550187` | "two one four, five five five, zero one eight seven" |
| `BC784592` | "B, C, seven eight four five nine two" |
| `TX7942B` (level 4–5) | "T as in Tango, X as in X-ray, seven nine four two, B as in Bravo" |
| `20%` | "twenty percent" |

Difficulty level controls pace (100–150 WPM), field count, whether data arrives
out of order, whether identifiers are spelled phonetically, how many spoken
corrections occur, and how many verification prompts fire. All of it is editable
by a trainer in **Configuration → Audio scenario difficulty engine**.
