/* 점수 색 구간과 중단 판정. 목록·관전·리포트가 같은 규칙을 쓴다.
 * 70점 이상 = 잘함(초록), 40~69 = 보통(호박색), 40 미만 = 다시(빨강). 사용자가 한 마디도 하지 않고 끝났으면 점수 대신 "중단".
 * (1회는 중단이 아니다: 사기 전화는 "필요 없습니다" 한마디로 끊는 것이 정답이라 발화 1회로 정상 종료된다.) */
export type ScoreBand = 'good' | 'mid' | 'low'

export const ABORT_MAX_USER_TURNS = 0 // 이 수 이하의 발화로 끝난 세션은 점수 대신 "중단"

export function scoreBand(score: number): ScoreBand {
  return score >= 70 ? 'good' : score >= 40 ? 'mid' : 'low'
}

export function isAborted(userTurns: number | null | undefined): boolean {
  return typeof userTurns === 'number' && userTurns <= ABORT_MAX_USER_TURNS
}

/** 목록용 표기: 상태·발화 수·점수를 받아 {text, cls}. cls 는 score-good / score-mid / score-low / score-abort / score-none */
export function scoreDisplay(score: number | null | undefined, reportStatus: string | undefined, userTurns?: number | null): { text: string; cls: string; unit: boolean } {
  if (reportStatus === 'pending') return { text: '생성 중', cls: 'score-none', unit: false }
  if (isAborted(userTurns)) return { text: '중단', cls: 'score-abort', unit: false }
  if (score === null || score === undefined) return { text: '–', cls: 'score-none', unit: false }
  return { text: String(score), cls: `score-${scoreBand(score)}`, unit: true }
}
