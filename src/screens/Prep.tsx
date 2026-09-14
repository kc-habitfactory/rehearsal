import { useEffect, useRef, useState } from 'react'
import { VisionEngine, type LiveState } from '../lib/vision'
import { speechSupported } from '../lib/speech'
import { createScenario } from '../lib/api'
import type { Scenario, SetupInput } from '../lib/types'
import { domainById } from '../lib/domains'
import { subscribe } from '../lib/ws'

interface Props {
  setup: SetupInput
  engineRef: React.MutableRefObject<VisionEngine | null>
  streamRef: React.MutableRefObject<MediaStream | null>
  onReady: (scenario: Scenario, realMode: boolean) => void
  onBack: () => void
}

type Step = 'idle' | 'ok' | 'fail' | 'skip'

const REAL_MODE_KEY = 'rehearsal.realMode'

export function Prep({ setup, engineRef, streamRef, onReady, onBack }: Props) {
  const dom = domainById(setup.domain)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState('카메라와 마이크 권한을 요청합니다...')
  const [live, setLive] = useState<LiveState | null>(null)
  const [scenario, setScenario] = useState<Scenario | null>(null)
  const [scenarioErr, setScenarioErr] = useState<string | null>(null)
  const [cam, setCam] = useState<Step>('idle')
  const [mic, setMic] = useState<Step>('idle')
  const [model, setModel] = useState<Step>('idle')
  const [calib, setCalib] = useState<Step>('idle')
  const speechOk = speechSupported()
  // 실전 모드: 세션 중 지표·자막·기록을 숨기고 화면만 본다. 브라우저에 기억
  const [realMode, setRealMode] = useState<boolean>(() => { try { return localStorage.getItem(REAL_MODE_KEY) === '1' } catch { return false } })
  const toggleReal = (v: boolean) => { setRealMode(v); try { localStorage.setItem(REAL_MODE_KEY, v ? '1' : '0') } catch { /* noop */ } }
  // 시나리오 생성 진행 표시: 경과 시간 + 단계 문구 회전
  const [scenarioElapsed, setScenarioElapsed] = useState(0)
  const scenarioStartRef = useRef(performance.now())
  const [serverStage, setServerStage] = useState<'pool_hit' | 'generating' | 'done' | 'pool_refilled' | 'failed' | null>(null)

  // 서버가 시나리오 생성 단계를 밀어준다 (풀에서 꺼냈는지, 새로 만드는지, 다음 훈련용 풀이 채워졌는지)
  useEffect(() => subscribe((m) => {
    if (m.type === 'scenario_progress' && m.domain === setup.domain) setServerStage(m.stage)
  }), [setup.domain])

  useEffect(() => {
    let raf = 0
    let cancelled = false
    ;(async () => {
      // 시나리오는 권한과 무관하게 바로 생성 시작
      scenarioStartRef.current = performance.now()
      createScenario(setup)
        .then((sc) => {
          setScenario(sc)
          // 첫 대사 음성을 지금 만들어 두면(서버 캐시) 세션 시작 직후 바로 나온다
          void fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: sc.opening }) }).catch(() => {})
        })
        .catch((e) => setScenarioErr('시나리오 생성 실패: ' + e.message))

      // 1) 전화 도메인은 마이크만. 그 외는 카메라+마이크 → 실패 시 마이크만 → 실패 시 둘 다 없이
      let stream: MediaStream | null = null
      if (!dom.usesCamera) {
        setCam('skip'); setModel('skip'); setCalib('skip')
        setStatus('마이크 권한을 요청합니다...')
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          setMic('ok')
          setStatus('전화를 받을 준비가 됐습니다.')
        } catch {
          setMic('fail')
          setStatus('마이크를 열 수 없어 텍스트로 답변합니다.')
        }
        if (cancelled) { stream?.getTracks().forEach((t) => t.stop()); return }
        streamRef.current = stream
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 960, height: 540, facingMode: 'user' }, audio: true })
        setCam('ok'); setMic('ok')
      } catch {
        setCam('fail')
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          setMic('ok')
        } catch {
          setMic('fail')
        }
      }
      if (cancelled) { stream?.getTracks().forEach((t) => t.stop()); return }
      streamRef.current = stream

      const hasVideo = Boolean(stream?.getVideoTracks().length)
      if (!hasVideo) {
        setModel('skip'); setCalib('skip')
        setStatus('카메라 없이 진행합니다. 시선·자세 분석은 꺼지고 음성만으로 진행됩니다.')
        return
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }

      // 2) 모델 로딩 → 실패 시 카메라는 보여주되 분석 없이 진행
      setStatus('얼굴·자세 모델을 불러옵니다...')
      const engine = new VisionEngine()
      try {
        await engine.init()
      } catch (e) {
        setModel('fail'); setCalib('skip')
        setStatus('분석 모델을 불러오지 못했습니다. 카메라 화면만 표시하고 지표 없이 진행합니다. ' + (e as Error).message)
        return
      }
      if (cancelled) { engine.close(); return }
      setModel('ok')
      engineRef.current = engine
      engine.startCalibration()
      setStatus('3초간 화면 중앙을 평소처럼 편하게 봐 주세요 (상대 말풍선이 있는 쪽)')

      let last = 0
      let done = false
      const loop = (t: number) => {
        raf = requestAnimationFrame(loop)
        if (t - last < 66) return
        last = t
        const v = videoRef.current
        if (!v) return
        const s = engine.process(v, performance.now())
        if (s) {
          setLive(s)
          if (!s.calibrating && !done) {
            done = true
            setCalib('ok')
            setStatus('보정 완료. 준비되면 시작하세요.')
          }
        }
      }
      raf = requestAnimationFrame(loop)
    })()
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (scenario || scenarioErr) return
    const t = window.setInterval(() => setScenarioElapsed((performance.now() - scenarioStartRef.current) / 1000), 250)
    return () => window.clearInterval(t)
  }, [scenario, scenarioErr])

  const STAGES: Record<string, string[]> = {
    interview: ['직군에 맞는 실제 질문을 고르는 중', '면접관 성향을 정하는 중', '꼬리질문 연쇄를 짜는 중', '돌발 변수를 심는 중', '첫 질문을 다듬는 중'],
    scam_call: ['실제 사례 중 수법을 고르는 중', '발신자의 소속과 말투를 정하는 중', '압박 단계와 해명 대사를 짜는 중', '사기인지 정상 전화인지 결정하는 중', '첫 대사를 다듬는 중'],
    salary_negotiation: ['회사 측 연봉 밴드와 한도를 정하는 중', '협상 상대(대표·인사·매니저)를 정하는 중', '협상 논리 순서를 짜는 중', '비금전 카드를 준비하는 중', '첫 제시를 다듬는 중'],
    exec_qa: ['임원 성향을 정하는 중', '핵심 메시지의 약점을 찾는 중', '질문 흐름을 짜는 중', '돌발 변수를 심는 중', '첫 질문을 다듬는 중'],
    hospital: ['의사 성향을 정하는 중', '확인할 정보 목록을 만드는 중', '환자가 놓치기 쉬운 지점을 심는 중', '첫 질문을 다듬는 중'],
    immigration: ['Picking the officer', 'Planning the question flow', 'Adding a twist', 'Polishing the first line'],
    insurance_consult: ['신청서 뒤에 숨은 고객 사정을 정하는 중', '고객 성향 여섯 축을 정하는 중', '2026 제도 사실을 맞추는 중', '돌발 변수를 심는 중', '전화 받는 첫 말을 다듬는 중'],
    money_talk: ['지인의 진짜 사정을 정하는 중', '압박형인지 정상 부탁인지 정하는 중', '압박 전술 순서를 짜는 중', '관계에 맞는 말투를 정하는 중', '첫 말을 다듬는 중'],
    parent_teacher: ['담임의 관찰 사실을 정하는 중', '안내할 절차를 맞추는 중', '담임 성향을 정하는 중', '돌발 변수를 심는 중', '첫 인사를 다듬는 중'],
    claim_inquiry: ['실제 보장 여부와 이유를 정하는 중', '상담원 유형을 정하는 중', '필요 서류와 절차를 맞추는 중', '돌발 변수를 심는 중', '콜센터 첫 인사를 다듬는 중'],
    insurance_purchase: ['설계사 유형을 정하는 중', '추천 상품의 적합성을 정하는 중', '먼저 말하지 않을 정보를 고르는 중', '밀어붙임 전술 순서를 짜는 중', '첫 인사를 다듬는 중'],
    claim_appeal: ['부지급이 정당한지 애매한지 정하는 중', '약관 근거와 인정 범위를 정하는 중', '담당자 전술 순서를 짜는 중', '돌발 변수를 심는 중', '콜센터 첫 인사를 다듬는 중'],
    hiring_interviewer: ['지원자 유형을 정하는 중', '이력서에 과장 항목을 심는 중', '질문 유형별 반응 규칙을 짜는 중', '역질문을 준비하는 중', '첫 인사를 다듬는 중'],
    meeting_prep: ['문서에서 결정 사항·미확인 항목을 뽑는 중', '내 역할이 걸린 대표 질문 하나를 고르는 중', '정답 요지와 판정 기준을 적는 중', '되묻기 규칙을 정하는 중', '첫 말을 다듬는 중'],
    customer_interview: ['고객 유형을 정하는 중', '표면 답과 진짜 이유를 나누는 중', '감정 단어와 숨은 니즈를 심는 중', '유도·닫힌 질문 반응을 정하는 중', '첫 인사를 다듬는 중'],
  }
  const stageMsgs = STAGES[dom.id] ?? STAGES.interview
  const timedMsg = stageMsgs[Math.min(stageMsgs.length - 1, Math.floor(scenarioElapsed / 4))]
  const stageMsg = serverStage === 'pool_hit' ? '미리 만들어 둔 시나리오를 꺼내는 중' : serverStage === 'generating' ? `AI가 새 시나리오를 만드는 중 · ${timedMsg}` : timedMsg
  const expected = dom.id === 'scam_call' || dom.id === 'insurance_consult' || dom.id === 'claim_appeal' || dom.id === 'claim_inquiry' || dom.id === 'insurance_purchase' || dom.id === 'meeting_prep' ? '보통 15~25초' : '보통 8~15초'
  // 판별 훈련 도메인은 제목이 답을 드러내므로 시작 전에는 숨긴다
  const scenarioLabel = scenario
    ? dom.hideTitleBeforeStart ? `시나리오 준비 완료 · 내용은 ${dom.startLabel} 후 확인하세요` : `시나리오 · ${scenario.title}`
    : '시나리오'

  // 시작 조건: 시나리오가 있고, 카메라를 쓰는 경우엔 보정이 끝났거나 분석을 건너뛴 상태
  const visionSettled = calib === 'ok' || calib === 'skip'
  const ready = Boolean(scenario) && cam !== 'idle' && mic !== 'idle' && visionSettled
  const textOnly = !speechOk || mic === 'fail'

  return (
    <div className="screen">
      <button className="link" onClick={onBack}>← 다시 설정</button>
      <h2>준비</h2>
      {!dom.usesCamera ? (
        <div className="call-card">
          <div className="call-avatar ringing">☎</div>
          <div className="call-name">{scenario ? '수신 전화' : '전화 연결 준비 중'}</div>
          <div className="muted small">{scenario ? '발신자 정보는 전화를 받으면 확인할 수 있습니다' : '시나리오를 만드는 동안 잠시만요'}</div>
        </div>
      ) : (
      <div className="cam-wrap">
        <video ref={videoRef} className="cam mirror" muted playsInline />
        {live?.calibrating && (
          <div className="overlay">
            <div className="calib-ring" style={{ ['--p' as string]: live.calibrationProgress }} />
            <p>화면 중앙을 평소처럼 봐 주세요</p>
          </div>
        )}
        {cam === 'fail' && <div className="overlay"><p>카메라 없음</p></div>}
      </div>
      )}
      <p className="muted">{calib === 'ok' && !scenario && !scenarioErr ? '보정 완료. 시나리오가 준비되면 시작 버튼이 켜집니다.' : status}</p>
      {scenarioErr && <p className="error">{scenarioErr}</p>}
      <ul className="checklist">
        {dom.usesCamera && <Item step={cam} label="카메라" failText="없음 · 시선·자세 분석 없이 진행" />}
        <Item step={mic} label="마이크" failText="없음 · 텍스트로 답변" />
        <Item step={speechOk ? 'ok' : 'fail'} label="음성 인식" failText="이 브라우저 미지원 · 텍스트로 답변 (크롬 권장)" />
        {dom.usesCamera && <Item step={model} label="얼굴·자세 인식 모델" />}
        {dom.usesCamera && <Item step={calib} label="시선 기준값 보정" />}
        <Item step={scenario ? 'ok' : scenarioErr ? 'fail' : 'idle'} label={scenarioLabel} />
      </ul>
      {!scenario && !scenarioErr && (
        <div className="gen-progress">
          <div className="spinner" />
          <div>
            <div>{stageMsg}… <span className="muted">{Math.floor(scenarioElapsed)}초</span></div>
            <div className="muted small">AI가 매번 새 시나리오를 만듭니다. {expected} 걸립니다. 같은 설정으로 다시 하면 즉시 시작됩니다.</div>
          </div>
        </div>
      )}
      {scenario && !visionSettled && <p className="muted small">시나리오는 준비됐습니다. 시선 보정이 끝나면 시작할 수 있어요.</p>}
      {scenario && serverStage === 'pool_refilled' && <p className="muted small">다음 훈련용 시나리오도 미리 준비해 두었습니다. 같은 설정이면 바로 시작됩니다.</p>}
      {textOnly && <p className="muted small">음성 입력이 불가능해 답변은 텍스트로 입력하게 됩니다. {dom.counterpart} 음성은 그대로 나옵니다.</p>}
      {!dom.usesCamera && <p className="muted small">{dom.callMode === 'desk' ? '카메라를 쓰지 않는 상황입니다. 말한 내용과 말투로만 평가합니다.' : '전화 상황이라 카메라를 쓰지 않습니다. 목소리와 말한 내용으로만 평가합니다.'}</p>}
      {dom.lang === 'en' && <p className="muted small">영어로 진행됩니다. 음성 인식도 영어로 설정됩니다. 리포트는 한국어로 나옵니다.</p>}
      <label className="real-toggle">
        <input type="checkbox" checked={realMode} onChange={(e) => toggleReal(e.target.checked)} />
        <span>
          <b>실전 모드</b>
          <span className="muted small"> · {dom.usesCamera ? '카메라 화면만 보고 진행합니다. 지표·자막·대화 기록은 리포트에서 봅니다.' : '통화 화면만 보고 진행합니다. 자막·대화 기록은 리포트에서 봅니다.'} 3초 카운트다운 뒤 시작, Space 답변 끝·말 끊기, Esc 종료.</span>
        </span>
      </label>
      <button className="primary big" disabled={!ready} onClick={() => scenario && onReady({ ...scenario, domain: setup.domain }, realMode)}>
        {dom.startLabel}
      </button>
    </div>
  )
}

function Item({ step, label, failText }: { step: Step; label: string; failText?: string }) {
  const cls = step === 'ok' ? 'done' : step === 'fail' ? 'fail' : step === 'skip' ? 'skip' : ''
  return (
    <li className={cls}>
      {label}
      {step === 'fail' && failText && <span className="muted small"> — {failText}</span>}
      {step === 'skip' && <span className="muted small"> — 건너뜀</span>}
    </li>
  )
}
