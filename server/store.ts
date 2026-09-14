import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise'
import { pool } from './db'
import { redis, keys } from './redis'

export interface SessionRow {
  id: number
  domain: string
  title: string
  score: number | null
  eye_contact: number
  duration_ms: number
  report_status: 'pending' | 'done' | 'failed'
  created_at: string
}

export async function touchUser(userKey: string, nickname?: string) {
  if (!pool) return
  await pool.query(
    `INSERT INTO users (user_key, nickname) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE last_seen = CURRENT_TIMESTAMP, nickname = COALESCE(?, nickname)`,
    [userKey, nickname ?? null, nickname ?? null],
  )
}

/** 같은 clientId로 이미 저장된 세션이 있으면 그 id를 돌려준다 (중복 저장 방지). */
export async function findSessionByClientId(userKey: string, clientId: string): Promise<number | null> {
  if (!pool || !clientId) return null
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT id FROM sessions WHERE client_id = ? AND user_key = ?`, [clientId, userKey])
  return rows[0]?.id ?? null
}

/** 이력서·공고 원문은 기록에 남기지 않는다 (개인정보). 길이만 표시로 남기고, 요약은 scenario.resumeSummary 에 있다.
 *  setup.fields 와 scenario.fields(서버가 시나리오 응답에 붙여 준 입력값) 둘 다 적용 */
function stripDocs<T extends { fields?: Record<string, string> } | undefined>(obj: T): T {
  const f = obj?.fields
  if (!obj || !f || (!f.jd && !f.resume)) return obj
  const fields = { ...f }
  if (fields.jd) fields.jd = `[채용 공고 ${String(fields.jd).replace(/\s/g, '').length}자 제공됨 · 원문 미저장]`
  if (fields.resume) fields.resume = `[이력서 ${String(fields.resume).replace(/\s/g, '').length}자 제공됨 · 원문 미저장]`
  return { ...obj, fields }
}

export async function saveSession(userKey: string, log: any, report: any | null, reportModel: string | null, status: 'pending' | 'done' | 'failed' = 'done'): Promise<number | null> {
  if (!pool) return null
  const clientId = typeof log?.clientId === 'string' ? log.clientId.slice(0, 64) : null
  if (clientId) {
    const existing = await findSessionByClientId(userKey, clientId)
    if (existing) return existing
  }
  const [r] = await pool.query<ResultSetHeader>(
    `INSERT INTO sessions (user_key, domain, title, setup, scenario, turns, events, overall, duration_ms, eye_contact, score, report, report_model, report_status, client_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userKey,
      String(log?.setup?.domain ?? 'interview').slice(0, 30),
      String(log?.scenario?.title ?? '').slice(0, 200),
      JSON.stringify(stripDocs(log.setup ?? {})),
      JSON.stringify(stripDocs(log.scenario ?? {})),
      JSON.stringify(log.turns ?? []),
      JSON.stringify(log.events ?? []),
      JSON.stringify(log.overall ?? {}),
      Number(log.durationMs ?? 0),
      Math.max(0, Math.min(100, Math.round(log?.overall?.eyeContactPct ?? 0))),
      report?.score ?? null,
      report ? JSON.stringify(report) : null,
      reportModel,
      status,
      clientId,
    ],
  )
  const id = r.insertId
  // 예약 이행 처리: 예약 시각 ±90분 안에 훈련했으면 이행으로 기록
  await pool.query(
    `UPDATE reservations SET fulfilled_session_id = ?, fulfilled_at = CURRENT_TIMESTAMP
     WHERE user_key = ? AND fulfilled_at IS NULL
       AND scheduled_at BETWEEN DATE_SUB(NOW(), INTERVAL 90 MINUTE) AND DATE_ADD(NOW(), INTERVAL 90 MINUTE)
     ORDER BY scheduled_at LIMIT 1`,
    [id, userKey],
  )
  await redis?.del(keys.streak(userKey))
  return id
}

/** 워커용: 사용자 필터 없이 세션 원본을 읽는다. */
export async function getSessionById(id: number) {
  if (!pool) return null
  // 관리자 상세: 훈련자 이름(users.nickname)을 함께 돌려준다
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT s.*, u.nickname FROM sessions s LEFT JOIN users u ON u.user_key = s.user_key WHERE s.id = ?`, [id])
  return rows[0] ?? null
}

export async function updateSessionReport(id: number, report: any | null, model: string | null, status: 'done' | 'failed') {
  if (!pool) return
  await pool.query(
    `UPDATE sessions SET report = ?, score = ?, report_model = ?, report_status = ? WHERE id = ?`,
    [report ? JSON.stringify(report) : null, report?.score ?? null, model, status, id],
  )
}

export async function listSessions(userKey: string, limit = 10, offset = 0): Promise<SessionRow[]> {
  if (!pool) return []
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, domain, title, score, eye_contact, duration_ms, report_status, created_at,
            JSON_EXTRACT(setup, '$.realMode') AS real_mode FROM sessions
     WHERE user_key = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [userKey, limit, offset],
  )
  return rows as SessionRow[]
}

/** 관리자용: 전체 사용자의 최근 세션 */
export async function listAllSessions(limit = 30, offset = 0) {
  if (!pool) return { items: [] as RowDataPacket[], total: 0 }
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT s.id, s.user_key, u.nickname, s.domain, s.title, s.score, s.eye_contact, s.duration_ms, s.report_status, s.created_at,
            JSON_EXTRACT(s.setup, '$.realMode') AS real_mode
     FROM sessions s LEFT JOIN users u ON u.user_key = s.user_key
     ORDER BY s.created_at DESC, s.id DESC LIMIT ? OFFSET ?`,
    [limit, offset],
  )
  const [[c]] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM sessions`)
  return { items: rows, total: Number(c.total) }
}

export async function getSession(userKey: string, id: number) {
  if (!pool) return null
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM sessions WHERE id = ? AND user_key = ?`, [id, userKey])
  return rows[0] ?? null
}

/** 연속 훈련 일수: 오늘(또는 어제)부터 거슬러 하루도 빠지지 않은 날 수. KST 기준. */
export async function getStreak(userKey: string): Promise<number> {
  if (!pool) return 0
  const cached = await redis?.get(keys.streak(userKey))
  if (cached !== null && cached !== undefined) return Number(cached)
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT DATE(CONVERT_TZ(created_at, '+00:00', '+09:00')) AS d FROM sessions WHERE user_key = ? ORDER BY d DESC LIMIT 400`,
    [userKey],
  )
  const days = rows.map((r) => new Date(r.d as string).getTime())
  const DAY = 86_400_000
  const todayKst = Math.floor((Date.now() + 9 * 3_600_000) / DAY) * DAY
  let streak = 0
  let cursor = todayKst
  const set = new Set(days.map((d) => Math.floor((d + 9 * 3_600_000) / DAY) * DAY))
  // 오늘 안 했으면 어제부터 센다 (오늘 하면 이어짐)
  if (!set.has(cursor)) cursor -= DAY
  while (set.has(cursor)) {
    streak++
    cursor -= DAY
  }
  await redis?.set(keys.streak(userKey), String(streak), 'EX', 3600)
  return streak
}

export async function createReservation(userKey: string, scheduledAt: Date, sourceSessionId: number | null) {
  if (!pool) return null
  // 같은 사용자의 미이행 예약은 하나만 유지
  await pool.query(`DELETE FROM reservations WHERE user_key = ? AND fulfilled_at IS NULL`, [userKey])
  const [r] = await pool.query<ResultSetHeader>(
    `INSERT INTO reservations (user_key, scheduled_at, source_session_id) VALUES (?, ?, ?)`,
    [userKey, scheduledAt, sourceSessionId],
  )
  return r.insertId
}

export async function cancelReservation(userKey: string, id: number): Promise<boolean> {
  if (!pool) return false
  const [r] = await pool.query<ResultSetHeader>(`DELETE FROM reservations WHERE id = ? AND user_key = ? AND fulfilled_at IS NULL`, [id, userKey])
  return r.affectedRows > 0
}

export async function getNextReservation(userKey: string) {
  if (!pool) return null
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, scheduled_at, created_at FROM reservations
     WHERE user_key = ? AND fulfilled_at IS NULL AND scheduled_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
     ORDER BY scheduled_at LIMIT 1`,
    [userKey],
  )
  return rows[0] ?? null
}

/** 홈 지표. recentAvg = 점수가 있는 최근 5회 평균, recentDelta = 그 직전 5회 평균과의 차이(비교 대상이 없으면 null) */
export async function getStats(userKey: string) {
  if (!pool) return { total: 0, recentAvg: null, recentDelta: null, recentCount: 0 }
  const [[t]] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM sessions WHERE user_key = ?`, [userKey])
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT score FROM sessions WHERE user_key = ? AND score IS NOT NULL ORDER BY created_at DESC, id DESC LIMIT 10`,
    [userKey],
  )
  const scores = rows.map((r) => Number(r.score))
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null)
  const recent = scores.slice(0, 5)
  const prev = scores.slice(5, 10)
  const recentAvg = avg(recent)
  const prevAvg = avg(prev)
  return {
    total: Number(t.total),
    recentAvg,
    recentDelta: recentAvg !== null && prevAvg !== null ? recentAvg - prevAvg : null,
    recentCount: recent.length,
  }
}

// ---------- 시나리오 프리페치 (Redis) ----------
export async function popScenario(hash: string): Promise<any | null> {
  if (!redis) return null
  const s = await redis.lpop(keys.scenarioPool(hash))
  return s ? JSON.parse(s) : null
}

export async function pushScenario(hash: string, scenario: any) {
  if (!redis) return
  const k = keys.scenarioPool(hash)
  await redis.rpush(k, JSON.stringify(scenario))
  await redis.expire(k, 6 * 3600)
}

export async function poolSize(hash: string) {
  if (!redis) return 0
  return redis.llen(keys.scenarioPool(hash))
}

/** 프리페치 잠금. true면 이 프로세스가 채우기 담당. */
export async function acquireFill(hash: string) {
  if (!redis) return false
  const ok = await redis.set(keys.scenarioFilling(hash), '1', 'EX', 60, 'NX')
  return ok === 'OK'
}
export async function releaseFill(hash: string) {
  await redis?.del(keys.scenarioFilling(hash))
}

export async function setLive(userKey: string, data: Record<string, string | number>) {
  if (!redis) return
  const k = keys.live(userKey)
  if (data.phase === '시작') await redis.del(k) // 이전 훈련의 ended·turns 같은 필드가 남지 않게
  await redis.hset(k, { ...data, updatedAt: Date.now() })
  await redis.expire(k, 600)
}
export async function getLive(userKey: string) {
  if (!redis) return null
  const h = await redis.hgetall(keys.live(userKey))
  return Object.keys(h).length ? h : null
}

// ---------- TTS 캐시 (Redis, base64 mp3, 24h) ----------
export async function getTtsCache(key: string): Promise<Buffer | null> {
  if (!redis) return null
  const b64 = await redis.get(key)
  return b64 ? Buffer.from(b64, 'base64') : null
}
export async function setTtsCache(key: string, buf: Buffer) {
  if (!redis) return
  await redis.set(key, buf.toString('base64'), 'EX', 24 * 3600)
}
