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
export function buildDesignerSystem(dom: DomainPrompts, fields: Record<string, string>): string {
  const base = typeof dom.scenarioSystem === 'function' ? dom.scenarioSystem(fields) : dom.scenarioSystem
  return base + habitfactoryDesignerNote(dom.id, fields) + nameNoteFor(dom, fields, 'designer')
}

/** 대화 상대(면접관·발신자·의사…) system 프롬프트 */
export function buildCounterpartSystem(dom: DomainPrompts, scenario: ScenarioLike): string {
  return dom.counterpartSystem(scenario) + habitfactoryCounterpartNote(dom.id, scenario.fields) + nameNoteFor(dom, scenario.fields, 'counterpart')
}

/** 코치(리포트) system 프롬프트. log 는 클라이언트가 보낸 세션 기록 */
export function buildCoachSystem(dom: DomainPrompts, log: any): string {
  const base = typeof dom.reportSystem === 'function' ? dom.reportSystem(log) : dom.reportSystem
  const real = log?.setup?.realMode
    ? `\n[실전 모드] 훈련자는 실시간 지표·자막·대화 기록을 보지 않고 화면(상대)만 보며 진행했다. 실전과 같은 조건이므로 (1) 비언어 지표와 이벤트 타임라인을 더 자세히 짚고, (2) 자막 없이 들은 만큼 질문을 놓치거나 잘못 들은 지점이 있는지 확인하고, (3) headline에 실전 모드였음을 한 번 언급한다.`
    : ''
  const speech = speechBriefForCoach(dom.id, log?.setup?.fields, log?.turns, dom.lang ?? 'ko')
  return base + real + speech + nameNoteFor(dom, log?.setup?.fields, 'coach')
}
