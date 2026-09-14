/* 도메인 프롬프트 공용: 타입, 상대가 아는 정보 헬퍼, 리포트 JSON 형식, 공통 대화 규칙 */

export type DomainId = 'interview' | 'scam_call' | 'salary_negotiation' | 'exec_qa' | 'hospital' | 'immigration' | 'insurance_consult'

export interface ScenarioLike {
  title: string
  interviewer: { name: string; style: string } // 상대 (면접관 / 발신자). 필드명은 호환을 위해 유지
  opening?: string
  hiddenPlan: string
  fields?: Record<string, string> // 사용자가 준비 화면에서 입력한 값. 상대 프롬프트에서 "상대가 알 법한 정보"만 골라 쓴다
  resumeSummary?: string // 면접: 이력서 요약 (원문 대신)
  jdRequirements?: string[] // 면접: 공고 요구사항 목록
}

/** 상대 프롬프트용: 필드 중 상대가 알고 있어야 자연스러운 것만 골라 문장으로 만든다 */
export function knownFacts(f: Record<string, string> | undefined, picks: [key: string, label: string][]): string {
  if (!f) return ''
  const lines = picks.filter(([k]) => (f[k] ?? '').trim()).map(([k, l]) => `- ${l}: ${f[k].trim()}`)
  return lines.length ? lines.join('\n') : ''
}

/** 프롬프트 노트가 붙는 자리: 시나리오 설계자 / 대화 상대 / 코치(리포트) */
export type NoteWhere = 'designer' | 'counterpart' | 'coach'

export interface DomainPrompts {
  id: DomainId
  /** 대화 언어. 음성 합성 지시문·이름 호칭 기본값에 쓰인다. 기본 ko */
  lang?: 'ko' | 'en'
  /** 도메인별 목소리와 말투. 같은 TTS 모델이라도 지시문에 따라 톤이 크게 달라진다. 없으면 서버 기본값 */
  voice?: { voice: string; instructions: string }
  /** 훈련자 이름을 "상대가 이미 아는 정보"로 다루는 지시. 없으면 defaultNameNote(한국어 "OO 님") */
  nameNote?: (name: string, where: NoteWhere) => string
  /** 설정 입력을 한 줄 문자열로 */
  describeInput: (fields: Record<string, string>) => string
  scenarioSystem: string | ((fields: Record<string, string>) => string)
  counterpartSystem: (s: ScenarioLike) => string
  reportSystem: string | ((log: any) => string)
  mockScenario: (fields: Record<string, string>) => ScenarioLike
  mockTurns: string[]
  mockReport: (overall: any) => any
}

/** 한국어 도메인 공용 이름 호칭 규칙 */
export function defaultNameNote(name: string, where: NoteWhere): string {
  if (where === 'designer') return `\n\n훈련자 이름: ${name}. 상대는 이 이름을 이미 알고 있다(이력서·지원서·접수증·명단 등). opening에서 상황에 맞는 호칭으로 자연스럽게 한 번 부른다(예: "${name} 님", "${name} 씨"). 이름을 묻는 문장은 만들지 않는다.`
  if (where === 'counterpart') return `\n훈련자 이름은 ${name}이다. 이미 알고 있으므로 절대 묻지 않는다. 대화 중 자연스럽게 가끔 호칭으로 부른다("${name} 님" 등, 매 문장마다는 아니다).`
  return `\n훈련자 이름은 ${name}이다. 리포트 본문에서 "${name} 님"으로 부른다.`
}

/** 도메인에 voice 가 없을 때 쓰는 영어 기본 말투 (한국어 기본은 서버 env REHEARSAL_TTS_INSTRUCTIONS) */
export const TTS_INSTRUCTIONS_EN_DEFAULT = 'Clear, neutral spoken English at a natural pace.'


export const REPORT_JSON = `반드시 아래 JSON만 출력한다.
{
  "score": 0~100 정수,
  "headline": "한 줄 총평",
  "strengths": ["...", "..."],
  "improvements": ["...", "..."],
  "perQuestion": [{ "question": "상대의 질문·요구 요약", "comment": "대응 평가 한두 문장" }],
  "nonverbal": ["타임라인 코멘트 1", "코멘트 2"],
  "nextTraining": "다음 훈련 제안 한 문장",
  "scoreBreakdown": [{ "item": "평가 항목 이름 (위 평가 기준 순서대로, 마지막에 '전달(말투)')", "max": 항목 만점 정수, "score": 받은 점수 정수, "note": "이 점수를 준 근거 한 문장 (대화 인용 포함)" }],
  "speech": ["말투·전달 코멘트 1 (숫자 + 인용)", "코멘트 2"],
  "speechProfile": "이 상황이 선호하는 화법 한 줄 (아래 말투·전달 평가 블록의 것을 그대로)"
}
scoreBreakdown 규칙: 위 평가 기준을 항목으로 4~6개 + "전달(말투)" 1개, max의 합은 100, score의 합은 반드시 위 score와 같아야 한다. 사용자가 "왜 이 점수인가"를 보는 용도이므로 각 note는 구체적으로.`


export const COMMON_RULES = `- 실제 사람이 말하듯 자연스러운 구어체. 음성으로 읽힌다. 마크다운, 목록, 괄호 지시문 금지.
- 한 번에 두 문장 이내, 질문이나 요구는 하나만.
- 각 사용자 메시지 끝에 [비언어 · 최근 30초] 지표가 붙어 올 수 있다. 시스템 관찰 정보이며 숫자를 직접 언급하지 않는다.`


export const VARY = '지식베이스의 문장을 그대로 복사하지 않는다. 같은 의도를 다른 표현으로, 이름·직함·금액·순서를 매번 바꾼다. 구조는 실제 사례, 말은 새로 쓴다.'
