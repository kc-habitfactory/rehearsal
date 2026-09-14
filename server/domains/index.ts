/* 도메인 레지스트리. 새 상황을 추가하려면: 1) 이 폴더에 파일 하나 2) 아래 DOMAIN_PROMPTS에 한 줄
 * 3) src/lib/domains.ts 에 같은 id 로 클라이언트 정의 4) 지식베이스는 ../cases 에 */
import { type DomainId, type DomainPrompts, type ScenarioLike, defaultNameNote } from './shared'
import { habitfactoryCounterpartNote, habitfactoryDesignerNote } from '../cases/habitfactory'
import { speechBriefForCoach } from '../cases/speech-style'
import { interview } from './interview'
import { scamCall } from './scam-call'
import { salaryNegotiation } from './salary-negotiation'
import { execQa } from './exec-qa'
import { hospital } from './hospital'
import { immigration } from './immigration'
import { insuranceConsult } from './insurance-consult'
import { moneyTalk } from './money-talk'
import { parentTeacher } from './parent-teacher'
import { claimAppeal } from './claim-appeal'
import { hiringInterviewer } from './hiring-interviewer'
import { meetingPrep } from './meeting-prep'
import { customerInterview } from './customer-interview'
import { insurancePurchase } from './insurance-purchase'
import { claimInquiry } from './claim-inquiry'

export type { DomainId, DomainPrompts, ScenarioLike, NoteWhere } from './shared'
export { knownFacts, TTS_INSTRUCTIONS_EN_DEFAULT } from './shared'

export const DOMAIN_PROMPTS: Record<DomainId, DomainPrompts> = {
  interview,
  scam_call: scamCall,
  salary_negotiation: salaryNegotiation,
  exec_qa: execQa,
  hospital,
  immigration,
  insurance_consult: insuranceConsult,
  money_talk: moneyTalk,
  parent_teacher: parentTeacher,
  claim_appeal: claimAppeal,
  hiring_interviewer: hiringInterviewer,
  meeting_prep: meetingPrep,
  customer_interview: customerInterview,
  insurance_purchase: insurancePurchase,
  claim_inquiry: claimInquiry,
}

export function getDomain(id: unknown): DomainPrompts {
  return typeof id === 'string' && id in DOMAIN_PROMPTS ? DOMAIN_PROMPTS[id as DomainId] : interview
}

/** 도메인 id가 유효할 때만 정의를 돌려준다 (getDomain은 모르는 id를 면접으로 폴백) */
export function findDomain(id: unknown): DomainPrompts | undefined {
  return typeof id === 'string' && id in DOMAIN_PROMPTS ? DOMAIN_PROMPTS[id as DomainId] : undefined
}

// ---------- 프롬프트 조립: 도메인 프롬프트 + 해빗팩토리 사내 규칙 + 훈련자 이름 규칙 ----------
// 라우트·워커는 이 세 함수만 부른다. 도메인이 무엇을 아는지는 여기와 각 도메인 파일에만 있다.

function nameNoteFor(dom: DomainPrompts, fields: Record<string, string> | undefined, where: 'designer' | 'counterpart' | 'coach'): string {
  const name = (fields?.name ?? '').trim()
  if (!name) return ''
  return (dom.nameNote ?? defaultNameNote)(name, where)
}

/** 시나리오 설계자 system 프롬프트 */
const JSON_HYGIENE = `\n\n[출력 형식] 유효한 JSON 하나만 출력한다. 문자열 값 안에서 무언가를 인용할 때는 쌍따옴표(")를 쓰지 말고 홑따옴표(')나 「」를 쓴다. 줄바꿈은 \\n 으로. 마크다운 코드 펜스는 붙이지 않는다.`

// 대화가 끝없이 이어지지 않게: "언제 만족하는지"를 시나리오에 정의하고(숨은 체크리스트), 상대는 그것이 채워지면 더 묻지 않는다.
// 모델이 횟수를 잘 세지 못하므로 서버가 마지막 턴을 따로 강제한다(index.ts /api/turn).
const CHECKLIST_DESIGNER = `\n\n[만족 조건 · 필수] hiddenPlan 안에 "만족 조건:" 항목으로, 당신이 연기하는 상대가 무엇이 확인·충족되면 더 질문하지 않고 결정·마무리로 넘어가는지 구체 항목 2~4개를 적는다. 상황에 맞는 실제 우려·확인 사항이어야 한다(예: 보험 상담 고객이면 '4세대가 왜 올랐나 / 5세대가 실제로 싸지나 / 허리 치료 보장이 유지되나', 면접관이면 '판단 근거 / 본인 기여 / 수치 검증', 사기 전화 발신자면 '이체·정보·앱 설치 중 하나 성공 또는 사용자의 확인 선언'). 질문 개수가 아니라 이 조건이 대화의 끝을 정한다.`

function closingRule(max: number, userTurns?: number): string {
  const lines = [
    `\n[마무리 규칙] 내부 계획의 "만족 조건"이 사용자의 말로 충족되면 더 질문하지 않고 결정·마무리 멘트를 하고 [END]를 붙인다. 충족되지 않았어도 사용자 발화 ${Math.max(1, max - 1)}번째부터는 남은 항목을 한 질문으로 묶어 묻고, ${max}번째 발화에 대한 답에서는 반드시 마무리 멘트와 [END]로 끝낸다.`,
  ]
  if (typeof userTurns === 'number' && userTurns >= max) lines.push(`\n[지금] 사용자 발화가 ${userTurns}번째다. 이번 응답이 마지막이다. 새 질문을 하지 말고 결정·마무리 멘트를 두 문장 이내로 하고 반드시 [END]를 붙인다.`)
  else if (typeof userTurns === 'number' && userTurns === max - 1) lines.push(`\n[지금] 사용자 발화가 ${userTurns}번째다. 남은 만족 조건이 있으면 이번 한 질문으로 묶어 묻고, 없으면 마무리 멘트와 [END].`)
  return lines.join('')
}

export function buildDesignerSystem(dom: DomainPrompts, fields: Record<string, string>): string {
  const base = typeof dom.scenarioSystem === 'function' ? dom.scenarioSystem(fields) : dom.scenarioSystem
  return base + habitfactoryDesignerNote(dom.id, fields) + nameNoteFor(dom, fields, 'designer') + CHECKLIST_DESIGNER + JSON_HYGIENE
}

/** 대화 상대(면접관·발신자·의사…) system 프롬프트 */
export function buildCounterpartSystem(dom: DomainPrompts, scenario: ScenarioLike, opts?: { userTurns?: number }): string {
  return dom.counterpartSystem(scenario) + habitfactoryCounterpartNote(dom.id, scenario.fields) + nameNoteFor(dom, scenario.fields, 'counterpart') + closingRule(maxUserTurnsOf(dom), opts?.userTurns)
}

export function maxUserTurnsOf(dom: DomainPrompts): number {
  return dom.maxUserTurns ?? 6
}

/** 코치(리포트) system 프롬프트. log 는 클라이언트가 보낸 세션 기록 */
export function buildCoachSystem(dom: DomainPrompts, log: any): string {
  const base = typeof dom.reportSystem === 'function' ? dom.reportSystem(log) : dom.reportSystem
  const real = log?.setup?.realMode
    ? `\n[실전 모드] 훈련자는 실시간 지표·자막·대화 기록을 보지 않고 화면(상대)만 보며 진행했다. 실전과 같은 조건이므로 (1) 비언어 지표와 이벤트 타임라인을 더 자세히 짚고, (2) 자막 없이 들은 만큼 질문을 놓치거나 잘못 들은 지점이 있는지 확인하고, (3) headline에 실전 모드였음을 한 번 언급한다.`
    : ''
  const speech = speechBriefForCoach(dom.id, log?.setup?.fields, log?.turns, dom.lang ?? 'ko')
  const checklist = `\n[만족 조건 평가] 내부 계획(hiddenPlan)의 "만족 조건" 각 항목이 사용자의 말로 충족됐는지 판정해 strengths/improvements와 scoreBreakdown 근거에 반영한다. 리포트에서 상대가 확인하고 싶었던 것(만족 조건 목록)과 그중 채워진 것·빠진 것을 사용자에게 공개한다.`
  return base + real + speech + checklist + nameNoteFor(dom, log?.setup?.fields, 'coach') + JSON_HYGIENE
}
