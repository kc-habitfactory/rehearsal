import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import Anthropic from '@anthropic-ai/sdk'
import { createHash } from 'node:crypto'
import { initDb, DB_DATABASE } from './db'
import { initRedis, REDIS_DB } from './redis'
import * as store from './store'
import { initMq, mqReady, publish, consume, QUEUE, type Job } from './mq'
import { getDomain, findDomain, DOMAIN_PROMPTS, buildDesignerSystem, buildCounterpartSystem, buildCoachSystem, TTS_INSTRUCTIONS_EN_DEFAULT } from './domains'
import { initRealtime, notify, subscriberCount, setLiveHandler, handleLive, listLive, clearEndedLive, isAdminToken } from './realtime'

const PORT = Number(process.env.PORT ?? 8787)
// 역할별 모델. 상대(면접관·발신자) 턴은 지연이 중요해서 빠른 모델, 리포트는 품질이 중요해서 상위 모델.
const TURN_MODEL = process.env.REHEARSAL_TURN_MODEL ?? 'claude-sonnet-4-6'
const SCENARIO_MODEL = process.env.REHEARSAL_SCENARIO_MODEL ?? 'claude-opus-4-8'
const REPORT_MODEL = process.env.REHEARSAL_REPORT_MODEL ?? 'claude-fable-5'
const REPORT_FALLBACK_MODEL = 'claude-opus-4-8'
// 음성 합성. 프록시의 OpenAI 호환 /v1/audio/speech 사용. 'browser'면 클라이언트 내장 음성.
const TTS_MODE = (process.env.REHEARSAL_TTS ?? 'server') as 'server' | 'browser'
const TTS_MODEL = process.env.REHEARSAL_TTS_MODEL ?? 'gpt-4o-mini-tts'
const TTS_VOICE = process.env.REHEARSAL_TTS_VOICE ?? 'nova'
const TTS_INSTRUCTIONS = process.env.REHEARSAL_TTS_INSTRUCTIONS ?? '차분하고 또렷한 한국어. 자연스러운 속도로, 문장 끝을 분명하게.'

const hasKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)
// ANTHROPIC_BASE_URL이 있으면 사내 LiteLLM 프록시(llm.signalplanner.ai)로 간다.
const client = hasKey ? new Anthropic({ baseURL: process.env.ANTHROPIC_BASE_URL || undefined }) : null

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

let dbReady = false
let redisReady = false
let mqOn = false

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    mode: client ? 'claude' : 'mock',
    model: `${TURN_MODEL} / ${REPORT_MODEL}`,
    models: { turn: TURN_MODEL, scenario: SCENARIO_MODEL, report: REPORT_MODEL },
    baseURL: process.env.ANTHROPIC_BASE_URL ?? 'api.anthropic.com',
    db: dbReady ? DB_DATABASE : null,
    redis: redisReady ? REDIS_DB : null,
    mq: mqOn && mqReady() ? QUEUE : null,
    wsClients: subscriberCount(),
    tts: client && TTS_MODE === 'server' ? { model: TTS_MODEL, voice: TTS_VOICE, byDomain: Object.fromEntries(Object.values(DOMAIN_PROMPTS).filter((d) => d.voice).map((d) => [d.id, d.voice!.voice])) } : null,
  })
})

// ---------- 시나리오 생성 ----------
const POOL_TARGET = 2 // 설정별로 미리 만들어 둘 시나리오 수

function setupHash(domainId: string, input: string) {
  return createHash('sha1').update(`${SCENARIO_MODEL}|${domainId}|${input}`).digest('hex').slice(0, 16)
}

/** 긴 문서(공고·이력서·기획 문서)가 붙은 요청인지. 매번 고유하므로 풀을 채우지 않고 출력 토큰도 넉넉히 */
const hasDocs = (f: Record<string, string>) => ['jd', 'resume', 'spec', 'guide'].some((k) => (f[k] ?? '').trim().length > 0)

async function generateScenario(domainId: string, input: string, fields: Record<string, string> = {}) {
  // 공고·이력서가 붙으면 요약·요구사항·커버리지 계획까지 나와 출력이 길다. 1500이면 잘려서 opening이 사라진다
  const long = hasDocs(fields)
  const msg = await client!.messages.create({
    model: SCENARIO_MODEL,
    max_tokens: long ? 4000 : 2000,
    output_config: { effort: 'low' },
    system: buildDesignerSystem(getDomain(domainId), fields),
    messages: [{ role: 'user', content: input }],
  })
  if (msg.stop_reason === 'max_tokens') console.warn('[scenario] output hit max_tokens')
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
  const sc = await parseJsonWithRepair(text)
  for (const k of ['title', 'opening', 'hiddenPlan'] as const) {
    if (typeof sc?.[k] !== 'string' || !sc[k].trim()) throw new Error(`scenario missing "${k}" (stop_reason=${msg.stop_reason})`)
  }
  if (typeof sc?.interviewer?.name !== 'string') throw new Error('scenario missing interviewer.name')
  return sc
}

/** 모델이 낸 JSON을 파싱한다. 문자열 안의 쌍따옴표 같은 문법 오류면 빠른 모델로 문법만 고쳐 한 번 더 시도한다 */
async function parseJsonWithRepair(text: string): Promise<any> {
  const raw = extractJson(text)
  try {
    return JSON.parse(raw)
  } catch (e) {
    console.warn('[scenario] JSON parse failed, repairing:', String(e).slice(0, 120))
    const fix = await client!.messages.create({
      model: TURN_MODEL,
      max_tokens: 6000,
      system: '아래는 문법 오류가 있는 JSON이다. 내용은 한 글자도 바꾸지 말고 문법만 고쳐서(문자열 안의 쌍따옴표는 홑따옴표로, 누락된 쉼표·괄호 보정) 유효한 JSON 하나만 출력한다. 설명·코드 펜스 금지.',
      messages: [{ role: 'user', content: raw }],
    })
    const fixed = fix.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
    return JSON.parse(extractJson(fixed))
  }
}

/** 배경에서 풀을 채운다. 잠금으로 중복 생성을 막는다. */
async function refillPool(hash: string, domainId: string, input: string, fields: Record<string, string>, userKey?: string) {
  if (!client || !redisReady) return
  if (!(await store.acquireFill(hash))) return
  try {
    let added = 0
    while ((await store.poolSize(hash)) < POOL_TARGET) {
      const sc = await generateScenario(domainId, input, fields)
      await store.pushScenario(hash, sc)
      console.log(`[scenario] pool ${hash} +1 → ${await store.poolSize(hash)}`)
      if (TTS_MODE === 'server' && sc?.opening) void synthesize(sc.opening, domainId).catch(() => {}) // 첫 대사 음성 미리 캐시
      added++
    }
    if (added > 0 && userKey) notify(userKey, { type: 'scenario_progress', stage: 'pool_refilled', domain: domainId })
  } catch (e) {
    console.warn('[scenario] refill failed:', String(e))
  } finally {
    await store.releaseFill(hash)
  }
}

app.post('/api/scenario', async (req, res) => {
  const body = req.body ?? {}
  // 구버전 클라이언트 호환: {role, company, ...} 평면 입력도 받는다
  const domainId: string = body.domain ?? 'interview'
  const fields: Record<string, string> = body.fields ?? { role: body.role, company: body.company, stage: body.stage, years: body.years }
  const dom = getDomain(domainId)
  const input = dom.describeInput(fields) + (fields.name?.trim() ? `\n훈련자 이름: ${fields.name.trim()}` : '')
  const userKey: string | undefined = body.userKey
  const push = (stage: 'pool_hit' | 'generating' | 'done' | 'failed') => userKey && notify(userKey, { type: 'scenario_progress', stage, domain: dom.id })
  if (!client) return res.json({ ...dom.mockScenario(fields), domain: dom.id, fields })
  const hash = setupHash(dom.id, input)
  try {
    const cached = await store.popScenario(hash)
    if (cached) {
      push('pool_hit')
      res.json({ ...cached, domain: dom.id, fields, fromPool: true })
    } else {
      push('generating')
      res.json({ ...(await generateScenario(dom.id, input, fields)), domain: dom.id, fields })
      push('done')
    }
    // 공고·이력서가 붙은 요청은 매번 고유하므로 풀을 미리 채우지 않는다 (opus 호출 낭비)
    if (!hasDocs(fields)) void refillPool(hash, dom.id, input, fields, userKey)
  } catch (e) {
    console.error(e)
    push('failed')
    res.status(500).json({ error: String(e) })
  }
})

// ---------- 상대 응답 (SSE 스트리밍) ----------
app.post('/api/turn', async (req, res) => {
  const { scenario, history, domain } = req.body as {
    scenario: { interviewer: { name: string; style: string }; hiddenPlan: string; title: string; domain?: string; fields?: Record<string, string> }
    history: { role: 'user' | 'interviewer'; text: string }[]
    domain?: string
  }
  const dom = getDomain(domain ?? scenario?.domain)
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  const send = (data: string) => res.write(`data: ${JSON.stringify(data)}\n\n`)

  if (!client) {
    const n = history.filter((h) => h.role === 'user').length
    const canned = dom.mockTurns
    const text = canned[Math.min(n - 1, canned.length - 1)] ?? canned[0]
    for (const ch of text.match(/.{1,6}/g) ?? [text]) {
      send(ch)
      await new Promise((r) => setTimeout(r, 40))
    }
    res.write('event: done\ndata: {}\n\n')
    return res.end()
  }

  try {
    const messages = history.map((h) => ({
      role: h.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: h.text,
    }))
    const stream = client.messages.stream({
      model: TURN_MODEL,
      max_tokens: 300,
      system: buildCounterpartSystem(dom, scenario),
      messages,
    })
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') send(event.delta.text)
    }
    res.write('event: done\ndata: {}\n\n')
    res.end()
  } catch (e) {
    console.error(e)
    res.write(`event: error\ndata: ${JSON.stringify(String(e))}\n\n`)
    res.end()
  }
})

// ---------- 피드백 리포트 ----------
/** 리포트 한 번 생성 (모델 폴백 포함). 동기 경로와 워커가 함께 쓴다. */
async function generateReport(log: any): Promise<{ report: any; model: string }> {
  const dom = getDomain(log?.setup?.domain ?? log?.scenario?.domain)
  const reportSys = buildCoachSystem(dom, log)
  const run = async (model: string) => {
    const msg = await client!.messages.create({
      model,
      max_tokens: 6000, // 항목별 배점·말투·커버리지까지 나와 길다. 잘리면 뒷부분(배점·다음 훈련)이 사라진다
      system: reportSys,
      messages: [{ role: 'user', content: JSON.stringify(log) }],
    })
    if (msg.stop_reason === 'refusal') throw new Error(`refusal:${msg.stop_details?.category ?? ''}`)
    if (msg.stop_reason === 'max_tokens') console.warn('[report] output hit max_tokens')
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
    const rep = await parseJsonWithRepair(text)
    // 잘린 출력은 복구 과정에서 뒷부분이 사라진다. 필수 필드가 없으면 실패로 처리해 재시도(폴백 모델)로 넘긴다
    if (typeof rep?.score !== 'number' || !rep?.headline || !Array.isArray(rep?.strengths) || !Array.isArray(rep?.improvements) || !rep?.nextTraining) {
      throw new Error(`report incomplete (stop_reason=${msg.stop_reason}, keys=${Object.keys(rep ?? {}).join(',')})`)
    }
    return rep
  }
  try {
    return { report: await run(REPORT_MODEL), model: REPORT_MODEL }
  } catch (e) {
    console.warn(`[report] ${REPORT_MODEL} failed, falling back to ${REPORT_FALLBACK_MODEL}:`, String(e))
    return { report: await run(REPORT_FALLBACK_MODEL), model: REPORT_FALLBACK_MODEL }
  }
}

/** MQ 워커: 세션을 읽어 리포트를 만들고 DB에 채운다. 예외를 던지면 mq.ts가 재시도·DLQ 처리. */
async function handleJob(job: Job) {
  if (job.type !== 'report') return
  const row = await store.getSessionById(job.sessionId)
  if (!row) return
  if (row.report_status === 'done') return // 중복 메시지 방어
  const j = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v)
  const log = { setup: j(row.setup), scenario: j(row.scenario), turns: j(row.turns), events: j(row.events), overall: j(row.overall), durationMs: row.duration_ms }
  const t0 = Date.now()
  notify(job.userKey, { type: 'report_started', sessionId: job.sessionId, model: REPORT_MODEL })
  try {
    const { report, model } = await generateReport(log)
    await store.updateSessionReport(job.sessionId, report, model, 'done')
    console.log(`[worker] report #${job.sessionId} done in ${((Date.now() - t0) / 1000).toFixed(1)}s (${model})`)
    notify(job.userKey, { type: 'report_done', sessionId: job.sessionId, model, report })
  } catch (e) {
    const final = job.attempt >= 2
    if (final) await store.updateSessionReport(job.sessionId, null, null, 'failed')
    notify(job.userKey, { type: 'report_failed', sessionId: job.sessionId, willRetry: !final })
    throw e
  }
}

app.post('/api/report', async (req, res) => {
  const { userKey, ...log } = req.body ?? {}

  // 비동기 경로: DB + MQ가 살아 있으면 세션을 먼저 저장하고 리포트 생성은 큐에 넘긴다.
  // 사용자가 탭을 닫아도 리포트는 완성되어 기록에 남는다.
  if (client && dbReady && mqOn && mqReady() && userKey) {
    try {
      await store.touchUser(userKey)
      const existing = typeof log?.clientId === 'string' ? await store.findSessionByClientId(userKey, log.clientId) : null
      if (existing) return res.json({ queued: true, sessionId: existing }) // 같은 세션 재요청: 새 작업 없이 기존 id
      const sessionId = await store.saveSession(userKey, log, null, null, 'pending')
      if (sessionId && publish({ type: 'report', sessionId, userKey, attempt: 1 })) {
        notify(userKey, { type: 'report_queued', sessionId })
        return res.json({ queued: true, sessionId })
      }
    } catch (e) {
      console.warn('[report] enqueue failed, falling back to sync:', String(e))
    }
  }

  const persist = async (report: any, model: string | null) => {
    if (!dbReady || !userKey) return report
    try {
      await store.touchUser(userKey)
      const sessionId = await store.saveSession(userKey, log, report, model)
      return { ...report, sessionId }
    } catch (e) {
      console.warn('[report] save failed:', String(e))
      return report
    }
  }
  if (!client) {
    const dom = getDomain(log?.setup?.domain ?? log?.scenario?.domain)
    return res.json(await persist(dom.mockReport(log?.overall), 'mock'))
  }
  try {
    const { report, model } = await generateReport(log)
    res.json(await persist(report, model))
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: String(e) })
  }
})

// ---------- 음성 합성 ----------
// LiteLLM 프록시는 /v1/audio/speech 를 통째로 받은 뒤 넘기지만(첫 바이트 ≈ 완료),
// /openai_passthrough/v1/audio/speech 에 body "stream": true 를 넣으면 OpenAI 응답을 그대로 흘려보낸다.
// 실측(432자): 첫 바이트 8.9초 → 0.9초. 이후 생성되는 대로 조각이 온다.
// 같은 문장은 Redis에 캐시하고, 시나리오 풀을 채울 때 첫 대사를 미리 만들어 둔다.
interface TtsOpts { voice: string; instructions: string }
// 도메인 정의의 voice 를 쓰고, 없으면 언어(도메인 lang 또는 요청 lang)에 맞는 기본값
function ttsOpts(domain?: string, lang?: string, voiceOverride?: string): TtsOpts {
  const dom = findDomain(domain)
  const en = (lang ?? dom?.lang) === 'en'
  const d = dom?.voice ?? { voice: TTS_VOICE, instructions: en ? TTS_INSTRUCTIONS_EN_DEFAULT : TTS_INSTRUCTIONS }
  return { voice: voiceOverride || d.voice, instructions: d.instructions }
}
function ttsCacheKey(text: string, o: TtsOpts) {
  return `tts:${createHash('sha1').update(`${TTS_MODEL}|${o.voice}|${o.instructions}|${text}`).digest('hex')}`
}

async function ttsUpstream(text: string, o: TtsOpts): Promise<Response> {
  const base = (process.env.ANTHROPIC_BASE_URL ?? '').replace(/\/$/, '')
  const key = process.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN ?? ''
  const isProxy = /signalplanner\.ai/.test(base)
  const url = isProxy ? `${base}/openai_passthrough/v1/audio/speech` : `${base}/v1/audio/speech`
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: TTS_MODEL, voice: o.voice, input: text, response_format: 'mp3', instructions: o.instructions, stream: true }),
  })
  if (!r.ok || !r.body) throw new Error(`tts upstream ${r.status}: ${await r.text()}`)
  return r
}

/** 통째로 합성 (캐시 워밍·프리페치용). */
async function synthesize(text: string, domain?: string, lang?: string): Promise<Buffer> {
  const input = text.slice(0, 1000)
  const o = ttsOpts(domain, lang)
  const cacheKey = ttsCacheKey(input, o)
  const cached = redisReady ? await store.getTtsCache(cacheKey) : null
  if (cached) return cached
  const r = await ttsUpstream(input, o)
  const buf = Buffer.from(await r.arrayBuffer())
  if (redisReady) void store.setTtsCache(cacheKey, buf)
  return buf
}

app.post('/api/tts', async (req, res) => {
  const { text, voice, lang, domain } = req.body ?? {}
  if (!client || TTS_MODE !== 'server') return res.status(503).json({ error: 'server tts disabled' })
  if (!text || typeof text !== 'string') return res.status(400).json({ error: 'text required' })
  const input = text.slice(0, 1000)
  const o = ttsOpts(domain, lang, voice)
  const cacheKey = ttsCacheKey(input, o)
  try {
    const cached = redisReady ? await store.getTtsCache(cacheKey) : null
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Tts-Cache', cached ? 'hit' : 'miss')
    if (cached) return res.end(cached)

    // 스트리밍: 조각이 오는 대로 클라이언트에 흘리고, 끝나면 전체를 캐시
    const r = await ttsUpstream(input, o)
    res.flushHeaders()
    const reader = r.body!.getReader()
    const chunks: Buffer[] = []
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      const b = Buffer.from(value)
      chunks.push(b)
      res.write(b)
    }
    res.end()
    if (redisReady) void store.setTtsCache(cacheKey, Buffer.concat(chunks))
  } catch (e) {
    if (!res.headersSent) res.status(502).json({ error: String(e) })
    else res.end()
  }
})

// ---------- 사용자 기록 (MySQL + Redis) ----------
app.get('/api/me', async (req, res) => {
  const userKey = String(req.query.user ?? '')
  if (!userKey) return res.status(400).json({ error: 'user required' })
  if (!dbReady) return res.json({ enabled: false, streak: 0, stats: { total: 0 }, next: null, recent: [] })
  try {
    await store.touchUser(userKey, req.query.nickname ? String(req.query.nickname) : undefined)
    const [streak, stats, next, recent] = await Promise.all([
      store.getStreak(userKey), store.getStats(userKey), store.getNextReservation(userKey), store.listSessions(userKey, 8),
    ])
    res.json({ enabled: true, streak, stats, next, recent })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

app.get('/api/sessions', async (req, res) => {
  const userKey = String(req.query.user ?? '')
  if (!userKey) return res.status(400).json({ error: 'user required' })
  if (!dbReady) return res.json({ items: [], total: 0 })
  const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 10)))
  const offset = Math.max(0, Number(req.query.offset ?? 0))
  const [items, stats] = await Promise.all([store.listSessions(userKey, limit, offset), store.getStats(userKey)])
  res.json({ items, total: stats.total })
})

// 관리자: 아무 세션이나 상세(리포트) 조회
app.get('/api/admin/sessions/:id', async (req, res) => {
  if (!isAdminToken(String(req.headers['x-admin-token'] ?? ''))) return res.status(401).json({ error: 'unauthorized' })
  if (!dbReady) return res.status(404).json({ error: 'db disabled' })
  const row = await store.getSessionById(Number(req.params.id))
  if (!row) return res.status(404).json({ error: 'not found' })
  res.json(row)
})

app.get('/api/sessions/:id', async (req, res) => {
  const userKey = String(req.query.user ?? '')
  if (!dbReady) return res.status(404).json({ error: 'db disabled' })
  const row = await store.getSession(userKey, Number(req.params.id))
  if (!row) return res.status(404).json({ error: 'not found' })
  res.json(row)
})

app.post('/api/reservations', async (req, res) => {
  const { userKey, scheduledAt, sourceSessionId } = req.body ?? {}
  if (!userKey || !scheduledAt) return res.status(400).json({ error: 'userKey, scheduledAt required' })
  if (!dbReady) return res.status(503).json({ error: 'db disabled' })
  const when = new Date(scheduledAt)
  if (Number.isNaN(when.getTime())) return res.status(400).json({ error: 'bad date' })
  const id = await store.createReservation(userKey, when, sourceSessionId ?? null)
  res.json({ id, scheduledAt: when.toISOString() })
})

app.delete('/api/reservations/:id', async (req, res) => {
  const userKey = String(req.query.user ?? '')
  if (!userKey) return res.status(400).json({ error: 'user required' })
  if (!dbReady) return res.status(503).json({ error: 'db disabled' })
  const ok = await store.cancelReservation(userKey, Number(req.params.id))
  res.json({ ok })
})

// ---------- 관리자 ----------
function requireAdmin(req: express.Request, res: express.Response) {
  const t = req.header('x-admin-token') ?? req.query.token
  if (!isAdminToken(t)) { res.status(401).json({ error: 'unauthorized' }); return false }
  return true
}
app.get('/api/admin/live', (req, res) => {
  if (!requireAdmin(req, res)) return
  res.json({ entries: listLive() })
})
// 방금 끝난 훈련 목록 비우기 (서버 메모리). DB·Redis 초기화와 함께 쓴다
app.delete('/api/admin/live', (req, res) => {
  if (!requireAdmin(req, res)) return
  res.json({ cleared: clearEndedLive() })
})
app.get('/api/admin/sessions', async (req, res) => {
  if (!requireAdmin(req, res)) return
  if (!dbReady) return res.json({ items: [], total: 0 })
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 30)))
  const offset = Math.max(0, Number(req.query.offset ?? 0))
  res.json(await store.listAllSessions(limit, offset))
})

// 진행 중 세션 지표 (시연용 관전·디버그)
// WS 폴백 + 탭 닫힘 beacon(left). WS 경로와 같은 처리(Redis·레지스트리·관전 중계)
app.post('/api/live', (req, res) => {
  const { userKey, ...data } = req.body ?? {}
  if (typeof userKey === 'string' && userKey) handleLive(userKey, data)
  res.json({ ok: true })
})
app.get('/api/live/:userKey', async (req, res) => {
  res.json((await store.getLive(req.params.userKey)) ?? {})
})

function extractJson(text: string) {
  const s = text.indexOf('{')
  const e = text.lastIndexOf('}')
  return s >= 0 && e > s ? text.slice(s, e + 1) : text
}

;(async () => {
  ;[dbReady, redisReady, mqOn] = await Promise.all([initDb(), initRedis(), initMq()])
  if (mqOn && dbReady && client) await consume(handleJob)
  const server = app.listen(PORT, () => {
    console.log(`[rehearsal] db=${dbReady ? DB_DATABASE : 'off'} redis=${redisReady ? `db${REDIS_DB}` : 'off'} mq=${mqOn ? QUEUE : 'off'}`)
    console.log(`[rehearsal] server on http://localhost:${PORT} · mode=${client ? 'claude' : 'mock'} · turn=${TURN_MODEL} scenario=${SCENARIO_MODEL} report=${REPORT_MODEL} · base=${process.env.ANTHROPIC_BASE_URL ?? 'api.anthropic.com'}`)
  })
  initRealtime(server)
  // 세션 진행 지표는 WS로 들어오고 Redis에 저장 (기존 /api/live GET으로도 조회 가능)
  setLiveHandler((userKey, data) => {
    if (!redisReady) return
    const flat: Record<string, string | number> = {}
    for (const [k, v] of Object.entries(data)) flat[k] = typeof v === 'object' ? JSON.stringify(v) : (v as string | number)
    void store.setLive(userKey, flat)
  })
})()
