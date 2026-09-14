/* 훈련 도메인 정의 (클라이언트). 서버의 server/domains.ts와 id를 맞춘다. */

export type DomainId = 'interview' | 'scam_call' | 'salary_negotiation' | 'exec_qa' | 'hospital' | 'immigration'

export interface FieldDef {
  key: string
  label: string
  placeholder?: string
}

export interface DomainDef {
  id: DomainId
  name: string // 탭 이름
  short: string // 홈 버튼 등 짧은 명칭
  description: string
  counterpart: string // 상대 호칭 (면접관 / 발신자)
  startLabel: string // 준비 화면 시작 버튼
  answerHint: string // 듣는 중 안내
  usesCamera: boolean // false면 카메라를 요청하지 않고 통화 화면으로 진행 (전화 상황)
  lang?: 'ko' | 'en' // 대화 언어. 음성 인식·합성에 반영. 기본 ko
  hideTitleBeforeStart?: boolean // 준비 화면에서 제목을 숨김 (판별 훈련)
  fields: FieldDef[]
  presets: Record<string, string>[]
}

export const DOMAINS: DomainDef[] = [
  {
    id: 'interview',
    name: '면접',
    short: '면접',
    description: 'AI 면접관과 5분 실전 면접. 2025~2026 실제 면접 질문과 꼬리질문 패턴 기반. 개발·기획·마케팅·디자인·QA 등 직군별.',
    counterpart: '면접관',
    startLabel: '면접 시작',
    answerHint: '듣고 있습니다. 답변해 주세요',
    usesCamera: true,
    fields: [
      { key: 'role', label: '직무' },
      { key: 'company', label: '회사 유형', placeholder: '예: 핀테크 스타트업 / 해빗팩토리' },
      { key: 'stage', label: '면접 단계' },
      { key: 'years', label: '경력' },
    ],
    presets: [
      { role: '백엔드 개발자', company: '핀테크 스타트업', stage: '2차 실무 면접', years: '경력 3년' },
      { role: '서비스 기획자(PM)', company: '금융 플랫폼', stage: '과제 리뷰 면접', years: '경력 4년' },
      { role: '퍼포먼스 마케터', company: '커머스 스타트업', stage: '1차 직무 면접', years: '경력 2년' },
      { role: '프로덕트 디자이너', company: 'IT 서비스 기업', stage: '포트폴리오 리뷰', years: '경력 3년' },
      { role: 'QA 엔지니어', company: '게임 회사', stage: '1차 실무 면접', years: '신입' },
      { role: '프론트엔드 개발자', company: '커머스 플랫폼', stage: '신입 기술 면접', years: '신입' },
      { role: '데이터 분석가', company: '보험사', stage: '임원 면접', years: '경력 2년' },
      { role: '영업 관리', company: '보험 GA', stage: '최종 면접', years: '경력 6년' },
      { role: 'AI·LLM 애플리케이션 엔지니어', company: 'AI 에이전트 스타트업', stage: '2차 기술 면접 (운영 경험 중심)', years: '경력 4년' },
      { role: 'DevOps/SRE', company: '커머스 플랫폼', stage: '1차 기술 면접', years: '경력 3년' },
      { role: '데이터 엔지니어', company: '핀테크', stage: '2차 실무 면접', years: '경력 5년' },
      { role: '안드로이드 개발자', company: '금융 플랫폼', stage: '2차 기술 면접', years: '경력 6년' },
      { role: '그로스 마케터', company: 'AI 서비스 스타트업', stage: '1차 직무 면접', years: '경력 3년' },
      { role: 'CX(고객경험) 매니저', company: '보험 플랫폼', stage: '최종 면접', years: '경력 2년' },
      { role: '콘텐츠 마케터', company: '금융 플랫폼', stage: '과제 리뷰 면접', years: '신입' },
      { role: 'HR(인사) 담당자', company: 'IT 스타트업', stage: '1차 실무 면접', years: '경력 4년' },
      { role: '백엔드 개발자', company: '해빗팩토리 (핀테크 · 시그널플래너)', stage: '2차 기술 면접', years: '경력 3년' },
      { role: '프로덕트 디자이너', company: '해빗팩토리 (핀테크 · 시그널플래너)', stage: '포트폴리오 리뷰', years: '경력 4년' },
      { role: '서비스 기획자(PM)', company: '해빗팩토리 (핀테크 · 시그널플래너)', stage: '임원(대표) 면접', years: '경력 5년' },
      { role: 'iOS 개발자', company: '해빗팩토리 (핀테크 · 시그널플래너)', stage: '1차 기술 면접', years: '경력 2년' },
    ],
  },
  {
    id: 'scam_call',
    name: '금융사기 전화',
    short: '사기 전화 대응',
    description: '2024~2026 실제 사례를 기반으로 사기범(또는 진짜 기관)의 전화를 받아 의심하고, 정보를 지키고, 끊는 연습. 진짜 전화가 섞여 나옵니다.',
    counterpart: '발신자',
    startLabel: '전화 받기',
    answerHint: '통화 중입니다. 말씀하세요',
    usesCamera: false,
    hideTitleBeforeStart: true,
    fields: [
      { key: 'scenario', label: '상황', placeholder: '랜덤 / 검찰·경찰 사칭 / 카드 배송 / 대환대출 / 자녀 사칭 / AI 목소리 / 악성앱·전화 가로채기 / 보험조정센터 / 시그널플래너 사칭' },
      { key: 'persona', label: '내가 연기할 사람', placeholder: '예: 30대 직장인 본인' },
      { key: 'level', label: '난이도', placeholder: '초급 / 중급 / 고급' },
    ],
    presets: [
      { scenario: '랜덤', persona: '30대 직장인 본인', level: '중급' },
      { scenario: '시그널플래너 사칭 (숨은보험금 환급)', persona: '시그널플래너로 숨은보험금을 조회해 본 40대', level: '중급' },
      { scenario: '검찰·경찰 사칭 (등기·구속영장)', persona: '60대 부모님 입장', level: '초급' },
      { scenario: '카드 배송 사칭 → 명의도용', persona: '30대 직장인 본인', level: '고급' },
      { scenario: '저금리 대환대출 안내', persona: '대출이 있는 40대', level: '고급' },
      { scenario: '자녀 사칭 (액정 파손·급전)', persona: '중학생 자녀를 둔 50대 부모', level: '중급' },
      { scenario: '보험조정센터 사칭', persona: '실손·운전자보험 가입자', level: '초급' },
      { scenario: '설계사 사칭 · 실효 보험 부활 (개인계좌 입금)', persona: '보험료를 몇 달 못 내 실효된 30대', level: '중급' },
      { scenario: '택배·과태료 문자 → 악성앱 설치 → 전화 가로채기 (강수강발)', persona: '택배를 자주 받는 20대 직장인', level: '고급' },
      { scenario: '자녀 AI 목소리 합성 · 사고 합의금 요구', persona: '대학생 자녀를 둔 50대 부모', level: '고급' },
      { scenario: '검찰·경찰 사칭 (본인인증 앱 설치·안전계좌)', persona: '60대 부모님 입장', level: '중급' },
    ],
  },
  {
    id: 'salary_negotiation',
    name: '연봉 협상',
    short: '연봉 협상',
    description: '오퍼를 받은 뒤 회사 측(대표·인사담당자·채용 매니저·팀장)과 연봉을 협상합니다. 상대는 직무와 현재 연봉만 알고 있고, 희망 연봉과 경쟁 오퍼는 내가 꺼내야 하는 카드입니다. 회사의 실제 한도는 리포트에서 공개됩니다.',
    counterpart: '회사 측',
    startLabel: '협상 시작',
    answerHint: '협상 중입니다. 말씀하세요',
    usesCamera: true,
    fields: [
      { key: 'role', label: '직무' },
      { key: 'current', label: '현재 연봉', placeholder: '예: 5,500만 원' },
      { key: 'target', label: '희망 연봉 (내 목표 · 상대는 모름)', placeholder: '예: 7,000만 원' },
      { key: 'situation', label: '상황 (내 카드 · 상대는 모름)', placeholder: '이직 오퍼 / 재직 중 조정 / 첫 직장 / 경쟁 오퍼 있음 / 대표와 협상 / 해빗팩토리 오퍼' },
    ],
    presets: [
      { role: '백엔드 개발자', current: '5,500만 원', target: '7,000만 원', situation: '이직 오퍼를 받은 상태' },
      { role: '서비스 기획자', current: '4,800만 원', target: '5,800만 원', situation: '재직 중 연봉 조정 요청' },
      { role: '마케터', current: '없음 (신입)', target: '4,200만 원', situation: '첫 직장 오퍼' },
      { role: '디자이너', current: '6,000만 원', target: '7,500만 원', situation: '경쟁 오퍼가 하나 더 있음' },
      { role: 'AI 엔지니어 (LLM 서비스)', current: '7,200만 원', target: '9,000만 원', situation: '이직 오퍼, 스톡옵션도 제안됨' },
      { role: '데이터 분석가', current: '5,200만 원', target: '6,000만 원', situation: '재직 중 조정 요청, 승진 없이 역할만 커진 상태' },
      { role: '프론트엔드 개발자', current: '6,300만 원', target: '7,000만 원', situation: '이직 오퍼, 주 3일 재택도 협상 대상' },
      { role: 'QA 엔지니어', current: '4,600만 원', target: '5,400만 원', situation: '첫 이직, 경쟁 오퍼 없음' },
      { role: '프로덕트 매니저', current: '8,000만 원', target: '9,500만 원', situation: '대기업 → 스타트업 이직, 사이닝 보너스 논의' },
      { role: '프론트엔드 개발자', current: '6,000만 원', target: '7,200만 원', situation: '해빗팩토리 이직 오퍼, 대표와 직접 협상' },
      { role: '백엔드 개발자', current: '5,800만 원', target: '7,000만 원', situation: '해빗팩토리 재직 중 연봉 조정, 인사 팀장과 면담' },
      { role: '데이터 엔지니어', current: '6,500만 원', target: '7,800만 원', situation: '시리즈 B 스타트업 오퍼, 대표가 직접 협상, 스톡옵션 제안됨' },
    ],
  },
  {
    id: 'exec_qa',
    name: '임원 보고 Q&A',
    short: '임원 보고',
    description: '보고를 마친 직후 임원의 질의응답 5분. 결론 먼저, 숫자 근거, 플랜 B를 검증합니다.',
    counterpart: '임원',
    startLabel: '질의응답 시작',
    answerHint: '임원이 듣고 있습니다. 답변하세요',
    usesCamera: true,
    fields: [
      { key: 'topic', label: '보고 주제' },
      { key: 'message', label: '핵심 메시지 (한 줄)', placeholder: '예: 신규 상품 출시로 분기 전환율 3.2% 달성 전망' },
      { key: 'audience', label: '보고 대상', placeholder: '대표 / CFO / 본부장 / 해빗팩토리 대표' },
      { key: 'situation', label: '상황', placeholder: '예: 지난 분기 목표 미달 직후' },
    ],
    presets: [
      { topic: '신규 대출 상품 출시 계획', message: '출시 후 3개월 내 전환율 3.2%, 월 매출 4천만 원', audience: 'CFO', situation: '지난 분기 목표 미달 직후' },
      { topic: '앱 개편 결과 보고', message: '개편 후 리텐션 12% 상승, 이탈 구간 해소', audience: '대표', situation: '개편 비용이 예산을 20% 초과한 상태' },
      { topic: '마케팅 예산 증액 요청', message: 'CAC 15% 절감 위해 채널 재배분과 예산 30% 증액', audience: '본부장', situation: '경쟁사 공격적 집행 중' },
      { topic: '장애 사후 보고', message: '결제 장애 40분, 원인은 배포 설정, 재발 방지책 3가지', audience: 'CTO', situation: '고객 불만 접수 200건' },
      { topic: 'AI 상담 자동화 도입 결과', message: '문의 42% 자동 처리, 상담 인건비 월 1,800만 원 절감', audience: '대표', situation: '"AI가 답을 못 한다"는 앱 리뷰 증가' },
      { topic: '개인정보 유출 의심 보안 사고 대응', message: '유출 없음 확인, 접근 로그 전량 검토, 인증 체계 개편안', audience: '대표·CISO', situation: '언론 문의 1건 들어온 상태' },
      { topic: '일본 시장 진출 타당성', message: '초기 투자 8억, 18개월 내 손익분기', audience: 'CFO', situation: '환율·규제 리스크 지적 예상' },
      { topic: '클라우드 비용 절감 결과', message: '비용 28% 절감, 성능 저하 없음', audience: 'CTO', situation: '지난달 장애와 연관 의심' },
      { topic: '연간 OKR 중간 점검', message: '핵심 지표 3개 중 2개 달성, 1개 미달 원인과 재계획', audience: '본부장', situation: '팀 인원 조정 논의 중' },
      { topic: '시그널플래너 숨은보험금 조회 개편 결과', message: '조회 완료율 18%p 상승, 상담 연결 전환 2배', audience: '해빗팩토리 대표', situation: '개편에 든 개발 기간이 계획보다 한 달 초과' },
      { topic: '시그널플래너 사칭 사기 대응 현황', message: '사칭 신고 주 12건, 앱 공지·LMS 발송 완료, 탐지 자동화 제안', audience: '해빗팩토리 CTO', situation: '피해 고객 1명 30만 원 입금 사례 접수 직후' },
      { topic: '개인정보 접근 로그 점검 결과', message: '이상 접근 0건, 권한 과다 계정 7개 정리, 분기 점검 자동화 제안', audience: '해빗팩토리 정보보호(CISO)', situation: '금융권 유출 사고 보도 직후 경영진 관심 높음' },
      { topic: '상담 연결 전환 개선안', message: '앱 내 상담 신청 → 첫 통화까지 평균 26시간을 8시간으로', audience: '핀랩 CEO', situation: '상담사 인력은 그대로 유지해야 하는 조건' },
    ],
  },
  {
    id: 'hospital',
    name: '병원 진료',
    short: '병원 진료',
    description: '짧은 진료 시간 안에 증상을 정확히 전달하고, 검사·약·비용·재방문 기준을 묻는 연습.',
    counterpart: '의사',
    startLabel: '진료 시작',
    answerHint: '의사가 듣고 있습니다. 말씀하세요',
    usesCamera: true,
    fields: [
      { key: 'symptom', label: '증상', placeholder: '예: 2주째 오후마다 두통' },
      { key: 'duration', label: '기간·경과', placeholder: '예: 2주 전 시작, 최근 심해짐' },
      { key: 'persona', label: '나', placeholder: '예: 30대, 복용 약 없음' },
    ],
    presets: [
      { symptom: '오후마다 생기는 두통', duration: '2주 전 시작, 최근 잦아짐', persona: '30대 직장인, 복용 약 없음' },
      { symptom: '허리 통증, 다리 저림', duration: '한 달, 앉아 있으면 심해짐', persona: '40대, 하루 9시간 앉아 근무' },
      { symptom: '속 쓰림과 더부룩함', duration: '3주, 식후 심함', persona: '50대, 고혈압약 복용' },
      { symptom: '아이 열 38.5도', duration: '어제 밤부터', persona: '5세 아이 보호자' },
      { symptom: '가슴 두근거림과 숨 찬 느낌', duration: '2주, 야근 뒤 심해짐', persona: '30대, 커피 하루 3잔' },
      { symptom: '잠들기 어렵고 아침에 피로', duration: '한 달 이상', persona: '40대, 수면제 복용 안 함' },
      { symptom: '무릎 통증, 계단 내려갈 때 심함', duration: '3개월, 러닝 시작 이후', persona: '30대, 주 3회 러닝' },
      { symptom: '눈 건조·피로, 저녁에 시야 흐림', duration: '두 달, 모니터 장시간', persona: '20대 개발자' },
      { symptom: '어깨·목 결림과 손 저림', duration: '6주, 재택근무 시작 이후', persona: '30대 재택근무자' },
    ],
  },
  {
    id: 'immigration',
    name: '해외 입국 심사 (영어)',
    short: '입국 심사',
    description: 'Immigration officer와 영어로 입국 심사. 목적·기간·숙소·귀국편을 짧고 명확하게. 영국 ETA, EU EES·ETIAS 등 2025~2026 제도 반영. 리포트는 한국어로, 표현 교정 포함.',
    counterpart: 'Officer',
    startLabel: '심사대로 이동',
    answerHint: 'The officer is waiting. Speak now',
    usesCamera: true,
    lang: 'en',
    fields: [
      { key: 'destination', label: '입국 국가·도시', placeholder: '예: 미국 LA' },
      { key: 'purpose', label: '방문 목적', placeholder: '관광 / 출장 / 친구 방문 / 유학' },
      { key: 'stay', label: '체류 기간', placeholder: '예: 2주' },
      { key: 'level', label: '난이도', placeholder: '초급 / 중급 / 고급' },
    ],
    presets: [
      { destination: '미국 LA', purpose: '관광', stay: '2주', level: '중급' },
      { destination: '영국 런던', purpose: '출장 (컨퍼런스)', stay: '5일', level: '고급' },
      { destination: '캐나다 밴쿠버', purpose: '친구 방문', stay: '10일', level: '초급' },
      { destination: '호주 시드니', purpose: '어학연수', stay: '3개월', level: '중급' },
      { destination: '일본 도쿄 (Visit Japan Web 등록)', purpose: '관광', stay: '4일', level: '초급' },
      { destination: '프랑스 파리 (EES 생체정보 등록 후 심사)', purpose: '관광 + 친구 방문', stay: '12일', level: '중급' },
      { destination: '영국 런던 (ETA 발급 완료)', purpose: '관광', stay: '1주', level: '초급' },
      { destination: '미국 뉴욕 (ESTA)', purpose: '단기 출장 (파트너 미팅)', stay: '1주', level: '고급' },
      { destination: '독일 베를린', purpose: '스타트업 컨퍼런스 참가', stay: '6일', level: '중급' },
      { destination: '뉴질랜드 오클랜드 (NZeTA)', purpose: '워킹홀리데이 입국', stay: '12개월', level: '고급' },
    ],
  },
]

export const domainById = (id: DomainId) => DOMAINS.find((d) => d.id === id) ?? DOMAINS[0]

/** 세션 제목 등에 쓰는 한 줄 요약 */
export function summarizeFields(id: DomainId, fields: Record<string, string>) {
  return domainById(id).fields.map((f) => fields[f.key]).filter(Boolean).join(' · ')
}
