/* 해빗팩토리 사내 컨텍스트.
 * 상황이 해빗팩토리·시그널플래너와 관련되면 사용자를 상대하는 "대표되는 한 사람"만 실제 인물로 등장시킨다.
 * 사내 발표용 몰입 장치다. 그 외 등장인물은 익명, 사기 전화에서는 실명 사용 금지. */

export interface Person { name: string; title: string; areas: string[] }

export const HABITFACTORY = {
  company: '해빗팩토리',
  desc: '핀테크. 보험 관리 앱 "시그널플래너"(보험 분석·숨은보험금 조회·설계사 상담 연결)를 운영한다. 상담은 자회사 시그널파이낸셜랩(사내 약칭 "핀랩") 소속 상담사가 진행한다.',
}

export const HABITFACTORY_PEOPLE: Person[] = [
  { name: '이동익', title: '대표', areas: ['임원', '최종', '컬처핏', '대표', 'CEO', '경영'] },
  { name: '정윤호', title: '대표', areas: ['임원', '최종', '컬처핏', '대표', 'CEO', '경영'] },
  { name: '이주헌', title: 'CTO', areas: ['CTO', '기술', '데이터', 'AI', 'LLM', '인프라', 'DevOps', 'SRE', 'QA'] },
  { name: '박광세', title: 'CSO', areas: ['CSO', '전략', '사업', '신사업', '제휴', 'BD'] },
  { name: '한승희', title: '모바일 팀 리드', areas: ['모바일', '안드로이드', 'android', 'iOS', 'flutter', '앱 개발'] },
  { name: '김주영', title: '경영지원', areas: ['경영지원', '재무', '회계', '정산', '총무', 'CFO', '대관', '규제', '인허가'] },
  { name: '김혁수', title: '정보보호', areas: ['정보보호', '보안', '개인정보', 'CISO', '유출'] },
  { name: '김성국', title: '시그널파이낸셜랩(핀랩) CEO', areas: ['핀랩', '시그널파이낸셜랩', '상담', '설계사', '보험 상담'] },
  { name: '전진혁', title: '시그널파이낸셜랩(핀랩) 운영 리드', areas: ['운영', 'CS', '고객', '상담 운영', '콜센터'] },
  { name: '최민영', title: '백엔드 리드', areas: ['백엔드', '서버', 'backend'] },
  { name: '안정우', title: '프론트엔드 리드', areas: ['프론트', 'frontend', '웹'] },
  { name: '한기훈', title: '디자인 리드', areas: ['디자인', '디자이너', 'UX', 'UI'] },
  { name: '송호진', title: '마케팅 리드', areas: ['마케팅', '마케터', '그로스', '콘텐츠', 'CRM'] },
  { name: '홍보라', title: '기획 리드', areas: ['기획', 'PM', '프로덕트', 'PO', '서비스 기획'] },
  { name: '정태희', title: '인사 팀장', areas: ['인사', 'HR', '연봉', '채용', '오퍼'] },
]

const TRIGGER = /해빗팩토리|habit\s*factory|habitfactory|시그널플래너|signal\s*planner|signalplanner|시그널파이낸셜랩/i

/** 입력값 어디에든 회사·서비스 이름이 있으면 사내 상황으로 본다 */
export function isHabitfactoryContext(fields: Record<string, string> | undefined): boolean {
  if (!fields) return false
  return Object.entries(fields).some(([k, v]) => k !== 'name' && TRIGGER.test(String(v ?? '')))
}

const roster = () => HABITFACTORY_PEOPLE.map((p) => `${p.title} ${p.name}`).join(' / ')

/** 시나리오 설계자에게: 누구를 상대로 세울지 규칙 */
export function habitfactoryDesignerNote(domainId: string, fields: Record<string, string> | undefined): string {
  if (!isHabitfactoryContext(fields)) return ''
  if (domainId === 'scam_call') {
    return `\n\n[해빗팩토리 규칙] 이 시나리오는 해빗팩토리·시그널플래너를 사칭하는 사기(또는 정상 전화)다. 실제 직원의 실명은 절대 쓰지 않는다. 발신자 이름은 가상으로 만든다.`
  }
  if (!['interview', 'salary_negotiation', 'exec_qa'].includes(domainId)) return ''
  const pick =
    domainId === 'interview'
      ? `면접관은 지원 직무에 맞는 한 사람: 백엔드→백엔드 리드 최민영, 프론트·웹→프론트엔드 리드 안정우, 모바일(iOS·안드로이드)→모바일 팀 리드 한승희, 디자인→디자인 리드 한기훈, 마케팅·그로스·콘텐츠→마케팅 리드 송호진, 기획·PM→기획 리드 홍보라, 데이터·AI·인프라·DevOps·QA→CTO 이주헌, 사업·전략·제휴→CSO 박광세, 보안·개인정보→정보보호 김혁수, 재무·회계·경영지원→경영지원 김주영, 인사·HR→인사 팀장 정태희, CS·상담·운영(핀랩)→핀랩 운영 리드 전진혁, 보험 상담 조직 임원 면접→핀랩 CEO 김성국. 해빗팩토리 임원 면접·최종 면접·컬처핏이면 대표 이동익 또는 정윤호 중 한 사람(매번 바꾼다).`
      : domainId === 'salary_negotiation'
        ? `협상 상대: 해빗팩토리는 스타트업이라 연봉 협상을 대부분 대표가 직접 한다. 상황 입력에 "인사"·"HR"·"인사 팀장"이 있으면 인사 팀장 정태희, 그 외에는 대표 이동익 또는 정윤호 중 한 사람(매번 바꾼다). 대표가 상대일 때는 연봉 밴드보다 회사 재무 상황·성장 기대·스톡옵션·역할 확대 같은 카드를 쓰고 결정이 빠르다. 인사 팀장일 때는 밴드·내부 형평성·승인 절차를 쓴다. 해당 직무 리드(예: 백엔드 리드 최민영)는 "동석" 정도로 언급만 하고 대사는 주지 않는다.`
        : `보고 대상 입력이 대표·CEO·경영진이면 대표 이동익 또는 정윤호 중 한 사람(매번 바꾼다), CTO·기술이면 CTO 이주헌, CSO·전략·사업이면 CSO 박광세, CFO·재무·비용·예산이면 경영지원 김주영, 보안·개인정보·CISO면 정보보호 김혁수, 인사면 인사 팀장 정태희, 핀랩·상담 조직 대표면 핀랩 CEO 김성국, 상담 운영이면 핀랩 운영 리드 전진혁. 그 외 직함(본부장 등)은 실명이 없으므로 가상의 인물로 만든다.`
  return `\n\n===== 해빗팩토리 사내 상황 규칙 =====
이 상황은 ${HABITFACTORY.company}(${HABITFACTORY.desc})와 관련된다. 사내 발표용이므로 사용자를 상대하는 "대표되는 한 사람"만 아래 실제 인물 중에서 고른다. 그 외 등장인물은 실명을 쓰지 않는다("다른 팀원", "동석한 리드"처럼 익명).
실제 인물: ${roster()}
${pick}
interviewer.name 은 "직함 실명" 형식으로 쓴다(예: "CTO 이주헌"). 실제 인물의 성향은 알 수 없으므로 style은 자유롭게 정하되 전문적이고 존중하는 톤으로 묘사하고, 비하·조롱·사생활 언급은 금지한다. 회사 이야기는 시그널플래너 서비스(보험 분석, 숨은보험금 조회, 상담 연결)를 소재로 삼는다. 확인되지 않은 회사 수치(매출·사용자 수 등)는 단정하지 않는다.`
}

/** 대화 상대에게: 실명 인물 연기 시 지킬 것 */
export function habitfactoryCounterpartNote(domainId: string, fields: Record<string, string> | undefined): string {
  if (!isHabitfactoryContext(fields)) return ''
  if (domainId === 'scam_call') return `\n[해빗팩토리 규칙] 실제 직원 실명을 말하지 않는다. 시나리오의 가상 이름만 쓴다.`
  if (!['interview', 'salary_negotiation', 'exec_qa'].includes(domainId)) return ''
  return `\n[해빗팩토리 규칙] 당신은 ${HABITFACTORY.company}의 실제 인물을 연기하고 있다(이름·직함은 위 시나리오대로). 회사: ${HABITFACTORY.desc} 다른 실제 직원의 이름을 새로 만들어 말하지 않고, 회사 수치를 단정하지 않으며, 전문적이고 존중하는 톤을 유지한다.`
}
