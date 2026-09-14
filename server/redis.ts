import Redis from 'ioredis'

const REDIS_HOST = process.env.REDIS_HOST ?? '127.0.0.1'
const REDIS_PORT = Number(process.env.REDIS_PORT ?? 6379)
// 다른 로컬 프로젝트와 겹치지 않도록 마지막 번호(15) 사용
export const REDIS_DB = Number(process.env.REDIS_DB ?? 15)

export let redis: Redis | null = null

export async function initRedis(): Promise<boolean> {
  const r = new Redis({ host: REDIS_HOST, port: REDIS_PORT, db: REDIS_DB, lazyConnect: true, maxRetriesPerRequest: 1, keyPrefix: 'rehearsal:' })
  try {
    await r.connect()
    await r.ping()
    redis = r
    return true
  } catch (e) {
    console.warn('[redis] 사용 불가, 캐시·프리페치 꺼짐:', (e as Error).message)
    r.disconnect()
    redis = null
    return false
  }
}

/* 키 설계 (prefix rehearsal: 자동)
 *  scenario:pool:{hash}      LIST   같은 설정으로 미리 만들어 둔 시나리오 JSON. LPOP으로 하나 꺼내고 배경에서 다시 채운다. TTL 6h
 *  scenario:filling:{hash}   STRING 프리페치 중 잠금. TTL 60s
 *  live:{userKey}            HASH   진행 중 세션의 최신 지표 (시연용 관전 화면 등에서 조회 가능). TTL 10m
 *  streak:{userKey}          STRING 연속 훈련 일수 캐시. DB 계산 결과를 하루 TTL로 저장
 */
export const keys = {
  scenarioPool: (hash: string) => `scenario:pool:${hash}`,
  scenarioFilling: (hash: string) => `scenario:filling:${hash}`,
  live: (userKey: string) => `live:${userKey}`,
  streak: (userKey: string) => `streak:${userKey}`,
}
