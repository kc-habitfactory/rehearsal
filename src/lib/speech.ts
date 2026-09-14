/* 음성 인식(Web Speech API)과 음성 합성 래퍼.
 * 합성은 서버 TTS(/api/tts, gpt-4o-mini-tts)를 기본으로 쓰고, 실패하면 브라우저 내장 음성으로 떨어진다. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SR = any

declare global {
  interface Window {
    SpeechRecognition: any
    webkitSpeechRecognition: any
  }
}

export function speechSupported() {
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
}

export interface ListenHandlers {
  onInterim?: (text: string) => void
  onFinal: (text: string) => void
  onError?: (err: string) => void
}

/**
 * 한 번의 발화를 듣는다. 사용자가 말을 멈추면(약 1.6초 침묵) final을 확정한다.
 * 반환된 stop()으로 강제 종료 가능.
 */
export function listenOnce(h: ListenHandlers, lang: 'ko' | 'en' = 'ko'): { stop: () => void } {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!Ctor) {
    h.onError?.('이 브라우저는 음성 인식을 지원하지 않습니다. 크롬을 사용하세요.')
    return { stop: () => {} }
  }
  const rec: SR = new Ctor()
  rec.lang = lang === 'en' ? 'en-US' : 'ko-KR'
  rec.continuous = true
  rec.interimResults = true
  rec.maxAlternatives = 1

  let finalText = ''
  let interimText = ''
  let silenceTimer: number | null = null
  let stopped = false

  const finish = () => {
    if (stopped) return
    stopped = true
    if (silenceTimer) window.clearTimeout(silenceTimer)
    try { rec.stop() } catch { /* noop */ }
    const text = (finalText + ' ' + interimText).trim()
    if (text) h.onFinal(text)
  }

  // 문장이 끝나는 어미로 끝났으면 1초, 아니면(말 중간에 쉰 것일 수 있음) 1.6초 기다린다
  const SENTENCE_END = lang === 'en' ? /[.?!]\s*$|\b(please|thanks|thank you|yeah|no|yes)\s*$/i : /(다|요|죠|까|니다|습니다|어요|에요|네요|거든요|잖아요|습니까|나요|가요|데요)[.?!]?\s*$/
  const armSilence = (text: string) => {
    if (silenceTimer) window.clearTimeout(silenceTimer)
    silenceTimer = window.setTimeout(finish, SENTENCE_END.test(text) ? 1000 : 1600)
  }

  rec.onresult = (e: any) => {
    interimText = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]
      if (r.isFinal) finalText += r[0].transcript + ' '
      else interimText += r[0].transcript
    }
    const all = (finalText + interimText).trim()
    h.onInterim?.(all)
    if (all) armSilence(all)
  }
  rec.onerror = (e: any) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return
    h.onError?.(e.error)
  }
  rec.onend = () => {
    if (stopped) return
    if ((finalText + interimText).trim()) finish()
    else {
      try { rec.start() } catch { /* noop */ }
    }
  }
  rec.start()
  return { stop: finish }
}

// ---------------------------------------------------------------------------
// 음성 합성

export type TtsMode = 'server' | 'browser'

/** 문장 종결 부호에서 자른다. 한국어 어미 포함. */
function splitSentences(buffer: string): { done: string[]; rest: string } {
  const parts = buffer.split(/(?<=[.!?。？！])\s+|(?<=다\.)|(?<=요\.)|(?<=까\?)|(?<=죠\?)|(?<=요\?)|(?<=네\.)/)
  if (parts.length <= 1) return { done: [], rest: buffer }
  return { done: parts.slice(0, -1).map((p) => p.trim()).filter(Boolean), rest: parts[parts.length - 1] }
}

const clean = (t: string) => t.replace(/\[END\]/g, '').trim()

/**
 * 스트리밍 텍스트를 문장 단위로 읊는다.
 * push(delta) → 문장이 완성되면 큐에 넣고, flush()로 남은 버퍼를 마무리. 전부 재생되면 onEnd.
 * 서버 모드: 문장이 큐에 들어오는 즉시 mp3를 미리 받아두고(prefetch) 순서대로 재생한다.
 */
export class Speaker {
  onEnd?: () => void
  private mode: TtsMode
  private buffer = ''
  private ended = false
  private cancelled = false

  // 서버 모드
  private queue: { text: string; audio: Promise<StreamedAudio | null> }[] = []
  private playing = false
  private currentAudio: StreamedAudio | null = null
  private gen = 0 // interrupt() 마다 증가. 끊기 전에 시작된 재생 루프는 깨어나도 아무것도 하지 않는다

  // 브라우저 모드
  private bQueue: string[] = []
  private bSpeaking = false
  private voice: SpeechSynthesisVoice | null = null

  private lang: 'ko' | 'en'
  private domain: string

  constructor(mode: TtsMode = 'server', lang: 'ko' | 'en' = 'ko', domain = 'interview') {
    this.mode = mode
    this.lang = lang
    this.domain = domain
    if (mode === 'browser') this.pickBrowserVoice()
  }

  private firstChunkDone = false

  push(delta: string) {
    this.buffer += delta
    // 첫 소리를 빨리 내기 위해, 아직 아무것도 큐에 없고 버퍼가 길어지면 쉼표·접속 지점에서 한 번 먼저 자른다
    if (!this.firstChunkDone && this.mode === 'server' && this.buffer.length >= 18) {
      const m = /^(.{10,40}?[,，、]|.{10,40}?(?:는데|지만|고요|서요|인데))\s*/.exec(this.buffer)
      if (m) {
        this.firstChunkDone = true
        this.enqueue(m[1])
        this.buffer = this.buffer.slice(m[0].length)
      }
    }
    const { done, rest } = splitSentences(this.buffer)
    this.buffer = rest
    for (const s of done) {
      this.firstChunkDone = true
      this.enqueue(s)
    }
  }

  flush() {
    if (this.buffer.trim()) this.enqueue(this.buffer.trim())
    this.buffer = ''
    this.ended = true
    this.resetChunking()
    this.maybeDone()
  }

  speak(text: string) {
    this.ended = true
    this.firstChunkDone = true
    this.enqueue(text)
  }

  /** 다음 발화를 위해 첫 조각 상태를 되돌린다. flush 뒤 자동 호출. */
  private resetChunking() {
    this.firstChunkDone = false
  }

  /** 지금 말하는 것을 끊는다 (사용자 끼어들기). cancel()과 달리 다음 발화는 정상 재생되고, onEnd는 부르지 않는다 */
  interrupt() {
    this.buffer = ''
    this.queue = []
    this.bQueue = []
    if (this.currentAudio) {
      this.currentAudio.stop()
      this.currentAudio = null
    }
    this.playing = false
    this.bSpeaking = false
    this.gen++
    this.ended = false // flush 뒤였다면 onEnd가 뒤늦게 울리지 않게
    this.resetChunking()
    window.speechSynthesis?.cancel()
  }

  cancel() {
    this.cancelled = true
    this.buffer = ''
    this.queue = []
    this.bQueue = []
    if (this.currentAudio) {
      this.currentAudio.stop()
      this.currentAudio = null
    }
    this.playing = false
    this.bSpeaking = false
    window.speechSynthesis?.cancel()
  }

  private enqueue(raw: string) {
    const text = clean(raw)
    if (!text) { this.maybeDone(); return }
    if (this.mode === 'server') {
      this.queue.push({ text, audio: this.fetchAudio(text) })
      void this.playNext()
    } else {
      this.bQueue.push(text)
      this.browserNext()
    }
  }

  // ---- 서버 TTS ----
  /** 요청은 즉시 시작하고(프리페치), 첫 조각이 오면 바로 재생할 수 있는 객체를 돌려준다. */
  private async fetchAudio(text: string): Promise<StreamedAudio | null> {
    try {
      const r = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, lang: this.lang, domain: this.domain }) })
      if (!r.ok || !r.body) throw new Error(String(r.status))
      return StreamedAudio.from(r)
    } catch {
      return null // 재생 단계에서 브라우저 음성으로 폴백
    }
  }

  private async playNext() {
    if (this.playing || this.cancelled) return
    const item = this.queue.shift()
    if (!item) { this.maybeDone(); return }
    this.playing = true
    const g = this.gen
    const audio = await item.audio
    if (g !== this.gen) return // 대기 중에 끊김: 이 루프는 여기서 끝 (상태는 interrupt가 이미 정리)
    if (this.cancelled) { this.playing = false; return }
    if (audio) {
      this.currentAudio = audio
      await audio.playToEnd()
      if (g !== this.gen) return
      this.currentAudio = null
    } else {
      await this.browserSpeakOnce(item.text)
      if (g !== this.gen) return
    }
    this.playing = false
    void this.playNext()
  }

  // ---- 브라우저 TTS ----
  private pickBrowserVoice() {
    const pick = () => {
      const voices = window.speechSynthesis.getVoices()
      if (this.lang === 'en') {
        this.voice = voices.find((v) => v.lang === 'en-US' && /Google/i.test(v.name)) ?? voices.find((v) => v.lang.startsWith('en')) ?? null
        return
      }
      this.voice =
        voices.find((v) => v.lang === 'ko-KR' && /Google/i.test(v.name)) ??
        voices.find((v) => v.lang === 'ko-KR' && /Yuna|유나/i.test(v.name)) ??
        voices.find((v) => v.lang === 'ko-KR') ??
        voices.find((v) => v.lang.startsWith('ko')) ??
        null
    }
    pick()
    window.speechSynthesis.onvoiceschanged = pick
  }

  private browserSpeakOnce(text: string) {
    if (!this.voice) this.pickBrowserVoice()
    return new Promise<void>((resolve) => {
      const u = new SpeechSynthesisUtterance(text)
      u.lang = this.lang === 'en' ? 'en-US' : 'ko-KR'
      if (this.voice) u.voice = this.voice
      u.rate = 1.05
      u.onend = u.onerror = () => resolve()
      window.speechSynthesis.speak(u)
    })
  }

  private browserNext() {
    if (this.bSpeaking) return
    const t = this.bQueue.shift()
    if (!t) { this.maybeDone(); return }
    this.bSpeaking = true
    void this.browserSpeakOnce(t).then(() => {
      this.bSpeaking = false
      this.browserNext()
    })
  }

  private maybeDone() {
    const idle = this.mode === 'server' ? !this.playing && this.queue.length === 0 : !this.bSpeaking && this.bQueue.length === 0
    if (this.ended && idle && !this.cancelled) {
      this.ended = false
      this.onEnd?.()
    }
  }
}

// ---------------------------------------------------------------------------
// 스트리밍 오디오 재생: 서버가 mp3 조각을 흘려보내면 MediaSource로 받는 즉시 재생한다.
// MediaSource가 mp3를 지원하지 않는 브라우저(일부 사파리)는 전체를 받은 뒤 재생한다.

const MSE_MP3 = typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported('audio/mpeg')

class StreamedAudio {
  private audio = new Audio()
  private stopped = false
  private ended: Promise<void>
  private resolveEnded!: () => void

  private constructor() {
    this.ended = new Promise<void>((r) => (this.resolveEnded = r))
    this.audio.onended = () => this.resolveEnded()
    this.audio.onerror = () => this.resolveEnded()
  }

  static from(r: Response): StreamedAudio {
    const sa = new StreamedAudio()
    if (MSE_MP3) void sa.pumpMse(r)
    else void sa.pumpBlob(r)
    return sa
  }

  /** 재생이 끝날 때까지 기다린다. 아직 데이터가 안 왔으면 첫 조각이 오는 대로 시작한다. */
  async playToEnd() {
    if (this.stopped) return
    this.playRequested = true
    await this.tryPlay()
    await this.ended
  }

  stop() {
    this.stopped = true
    try { this.audio.pause() } catch { /* noop */ }
    this.audio.src = ''
    this.resolveEnded()
  }

  private playRequested = false
  private hasData = false
  private async tryPlay() {
    if (!this.playRequested || !this.hasData || this.stopped) return
    try { await this.audio.play() } catch { this.resolveEnded() }
  }

  private async pumpMse(r: Response) {
    const ms = new MediaSource()
    this.audio.src = URL.createObjectURL(ms)
    await new Promise<void>((res) => ms.addEventListener('sourceopen', () => res(), { once: true }))
    let sb: SourceBuffer
    try { sb = ms.addSourceBuffer('audio/mpeg') } catch { return this.pumpBlob(r) }
    const append = (chunk: Uint8Array) => new Promise<void>((res) => {
      sb.addEventListener('updateend', () => res(), { once: true })
      sb.appendBuffer(chunk as BufferSource)
    })
    const reader = r.body!.getReader()
    try {
      while (!this.stopped) {
        const { value, done } = await reader.read()
        if (done) break
        await append(value)
        if (!this.hasData) { this.hasData = true; void this.tryPlay() }
      }
      if (!this.stopped && ms.readyState === 'open') {
        if (sb.updating) await new Promise<void>((res) => sb.addEventListener('updateend', () => res(), { once: true }))
        try { ms.endOfStream() } catch { /* noop */ }
      }
      if (!this.hasData) this.resolveEnded() // 빈 응답
    } catch {
      this.resolveEnded()
    }
  }

  private async pumpBlob(r: Response) {
    try {
      const blob = await r.blob()
      if (this.stopped) return
      this.audio.src = URL.createObjectURL(blob)
      this.hasData = true
      void this.tryPlay()
    } catch {
      this.resolveEnded()
    }
  }
}
