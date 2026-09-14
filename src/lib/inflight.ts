/* 진행 중 세션 보존. 개발 서버 재배포(HMR 전체 새로고침)나 실수로 새로고침해도 홈으로 튕기지 않고 이어서 진행한다.
 * sessionStorage: 같은 탭에서만 살고, 탭을 닫으면 사라진다(닫기는 의도한 종료로 본다). 30분 지나면 무시. */
import type { Scenario, SetupInput, Turn } from './types'

const KEY = 'rehearsal.inflight'
const MAX_AGE_MS = 30 * 60 * 1000

export interface Inflight {
  setup: SetupInput
  scenario: Scenario
  turns: Turn[]
  elapsedMs: number
  clientId: string
  textMode: boolean
  savedAt: number
}

export function saveInflight(v: Omit<Inflight, 'savedAt'>): void {
  try { sessionStorage.setItem(KEY, JSON.stringify({ ...v, savedAt: Date.now() })) } catch { /* 저장 공간 없음 등: 무시 */ }
}

export function loadInflight(): Inflight | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Inflight
    if (!v?.setup?.domain || !v?.scenario?.opening || !Array.isArray(v.turns)) return null
    if (Date.now() - (v.savedAt ?? 0) > MAX_AGE_MS) { clearInflight(); return null }
    return v
  } catch { return null }
}

export function clearInflight(): void {
  try { sessionStorage.removeItem(KEY) } catch { /* noop */ }
}
