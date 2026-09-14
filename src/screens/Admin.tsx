import { useEffect, useState } from 'react'
import { subscribeAdmin, type LiveEntry } from '../lib/ws'
import { domainById, type DomainId } from '../lib/domains'
import { Spectator } from './Spectator'
import { History } from './History'

/* 관리자 화면 (#admin). 진행 중·방금 끝난 훈련을 실시간 목록으로 보고, 클릭하면 관전한다.
 * 비밀번호는 서버 REHEARSAL_ADMIN_TOKEN (기본 rehearsal). */

const TOKEN_KEY = 'rehearsal.adminToken'

interface PastRow { id: number; user_key: string; nickname?: string | null; domain: string; title: string; score: number | null; report_status: string; created_at: string; duration_ms: number; real_mode?: boolean | number | null }

export function Admin() {
  const [token, setToken] = useState<string | null>(() => { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } })
  const [input, setInput] = useState('')
  const [denied, setDenied] = useState(false)
  const [entries, setEntries] = useState<LiveEntry[]>([])
  const [past, setPast] = useState<PastRow[]>([])
  const [pastTotal, setPastTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [watching, setWatching] = useState<string | null>(null)
  const [viewing, setViewing] = useState<number | null>(null) // 지난 기록 리포트 보기
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  // 관전 링크(#watch=<키>)를 복사한다. 비밀번호 없는 다른 모니터에 특정 훈련자 화면만 넘길 때
  const copyWatchLink = async (userKey: string) => {
    const link = `${location.origin}/#watch=${userKey}`
    try { await navigator.clipboard.writeText(link); setCopiedKey(userKey); window.setTimeout(() => setCopiedKey(null), 2000) } catch { window.prompt('관전 링크', link) }
  }
  const [, tick] = useState(0)

  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 1000)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    if (!token) return
    setDenied(false)
    // 전체 기록: 처음 30건. 누군가의 리포트가 완성·저장되면(admin_update) 즉시 다시 불러온다 (3초 스로틀)
    const loadPast = () =>
      fetch(`/api/admin/sessions?limit=30&offset=0`, { headers: { 'x-admin-token': token } })
        .then((r) => (r.ok ? r.json() : { items: [], total: 0 }))
        .then((j) => { setPast(j.items ?? []); setPastTotal(j.total ?? 0) })
        .catch(() => {})
    let lastLoad = 0
    let pendingReload: number | null = null
    const reloadSoon = () => {
      const wait = Math.max(0, 3000 - (Date.now() - lastLoad))
      if (pendingReload) return
      pendingReload = window.setTimeout(() => { pendingReload = null; lastLoad = Date.now(); void loadPast() }, wait)
    }
    const unsub = subscribeAdmin(token, (m) => {
      if (m.type === 'admin_update') {
        setEntries(m.entries)
        if (m.entries.some((e) => e.ended)) reloadSoon() // 끝난 훈련이 있으면 저장·점수 반영 확인
      }
      if (m.type === 'admin_denied') { setDenied(true); setToken(null); try { localStorage.removeItem(TOKEN_KEY) } catch { /* noop */ } }
    })
    lastLoad = Date.now()
    loadPast()
    return () => { unsub(); if (pendingReload) window.clearTimeout(pendingReload) }
  }, [token])

  const loadMorePast = async () => {
    if (!token) return
    setLoadingMore(true)
    try {
      const r = await fetch(`/api/admin/sessions?limit=30&offset=${past.length}`, { headers: { 'x-admin-token': token } }).then((x) => x.json())
      setPast((prev) => { const seen = new Set(prev.map((p) => p.id)); return [...prev, ...(r.items ?? []).filter((p: PastRow) => !seen.has(p.id))] })
      setPastTotal(r.total ?? pastTotal)
    } finally {
      setLoadingMore(false)
    }
  }

  if (!token) {
    return (
      <div className="screen center">
        <h2>관리자</h2>
        <p className="muted small">진행 중인 훈련을 모두 보고 관전할 수 있습니다.</p>
        {denied && <p className="error small">비밀번호가 맞지 않습니다.</p>}
        <form className="row" style={{ justifyContent: 'center' }} onSubmit={(e) => { e.preventDefault(); try { localStorage.setItem(TOKEN_KEY, input) } catch { /* noop */ } setToken(input) }}>
          <input type="password" value={input} onChange={(e) => setInput(e.target.value)} placeholder="비밀번호" autoFocus className="pw" />
          <button className="primary" type="submit">들어가기</button>
        </form>
      </div>
    )
  }

  if (viewing !== null) {
    return <History sessionId={viewing} adminToken={token} backLabel="← 목록으로" onBack={() => setViewing(null)} />
  }

  if (watching) {
    return (
      <div>
        <div className="admin-bar">
          <button className="link" onClick={() => setWatching(null)}>← 목록으로</button>
        </div>
        <Spectator userKey={watching} />
      </div>
    )
  }

  const active = entries.filter((e) => !e.ended)
  const justEnded = entries.filter((e) => e.ended)
  const fmtElapsed = (ms?: number) => `${String(Math.floor((ms ?? 0) / 60000)).padStart(2, '0')}:${String(Math.floor(((ms ?? 0) % 60000) / 1000)).padStart(2, '0')}`
  const badge = (d?: string) => <span className={`badge ${d ?? 'interview'}`}>{domainById((d ?? 'interview') as DomainId).short}</span>
  const ago = (t: number) => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? `${s}초 전` : `${Math.floor(s / 60)}분 전` }

  return (
    <div className="admin">
      <div className="admin-head">
        <div><div className="muted small">관리자</div><h2>진행 중인 훈련</h2></div>
        <div className="muted small">{active.length}명 훈련 중 · 실시간</div>
      </div>

      {active.length === 0 && <p className="muted">지금 진행 중인 훈련이 없습니다. 누군가 시작하면 여기에 바로 나타납니다.</p>}
      <div className="admin-grid">
        {active.map((e) => {
          const eye = (e.metrics?.eyeContactPct as number | undefined)
          const stale = Date.now() - e.lastAt > 15_000
          return (
            <div key={e.userKey} className={`admin-card ${stale ? 'stale' : ''}`} role="button" tabIndex={0}
              onClick={() => setWatching(e.userKey)} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setWatching(e.userKey) } }}>
              <div className="admin-card-top">{badge(e.domain)}<span className="admin-time">{fmtElapsed(e.elapsedMs)}</span></div>
              <div className="admin-title">{e.title ?? '시작 중…'}</div>
              <div className="muted small">{e.phase ?? ''}{stale ? ' · 신호 없음' : ''}</div>
              <div className="admin-metrics">
                {eye !== undefined ? <><span className="big">{Math.round(eye)}%</span><span className="muted small">시선 유지</span></> : <span className="muted small">카메라 없음</span>}
              </div>
              <div className="muted small key">{e.name ? <b>{e.name}</b> : `${e.userKey.slice(0, 14)}…`}</div>
              <div className="admin-cta">
                <span>관전하기 →</span>
                <button className="ghost small" title="이 훈련자의 관전 링크를 복사합니다 (비밀번호 없이 열 수 있음)"
                  onClick={(ev) => { ev.stopPropagation(); void copyWatchLink(e.userKey) }}>
                  {copiedKey === e.userKey ? '복사됨' : '링크 복사'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {justEnded.length > 0 && (
        <>
          <h3 className="with-action">
            방금 끝난 훈련
            <button className="ghost small" title="서버 메모리의 끝난 훈련 목록을 비웁니다. 저장된 기록은 그대로입니다"
              onClick={() => fetch('/api/admin/live', { method: 'DELETE', headers: { 'x-admin-token': token } }).catch(() => {})}>
              목록 비우기
            </button>
          </h3>
          <div className="admin-list">
            {justEnded.map((e) => {
              const inner = (
                <>
                  {badge(e.domain)}
                  <span className="title">{e.name ? <b>{e.name}</b> : null}{e.name ? ' · ' : ''}{e.title ?? '-'}</span>
                  <span className="muted small">{e.endedAt ? ago(e.endedAt) : ''}</span>
                  <span className="score">{e.reportStatus === 'done' ? `${e.score}점` : e.reportStatus === 'failed' ? '실패' : '리포트 작성 중'}</span>
                </>
              )
              // 세션이 저장되면 sessionId가 채워지고, 그때부터 클릭해 리포트(작성 중이면 진행 화면)를 볼 수 있다
              return e.sessionId ? (
                <button key={e.userKey} className="admin-row clickable" onClick={() => setViewing(e.sessionId!)} title="리포트 보기">{inner}</button>
              ) : (
                <div key={e.userKey} className="admin-row">{inner}</div>
              )
            })}
          </div>
        </>
      )}

      <h3>전체 최근 기록 <span className="muted small">· {pastTotal}건 · 클릭하면 리포트 · 리포트가 완성되면 자동 갱신</span></h3>
      <div className="admin-list">
        {past.map((r) => (
          <button key={r.id} className="admin-row clickable" onClick={() => setViewing(r.id)} title="리포트 보기">
            {badge(r.domain)}
            <span className="title">{r.real_mode ? <span className="badge real">실전</span> : null}{r.title}</span>
            <span className="muted small">{new Date(r.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
            <span className="muted small key">{r.nickname ? <b>{r.nickname}</b> : `${r.user_key.slice(0, 10)}…`}</span>
            <span className="score">{r.report_status === 'pending' ? '생성 중' : r.score !== null ? `${r.score}점` : '–'}</span>
          </button>
        ))}
        {past.length < pastTotal && (
          <button className="ghost more" onClick={loadMorePast} disabled={loadingMore}>{loadingMore ? '불러오는 중…' : `더 보기 (${pastTotal - past.length}건 남음)`}</button>
        )}
      </div>
    </div>
  )
}
