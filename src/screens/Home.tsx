import { useEffect, useState } from 'react'
import { cancelReservation, fetchMe, fetchSessions, type Me, type SessionListItem } from '../lib/api'
import { getNickname, setNickname } from '../lib/user'
import { domainById, type DomainId } from '../lib/domains'
import { subscribe } from '../lib/ws'

function fmtWhen(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  const tomorrow = new Date(today.getTime() + 86_400_000).toDateString() === d.toDateString()
  const hm = d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })
  return `${sameDay ? '오늘' : tomorrow ? '내일' : d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })} ${hm}`
}

const WINDOW_MS = 90 * 60_000

function reservationState(iso: string): 'upcoming' | 'now' | 'missed' {
  const diff = new Date(iso).getTime() - Date.now()
  if (Math.abs(diff) <= WINDOW_MS) return 'now'
  return diff > 0 ? 'upcoming' : 'missed'
}

export function Home({ onStart, onOpenHistory }: { onStart: () => void; onOpenHistory: (id: number) => void }) {
  const [me, setMe] = useState<Me | null>(null)
  const [recent, setRecent] = useState<SessionListItem[]>([])
  const [total, setTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const r = await fetchSessions(recent.length, 10)
      setRecent((prev) => {
        const seen = new Set(prev.map((x) => x.id))
        return [...prev, ...r.items.filter((x) => !seen.has(x.id))]
      })
      setTotal(r.total)
    } finally {
      setLoadingMore(false)
    }
  }

  // 이름: 회원 가입 없이 브라우저에 저장. 상대(면접관·인사담당자·의사…)가 이미 아는 정보로 프롬프트에 들어간다
  const [name, setName] = useState<string>(() => getNickname() ?? '')
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const saveName = () => {
    const n = nameDraft.trim().slice(0, 20)
    if (!n) return
    setNickname(n)
    setName(n)
    setEditingName(false)
    void fetchMe(n).catch(() => {}) // 서버 users.nickname 에도 저장 (관리자 화면 표시용)
  }

  useEffect(() => {
    const load = () =>
      fetchMe(getNickname())
        .then((m) => {
          setMe(m)
          setRecent(m.recent.slice(0, 5))
          setTotal(m.stats.total)
        })
        .catch(() => setMe(null))
    load()
    // 세션이 저장되면(큐 등록) 즉시 "생성 중" 행을, 리포트가 완성되면 점수와 통계를 갱신
    const unsub = subscribe((m) => {
      if (m.type === 'report_queued' || m.type === 'report_done' || m.type === 'report_failed') void load()
    })
    return unsub
  }, [])

  const hasHistory = me?.enabled && me.stats.total > 0
  const [, tick] = useState(0)
  // 예약 시각을 넘나들 때 문구가 바뀌도록 1분마다 다시 그린다
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 60_000)
    return () => window.clearInterval(t)
  }, [])
  const resState = me?.next ? reservationState(me.next.scheduled_at) : null
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const doCancel = async () => {
    if (!me?.next) return
    setCancelling(true)
    try {
      await cancelReservation(me.next.id)
      setMe({ ...me, next: null })
    } finally {
      setCancelling(false)
      setConfirmCancel(false)
    }
  }

  // 예약 시각이 되면(앱을 열어둔 상태에서) 브라우저 알림 한 번
  useEffect(() => {
    if (!me?.next || typeof Notification === 'undefined') return
    const ms = new Date(me.next.scheduled_at).getTime() - Date.now()
    if (ms <= 0 || ms > 12 * 3_600_000) return
    if (Notification.permission === 'default') void Notification.requestPermission()
    const t = window.setTimeout(() => {
      if (Notification.permission === 'granted') new Notification('리허설', { body: '예약한 훈련 시간이에요. 오늘의 훈련을 시작해 보세요.' })
      tick((n) => n + 1)
    }, ms)
    return () => window.clearTimeout(t)
  }, [me?.next])
  return (
    <div className="screen center home">
      <div className="home-tools">
        <a className="ghost" href="#admin" target="_blank" rel="noopener" title="새 탭에서 열립니다. 진행 중인 모든 훈련을 보고 관전합니다">
          <span aria-hidden>▣</span> 관리자
        </a>
      </div>
      <h1 className="logo">리허설</h1>
      <p className="tagline">인생의 중요한 순간, 미리 한 번 해보기</p>

      {(!name || editingName) ? (
        <form className="name-card" onSubmit={(e) => { e.preventDefault(); saveName() }}>
          {/* 바꾸기 모드에는 제목 없이 입력칸만. 처음에는 질문형 제목으로 또렷하게 */}
          {!name && <label htmlFor="name-input">어떻게 불러드릴까요?</label>}
          <div className="name-row">
            <input id="name-input" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="이름이나 별명 (예: 기철)" maxLength={20} autoFocus aria-label={name ? '새 이름' : undefined} onFocus={(e) => name && e.currentTarget.select()} />
            <button className="primary" type="submit" disabled={!nameDraft.trim()}>저장</button>
            {name && <button type="button" className="ghost" onClick={() => setEditingName(false)}>취소</button>}
          </div>
          <p className="muted small">{name ? '상대가 부르는 이름이 바뀝니다.' : '면접관·인사담당자·의사가 이 이름으로 부릅니다. 가입 없이 이 브라우저에만 저장돼요.'}</p>
        </form>
      ) : (
        <p className="greeting">
          {/* 이름을 누르면 바꾸기. 별도 링크 대신 작은 연필 아이콘으로 낮춘다 */}
          <button type="button" className="name-btn" onClick={() => { setNameDraft(name); setEditingName(true) }} title="이름 바꾸기" aria-label="이름 바꾸기">
            <b>{name}</b><span className="pencil" aria-hidden>✎</span>
          </button>
          {' '}님, 오늘도 한 번 해볼까요?
        </p>
      )}

      {me?.enabled && (
        <div className="home-stats">
          <div className="stat"><div className="num">{me.streak}<span className="unit">일</span></div><div className="lbl">연속 훈련</div></div>
          <div className="stat"><div className="num">{me.stats.total}<span className="unit">회</span></div><div className="lbl">누적 훈련</div></div>
          <div className="stat">
            <div className="num">
              {me.stats.recentAvg ?? '–'}{me.stats.recentAvg !== null && <span className="unit">점</span>}
              {me.stats.recentDelta !== null && me.stats.recentDelta !== 0 && (
                <span className={`delta ${me.stats.recentDelta > 0 ? 'up' : 'down'}`} title="직전 5회 평균과 비교">
                  {me.stats.recentDelta > 0 ? '▲' : '▼'}{Math.abs(me.stats.recentDelta)}
                </span>
              )}
            </div>
            <div className="lbl">{me.stats.recentCount > 1 ? `최근 ${me.stats.recentCount}회 평균` : '최근 점수'}</div>
          </div>
        </div>
      )}

      <button className={`primary big ${resState === 'now' ? 'pulse' : ''}`} onClick={() => { if (!name) { document.getElementById('name-input')?.focus(); return } onStart() }} title={name ? undefined : '먼저 이름을 알려주세요'}>
        {resState === 'now' ? '예약한 훈련 시작' : hasHistory ? '오늘의 훈련 시작' : '첫 훈련 시작'}
      </button>
      {me?.next && !confirmCancel && (
        <p className={`reserved-note ${resState}`}>
          {resState === 'now'
            ? '지금이 예약한 시간이에요. 지금 시작하면 연속 훈련이 이어집니다'
            : resState === 'missed'
              ? `${fmtWhen(me.next.scheduled_at)} 예약 시간이 지났어요. 지금 해도 기록은 이어집니다`
              : `${fmtWhen(me.next.scheduled_at)}에 다음 훈련이 예약되어 있어요`}
          <button className="link inline" onClick={() => setConfirmCancel(true)}>취소</button>
        </p>
      )}
      {me?.next && confirmCancel && (
        <div className="inline-confirm">
          <span>{fmtWhen(me.next.scheduled_at)} 예약을 취소할까요?</span>
          <button className="mini danger" onClick={doCancel} disabled={cancelling}>{cancelling ? '취소 중…' : '예약 취소'}</button>
          <button className="mini" onClick={() => setConfirmCancel(false)} disabled={cancelling}>유지</button>
        </div>
      )}

      {hasHistory && (
        <div className="recent">
          <div className="recent-title"><span>최근 훈련</span><span className="muted small">누르면 리포트를 다시 볼 수 있어요</span></div>
          {recent.map((s) => (
            <button key={s.id} className="recent-row" onClick={() => onOpenHistory(s.id)}>
              <span className="title"><span className={`badge ${s.domain ?? 'interview'}`}>{domainById((s.domain ?? 'interview') as DomainId).short}</span>{s.real_mode ? <span className="badge real" title="실전 모드로 훈련">실전</span> : null}{s.title}</span>
              <span className="muted small">{new Date(s.created_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}</span>
              <span className="recent-score">{s.report_status === 'pending' ? '생성 중' : s.score !== null ? <>{s.score}<span className="unit">점</span></> : '–'}</span>
            </button>
          ))}
          {recent.length < total && (
            <button className="ghost more" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? '불러오는 중…' : `더 보기 (${total - recent.length}개 남음)`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
