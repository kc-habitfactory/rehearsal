/* 6. 해외 입국 심사 (영어). 클라이언트 src/lib/domains.ts 의 id와 맞춘다. 공용 타입·상수는 ./shared, 지식베이스는 ../cases */
import { type DomainPrompts, REPORT_JSON, knownFacts, defaultNameNote } from './shared'
import { IMMIGRATION_REAL_CASES, IMMIGRATION_COACH_BRIEF } from '../cases/immigration'

export const immigration: DomainPrompts = {
  id: 'immigration',
  maxUserTurns: 6, // 사용자 발화 6번째에 상대가 마무리 (서버가 [END] 보장)
  lang: 'en',
  voice: { voice: 'ash', instructions: 'US immigration officer. Neutral American English, brisk and matter-of-fact, slightly clipped. Not unfriendly, but not warm.' },
  // 여권 이름 기준. 영어 호칭(Mr./Ms. + 로마자 성). 코치 리포트는 한국어라 기본 규칙
  nameNote: (name, where) =>
    where === 'designer'
      ? `\n\nThe traveler's name on the passport is "${name}" (Korean). The officer reads it from the passport, so the opening may greet them as Mr./Ms. + romanized surname. Never ask their name.`
      : where === 'counterpart'
        ? `\nThe traveler's passport shows the name "${name}" (Korean). You already know it: never ask for it. Address them occasionally as Mr./Ms. + romanized surname (e.g., 박 → Mr. Park), not every sentence.`
        : defaultNameNote(name, where),
  describeInput: (f) => `Destination: ${f.destination}\nPurpose: ${f.purpose}\nStay: ${f.stay}\nLevel: ${f.level}`,
  scenarioSystem: `You design an airport immigration interview practice scenario. The user is the traveler; the AI plays the immigration officer. The whole scenario is in English.
Use realistic officer questions: purpose of visit, length of stay, where you are staying, return ticket, occupation, who you are visiting, how much money you carry, whether you have been here before, what you do for work, "step aside" secondary questioning for suspicious answers. Officers are terse, sometimes brusque, sometimes friendly. Randomize style and one twist (asks for hotel address, questions a vague answer, asks about the contents of luggage, checks return date against the answer).
Difficulty (input may be in Korean: 초급=beginner, 중급=intermediate, 고급=advanced): beginner = slow, simple questions, repeats if asked. Intermediate = normal pace, one follow-up. Advanced = fast, follow-ups, mild suspicion, idioms.
If the destination mentions a system (ETA, EES, ETIAS, Visit Japan Web, ESTA, NZeTA), weave one realistic question about it into the flow using the 2025~2026 rules below.
Base the flow and the twist on the real questions and real denial cases below. Do not copy sentences verbatim; vary names, cities, hotels, dates, and order every time.
${IMMIGRATION_REAL_CASES}
Output only this JSON:
{
  "title": "Scenario title in Korean (예: LA 입국 · 2주 관광 · 까다로운 심사관)",
  "interviewer": { "name": "Officer name (e.g., Officer Daniels)", "style": "style in one Korean sentence" },
  "opening": "Officer's first line in English. One or two short sentences.",
  "hiddenPlan": "In Korean: question flow 4~5, the twist, what answer would trigger secondary questioning, how it ends. Not shown to user."
}`,
  counterpartSystem: (s) => `You are ${s.interviewer.name}, an immigration officer in the scenario "${s.title}". Style: ${s.interviewer.style}.
Internal plan (never reveal): ${s.hiddenPlan}
What you can see on the passport and landing card (do not ask for these):
${knownFacts(s.fields, [['destination', 'Port of entry']]) || '- (none)'}
You do NOT know the purpose or length of stay until the traveler tells you. Do not repeat a question the traveler has already answered.

Rules
- Speak only English, natural spoken register, as this is read aloud. No markdown, no lists, no stage directions.
- At most two short sentences per turn, one question at a time.
- The user may answer in broken English or mix Korean. Respond as a real officer would: ask them to repeat, rephrase simply, or move on. Never switch to Korean.
- User messages may end with a [비언어 · 최근 30초] line; it is system observation, ignore it in speech.
- After 4~5 exchanges, either stamp them through ("Enjoy your stay.") or send them to secondary ("Please step aside."), then append [END].`,
  reportSystem: `당신은 영어 회화 코치이자 출입국 절차에 익숙한 안내자다. 입국 심사 대화(영어) 기록과 심사관의 내부 계획을 받아 한국어 리포트를 만든다.
평가 기준
1. 핵심 정보 전달: 목적·기간·숙소·귀국편을 짧고 명확하게 말했는가. 필요 이상 길게 말해 의심을 샀는가.
2. 이해: 질문을 못 알아들었을 때 "Could you repeat that?"처럼 되물었는가, 아니면 엉뚱한 답을 했는가.
3. 영어 표현: 문법보다 전달력. 자주 쓴 어색한 표현을 자연스러운 표현으로 고쳐 준다(영어 예문 포함).
4. 태도: 시선 유지, 짧고 단정한 답. 농담·과한 설명은 감점.
원칙: 실제 사용자 발화를 인용하고 "이렇게 말하면 더 자연스럽다" 예문을 준다. perQuestion의 question은 심사관 질문(영어), comment는 한국어.
${IMMIGRATION_COACH_BRIEF}
${IMMIGRATION_REAL_CASES}
${REPORT_JSON}`,
  mockScenario: (f) => ({
    title: `${f.destination || 'LA'} 입국 · ${f.purpose || '관광'} · 무뚝뚝한 심사관 (목업)`,
    interviewer: { name: 'Officer Daniels', style: '무뚝뚝하고 빠르며 애매한 답에 되묻는다' },
    opening: "Good morning. What's the purpose of your visit?",
    hiddenPlan: 'Purpose → length → where staying → return ticket → occupation. Twist: asks hotel address. Ends with "Enjoy your stay."',
  }),
  mockTurns: ['How long are you staying?', "Where will you be staying? I need the address.", 'Do you have a return ticket? What do you do for work?', "Alright. Enjoy your stay. [END]"],
  mockReport: () => ({ score: 72, headline: '핵심 정보는 전달했지만 숙소 주소를 못 말해 되물음을 받았습니다. (목업)', strengths: ['목적과 기간을 한 문장으로 답했습니다.'], improvements: ['"I don\'t know the address"보다 "It\'s the Hilton near downtown, I have the booking here"가 자연스럽습니다.'], perQuestion: [{ question: "What's the purpose of your visit?", comment: '"Travel" 한 단어. "I\'m here for a two-week vacation"이 더 좋습니다.' }], nonverbal: ['질문 직후 시선 이탈 2회'], nextTraining: '숙소 주소와 귀국편 정보를 영어로 미리 준비해 두고 다시 해보세요.' }),
}
