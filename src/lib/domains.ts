/* 훈련 도메인 정의 (클라이언트). 서버의 server/domains.ts와 id를 맞춘다. */

export type DomainId = 'interview' | 'scam_call' | 'salary_negotiation' | 'exec_qa' | 'hospital' | 'immigration' | 'insurance_consult' | 'money_talk' | 'parent_teacher' | 'claim_appeal'

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
  /** 긴 문서 입력(선택). 붙여넣기 또는 PDF·TXT 드롭. 브라우저에서 텍스트만 추출해 fields[key]로 보낸다 */
  docs?: { key: string; label: string; hint: string; sample?: { label: string; text: string } }[]
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
    docs: [
      {
        key: 'jd', label: '채용 공고 (선택)', hint: '공고 본문을 붙이거나 PDF·TXT를 놓으세요. 요구사항과 내 이력서를 대조해 질문을 만듭니다.',
        sample: {
          label: '해빗팩토리 백엔드 공고 예시 넣기',
          text: `[예시 공고 · 실제 공고와 다를 수 있습니다]
해빗팩토리 백엔드 개발자 (경력 3년 이상)
담당 업무
- 시그널플래너 보험 분석 서비스의 백엔드 API 설계·운영 (보험사·기관 데이터 연동, 보험 분석 리포트, 숨은보험금 조회)
- 외부 기관 연동의 안정성 확보: 타임아웃·재시도·멱등성, 장애 격리, 관측(로그·메트릭·트레이스)
- 상담 신청 → 상담사 배정 흐름과 알림(문자·앱 푸시) 파이프라인 개발
- 금융 데이터 보안·개인정보 처리 기준 준수
자격 요건
- Node.js/TypeScript 또는 Java/Kotlin 서버 개발 3년 이상
- MySQL 등 RDB 설계·튜닝 경험, Redis·메시지 큐(RabbitMQ/Kafka) 운영 경험
- 장애를 직접 분석하고 재발 방지까지 이어간 경험
우대 사항
- 보험·핀테크 도메인 경험, 마이데이터·기관 연동 경험
- LLM API를 서비스에 붙여 본 경험(프롬프트·평가·비용 관리)
- 작은 팀에서 기획·프론트와 직접 소통하며 기능을 끝까지 만든 경험`,
        },
      },
      { key: 'resume', label: '내 이력서 (선택)', hint: '이력서·경력기술서를 붙이거나 PDF·TXT를 놓으세요. 면접관이 이력서의 프로젝트·수치를 인용해 묻습니다. 원문은 저장하지 않고 요약만 남습니다.' },
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
      { role: '보험 상담사 (정규직 전환)', company: '시그널파이낸셜랩(핀랩) · 시그널플래너 상담 조직', stage: '신입교육 1개월차 최종 RP 테스트 (대면 구두)', years: '무경력 신입 · 교육 1개월' },
      { role: '보험 상담사 (경력 입사)', company: '시그널파이낸셜랩(핀랩) · 시그널플래너 상담 조직', stage: '경력 설계사 채용 RP 면접', years: '설계사 경력 4년' },
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
  {
    id: 'insurance_consult',
    name: '보험 상담 (상담사)',
    short: '보험 상담',
    description: '내가 시그널파이낸셜랩 상담사가 되어, 시그널플래너에서 상담을 신청한 고객에게 콜백 전화를 합니다. 고객은 매번 다른 숨은 사정을 갖고 있고, 2026년 실제 제도(5세대 실손, 보험료 인상, 수수료 공시)를 기준으로 정확성과 설명의무까지 평가합니다.',
    counterpart: '고객',
    startLabel: '콜백 전화 걸기',
    answerHint: '고객이 듣고 있습니다. 상담하세요',
    usesCamera: false,
    fields: [
      { key: 'topic', label: '상담 주제 (신청서)', placeholder: '예: 4세대 실손 보험료 20% 인상, 5세대 전환 문의' },
      { key: 'customer', label: '고객 (신청서 요약)', placeholder: '예: 42세 자영업, 4세대 실손 + 종신 1건' },
      { key: 'persona', label: '고객 성향 (선택 · 비우면 AI가 정함)', placeholder: '예: 까칠함, 질문 많음, 보험 불신, 설계사 불신, 보험 지식 낮음, 조급함' },
      { key: 'level', label: '난이도', placeholder: '초급 / 중급 / 고급' },
      { key: 'career', label: '내 경력', placeholder: '신입 / 1년차 / 3년 이상' },
    ],
    presets: [
      { topic: '4세대 실손 보험료 20% 인상 통지, 5세대로 갈아타야 하나', customer: '42세 자영업, 4세대 실손 + 종신 1건, 허리 치료 중', persona: '', level: '중급', career: '신입' },
      { topic: '보험료가 부담돼 전부 해지하고 싶다', customer: '35세 직장인, 월 보험료 38만 원, 무·저해지 종신 2건 포함', persona: '까칠함, 설계사 불신 강함, 조급함', level: '중급', career: '1년차' },
      { topic: '실손 갱신 안내 문자를 보고 뭐가 바뀌는지 궁금하다', customer: '61세 주부, 2세대 실손, 자녀가 앱 설치해 줌', persona: '질문 많음, 보험 지식 거의 없음, 매우 여유, 친절', level: '초급', career: '신입' },
      { topic: '3세대 실손 16% 인상, 유지가 맞는지', customer: '58세 주부, 3세대 실손, 병원 거의 안 감', level: '초급', career: '신입' },
      { topic: '타사 설계사가 제안한 리모델링 안 비교', customer: '47세 회사원, 타사 제안서 보유, 총 6건 가입', level: '고급', career: '3년 이상' },
      { topic: '부모님(72세) 실손 1세대 유지 vs 전환', customer: '40세 자녀가 대신 문의, 부모님이 결정', level: '중급', career: '1년차' },
      { topic: '무·저해지 종신이 싸다던데 가입하고 싶다', customer: '29세 첫 직장, 보험 처음, 유튜브 정보', level: '초급', career: '신입' },
      { topic: '숨은보험금 청구 가능하다고 앱에 떠서 문의', customer: '51세 자영업, 실손 2세대, 최근 입원 이력', level: '초급', career: '1년차' },
      { topic: '어린이보험·태아보험 신규 가입', customer: '33세 임신 7개월, 첫 아이', level: '중급', career: '신입' },
      { topic: '이 전화 사기 아니냐, 시그널플래너 사칭 뉴스 봤다', customer: '63세, 앱으로 숨은보험금 조회 후 상담 신청', level: '고급', career: '1년차' },
    ],
  },
  {
    id: 'money_talk',
    name: '지인과 돈 이야기',
    short: '돈 이야기',
    description: '지인이 돈을 빌려달라고 할 때 관계를 지키며 거절하거나, 반대로 내가 예의 있게 부탁하는 연습. 상대는 급함·죄책감·금액 낮추기 같은 실제 압박 패턴을 쓰고, 셋 중 하나는 사정이 진짜인 정상 부탁이라 판단력도 함께 봅니다.',
    counterpart: '지인',
    startLabel: '대화 시작',
    answerHint: '지인이 듣고 있습니다. 말씀하세요',
    usesCamera: true,
    fields: [
      { key: 'side', label: '내 역할', placeholder: '거절하는 쪽 (지인이 빌려달라고 함) / 빌리는 쪽 (내가 부탁)' },
      { key: 'relation', label: '관계', placeholder: '예: 5년 지기 친구 / 옆 팀 동료 / 사촌 형' },
      { key: 'amount', label: '금액', placeholder: '예: 300만 원' },
      { key: 'situation', label: '상황', placeholder: '예: 사업 급전, 다음 달 갚겠다고 함' },
    ],
    presets: [
      { side: '거절하는 쪽 (지인이 빌려달라고 함)', relation: '5년 지기 친구', amount: '300만 원', situation: '사업 급전, 다음 달 월급으로 갚겠다고 함' },
      { side: '거절하는 쪽 (지인이 빌려달라고 함)', relation: '옆 팀 동료', amount: '50만 원', situation: '월급 전까지만, 카드값 연체 직전' },
      { side: '거절하는 쪽 (지인이 빌려달라고 함)', relation: '사촌 형', amount: '1,000만 원', situation: '전세 보증금 부족, 부모님께는 말하지 말아 달라 함' },
      { side: '거절하는 쪽 (지인이 빌려달라고 함)', relation: '오랜만에 연락 온 고등학교 동창', amount: '200만 원', situation: '갑자기 연락해 급하다고만 함' },
      { side: '거절하는 쪽 (지인이 빌려달라고 함)', relation: '친한 친구', amount: '150만 원', situation: '전에 빌려준 100만 원도 아직 안 갚은 상태에서 두 번째 부탁' },
      { side: '거절하는 쪽 (지인이 빌려달라고 함)', relation: '전 연인', amount: '500만 원', situation: '헤어진 뒤 연락, 병원비라고 함' },
      { side: '빌리는 쪽 (내가 부탁)', relation: '친한 친구', amount: '80만 원', situation: '병원비, 다음 달 25일 월급으로 갚을 계획' },
      { side: '빌리는 쪽 (내가 부탁)', relation: '형(친형)', amount: '500만 원', situation: '이사 보증금 부족, 3개월 분할 상환 계획' },
      { side: '빌리는 쪽 (내가 부탁)', relation: '대학 선배', amount: '200만 원', situation: '노트북 고장으로 급히 필요, 두 달 뒤 상환' },
    ],
  },
  {
    id: 'parent_teacher',
    name: '학부모 상담',
    short: '학부모 상담',
    description: '자녀 문제(따돌림 의심, 성적 하락, 생활지도, 교우관계, 과목 선택)로 담임교사와 15분 면담합니다. 담임은 내가 모르는 관찰 사실을 갖고 있고, 학교폭력 절차·생활지도 고시·2026 스마트폰 금지법·고교학점제 같은 최신 제도를 정확히 안내합니다.',
    counterpart: '담임교사',
    startLabel: '면담 시작',
    answerHint: '선생님이 듣고 있습니다. 말씀하세요',
    usesCamera: true,
    fields: [
      { key: 'child', label: '자녀', placeholder: '예: 초4 딸 / 중2 아들 / 고1 아들' },
      { key: 'topic', label: '상담 주제 (신청서)', placeholder: '예: 따돌림 의심 / 성적 하락 / 수업 중 스마트폰 / 과목 선택' },
      { key: 'situation', label: '내가 아는 상황', placeholder: '예: 2주 전부터 학교 가기 싫다고 함, 단톡에서 빠짐' },
      { key: 'goal', label: '원하는 결과', placeholder: '예: 학교에서 무슨 일이 있는지 확인, 자리 조정' },
    ],
    presets: [
      { child: '초4 딸', topic: '따돌림 의심', situation: '2주 전부터 학교 가기 싫다고 함, 친구 단톡에서 빠졌다고 함', goal: '학교에서 무슨 일이 있는지 확인하고 대응 방법 정하기' },
      { child: '중2 아들', topic: '학교폭력 피해 신고 여부 상의', situation: '같은 반 아이에게 밀쳐져 멍이 들었고 카톡 욕설 캡처 있음', goal: '신고 절차와 학교가 해 줄 수 있는 것 확인' },
      { child: '중1 딸', topic: '성적 하락', situation: '1학기 중간 대비 수학·영어 크게 하락, 밤늦게까지 폰을 봄', goal: '원인 파악과 학교에서의 모습 확인' },
      { child: '고1 아들', topic: '고교학점제 과목 선택 상담', situation: '진로가 정해지지 않아 2학년 선택과목을 못 정함', goal: '선택 기준과 이수 계획 조언' },
      { child: '초2 아들', topic: '수업 중 돌아다니고 친구를 방해한다는 알림', situation: '집에서는 얌전한데 학교에서 그렇다니 당황', goal: '실제 모습 확인, 가정에서 도울 방법' },
      { child: '중3 딸', topic: '수업 중 스마트폰 사용으로 분리 조치 받음', situation: '아이가 억울하다고 함, 2026년 법 시행 이후 첫 조치', goal: '상황 확인과 재발 방지' },
      { child: '초6 아들', topic: '우리 아이가 가해자로 지목됨', situation: '다른 학부모가 학교에 연락했다고 담임이 알림', goal: '사실 확인과 아이 입장 전달, 절차 이해' },
      { child: '고2 딸', topic: '교우관계와 무기력', situation: '친구를 만나지 않고 성적 관심도 떨어짐', goal: '학교에서의 모습 확인, 상담 연계 가능성' },
      { child: '초5 아들', topic: '담임의 지도 방식에 대한 불만', situation: '아이가 선생님이 자기만 혼낸다고 함', goal: '오해인지 확인하고 관계 풀기 (감정 조절 훈련)' },
    ],
  },
  {
    id: 'claim_appeal',
    name: '실손 청구 거절 이의신청',
    short: '청구 이의',
    description: '보험사가 거절한 실손 청구 건으로 보상 담당자에게 전화해 이의를 제기합니다. 서면 사유·약관 조항 요구, 소견서 재심사, 의료자문 대응(제3의료기관 동시감정), 손해사정사 선임권, 금감원 민원까지 2025~26 실제 절차와 통계 기반. 부지급이 정당한 건도 섞여 있어 판단력도 봅니다.',
    counterpart: '보상 담당자',
    startLabel: '고객센터 전화',
    answerHint: '담당자가 듣고 있습니다. 말씀하세요',
    usesCamera: false,
    fields: [
      { key: 'claim', label: '청구 내용', placeholder: '예: 도수치료 12회차 18만 원' },
      { key: 'denial', label: '보험사 거절 통보', placeholder: '예: 문자로 "치료 효과 불인정, 약관상 부지급"' },
      { key: 'situation', label: '내 상황', placeholder: '예: 4세대 실손, 허리 디스크 진단, 주치의 소견서 받을 수 있음' },
      { key: 'goal', label: '원하는 결과', placeholder: '예: 재심사 접수와 서면 사유 확보' },
    ],
    presets: [
      { claim: '도수치료 12회차 18만 원', denial: '문자로 "10회 이후 치료 효과 불인정, 약관상 부지급"', situation: '4세대 실손, 허리 디스크 진단, 주치의 소견서 받을 수 있음', goal: '서면 사유 확보와 재심사 접수' },
      { claim: '비급여 영양 수액 3회 27만 원', denial: '"예방·피로 회복 목적은 보장 제외"', situation: '3세대 실손, 급성 장염으로 처방받은 수액', goal: '치료 목적 소견서로 재심사' },
      { claim: '백내장 다초점렌즈 수술 380만 원', denial: '"입원 필요성 없어 통원 한도 25만 원만 인정"', situation: '2세대 실손, 양안 수술, 병원은 입원 처리', goal: '거절 근거 확인과 대응 방향 결정' },
      { claim: '무릎 MRI·주사 치료 62만 원', denial: '"가입 전 무릎 진료 이력 미고지로 계약 해지 및 부지급"', situation: '2년 전 가입, 가입 전 단순 타박상 진료 1회', goal: '고지의무 위반 주장의 근거와 인과관계 확인' },
      { claim: '입원 7일 실손 210만 원', denial: '"진료기록지·세부내역서 추가 제출 요청" 후 두 달 무응답', situation: '서류는 이미 두 번 보냄', goal: '접수 상태 확인, 기한과 담당자 확보' },
      { claim: '체외충격파 8회 40만 원', denial: '"의료자문 동의 후 재검토 가능"', situation: '4세대 실손, 족저근막염, 의료자문 동의서가 우편으로 옴', goal: '동의 전 자문 사유·기관 확인, 동시감정 요구' },
      { claim: '하지정맥류 레이저 시술 190만 원', denial: '"미용 목적으로 판단"', situation: '통증·부종 기록 있음, 3세대 실손', goal: '치료 목적 입증 자료로 재심사' },
      { claim: '통원 치료 12회 36만 원', denial: '"본인부담상한제 환급 예정액 공제 후 지급"', situation: '4세대 실손, 공제 계산 근거를 못 받음', goal: '공제 근거 약관 조항과 계산서 서면 요구' },
      { claim: '어깨 도수치료 6회 9만 원', denial: '"약관상 부보장 항목"이라고만 통보', situation: '무슨 조항인지 설명 없음, 5세대 실손로 전환한 첫 청구', goal: '정확한 거절 조항 확인 (부지급이 정당할 수도 있음)' },
    ],
  },
]

export const domainById = (id: DomainId) => DOMAINS.find((d) => d.id === id) ?? DOMAINS[0]

/** 세션 제목 등에 쓰는 한 줄 요약 */
export function summarizeFields(id: DomainId, fields: Record<string, string>) {
  return domainById(id).fields.map((f) => fields[f.key]).filter(Boolean).join(' · ')
}
