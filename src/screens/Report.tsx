import { useEffect, useMemo, useRef, useState } from 'react'
import { createReport, createReservation, fetchSession } from '../lib/api'
import { ReportView } from '../components/ReportView'
import type { Report as ReportT, SessionLog } from '../lib/types'
import { domainById } from '../lib/domains'
import { subscribe } from '../lib/ws'

// 같은 세션 로그로 리포트 요청이 두 번 나가지 않게 한다 (개발 중 HMR 재마운트 등)
const submitted = new Map<string, Promise<Awaited<ReturnType<typeof createReport>>>>()
function submitOnce(log: SessionLog) {
  let p = submitted.get(log.clientId)
  if (!p) {
    p = createReport(log)
    submitted.set(log.clientId, p)
    p.catch(() => submitted.delete(log.clientId))
  }
  return p
}

export function Report({ log, onRestart, onHome }: { log: SessionLog; onRestart: () => void; onHome: () => void }) {
  const [report, setReport] = useState<ReportT | null>(null)
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stage, setStage] = useState<'saving' | 'queued' | 'writing' | 'retrying'>('saving')
  const pollRef = useRef<number | null>(null)
  const sessionIdRef = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false

    // 서버 푸시: 워커가 시작·완료·실패를 알려준다. 폴링은 연결이 끊겼을 때의 폴백
    const unsub = subscribe((m) => {
      if (cancelled) return
      if ('sessionId' in m && sessionIdRef.current !== null && m.sessionId !== sessionIdRef.current) return
      if (m.type === 'report_queued') setStage('queued')
      if (m.type === 'report_started') setStage('writing')
      if (m.type === 'report_failed') {
        if (m.willRetry) setStage('retrying')
        else setError('리포트 생성에 실패했습니다. 기록에는 남아 있으니 나중에 다시 시도할 수 있습니다.')
      }
      if (m.type === 'report_done') {
        setReport(m.report as ReportT)
        if (pollRef.current) window.clearTimeout(pollRef.current)
      }
    })

    submitOnce(log)
      .then((r) => {
        if (cancelled) return
        if (r.queued) {
          setSessionId(r.sessionId)
          sessionIdRef.current = r.sessionId
          setStage((st) => (st === 'saving' ? 'queued' : st))
          // 폴백 폴링: 푸시를 못 받았을 때만 의미 있음. 6초마다
          const tick = async () => {
            try {
              const row = await fetchSession(r.sessionId)
              if (row.report_status === 'failed') {
                setError('리포트 생성에 실패했습니다. 기록에는 남아 있으니 나중에 다시 시도할 수 있습니다.')
                return
              }
              if (row.report) {
                setReport(row.report)
                return
              }
            } catch {
              /* 다음 틱에 재시도 */
            }
            pollRef.current = window.setTimeout(tick, 6000)
          }
          pollRef.current = window.setTimeout(tick, 6000)
        } else {
          setReport(r)
          if (r.sessionId !== undefined) setSessionId(r.sessionId)
        }
      })
      .catch((e) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
      unsub()
      if (pollRef.current) window.clearTimeout(pollRef.current)
    }
  }, [log])

  const finishedAt = useMemo(() => new Date(), [])
  return (
    <div className="screen report">
      <h2>{log.setup.fields.name?.trim() ? `${log.setup.fields.name.trim()} 님의 리포트` : '피드백 리포트'}</h2>
      <p className="muted small">{finishedAt.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })} · {domainById(log.setup.domain).name}{log.setup.realMode && <> · <span className="badge real">실전 모드</span></>}</p>
      <ReportView
        title={log.scenario.title}
        durationMs={log.durationMs}
        turns={log.turns}
        events={log.events}
        overall={log.overall}
        report={report}
        loading={!report && !error}
        loadingStage={stage}
        error={error}
        counterpart={domainById(log.setup.domain).counterpart}
        hasVision={domainById(log.setup.domain).usesCamera}
      />
      {!report && !error && sessionId !== null && (
        <p className="muted small">기록은 이미 저장됐습니다. 지금 나가도 홈의 최근 훈련에서 완성된 리포트를 볼 수 있습니다.</p>
      )}
      {sessionId !== null && <Reserve sessionId={sessionId} />}
      <div className="row">
        <button className="primary big" onClick={onRestart}>다시 연습하기</button>
        <button className="big" onClick={onHome}>홈으로</button>
      </div>
    </div>
  )
}

/** 다음 훈련 시각 예약. 기본값은 내일 같은 시각(30분 단위 반올림). */
function Reserve({ sessionId }: { sessionId: number }) {
  const defaultWhen = useMemo(() => {
    const d = new Date(Date.now() + 86_400_000)
    d.setMinutes(Math.round(d.getMinutes() / 30) * 30, 0, 0)
    return d
  }, [])
  const [when, setWhen] = useState(toLocalInput(defaultWhen))
  const [done, setDone] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    try {
      const r = await createReservation(new Date(when), sessionId)
      setDone(new Date(r.scheduledAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }))
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  return (
    <section className="reserve">
      <h3>다음 훈련 예약</h3>
      {done ? (
        <p>{done}에 다시 만나요. 그 시간 앞뒤 90분 안에 훈련하면 연속 훈련이 이어집니다.</p>
      ) : (
        <div className="row">
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          <button className="primary" onClick={submit}>예약</button>
        </div>
      )}
      {err && <p className="error small">{err}</p>}
    </section>
  )
}

function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
