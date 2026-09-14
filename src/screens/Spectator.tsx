import { useEffect, useState } from 'react'
import { Gauge, Pill } from '../components/Gauge'
import { spectate, type PushMessage } from '../lib/ws'

/* 발표용 관전 화면. 다른 기기(심사위원 모니터)에서 #watch=<userKey> 로 열면
 * 훈련 중인 사람의 지표·대사·상태가 실시간으로 보인다. */

interface LiveTurn { role: 'user' | 'interviewer'; text: string; at: number }

export function Spectator({ userKey }: { userKey: string }) {
  const [metrics, setMetrics] = useState<Record<string, number> | null>(null)
  const [phase, setPhase] = useState<string>('대기 중')
  const [title, setTitle] = useState<string>('')
  const [name, setName] = useState<string>('')
  const [counterpart, setCounterpart] = useState<string>('상대')
  const [turns, setTurns] = useState<LiveTurn[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [lastAt, setLastAt] = useState<number>(0)
  const [ended, setEnded] = useState(false)
  const [reportState, setReportState] = useState<'none' | 'writing' | 'done' | 'failed'>('none')
  const [result, setResult] = useState<{ score: number; headline: string } | null>(null)
  const [, tick] = useState(0)

  // 무신호 판정을 위해 1초마다 다시 그린다
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 1000)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    return spectate(userKey, (m: PushMessage) => {
      if (m.type === 'report_queued' || m.type === 'report_started') { setReportState('writing'); return }
      if (m.type === 'report_done') {
        const r = m.report as { score: number; headline: string }
        setResult({ score: r.score, headline: r.headline })
        setReportState('done')
        return
      }
      if (m.type === 'report_failed') { if (!m.willRetry) setReportState('failed'); return }
      if (m.type !== 'live_update') return
      setLastAt(m.at)
      if (m.ended) {
        setEnded(true)
        setPhase('훈련 종료')
      } else if (ended) {
        // 새 훈련이 시작되면 초기화
        setEnded(false); setResult(null); setReportState('none'); setTurns([])
      }
      if (m.metrics) setMetrics(m.metrics as Record<string, number>)
      if (m.phase) setPhase(m.phase)
      if (m.title) setTitle(m.title)
      if (m.name) setName(m.name)
      if (m.counterpart) setCounterpart(m.counterpart)
      if (typeof m.elapsedMs === 'number') setElapsed(m.elapsedMs)
      if (Array.isArray((m as { turns?: unknown }).turns)) {
        setTurns((m as { turns: LiveTurn[] }).turns)
      } else if (m.turn) {
        const t = m.turn as LiveTurn
        setTurns((prev) => (prev.some((p) => p.at === t.at && p.role === t.role) ? prev : [...prev, t]))
      }
    })
  }, [userKey])

  const stale = !ended && lastAt > 0 && Date.now() - lastAt > 15_000
  const mm = String(Math.floor(elapsed / 60000)).padStart(2, '0')
  const ss = String(Math.floor((elapsed % 60000) / 1000)).padStart(2, '0')
  const eye = metrics?.eyeContactPct

  return (
    <div className="spectator">
      <div className="spectator-head">
        <div>
          <div className="muted small">관전 중 · {name && <><b>{name}</b> · </>}<code className="key">{userKey}</code></div>
          <h2>{title || '훈련 대기 중'}</h2>
        </div>
        <div className="spectator-timer">{mm}:{ss}</div>
      </div>

      {!lastAt && <p className="muted">훈련이 시작되면 여기에 실시간 지표와 대화가 표시됩니다.</p>}
      {stale && <p className="error small">15초 이상 신호가 없습니다. 연결이 끊겼을 수 있습니다.</p>}
      {ended && (
        <div className="spectator-result">
          {reportState === 'done' && result ? (
            <>
              <div className="score-wrap"><div className="score">{result.score}</div><div className="score-unit">종합 점수 / 100</div></div>
              <div className="headline">{result.headline}</div>
            </>
          ) : reportState === 'failed' ? (
            <div className="muted">리포트 생성에 실패했습니다.</div>
          ) : (
            <>
              <div className="spinner" />
              <div>
                <div>훈련이 끝났습니다.</div>
                <div className="muted small">코치가 리포트를 작성하고 있습니다. 완성되면 점수가 여기에 표시됩니다.</div>
              </div>
            </>
          )}
        </div>
      )}

      <div className={`spectator-grid ${ended ? 'ended' : ''}`}>
        <div className="spectator-metrics">
          <div className="spectator-phase">{phase}</div>
          {eye !== undefined && (
            <>
              <div className="big-num">{Math.round(eye)}<span className="unit">%</span></div>
              <div className="muted">시선 유지 (최근 30초)</div>
              <Gauge label="시선 유지" value={eye} ok={eye >= 60} />
              <div className="row" style={{ marginTop: 12 }}>
                <Pill label={`자세 이탈 ${metrics?.postureBreaks ?? 0}`} ok={(metrics?.postureBreaks ?? 0) === 0} />
                <Pill label={`얼굴 접촉 ${metrics?.faceTouches ?? 0}`} ok={(metrics?.faceTouches ?? 0) === 0} />
              </div>
            </>
          )}
          {eye === undefined && lastAt > 0 && <div className="muted">이 훈련은 카메라를 쓰지 않습니다. 대화만 표시됩니다.</div>}
        </div>
        <div className="spectator-transcript">
          {turns.slice(-8).map((t, i) => (
            <div key={i} className={`line ${t.role}`}>
              <span className="who">{t.role === 'user' ? '훈련자' : counterpart}</span> {t.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
