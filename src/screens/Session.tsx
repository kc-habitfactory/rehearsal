import { useEffect, useRef, useState } from 'react'
import { Gauge, Pill } from '../components/Gauge'
import { health, postLive, streamTurn } from '../lib/api'
import { listenOnce, Speaker, speechSupported, type TtsMode } from '../lib/speech'
import { formatNonverbal, type LiveState, type VisionEngine } from '../lib/vision'
import type { NonverbalSummary, Scenario, SessionLog, SetupInput, Turn } from '../lib/types'
import { domainById } from '../lib/domains'
import { loadTtsPref } from './Setup'
import { subscribe } from '../lib/ws'
import { getUserKey } from '../lib/user'

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
  const phaseRef = useRef<Phase>('interviewer')
  const setPhase = (p: Phase) => {
    phaseRef.current = p
    setPhaseState(p)
    phaseLabelRef.current = p === 'interviewer' ? `${dom.counterpart} 말하는 중` : p === 'listening' ? '훈련자 답변 중' : p === 'thinking' ? '상대 생각 중' : '종료'
  }
  const [turns, setTurns] = useState<Turn[]>([])
  const [interim, setInterim] = useState('')
  const [current, setCurrent] = useState('') // 면접관이 지금 말하는 텍스트
  // 관전 화면 중계용: 지금 말하는 문장·인식 중인 내 말을 1초마다 함께 보낸다 (interval 클로저에서 읽을 수 있게 ref)
  const currentRef = useRef('')
  const interimRef = useRef('')
  const updateCurrent = (v: string) => { currentRef.current = v; setCurrent(v) }
  const updateInterim = (v: string) => {
    interimRef.current = v
    if (v.trim() && firstSoundRef.current === null) firstSoundRef.current = performance.now() // 내 첫 소리
    setInterim(v)
  }
  // 말투 측정: 듣기 시작 시각, 첫 소리 시각
  const listenStartRef = useRef<number | null>(null)
  const firstSoundRef = useRef<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  // 실전 모드: 화면(카메라/통화)만 크게, 지표·자막·기록 숨김. 세션 중에도 끄고 켤 수 있다
  const [real, setReal] = useState<boolean>(Boolean(setup.realMode))
  const [countdown, setCountdownState] = useState<number | null>(null) // 실전 모드 시작 전 3·2·1
  const countdownRef = useRef<number | null>(null)
  const setCountdown = (v: number | null) => { countdownRef.current = v; setCountdownState(v) }
  const [confirmEnd, setConfirmEndState] = useState(false)
  const confirmEndRef = useRef(false)
  const setConfirmEnd = (v: boolean) => { confirmEndRef.current = v; setConfirmEndState(v) }

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
      if (e - lastLive > 1000) {
        lastLive = e
        const s = recent()
        // 늦게 들어온 관전자도 바로 볼 수 있게 제목·상대·최근 대화를 매번 함께 보낸다. 말하는 중인 문장·인식 중인 내 말도
        postLive({
          elapsedMs: Math.round(e),
          phase: phaseLabelRef.current,
          title: scenario.title,
          counterpart: dom.counterpart,
          domain: dom.id,
          name: setup.fields.name ?? '',
          current: currentRef.current,
          interim: interimRef.current,
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
    let countdownIv: number | null = null
    turnsRef.current = []
    pushTurn({ role: 'interviewer', text: scenario.opening, at: 0 })
    updateCurrent(scenario.opening)
    setPhase('interviewer')
    health()
      .then((h): TtsMode => (h.tts && loadTtsPref() === 'server' ? 'server' : 'browser'))
      .catch((): TtsMode => 'browser')
      .then((mode) => {
        if (cancelled) return
        sp = new Speaker(mode, dom.lang ?? 'ko', dom.id)
        speakerRef.current = sp
        sp.onEnd = () => startListening()
        const begin = () => {
          if (cancelled) return
          startRef.current = performance.now() // 타이머는 상대가 입을 여는 순간부터
          sp!.speak(scenario.opening)
        }
        if (setup.realMode) {
          // 자세를 잡을 시간. 3, 2, 1 뒤 상대가 말을 시작한다
          let n = 3
          setCountdown(n)
          countdownIv = window.setInterval(() => {
            n -= 1
            if (n <= 0) { window.clearInterval(countdownIv!); countdownIv = null; setCountdown(null); begin() } else setCountdown(n)
          }, 1000)
        } else begin()
      })
    return () => {
      cancelled = true
      if (countdownIv) window.clearInterval(countdownIv)
      sp?.cancel()
      stopListenRef.current?.()
      abortRef.current?.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 종료 버튼 없이 탭을 닫거나 나가면 관전자·관리자에게 "이탈"을 알린다 (WS는 이 시점에 못 보내므로 beacon)
  useEffect(() => {
    const onHide = () => {
      if (finishedRef.current) return
      const body = JSON.stringify({ userKey: getUserKey(), left: true, ended: true, phase: '이탈', elapsedMs: Math.round(now()), title: scenario.title, counterpart: dom.counterpart, domain: dom.id, name: setup.fields.name ?? '' })
      try { navigator.sendBeacon('/api/live', new Blob([body], { type: 'application/json' })) } catch { /* noop */ }
    }
    window.addEventListener('pagehide', onHide)
    return () => window.removeEventListener('pagehide', onHide)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 실전 모드 키보드: Space = 답변 끝 / 말 끊기, Esc = 종료 확인. 입력창에 타이핑 중일 때는 무시.
  // 상태는 ref 로 읽는다: 렌더 클로저에 묶으면 카운트다운이 끝난 직후 잠깐 옛 핸들러가 남아 Space 를 무시한다.
  useEffect(() => {
    if (!real) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) return
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault()
        if (countdownRef.current !== null || confirmEndRef.current) return
        if (phaseRef.current === 'interviewer') interrupt()
        else if (phaseRef.current === 'listening' && !textModeRef.current) stopListenRef.current?.()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setConfirmEnd(!confirmEndRef.current)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [real])

  function pushTurn(t: Turn) {
    turnsRef.current = [...turnsRef.current, t]
    setTurns(turnsRef.current)
    postLive({ turn: { role: t.role, text: t.text, at: t.at }, elapsedMs: Math.round(now()) }) // 관전자에게 대사 즉시 중계
  }

  function startListening() {
    if (finishedRef.current) return
    setPhase('listening')
    listenStartRef.current = performance.now()
    firstSoundRef.current = null
    updateInterim('')
    if (textModeRef.current) return // 텍스트 모드: 입력창에서 제출을 기다린다
    const { stop } = listenOnce({
      onInterim: updateInterim,
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
    // 시간 지표: 텍스트 모드면 제외, 음성이면 첫 소리까지 지연과 말한 시간
    const t0 = performance.now()
    const timing = textModeRef.current
      ? { textMode: true }
      : {
          latencyMs: listenStartRef.current !== null && firstSoundRef.current !== null ? Math.max(0, Math.round(firstSoundRef.current - listenStartRef.current)) : undefined,
          speakMs: firstSoundRef.current !== null ? Math.max(0, Math.round(t0 - firstSoundRef.current)) : undefined,
        }
    pushTurn({ role: 'user', text, at: now(), nonverbal, timing })
    updateInterim('')
    setPhase('thinking')
    updateCurrent('')

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
        updateCurrent(full.replace('[END]', ''))
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
      updateCurrent(text ? `${text}…` : '') // 말풍선에는 끊긴 지점까지 남긴다
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
  const endLabel = dom.id === 'scam_call' || dom.id === 'claim_appeal' ? '전화 끊기' : dom.id === 'insurance_consult' ? '상담 마치기' : dom.id === 'hospital' ? '진료 끝' : dom.id === 'money_talk' ? '대화 마치기' : dom.id === 'parent_teacher' ? '면담 마치기' : dom.id === 'hiring_interviewer' ? '면접 마치기' : dom.id === 'meeting_prep' ? '점검 마치기' : '종료'
  const statusText = phase === 'interviewer' ? '말하는 중' : phase === 'listening' ? (textMode ? '답변을 입력해 주세요' : '내 차례') : phase === 'thinking' ? '…' : '종료'

  // 실전 모드에서 화면(카메라/통화) 위에 얹는 것들: 렌즈 아래 상대 표시, 카운트다운, 종료 확인, 최소 조작
  const realOverlays = real && (
    <>
      {dom.usesCamera && (
        <div className="focus-bar" title="상대를 보는 시선이 곧 카메라를 보는 시선입니다">
          <div className={`avatar small ${phase === 'interviewer' ? 'talking' : ''}`}>{scenario.interviewer.name[0]}</div>
          <div>
            <div className="focus-name">{scenario.interviewer.name}</div>
            <div className={`focus-status ${phase}`}>{statusText}</div>
          </div>
        </div>
      )}
      {countdown !== null && (
        <div className="overlay countdown">
          <div className="count">{countdown}</div>
          <p>곧 시작합니다. 자세를 잡고 상대를 봐 주세요</p>
        </div>
      )}
      {confirmEnd && (
        <div className="overlay confirm-end" onClick={() => setConfirmEnd(false)}>
          <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
            <p>훈련을 종료할까요?</p>
            <div className="row">
              <button className="danger" onClick={finish}>{endLabel}</button>
              <button onClick={() => setConfirmEnd(false)}>계속하기</button>
            </div>
          </div>
        </div>
      )}
      <div className="real-controls">
        <span className="hint">{phase === 'interviewer' ? 'Space 말 끊고 답하기' : phase === 'listening' && !textMode ? 'Space 답변 끝' : ''}{phase !== 'done' ? ` · Esc ${endLabel}` : ''}</span>
        <button className="ghost small" onClick={() => setReal(false)} title="지표·자막·기록을 다시 보입니다">실전 모드 끄기</button>
        <button className="ghost small danger" onClick={() => setConfirmEnd(true)}>{endLabel}</button>
      </div>
      {real && textMode && phase === 'listening' && (
        <div className="real-text">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitDraft() } }} placeholder="음성 입력이 안 되어 텍스트로 답합니다. Enter로 보내기" rows={2} autoFocus />
        </div>
      )}
    </>
  )

  return (
    <div className={`session ${real ? 'real' : ''}`}>
      <div className="session-main">
        {!dom.usesCamera ? (
          <div className="call-screen">
            <div className={`call-avatar ${phase === 'interviewer' ? 'talking' : ''}`}>{scenario.interviewer.name[0]}</div>
            <div className="call-name">{scenario.interviewer.name}</div>
            <div className="call-status">
              {phase === 'done' ? (dom.callMode === 'desk' ? '점검 종료' : '통화 종료') : `${dom.callMode === 'desk' ? '점검 중' : '통화 중'} ${mm}:${ss}`}
            </div>
            <div className="call-wave">{phase === 'interviewer' ? '상대가 말하는 중' : phase === 'listening' ? (textMode ? '답변 입력 대기' : '내 차례') : phase === 'thinking' ? '…' : ''}</div>
            {realOverlays}
          </div>
        ) : (
        <div className="cam-wrap">
          {hasVideo ? <video ref={videoRef} className="cam mirror" muted playsInline /> : <div className="overlay static"><p>카메라 없이 진행 중</p></div>}
          <div className="hud">
            {showVision && !real && <Pill label={live?.eyeContact ? '시선 유지' : '시선 이탈'} ok={!!live?.eyeContact} />}
            {showVision && !real && <Pill label={live?.postureOk ? '자세 안정' : '자세 이탈'} ok={!!live?.postureOk} />}
            <span className="timer">{mm}:{ss}</span>
          </div>
          {showVision && live && !live.faceFound && countdown === null && <div className="overlay"><p>얼굴이 보이지 않습니다</p></div>}
          {realOverlays}
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
            <button className="danger" onClick={finish}>{endLabel}</button>
            <button className="ghost small" onClick={() => setReal(true)} title="지표·자막·기록을 숨기고 화면만 봅니다">실전 모드</button>
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
