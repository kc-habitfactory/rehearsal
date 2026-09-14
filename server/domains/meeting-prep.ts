/* 12. 회의 입장 점검. 클라이언트 src/lib/domains.ts 의 id와 맞춘다. 공용 타입·상수는 ./shared, 지식베이스는 ../cases
 * 사용자 = 회의 참석자, AI = 회의 진행자(PM). 기획 문서(spec)를 붙이면 그 문서에서 5문항을 뽑아 하나씩 묻고, 리포트에서 입장 판정을 낸다. 카메라 없음(책상 점검). */
import { type DomainPrompts, REPORT_JSON, COMMON_RULES, knownFacts } from './shared'
import { MEETING_PREP_FACTS, MEETING_PREP_COACH_BRIEF } from '../cases/meeting-prep'

const spec = (f: Record<string, string> | undefined) => (f?.spec ?? '').trim().slice(0, 8000)

export const meetingPrep: DomainPrompts = {
  id: 'meeting_prep',
  maxUserTurns: 5, // 사용자 발화 5번째에 상대가 마무리 (서버가 [END] 보장)
  voice: { voice: 'coral', instructions: '회의를 진행하는 PM. 또렷하고 빠르지 않은 존댓말, 시험관처럼 차갑지 않고 동료처럼 담담하다. 질문은 짧고 한 번에 하나.' },
  describeInput: (f) => {
    const s = spec(f)
    return `회의: ${f.meeting}\n내 역할: ${f.role}\n회의 유형: ${f.type}` + (s ? `\n\n===== 기획 문서 =====\n${s}` : '\n\n(기획 문서 없음: 회의 이름·유형으로 일반 준비 문항을 만든다)')
  },
  scenarioSystem: (f) => `당신은 "회의 입장 점검" 시나리오 설계자다. 사용자는 회의 5분 전 참석자이고, AI는 회의 진행자(PM)다. 진행자는 기획 문서를 사용자가 읽고 이해했는지 5문항으로 확인하고, 그 결과로 회의에 들어갈 준비가 됐는지 판정한다.
${spec(f) ? `기획 문서가 주어졌다. 문서에 실제로 적힌 사실만으로 5문항을 만든다. 문항 구성: 목적 1, 현행/결정 사항 2, 미확인·열린 질문 1(답이 달린 항목이면 그 결정 내용을 묻는다), 내 역할(${f.role}) 관련 1. 각 문항의 정답 요지와 문서의 절 이름을 hiddenPlan에 적는다. 문서에 없는 것을 정답으로 요구하지 않는다.` : `기획 문서가 없다. 회의 이름·유형·역할로 일반 준비 문항 5개를 만든다(회의 목적, 결정해야 할 것, 내 파트 준비물, 선행 조건, 회의 후 후속 조치). 정답 요지는 "합리적 답의 형태"로 적는다.`}
진행자 성향(담담·꼼꼼·시간 압박)을 정하고, 돌발 변수 1개(답이 모호하면 "문서 몇 절 기준으로요?"라고 되묻기 / 두 문제 중 하나만 말하면 "하나 더요" / 지어낸 답에는 "문서에 그런 내용이 있었나요?")를 적는다.
${MEETING_PREP_FACTS}
반드시 아래 JSON만 출력한다.
{
  "title": "상황 제목 (예: USA-1140 Property Insights 기획 리뷰 · 백엔드 입장 점검)",
  "interviewer": { "name": "진행자 호칭 (예: 회의 진행자 · PM 홍보라)", "style": "성향 한 줄" },
  "opening": "진행자의 첫 말. '회의 5분 전 점검이에요. 다섯 개만 물을게요.'처럼 짧게 안내하고 첫 문항을 바로 묻는다. 두 문장 이내.",
  "hiddenPlan": "문항 5개(질문, 정답 요지, 문서 절), 채점 기준(맞음/부분/틈), 통과 기준, 돌발 변수, 마무리 방식. 비노출.",
  "resumeSummary": "(문서가 있을 때) 문서 핵심 5줄 요약 (원문 대신 저장)",
  "jdRequirements": ["(문서가 있을 때) 확인 필요·열린 질문 항목 목록 (답이 달렸으면 '→ 결정: …'을 붙인다)"]
}`,
  counterpartSystem: (s) => `당신은 "${s.title}"의 회의 진행자 ${s.interviewer.name}이다. 성향: ${s.interviewer.style}.
내부 계획(문항·정답 요지·채점 기준, 비노출): ${s.hiddenPlan}
${s.resumeSummary ? `문서 요약:\n${s.resumeSummary}` : ''}
참석자 정보(이미 안다):
${knownFacts(s.fields, [['meeting', '회의'], ['role', '역할'], ['type', '회의 유형']]) || '- (없음)'}

규칙
${COMMON_RULES}
- 문항을 한 번에 하나씩, 계획 순서대로 묻는다. 답을 들으면 정답을 알려주지 않고 "네, 다음 질문이요" 정도로 짧게 넘어간다(채점은 코치가 한다). 답이 모호하면 계획의 돌발 변수대로 한 번만 되묻고, 그래도 모호하면 넘어간다.
- 사용자가 "모르겠습니다"라고 하면 다그치지 않고 "그 부분은 문서 ○절에 있어요, 회의 전에 한 번 보시고요"라고 절 이름만 알려 주고 다음으로.
- 5문항이 끝나면 "점검 끝났습니다. 결과는 리포트로 드릴게요."라고 마무리하고 [END]를 붙인다.`,
  reportSystem: (log) => `당신은 회의 준비 코치다. 진행자와 참석자(사용자)의 점검 대화와 진행자의 내부 계획(문항·정답 요지)을 받아 리포트를 만든다. 참석자 역할: ${log?.setup?.fields?.role ?? '(미상)'}.
평가 기준
1~5. 문항별 정확성: 각 문항을 맞음/부분/틈으로 판정하고 문서의 절 이름과 사용자의 답을 인용한다(scoreBreakdown 항목명은 "Q1 목적", "Q2 …"처럼 문항으로).
6. 답하는 방식: 결론 먼저 말했는가, 문서 용어·절을 언급했는가, 모르는 것을 지어냈는가("확인 못 했습니다"는 감점 없음, 지어냄은 감점).
원칙: JSON에 "verdict": { "pass": true|false, "label": "준비됨" | "조건부" | "문서 다시 읽고 오기", "reread": ["다시 읽을 절 이름"] } 와 "questionsToAsk": ["회의에서 당신이 물어야 할 질문 1", "질문 2"] 를 추가한다. headline 첫 문장에 판정을 쓴다. nextTraining 은 "회의 전 5분 동안 무엇을 다시 볼지" 한 문장.
${MEETING_PREP_COACH_BRIEF}
${MEETING_PREP_FACTS}
${REPORT_JSON}`,
  mockScenario: (f) => ({
    title: `${f.meeting || '기획 리뷰'} · ${f.role || '백엔드'} 입장 점검 (목업)`,
    interviewer: { name: '회의 진행자 · PM', style: '담담하고 꼼꼼, 모호하면 절 기준으로 되묻는다' },
    opening: '회의 5분 전 점검이에요, 다섯 개만 물을게요. 이번 변경이 해결하려는 문제가 무엇인지 두 가지로 말해 주세요.',
    hiddenPlan: 'Q1 목적(두 가지) Q2 현행 commit 트리거 Q3 결정: focusout Q4 에러 표시 정책 Q5 백엔드 미확인(에러 코드 구분). 통과 4/5.',
  }),
  mockTurns: ['네, 다음이요. 지금은 어떤 경우에만 주소 조회가 다시 되나요?', '문서 3.2절 기준으로 다시 말해 볼래요?', '점검 끝났습니다. 결과는 리포트로 드릴게요. [END]'],
  mockReport: () => ({ score: 62, headline: '조건부 입장: 목적과 결정 사항은 정확했지만 백엔드 미확인 항목(에러 코드 구분)을 지어내서 답했습니다. (목업)', strengths: ['Q1 두 가지 문제를 모두 말했습니다.'], improvements: ['Q5는 "확인 못 했습니다"가 정답에 가까웠습니다. 3.3절을 다시 보세요.'], perQuestion: [{ question: 'commit 타이밍', comment: 'focusout, 정확' }], nonverbal: [], nextTraining: '회의 전 5분: 3.3 에러 판정 기준과 기획자 확인 3번만 다시 읽기.', verdict: { pass: false, label: '조건부', reread: ['3.3 에러 판정 기준', '기획자 확인 필요 3'] }, questionsToAsk: ['Flood API와 District Search에서 주소 없음을 어떤 응답으로 구분하나요?', '부분 성공(Flood만 성공)일 때 카드 노출 정책은 확정됐나요?'] }),
}
