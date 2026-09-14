/* WebSocket 푸시. 클라이언트가 userKey로 구독하면 그 사용자의 리포트 진행 상태를 서버가 밀어준다.
 * 경로 /ws. Vite 프록시(ws: true)와 ngrok 모두 통과한다. */
import type { Server } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'

export type PushMessage =
  | { type: 'scenario_progress'; stage: 'pool_hit' | 'generating' | 'done' | 'pool_refilled' | 'failed'; domain: string }
  | { type: 'live_update'; from: string; at: number; metrics?: Record<string, unknown>; turn?: unknown; turns?: unknown[]; phase?: string; title?: string; counterpart?: string; ended?: boolean; elapsedMs?: number }
  | { type: 'report_queued'; sessionId: number }
  | { type: 'report_started'; sessionId: number; model: string }
  | { type: 'report_done'; sessionId: number; model: string; report: unknown }
  | { type: 'report_failed'; sessionId: number; willRetry: boolean }
  | { type: 'hello'; serverTime: number }
  | { type: 'admin_update'; entries: LiveEntry[] }
  | { type: 'admin_denied' }

const ADMIN_TOKEN = process.env.REHEARSAL_ADMIN_TOKEN ?? 'rehearsal'

/** 진행 중(또는 방금 끝난) 훈련. WS live 메시지로 갱신되고 10분 무신호면 사라진다. */
export interface LiveEntry {
  userKey: string
  title?: string
  counterpart?: string
  domain?: string
  phase?: string
  elapsedMs?: number
  metrics?: Record<string, unknown>
  startedAt: number
  lastAt: number
  ended: boolean
  endedAt?: number
  score?: number
  headline?: string
  reportStatus?: 'writing' | 'done' | 'failed'
  sessionId?: number // 저장된 세션 id (리포트 큐잉 이후 채워짐) — 관리자 화면에서 클릭해 리포트를 본다
  name?: string // 훈련자 이름 (홈에서 입력). 관리자·관전 화면 표시용
}
const liveEntries = new Map<string, LiveEntry>()
const admins = new Set<WebSocket>()
let adminTimer: NodeJS.Timeout | null = null

export function listLive(): LiveEntry[] {
  const now = Date.now()
  for (const [k, e] of liveEntries) if (now - e.lastAt > 10 * 60_000) liveEntries.delete(k)
  return [...liveEntries.values()].sort((a, b) => Number(a.ended) - Number(b.ended) || b.lastAt - a.lastAt)
}

function touchLive(userKey: string, data: Record<string, unknown>) {
  const now = Date.now()
  const prev = liveEntries.get(userKey)
  const startingNew = !prev || (prev.ended && !data.ended)
  const e: LiveEntry = startingNew ? { userKey, startedAt: now, lastAt: now, ended: false } : prev!
  if (typeof data.title === 'string') e.title = data.title
  if (typeof data.name === 'string' && data.name.trim()) e.name = data.name.trim()
  if (typeof data.counterpart === 'string') e.counterpart = data.counterpart
  if (typeof data.domain === 'string') e.domain = data.domain
  if (typeof data.phase === 'string') e.phase = data.phase
  if (typeof data.elapsedMs === 'number') e.elapsedMs = data.elapsedMs
  if (data.metrics && typeof data.metrics === 'object') e.metrics = data.metrics as Record<string, unknown>
  if (data.ended === true) { e.ended = true; e.endedAt = now; e.reportStatus = e.reportStatus ?? 'writing' }
  e.lastAt = now
  liveEntries.set(userKey, e)
  scheduleAdminBroadcast()
}

/** 끝난 훈련 항목을 메모리 레지스트리에서 지운다 (진행 중은 유지). 데이터 초기화·시연 직전 정리용. 지운 개수 반환 */
export function clearEndedLive(): number {
  let n = 0
  for (const [k, e] of liveEntries) if (e.ended) { liveEntries.delete(k); n++ }
  if (n) scheduleAdminBroadcast()
  return n
}

function scheduleAdminBroadcast() {
  if (adminTimer || admins.size === 0) return
  adminTimer = setTimeout(() => {
    adminTimer = null
    const payload = JSON.stringify({ type: 'admin_update', entries: listLive() })
    for (const ws of admins) if (ws.readyState === WebSocket.OPEN) ws.send(payload)
  }, 400)
}

export function isAdminToken(t: unknown) {
  return typeof t === 'string' && t === ADMIN_TOKEN
}

const subs = new Map<string, Set<WebSocket>>() // userKey → sockets (본인)
const spectators = new Map<string, Set<WebSocket>>() // userKey → 관전자 sockets
let onLive: ((userKey: string, data: Record<string, unknown>) => void) | null = null

/** 라이브 지표가 들어올 때 호출할 훅 (Redis 저장 등) */
export function setLiveHandler(fn: (userKey: string, data: Record<string, unknown>) => void) {
  onLive = fn
}

export function initRealtime(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' })
  wss.on('connection', (ws) => {
    let userKey: string | null = null
    let watching: string | null = null
    let isAdmin = false
    ws.send(JSON.stringify({ type: 'hello', serverTime: Date.now() } satisfies PushMessage))
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as { type: string; userKey?: string; [k: string]: unknown }
        if (msg.type === 'subscribe' && msg.userKey) {
          if (userKey) subs.get(userKey)?.delete(ws)
          userKey = msg.userKey
          if (!subs.has(userKey)) subs.set(userKey, new Set())
          subs.get(userKey)!.add(ws)
        } else if (msg.type === 'spectate' && msg.userKey) {
          // 다른 사용자의 진행 상황을 본다 (발표용 관전 화면)
          if (watching) spectators.get(watching)?.delete(ws)
          watching = msg.userKey
          if (!spectators.has(watching)) spectators.set(watching, new Set())
          spectators.get(watching)!.add(ws)
        } else if (msg.type === 'admin') {
          if (isAdminToken(msg.token)) {
            isAdmin = true
            admins.add(ws)
            ws.send(JSON.stringify({ type: 'admin_update', entries: listLive() } satisfies PushMessage))
          } else {
            ws.send(JSON.stringify({ type: 'admin_denied' } satisfies PushMessage))
          }
        } else if (msg.type === 'live' && userKey) {
          // 세션 진행 중 지표·대사·상태. Redis에 저장하고 관전자에게 중계, 관리자 목록 갱신
          const { type: _t, ...data } = msg
          void _t
          onLive?.(userKey, data)
          touchLive(userKey, data)
          const out: PushMessage = { type: 'live_update', from: userKey, at: Date.now(), ...(data as object) }
          const set = spectators.get(userKey)
          if (set) {
            const payload = JSON.stringify(out)
            for (const w of set) if (w.readyState === WebSocket.OPEN) w.send(payload)
          }
        } else if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }))
        }
      } catch {
        /* 무시 */
      }
    })
    ws.on('close', () => {
      if (userKey) {
        const set = subs.get(userKey)
        set?.delete(ws)
        if (set && set.size === 0) subs.delete(userKey)
      }
      if (watching) {
        const set = spectators.get(watching)
        set?.delete(ws)
        if (set && set.size === 0) spectators.delete(watching)
      }
      if (isAdmin) admins.delete(ws)
    })
  })
  console.log('[ws] realtime on /ws')
  return wss
}

/** 해당 사용자의 모든 연결에 전송. 리포트 이벤트는 그 사용자를 관전하는 화면에도 보낸다. 연결이 없으면 조용히 무시 (폴링이 폴백). */
export function notify(userKey: string, msg: PushMessage) {
  const data = JSON.stringify(msg)
  for (const ws of subs.get(userKey) ?? []) if (ws.readyState === WebSocket.OPEN) ws.send(data)
  if (msg.type.startsWith('report_')) {
    for (const ws of spectators.get(userKey) ?? []) if (ws.readyState === WebSocket.OPEN) ws.send(data)
    // 관리자 목록에 리포트 상태·점수 반영
    const e = liveEntries.get(userKey)
    if (e) {
      if (msg.type === 'report_started' || msg.type === 'report_queued') { e.reportStatus = 'writing'; e.sessionId = msg.sessionId }
      if (msg.type === 'report_done' || msg.type === 'report_failed') e.sessionId = msg.sessionId
      if (msg.type === 'report_done') {
        const r = msg.report as { score?: number; headline?: string }
        e.reportStatus = 'done'; e.score = r?.score; e.headline = r?.headline
      }
      if (msg.type === 'report_failed' && !msg.willRetry) e.reportStatus = 'failed'
      e.lastAt = Date.now()
      scheduleAdminBroadcast()
    }
  }
}

export function subscriberCount() {
  let n = 0
  for (const s of subs.values()) n += s.size
  for (const s of spectators.values()) n += s.size
  return n
}
