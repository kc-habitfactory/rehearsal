import { useEffect, useRef, useState } from 'react'
import { Gauge, Pill } from '../components/Gauge'
import { health, postLive, streamTurn } from '../lib/api'
import { listenOnce, Speaker, speechSupported, type TtsMode } from '../lib/speech'
import { formatNonverbal, type LiveState, type VisionEngine } from '../lib/vision'
import type { NonverbalSummary, Scenario, SessionLog, SetupInput, Turn } from '../lib/types'
import { domainById } from '../lib/domains'
import { loadTtsPref } from './Setup'
import { subscribe } from '../lib/ws'

const MAX_MS = 5 * 60 * 1000
const EMPTY: NonverbalSummary = { eyeContactPct: 0, postureBreaks: 0, faceTouches: 0, smileAvg: 0, longestGazeAwayMs: 0 }

type Phase = 'interviewer' | 'listening' | 'thinking' | 'done'

interface Props {
  setup: SetupInput
  scenario: Scenario
  engine: VisionEngine | null // null이면 비언어 분석 없이 진행
  stream: MediaStream | null // null이면 카메라·마이크 없음
  onFinish: (log: SessionLog) => void
}

export function Session({ setup, scenario, engine, stream, onFinish }: Props) {
  const dom = domainById(setup.domain)
  const showVision = Boolean(engine) && dom.usesCamera
  const videoRef = useRef<HTMLVideoElement>(null)
  const hasVideo = Boolean(stream?.getVideoTracks().length)
  const hasMic = Boolean(stream?.getAudioTracks().length)
  const [textMode, setTextMode] = useState(!hasMic || !speechSupported())
  const [draft, setDraft] = useState('')

  const [live, setLive] = useState<LiveState | null>(null)
  const [phase, setPhaseState] = useState<Phase>('interviewer')
  const setPhase = (p: Phase) => {
    setPhaseState(p)
    phaseLabelRef.current = p === 'interviewer' ? `${dom.counterpart} 말하는 중` : p === 'listening' ? '훈련자 답변 중' : p === 'thinking' ? '상대 생각 중' : '종료'
  }
  const [turns, setTurns] = useState<Turn[]>([])
  const [interim, setInterim] = useState('')
  const [current, setCurrent] = useState('') // 면접관이 지금 말하는 텍스트
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const turnsRef = useRef<Turn[]>([])
  const startRef = useRef(0)
  const stopListenRef = useRef<(() => void) | null>(null)
  const speakerRef = useRef<Speaker | null>(null)
  const pendingRef = useRef<string | null>(null) // 스트리밍 중인 상대 발화 (아직 기록 전). 끊기면 여기까지만 기록
  const endedRef = useRef(false) // 마지막 응답에 [END]가 있었는지 (재생 중 끊어도 종료로)
  const abortRef = useRef<AbortController | null>(null)
  const finishedRef = useRef(false)
  const clientIdRef = useRef<string>(crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const textModeRef = useRef(textMode)
  textModeRef.current = textMode

  const now = () => performance.now() - startRef.current
  const recent = () => (engine ? engine.recentSummary() : null)
  const phaseLabelRef = useRef('시작')

  // 카메라 + 비전 루프 + 타이머
  useEffect(() => {
    startRef.current = performance.now()
    let raf = 0
    if (hasVideo && videoRef.current) {
      const v = videoRef.current
      v.srcObject = stream
      v.play().catch(() => {})
      if (engine) {
        engine.startSession()
        let last = 0
        const loop = (t: number) => {
          raf = requestAnimationFrame(loop)
          if (t - last < 66) return
          last = t
          const s = engine.process(v, performance.now())
          if (s) setLive(s)
        }
        raf = requestAnimationFrame(loop)
      }
    }
    // 세션 동안 WS 연결을 유지해 관전자에게 중계한다 (수신할 메시지는 없음)
    const unsub = subscribe(() => {})
    postLive({ title: scenario.title, counterpart: dom.counterpart, domain: dom.id, phase: '시작', elapsedMs: 0, name: setup.fields.name ?? '' })
    let lastLive = 0
    const timer = window.setInterval(() => {
      const e = now()
      setElapsed(e)
      if (e > MAX_MS) finish()
      // 2초마다 진행 지표를 WS로 보낸다 (관전 화면 실시간 갱신 + 서버 Redis 저장). 실패해도 무시
      if (e - lastLive > 2000) {
        lastLive = e
        const s = recent()
        // 늦게 들어온 관전자도 바로 볼 수 있게 제목·상대·최근 대화를 매번 함께 보낸다
        postLive({
          elapsedMs: Math.round(e),
          phase: phaseLabelRef.current,
          title: scenario.title,
          counterpart: dom.counterpart,
          domain: dom.id,
          name: setup.fields.name ?? '',
          turns: turnsRef.current.slice(-8).map((t) => ({ role: t.role, text: t.text, at: t.at })),
          ...(s && showVision ? { metrics: { eyeContactPct: s.eyeContactPct, postureBreaks: s.postureBreaks, faceTouches: s.faceTouches, smileAvg: s.smileAvg } } : {}),
        })
      }
    }, 500)
    return () => {
      cancelAnimationFrame(raf)
      window.clearInterval(timer)
      unsub()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 첫 질문. 서버 TTS가 켜져 있으면 그걸, 아니면 브라우저 음성
  useEffect(() => {
    let sp: Speaker | null = null
    let cancelled = false
    turnsRef.current = []
    pushTurn({ role: 'interviewer', text: scenario.opening, at: 0 })
    setCurrent(scenario.opening)
    setPhase('interviewer')
    health()
      .then((h): TtsMode => (h.tts && loadTtsPref() === 'server' ? 'server' : 'browser'))
      .catch((): TtsMode => 'browser')
      .then((mode) => {
        if (cancelled) return
        sp = new Speaker(mode, dom.lang ?? 'ko', dom.id)
        speakerRef.current = sp
        sp.onEnd = () => startListening()
        sp.speak(scenario.opening)
      })
    return () => {
      cancelled = true
      sp?.cancel()
      stopListenRef.current?.()
      abortRef.current?.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function pushTurn(t: Turn) {
    turnsRef.current = [...turnsRef.current, t]
    setTurns(turnsRef.current)
    postLive({ turn: { role: t.role, text: t.text, at: t.at }, elapsedMs: Math.round(now()) }) // 관전자에게 대사 즉시 중계
  }

  function startListening() {
    if (finishedRef.current) return
    setPhase('listening')
    setInterim('')
    if (textModeRef.current) return // 텍스트 모드: 입력창에서 제출을 기다린다
    const { stop } = listenOnce({
      onInterim: setInterim,
      onFinal: (text) => {
        stopListenRef.current = null
        void handleUserAnswer(text)
      },
      onError: (e) => {
        // 음성 인식이 죽으면 텍스트 모드로 자동 전환
        setError('음성 인식 오류: ' + e + ' · 텍스트 입력으로 전환했습니다')
        setTextMode(true)
        stopListenRef.current = null
      },
    }, dom.lang ?? 'ko')
    stopListenRef.current = stop
  }

  function switchToText() {
    stopListenRef.current?.()
    stopListenRef.current = null
    setTextMode(true)
    if (interim) setDraft(interim)
  }

  function submitDraft() {
    const t = draft.trim()
    if (!t || phase !== 'listening') return
    setDraft('')
    void handleUserAnswer(t)
  }

  async function handleUserAnswer(text: string) {
    if (finishedRef.current) return
    const nonverbal = recent() ?? undefined
    pushTurn({ role: 'user', text, at: now(), nonverbal })
    setInterim('')
    setPhase('thinking')
    setCurrent('')

    const history = turnsRef.current.map((t, i, arr) => ({
      role: t.role,
      text: t.role === 'user' && i === arr.length - 1 && t.nonverbal ? `${t.text}\n${formatNonverbal(t.nonverbal)}` : t.text,
    }))

    const sp = speakerRef.current!
    const ac = new AbortController()
    abortRef.current = ac
    endedRef.current = false
    pendingRef.current = ''
    let full = ''
    try {
      full = await streamTurn(scenario, history, (d) => {
        if (!full) setPhase('interviewer')
        full += d
        pendingRef.current = full
        setCurrent(full.replace('[END]', ''))
        sp.push(d)
      }, ac.signal)
    } catch (e) {
      if ((e as Error).name === 'AbortError') return // 끼어들기·종료가 처리한다
      pendingRef.current = null
      setError('상대 응답 실패: ' + (e as Error).message)
      setPhase('listening')
      return
    }
    const ended = full.includes('[END]')
    endedRef.current = ended
    pushTurn({ role: 'interviewer', text: full.replace('[END]', '').trim(), at: now() })
    pendingRef.current = null
    sp.onEnd = ended ? () => finish() : () => startListening()
    sp.flush()
  }

  /** 상대가 말하는 도중 끼어든다. 재생을 멈추고, 스트리밍 중이면 지금까지 말한 부분만 기록한 뒤 바로 듣는다 */
  function interrupt() {
    if (finishedRef.current) return
    abortRef.current?.abort()
    speakerRef.current?.interrupt()
    const pending = pendingRef.current
    let ended = endedRef.current
    if (pending !== null) {
      // 스트림이 끝나기 전에 끊음: 지금까지 나온 말만 남긴다 (상대는 다음 턴에서 끊긴 것을 알고 이어간다)
      const text = pending.replace('[END]', '').trim()
      if (text) pushTurn({ role: 'interviewer', text: `${text}…`, at: now() })
      ended = pending.includes('[END]')
      pendingRef.current = null
      setCurrent(text ? `${text}…` : '') // 말풍선에는 끊긴 지점까지 남긴다
    }
    // 스트림이 이미 끝난 뒤(첫 대사 포함) 끊은 경우 말풍선은 그대로 둔다
    if (ended) finish()
    else startListening()
  }

  function finish() {
    if (finishedRef.current) return
    finishedRef.current = true
    setPhase('done')
    postLive({ ended: true, phase: '종료', elapsedMs: Math.round(now()), title: scenario.title, counterpart: dom.counterpart, turns: turnsRef.current.slice(-8).map((t) => ({ role: t.role, text: t.text, at: t.at })) })
    stopListenRef.current?.()
    abortRef.current?.abort()
    speakerRef.current?.cancel()
    const log: SessionLog = {
      clientId: clientIdRef.current,
      setup,
      scenario,
      turns: turnsRef.current,
      events: engine?.getEvents() ?? [],
      overall: engine?.overallSummary() ?? EMPTY,
      durationMs: now(),
    }
    onFinish(log)
  }

  const mm = String(Math.floor(elapsed / 60000)).padStart(2, '0')
  const ss = String(Math.floor((elapsed % 60000) / 1000)).padStart(2, '0')

  return (
    <div className="session">
      <div className="session-main">
        {!dom.usesCamera ? (
          <div className="call-screen">
            <div className={`call-avatar ${phase === 'interviewer' ? 'talking' : ''}`}>{scenario.interviewer.name[0]}</div>
            <div className="call-name">{scenario.interviewer.name}</div>
            <div className="call-status">
              {phase === 'done' ? '통화 종료' : `통화 중 ${mm}:${ss}`}
            </div>
            <div className="call-wave">{phase === 'interviewer' ? '상대가 말하는 중' : phase === 'listening' ? (textMode ? '답변 입력 대기' : '내 차례') : phase === 'thinking' ? '…' : ''}</div>
          </div>
        ) : (
        <div className="cam-wrap">
          {hasVideo ? <video ref={videoRef} className="cam mirror" muted playsInline /> : <div className="overlay static"><p>카메라 없이 진행 중</p></div>}
          <div className="hud">
            {showVision && <Pill label={live?.eyeContact ? '시선 유지' : '시선 이탈'} ok={!!live?.eyeContact} />}
            {showVision && <Pill label={live?.postureOk ? '자세 안정' : '자세 이탈'} ok={!!live?.postureOk} />}
            <span className="timer">{mm}:{ss}</span>
          </div>
          {showVision && live && !live.faceFound && <div className="overlay"><p>얼굴이 보이지 않습니다</p></div>}
        </div>
        )}
        <div className="side">
          <div className="interviewer-card">
            <div className={`avatar ${phase === 'interviewer' ? 'talking' : ''}`}>{scenario.interviewer.name[0]}</div>
            <div>
              <div className="muted small">{dom.counterpart} · {scenario.interviewer.name}</div>
              <div className="phase">
                {phase === 'interviewer' && '말하는 중'}
                {phase === 'listening' && (textMode ? '답변을 입력해 주세요' : dom.answerHint)}
                {phase === 'thinking' && '...'}
                {phase === 'done' && '종료'}
              </div>
            </div>
          </div>
          <div className="bubble interviewer">{current || '…'}</div>

          {phase === 'listening' && !textMode && <div className="bubble user">{interim || '(말씀해 주세요)'}</div>}
          {phase === 'listening' && textMode && (
            <div className="text-answer">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitDraft() } }}
                placeholder="답변을 입력하고 Enter"
                rows={3}
                autoFocus
              />
              <button className="primary" onClick={submitDraft} disabled={!draft.trim()}>보내기</button>
            </div>
          )}

          {showVision && <Gauge label="시선 유지 (최근 30초)" value={live?.eyeContactPct ?? 100} ok={(live?.eyeContactPct ?? 100) >= 60} />}
          {showVision && <Gauge label="미소" value={Math.min(100, (live?.smile ?? 0) * 150)} />}
          {error && <p className="error small">{error}</p>}
          <div className="row">
            {phase === 'interviewer' && <button onClick={interrupt} title="상대 말을 끊고 바로 답합니다">말 끊고 답하기</button>}
            {phase === 'listening' && !textMode && <button onClick={() => stopListenRef.current?.()}>답변 끝</button>}
            {phase === 'listening' && !textMode && <button onClick={switchToText}>텍스트로 답하기</button>}
            <button className="danger" onClick={finish}>{dom.id === 'scam_call' ? '전화 끊기' : dom.id === 'hospital' ? '진료 끝' : '종료'}</button>
          </div>
        </div>
      </div>
      <div className="transcript">
        {turns.map((t, i) => (
          <div key={i} className={`line ${t.role}`}>
            <span className="who">{t.role === 'user' ? '나' : scenario.interviewer.name}</span> {t.text}
          </div>
        ))}
      </div>
    </div>
  )
}
