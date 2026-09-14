/* 서버 푸시 구독. 한 페이지에 연결 하나를 공유하고, 끊기면 자동 재연결한다. */
import { getUserKey } from './user'

export type PushMessage =
  | { type: 'scenario_progress'; stage: 'pool_hit' | 'generating' | 'done' | 'pool_refilled' | 'failed'; domain: string }
  | { type: 'live_update'; from: string; at: number; metrics?: Record<string, unknown>; turn?: unknown; turns?: unknown[]; phase?: string; title?: string; counterpart?: string; elapsedMs?: number; ended?: boolean; left?: boolean; name?: string; current?: string; interim?: string }
  | { type: 'hello'; serverTime: number }
  | { type: 'pong' }
  | { type: 'admin_update'; entries: LiveEntry[] }
  | { type: 'admin_denied' }
  | { type: 'report_queued'; sessionId: number }
  | { type: 'report_started'; sessionId: number; model: string }
  | { type: 'report_done'; sessionId: number; model: string; report: unknown }
  | { type: 'report_failed'; sessionId: number; willRetry: boolean }

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
  sessionId?: number
  name?: string
  left?: boolean
}

type Listener = (m: PushMessage) => void
let adminToken: string | null = null

let socket: WebSocket | null = null
let retryMs = 1000
const listeners = new Set<Listener>()
let pingTimer: number | null = null

function url() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}/ws`
}

let spectating: string | null = null
const pending: string[] = [] // 연결 전에 보낸 live 메시지. 연결되면 순서대로 전송 (최대 20개)

function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return
  const ws = new WebSocket(url())
  socket = ws
  ws.onopen = () => {
    retryMs = 1000
    ws.send(JSON.stringify({ type: 'subscribe', userKey: getUserKey() }))
    if (spectating) ws.send(JSON.stringify({ type: 'spectate', userKey: spectating }))
    if (adminToken) ws.send(JSON.stringify({ type: 'admin', token: adminToken }))
    while (pending.length) ws.send(pending.shift()!)
    if (pingTimer) window.clearInterval(pingTimer)
    pingTimer = window.setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: 'ping' })), 25_000)
  }
  ws.onmessage = (e) => {
    try {
      const m = JSON.parse(e.data) as PushMessage
      for (const l of listeners) l(m)
    } catch {
      /* 무시 */
    }
  }
  ws.onclose = () => {
    if (pingTimer) window.clearInterval(pingTimer)
    pingTimer = null
    socket = null
    if (listeners.size > 0) window.setTimeout(connect, retryMs)
    retryMs = Math.min(retryMs * 2, 15_000)
  }
  ws.onerror = () => ws.close()
}

/** 구독 시작. 반환된 함수로 해제. 마지막 구독자가 빠지면 연결도 닫는다. */
export function subscribe(l: Listener): () => void {
  listeners.add(l)
  connect()
  return () => {
    listeners.delete(l)
    if (listeners.size === 0) {
      socket?.close()
      socket = null
    }
  }
}

/** 세션 진행 상황을 서버로 보낸다. 연결돼 있을 때만. 성공 여부 반환 */
export function sendLive(data: Record<string, unknown>): boolean {
  const payload = JSON.stringify({ type: 'live', ...data })
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    pending.push(payload)
    if (pending.length > 20) pending.shift()
    connect()
    return true // 연결되면 전송된다
  }
  socket.send(payload)
  return true
}

/** 다른 사용자의 진행 상황을 본다 (관전). 반환 함수로 해제 */
export function spectate(userKey: string, l: Listener): () => void {
  spectating = userKey
  const un = subscribe(l)
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'spectate', userKey }))
  return () => {
    spectating = null
    un()
  }
}

/** 관리자 구독: 진행 중 훈련 목록을 실시간으로 받는다 */
export function subscribeAdmin(token: string, l: Listener): () => void {
  adminToken = token
  const un = subscribe(l)
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'admin', token }))
  return () => {
    adminToken = null
    un()
  }
}
