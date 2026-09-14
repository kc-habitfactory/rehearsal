import amqp, { type Channel, type ChannelModel, type ConsumeMessage } from 'amqplib'

const PROTOCOL = process.env.RABBIT_MQ_PROTOCOL ?? 'amqp'
const HOST = process.env.RABBIT_MQ_HOST ?? '127.0.0.1'
const PORT = Number(process.env.RABBIT_MQ_PORT ?? 5672)
const USER = process.env.RABBIT_MQ_USER ?? 'guest'
const PASSWORD = process.env.RABBIT_MQ_PASSWORD ?? 'guest'

// 기존 로컬 큐 명명 규칙(xxx_rmq / xxx_rmq_dlq)을 따른다. 리허설 전용 새 큐.
export const QUEUE = process.env.RABBIT_MQ_QUEUE ?? 'rehearsal_rmq'
export const DLQ = `${QUEUE}_dlq`

export interface ReportJob {
  type: 'report'
  sessionId: number
  userKey: string
  attempt: number
}
export type Job = ReportJob

let conn: ChannelModel | null = null
let ch: Channel | null = null

export async function initMq(): Promise<boolean> {
  try {
    conn = await amqp.connect({ protocol: PROTOCOL, hostname: HOST, port: PORT, username: USER, password: PASSWORD })
    ch = await conn.createChannel()
    await ch.assertQueue(DLQ, { durable: true })
    await ch.assertQueue(QUEUE, { durable: true, deadLetterExchange: '', deadLetterRoutingKey: DLQ })
    await ch.prefetch(2) // 리포트 생성은 무겁다. 동시 2개까지만
    conn.on('error', (e) => console.warn('[mq] connection error:', e.message))
    conn.on('close', () => {
      console.warn('[mq] connection closed')
      conn = null
      ch = null
    })
    return true
  } catch (e) {
    console.warn('[mq] 사용 불가, 리포트는 동기 생성:', (e as Error).message)
    conn = null
    ch = null
    return false
  }
}

export function mqReady() {
  return ch !== null
}

export function publish(job: Job) {
  if (!ch) return false
  return ch.sendToQueue(QUEUE, Buffer.from(JSON.stringify(job)), { persistent: true, contentType: 'application/json' })
}

/**
 * 소비 시작. handler가 정상 종료하면 ack, 예외를 던지면 재시도(최대 maxAttempts) 후 DLQ로.
 * 같은 프로세스 안에서 돈다. 별도 워커 프로세스로 빼고 싶으면 이 함수만 다른 엔트리에서 호출하면 된다.
 */
export async function consume(handler: (job: Job) => Promise<void>, maxAttempts = 2) {
  if (!ch) return
  await ch.consume(QUEUE, async (msg: ConsumeMessage | null) => {
    if (!msg || !ch) return
    let job: Job
    try {
      job = JSON.parse(msg.content.toString()) as Job
    } catch {
      ch.nack(msg, false, false) // 파싱 불가 → DLQ
      return
    }
    try {
      await handler(job)
      ch.ack(msg)
    } catch (e) {
      console.warn(`[mq] job failed (attempt ${job.attempt}/${maxAttempts}):`, (e as Error).message)
      ch.ack(msg)
      if (job.attempt < maxAttempts) {
        publish({ ...job, attempt: job.attempt + 1 })
      } else {
        // 재시도 소진 → DLQ에 직접 넣어 흔적을 남긴다
        ch.sendToQueue(DLQ, Buffer.from(JSON.stringify({ ...job, error: (e as Error).message })), { persistent: true })
      }
    }
  })
  console.log(`[mq] consuming ${QUEUE} (dlq: ${DLQ})`)
}

export async function closeMq() {
  await ch?.close().catch(() => {})
  await conn?.close().catch(() => {})
}
