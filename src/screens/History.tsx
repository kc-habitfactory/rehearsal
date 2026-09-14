import { useEffect, useState } from 'react'
import { fetchSession, type SessionDetail } from '../lib/api'
import { ReportView } from '../components/ReportView'
import { domainById } from '../lib/domains'
import { subscribe } from '../lib/ws'

export function History({ sessionId, onBack, adminToken, backLabel = '← 홈' }: { sessionId: number; onBack: () => void; adminToken?: string; backLabel?: string }) {
  const [row, setRow] = useState<SessionDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const load = () => fetchSession(sessionId, adminToken).then(setRow).catch((e) => setError(e.message))
    load()
    const unsub = subscribe((m) => {
      if ((m.type === 'report_done' || m.type === 'report_failed') && m.sessionId === sessionId) void load()
    })
    return unsub
  }, [sessionId, adminToken])

  return (
    <div className="screen report">
      <button className="link" onClick={onBack}>{backLabel}</button>
      <h2>{row && (row.nickname || row.setup?.fields?.name) ? `${(row.nickname || row.setup?.fields?.name)!.trim()} 님의 리포트` : '지난 훈련 리포트'}</h2>
      {error && <p className="error">{error}</p>}
      {!row && !error && <p className="muted">불러오는 중...</p>}
      {row && (
        <>
          <p className="muted small">
            {new Date(row.created_at).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })} · {domainById(row.setup?.domain ?? 'interview').name}{row.setup?.realMode && <> · <span className="badge real">실전 모드</span></>}
            {/* 모델 이름과 사용자 키는 개발·운영 정보라 관리자 화면에서만 */}
            {adminToken && <> · {row.report_model ?? ''} · 훈련자 <code className="key">{row.user_key}</code></>}
          </p>
          <ReportView
            title={row.title}
            durationMs={row.duration_ms}
            turns={row.turns}
            events={row.events}
            overall={row.overall}
            report={row.report}
            loading={row.report_status === 'pending'}
            loadingStage="writing"
            counterpart={domainById(row.setup?.domain ?? 'interview').counterpart}
            hasVision={domainById(row.setup?.domain ?? 'interview').usesCamera}
          />
        </>
      )}
    </div>
  )
}
