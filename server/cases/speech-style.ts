/* 화법 프로필: 상황·회사 유형별로 "어떻게 말해야 하는가"의 기준. 코치가 말투 측정치를 해석할 때 쓴다.
 * 출처(2025~2026): 삼성 면접관 출신 현직자(링커리어) "간결하게 결론 중심, 허세 없는 솔직함", IBK기업은행 인사담당자(한국금융신문 2025.08 금융권 공동채용박람회)
 * "근거가 약해도 완결된 문장으로 끝내라 · 끊기는 것보다 시간을 달라고 요청", 토스·당근 컬처핏 면접(진솔한 대화, "잘 모릅니다" 인정),
 * STAR 답변 60~90초(링커리어 2026, AceRound), 한국어 발표 표준 속도 분당 350~450자(SpeechTimer) → 면접·상담은 300~400자 권장,
 * 보험 상담 클로징 화법(제안 뒤 3~5초 침묵, 거절에 압박 대신 후속 약속). */
import { summarizeSpeech, describeSpeechForCoach, type SpeechTurnLike } from '../../src/lib/speech-metrics'

export interface SpeechProfile {
  key: string
  name: string // 리포트에 보이는 한 줄
  likes: string[]
  dislikes: string[]
  cpm?: [number, number] // 권장 분당 글자수(한국어) 또는 wpm(영어)
  answerSec?: [number, number] // 권장 한 답변 길이(초)
  latencySec?: [number, number] // 권장 첫 반응 지연(초). 너무 빠르면 즉답, 느리면 망설임
}

const P: Record<string, SpeechProfile> = {
  corporate: {
    key: 'corporate', name: '대기업형: 결론 먼저, 간결하게, 허세 없이',
    likes: ['첫 문장에 결론(직무 강점·판단), 그 다음 근거·사례·성과 순서', '허세 없는 솔직함: 모르면 가정과 전제를 밝히고 합리적 결론', '정중하고 담백한 톤, 60~90초 안에 끝나는 답변'],
    dislikes: ['장황한 서론·배경 설명', '과장·확실하지 않은 주장', '"~인 것 같아요" 식 완충 표현의 반복'],
    cpm: [300, 400], answerSec: [40, 90], latencySec: [0.8, 3],
  },
  finance: {
    key: 'finance', name: '금융권형: 담백한 사실, 완결된 문장, 일관성',
    likes: ['맥락·구체 행동·숫자·상대 반응을 담백하게', '근거가 약해도 문장을 끝맺기(IBK기업은행 인사담당자)', '생각이 필요하면 "잠시 정리하겠습니다"라고 정식으로 시간 요청', '지원동기와 다른 답변의 일관성'],
    dislikes: ['말끝 흐림, 말하는 도중 뚝 끊김', '그럴싸한 포장, 좋은 모습만 나열', '답변 간 모순'],
    cpm: [280, 380], answerSec: [40, 90], latencySec: [0.8, 3],
  },
  startup: {
    key: 'startup', name: '스타트업형: 솔직하고 직설적으로, 의견에 근거를 붙여 대화',
    likes: ['"잘 모릅니다, 다만 이렇게 접근하겠습니다"처럼 솔직하게 인정 후 접근법', '자기 의견 + 근거, 반박에는 대화로 설득', '일관된 답(비슷한 질문을 바꿔 되묻는 검증에 흔들리지 않기)', '숫자·임팩트로 말하기'],
    dislikes: ['정답 외운 듯한 답, 커버하려는 답변', '겸손을 가장한 회피', '결론 없는 탐색'],
    cpm: [320, 430], answerSec: [30, 75], latencySec: [0.5, 2.5],
  },
  general: {
    key: 'general', name: '공통: 두괄식(결론→근거→사례→마무리), 60~90초, 정중한 톤',
    likes: ['결론 → 근거 → 사례 → 한 줄 마무리', '한 답변 60~90초', '정중한 톤, 문장 끝맺기'],
    dislikes: ['60초 미만의 얇은 답, 90초 초과의 상황 설명', '말끝 흐림', '필러 반복'],
    cpm: [300, 400], answerSec: [40, 90], latencySec: [0.8, 3],
  },
  negotiation: {
    key: 'negotiation', name: '협상형: 짧고 차분하게, 숫자에는 근거를, 침묵을 두려워하지 않기',
    likes: ['숫자를 말할 땐 근거(시장 데이터·성과·경쟁 오퍼)를 붙여 한 문장', '상대 제시 뒤 2~3초 침묵 후 반응', '감정 표현 대신 조건으로 말하기'],
    dislikes: ['"~정도면 될 것 같아요" 식 완충 표현으로 숫자 흐리기', '상대 제시에 1초 안에 수락·반응', '길게 사정 설명'],
    cpm: [260, 360], answerSec: [8, 40], latencySec: [1.5, 5],
  },
  executive: {
    key: 'executive', name: '임원 보고형: 결론 한 문장 먼저, 숫자에 출처, 30초 안에',
    likes: ['첫 문장이 결론(숫자 포함)', '근거는 출처·비교 기준과 함께 하나만', '"안 되면"에 플랜 B 한 줄', '끊기면 멈추고 질문에 바로 답'],
    dislikes: ['배경 설명으로 시작', '수치 없는 형용사(많이·크게)', '끊긴 뒤 하던 말을 이어가기'],
    cpm: [300, 400], answerSec: [10, 40], latencySec: [0.5, 2.5],
  },
  patient: {
    key: 'patient', name: '환자형: 언제·어디·어떻게를 짧고 구체적으로, 모르는 말은 되묻기',
    likes: ['시작 시점 → 부위 → 양상 → 빈도 → 악화 요인 순서', '짧은 문장, 숫자(며칠, 하루 몇 번)', '검사·약·비용·재방문 기준을 묻기', '전문용어는 "그게 뭔가요?"'],
    dislikes: ['"좀 안 좋아요" 같은 모호한 표현', '한 번에 여러 증상을 뒤섞기', '이해 안 된 설명을 넘기기'],
    cpm: [280, 400], answerSec: [8, 40], latencySec: [0.5, 3],
  },
  border: {
    key: 'border', name: 'Border control: short, factual, consistent; ask to repeat if unsure',
    likes: ['One short, complete sentence per question (purpose, days, hotel name, return date)', 'Consistent with documents', '"Sorry, could you repeat that?" instead of guessing', 'Calm, no jokes'],
    dislikes: ['Vague answers ("about a month or so")', 'Over-explaining life story', 'Guessing a different question'],
    cpm: [110, 160], answerSec: [2, 12], latencySec: [0.5, 3],
  },
  firm: {
    key: 'firm', name: '사기 대응형: 짧고 단호하게, 정보는 주지 않고, 확인 선언 후 끊기',
    likes: ['"직접 공식 번호로 확인하겠습니다" 한 문장 선언', '짧은 거절, 반복 요구에 같은 말 반복', '망설임 없는 종료'],
    dislikes: ['"어… 네…" 망설임, 상대 페이스에 끌려가는 단답 "네", "아니요"', '정보 조각(은행명·가족 유무) 흘리기', '길게 사정 설명하며 설득 시도'],
    cpm: [300, 420], answerSec: [2, 15], latencySec: [0.3, 2.5],
  },
  finlabRp: {
    key: 'finlabRp', name: '핀랩 RP 테스트형: 결론(유지·조정·해지) 먼저, 고객 언어로, 2분 안에',
    likes: ['첫 30초에 유지/조정/해지 결론과 이유', '무해지·갱신·알릴의무를 비유·예시로', '해지 권유엔 환급금·보장 공백·알릴의무·면책 재시작 고지', '모르면 "확인 후 안내드리겠습니다"'],
    dislikes: ['특약 나열로 시작', '"무조건·확정" 단정', '고객 질문에 침묵·"어…"', '2분을 넘기는 장황한 분석'],
    cpm: [280, 380], answerSec: [30, 120], latencySec: [0.5, 3],
  },
  boundary: {
    key: 'boundary', name: '거절·부탁형: 두 문장 안에 분명하게, 말투는 부드럽게',
    likes: ['거절은 두 문장 안에, 개인 원칙으로("지인이랑 돈거래는 안 하기로 했어")', '부탁은 첫 문장에 금액·용도·상환일', '낮고 천천히, 사과 반복 없이', '거절 뒤 화제 전환 한 문장'],
    dislikes: ['이유를 세 개 이상 나열', '"돈이 없어" 식 애매한 핑계', '상대 비난', '침묵으로 버티다 승낙', '사정만 길게'],
    cpm: [250, 350], answerSec: [4, 25], latencySec: [0.8, 4],
  },
  parent: {
    key: 'parent', name: '학부모 상담형: 첫 30초에 주제와 요청, 사실은 육하원칙으로, 교사 관찰은 끝까지',
    likes: ['첫 문장에 주제와 원하는 것', '"언제·어디서·무엇을" 사실과 증거로', '교사 말을 끊지 않고 되짚기("그러니까 급식 시간에…")', '요청은 조치·기간·연락 방법으로', '감사 인사와 시간 배려'],
    dislikes: ['감정으로 시작해 사실이 늦게 나옴', '다른 아이·학부모 비난', '교사 관찰에 즉각 반박', '"지켜봐 주세요" 같은 모호한 요구', '상대 학생 처벌·연락처 요구'],
    cpm: [260, 360], answerSec: [10, 45], latencySec: [0.8, 3],
  },
  consultant: {
    key: 'consultant', name: '상담사형: 쉬운 말로 한 번에 하나씩, 단정하지 않고, 제안 뒤 침묵을 견디기',
    likes: ['고객 상황을 먼저 묻고 되짚기("~하신 거죠?")', '전문용어는 비유·예시로, 한 번에 한 가지', '"고객님 상황에서는 ~한 경우 유리합니다"처럼 조건부 표현', '핵심 제안 뒤 3~5초 침묵, 결정 재촉 금지', '거절에는 압박 대신 "한두 달 뒤 안부 겸 연락" 수준의 후속 약속'],
    dislikes: ['"무조건·절대·보장" 단정 표현', '설명이 40초 넘게 이어져 고객이 끼어들게 만들기', '고객 질문(수수료 등)을 피해 가기', '용어 나열'],
    cpm: [270, 370], answerSec: [10, 40], latencySec: [0.5, 2.5],
  },
}

const CORP = /대기업|삼성|현대|LG|SK|롯데|포스코|한화|CJ|공사|공공|공기업|공무원|외국계/i
const FIN = /은행|보험사|보험|금융|증권|카드사|캐피탈|저축은행|자산운용|공제/i
const STARTUP = /스타트업|토스|당근|카카오|네이버|배민|우아한|쿠팡|해빗팩토리|시그널플래너|핀테크|\bAI\b|플랫폼|IT 서비스|커머스|게임/i

/** 도메인과 입력값으로 화법 프로필을 고른다 */
export function speechProfileFor(domainId: string, fields: Record<string, string> | undefined): SpeechProfile {
  const f = fields ?? {}
  switch (domainId) {
    case 'interview': {
      const c = `${f.company ?? ''} ${f.role ?? ''} ${f.stage ?? ''}`
      if (/핀랩|시그널파이낸셜랩/.test(c) && /상담사|설계사|RP/.test(c)) return P.finlabRp
      // 스타트업 단서(해빗팩토리·토스·핀테크 스타트업 등)를 먼저 본다. "핀테크"만으로는 금융권으로 보지 않는다
      if (STARTUP.test(c)) return P.startup
      if (FIN.test(c)) return P.finance
      if (CORP.test(c)) return P.corporate
      return P.general
    }
    case 'salary_negotiation': return P.negotiation
    case 'exec_qa': return P.executive
    case 'hospital': return P.patient
    case 'immigration': return P.border
    case 'scam_call': return P.firm
    case 'insurance_consult': return P.consultant
    case 'money_talk': return P.boundary
    case 'parent_teacher': return P.parent
    default: return P.general
  }
}

/** 코치 프롬프트에 붙이는 말투 블록: 프로필 기준 + 측정치 + 해석 지시 */
export function speechBriefForCoach(domainId: string, fields: Record<string, string> | undefined, turns: SpeechTurnLike[] | undefined, lang: 'ko' | 'en' = 'ko'): string {
  const p = speechProfileFor(domainId, fields)
  const s = summarizeSpeech(turns ?? [], lang)
  const band = (r?: [number, number], unit = '') => (r ? `${r[0]}~${r[1]}${unit}` : '기준 없음')
  return `
===== 말투·전달 평가 =====
[이 상황이 선호하는 화법] ${p.name}
- 좋게 보는 것: ${p.likes.join(' / ')}
- 감점 신호: ${p.dislikes.join(' / ')}
- 권장 범위: 말 속도 ${band(p.cpm, lang === 'en' ? ' wpm' : '자/분')}, 한 답변 ${band(p.answerSec, '초')}, 첫 반응 지연 ${band(p.latencySec, '초')}
[측정치 (대화 기록에서 계산)]
${describeSpeechForCoach(s)}
[지시]
- 측정치를 위 권장 범위와 비교해 "speech" 배열에 2~4개 코멘트를 쓴다. 각 코멘트는 숫자 + 해당 발화 인용 + 이 화법 프로필에서 왜 문제/장점인지. 예: "4번째 답이 96초로 권장(40~90초)을 넘었고 '그래서 어… 결국'으로 이어져 결론이 늦었습니다."
- "speechProfile" 에는 위 [이 상황이 선호하는 화법] 한 줄을 그대로 넣는다.
- scoreBreakdown 에 "전달(말투)" 항목을 하나 포함한다(만점 10~15). 필러 수는 음성 인식이 걸러낸 것을 감안해 가볍게만 반영하고, 지연·속도·길이·완충/단정 표현·문장 완결을 주로 본다.
- 음성으로 답한 발화가 없거나(텍스트 모드) 시간 지표가 없으면 표현·길이·완결만 평가하고 속도·지연은 언급하지 않는다.`
}
