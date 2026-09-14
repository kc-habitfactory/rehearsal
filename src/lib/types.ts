import type { TurnTiming } from './speech-metrics'
export type Screen = 'home' | 'setup' | 'prep' | 'session' | 'report' | 'history'

import type { DomainId } from './domains'

export interface SetupInput {
  domain: DomainId
  fields: Record<string, string> // 도메인별 입력 (domains.ts의 fields 키)
  realMode?: boolean // 실전 모드: 세션 중 지표·자막·대화 기록을 숨기고 화면만 본다. 리포트·코치에 전달
}

export interface Scenario {
  domain?: DomainId
  title: string
  interviewer: {
    name: string
    style: string // 사용자에게는 노출하지 않음
  }
  opening: string // 첫 질문
  hiddenPlan: string // 면접관 내부 계획 (돌발 변수 포함)
  fields?: Record<string, string> // 준비 화면 입력값 (서버가 응답에 붙여 줌). 상대 프롬프트에 "상대가 알 법한 정보"로 쓰인다
  resumeSummary?: string // 이력서 요약 (원문 대신 저장·전달)
  jdRequirements?: string[] // 공고 요구사항 목록 (코치의 커버리지 평가용)
}

export interface Turn {
  role: 'user' | 'interviewer'
  text: string
  at: number // ms since session start
  nonverbal?: NonverbalSummary
  timing?: TurnTiming // 내 발화의 시간 지표 (말투 분석용)
}

export interface NonverbalSummary {
  eyeContactPct: number // 0~100
  postureBreaks: number
  faceTouches: number
  smileAvg: number // 0~1
  longestGazeAwayMs: number
}

export interface NonverbalEvent {
  at: number
  kind: 'gaze_away' | 'posture_break' | 'face_touch'
  durationMs?: number
}

export interface SessionLog {
  clientId: string // 세션 시작 시 생성. 서버가 중복 저장을 막는 키
  setup: SetupInput
  scenario: Scenario
  turns: Turn[]
  events: NonverbalEvent[]
  overall: NonverbalSummary
  durationMs: number
}

export interface Report {
  score: number // 0~100
  headline: string
  strengths: string[]
  improvements: string[]
  perQuestion: { question: string; comment: string }[]
  nonverbal: string[] // 타임라인 코멘트
  nextTraining: string
  scoreBreakdown?: { item: string; max: number; score: number; note: string }[] // 항목별 배점
  speech?: string[] // 말투·전달 코멘트 (측정치 + 인용)
  speechProfile?: string // 이 상황이 선호하는 화법 한 줄
  coverage?: { requirement: string; status: '증명' | '부분' | '미답' | '확인' | '미확인' | '발견' | '놓침'; note: string }[] // 요구사항·인사이트 대비 표
  coverageTitle?: string // coverage 표 제목 (기본: 공고 요구사항 대비)
  guideFixes?: string[] // 고객 인터뷰: 다음 가이드에 넣을 질문
  candidateReview?: string // 면접관 훈련: 지원자가 남길 법한 가상 후기
  verdict?: { pass: boolean; label: string; reread: string[] } // 회의 입장 점검: 판정과 다시 읽을 절
  questionsToAsk?: string[] // 회의 입장 점검: 회의에서 물어야 할 질문
}
