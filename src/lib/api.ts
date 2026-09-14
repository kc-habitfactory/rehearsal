import type { NonverbalEvent, NonverbalSummary, Report, Scenario, SessionLog, SetupInput, Turn } from './types'
import { getUserKey } from './user'
import { sendLive } from './ws'

export async function health(): Promise<{ ok: boolean; mode: 'claude' | 'mock'; model: string; db: string | null; redis: number | null; mq: string | null; tts: { model: string; voice: string } | null }> {
  const r = await fetch('/api/health')
  return r.json()
}

export async function createScenario(input: SetupInput): Promise<Scenario & { fromPool?: boolean }> {
  const r = await fetch('/api/scenario', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, userKey: getUserKey() }),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

/** 면접관 응답을 SSE로 받는다. onDelta로 조각이 오고, 끝나면 전체 텍스트를 resolve. */
export async function streamTurn(
  scenario: Scenario,
  history: Pick<Turn, 'role' | 'text'>[],
  onDelta: (t: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const r = await fetch('/api/turn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario, history, domain: scenario.domain }),
    signal,
  })
  if (!r.ok || !r.body) throw new Error(await r.text())
  const reader = r.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let full = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let idx
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      const isEvent = chunk.startsWith('event:')
      if (isEvent) {
        if (chunk.startsWith('event: error')) throw new Error(chunk)
        continue
      }
      const line = chunk.split('\n').find((l) => l.startsWith('data:'))
      if (!line) continue
      const delta = JSON.parse(line.slice(5).trim()) as string
      full += delta
      onDelta(delta)
    }
  }
  return full
}

export type ReportResponse = (Report & { sessionId?: number; queued?: false }) | { queued: true; sessionId: number }

export async function createReport(log: SessionLog): Promise<ReportResponse> {
  const r = await fetch('/api/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...log, userKey: getUserKey() }),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

// ---------- 기록 ----------
export interface Me {
  enabled: boolean
  streak: number
  stats: { total: number; recentAvg: number | null; recentDelta: number | null; recentCount: number }
  next: { id: number; scheduled_at: string } | null
  recent: { id: number; domain?: string; title: string; score: number | null; eye_contact: number; duration_ms: number; report_status?: 'pending' | 'done' | 'failed'; created_at: string; real_mode?: boolean | number | null }[]
}

export async function fetchMe(nickname?: string | null): Promise<Me> {
  const q = new URLSearchParams({ user: getUserKey() })
  if (nickname) q.set('nickname', nickname)
  const r = await fetch(`/api/me?${q}`)
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function createReservation(scheduledAt: Date, sourceSessionId?: number): Promise<{ id: number; scheduledAt: string }> {
  const r = await fetch('/api/reservations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userKey: getUserKey(), scheduledAt: scheduledAt.toISOString(), sourceSessionId }),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function cancelReservation(id: number): Promise<boolean> {
  const r = await fetch(`/api/reservations/${id}?user=${encodeURIComponent(getUserKey())}`, { method: 'DELETE' })
  if (!r.ok) throw new Error(await r.text())
  return (await r.json()).ok
}

export function postLive(data: Record<string, unknown>) {
  // WebSocket으로 보낸다 (관전자에게 실시간 중계 + 서버가 Redis 저장). 연결이 없으면 HTTP 폴백
  if (!sendLive(data)) {
    void fetch('/api/live', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userKey: getUserKey(), ...data }),
      keepalive: true,
    }).catch(() => {})
  }
}

export interface SessionDetail {
  id: number
  title: string
  setup: SetupInput
  scenario: Scenario
  turns: Turn[]
  events: NonverbalEvent[]
  overall: NonverbalSummary
  duration_ms: number
  eye_contact: number
  score: number | null
  report: Report | null
  report_model: string | null
  report_status: 'pending' | 'done' | 'failed'
  created_at: string
  user_key?: string
  nickname?: string | null
}

export type SessionListItem = Me['recent'][number]

export async function fetchSessions(offset: number, limit = 10): Promise<{ items: SessionListItem[]; total: number }> {
  const q = new URLSearchParams({ user: getUserKey(), offset: String(offset), limit: String(limit) })
  const r = await fetch(`/api/sessions?${q}`)
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function fetchSession(id: number, adminToken?: string): Promise<SessionDetail> {
  // 관리자 토큰이 있으면 본인 것이 아닌 세션도 조회한다 (관리자 화면)
  const r = adminToken
    ? await fetch(`/api/admin/sessions/${id}`, { headers: { 'x-admin-token': adminToken } })
    : await fetch(`/api/sessions/${id}?user=${encodeURIComponent(getUserKey())}`)
  if (!r.ok) throw new Error(await r.text())
  const row = await r.json()
  // mysql2는 JSON 컬럼을 객체로 돌려주지만, 문자열로 올 경우도 대비
  const j = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v)
  return { ...row, setup: j(row.setup), scenario: j(row.scenario), turns: j(row.turns), events: j(row.events), overall: j(row.overall), report: j(row.report) }
}
