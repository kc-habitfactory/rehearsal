/* 말투 측정. 대화 기록(turns)만으로 계산한다. 브라우저(리포트 화면)와 서버(코치 프롬프트)가 같은 파일을 쓴다.
 * 음성 인식은 "어·음" 같은 소리를 자주 걸러내므로 필러 수는 실제보다 적게 잡힌다. 강한 신호는 지연·속도·길이·완충 표현·문장 완결이다. */

export interface TurnTiming {
  latencyMs?: number // 상대 말이 끝난 뒤(듣기 시작) 내가 첫 소리를 낼 때까지
  speakMs?: number // 첫 소리부터 마지막 인식 갱신까지 (침묵 대기 제외)
  textMode?: boolean // 텍스트로 답한 턴: 시간 지표 제외
}

export interface SpeechTurnLike {
  role: 'user' | 'interviewer'
  text: string
  at: number
  timing?: TurnTiming
}

export interface SpeechSummary {
  userTurns: number
  timedTurns: number // 음성으로 답해 시간 지표가 있는 턴 수
  cpmTurns: number // 말 속도 계산에 들어간 발화 수 (12자·2초 이상)
  avgLatencyMs: number | null
  maxLatencyMs: number | null
  maxLatencyTurn: number | null // 1부터 세는 내 발화 번호
  avgCpm: number | null // 분당 글자수(공백 제외). 영어는 분당 단어수
  avgAnswerChars: number
  maxAnswerChars: number
  avgAnswerSec: number | null
  maxAnswerSec: number | null
  maxAnswerTurn: number | null
  fillers: number
  fillerExamples: string[]
  hedges: number
  hedgeExamples: string[]
  assertives: number
  assertiveExamples: string[]
  completeRatio: number | null // 끝맺은 문장으로 끝난 발화 비율 (한국어)
  incompleteTurns: number[]
  honorificMix: boolean // 존댓말·반말 혼용 (한국어)
  questions: number // 내가 되물은 횟수
  lang: 'ko' | 'en'
}

const KO_FILLER = /(^|[\s,])(어+|음+|그+|아+|에+|뭐|약간|일단|막|되게|그냥|사실|그러니까|그니까)(?=[\s,.!?…]|$)/g
const KO_HEDGE = /(인 것 같|일 것 같|같아요|같습니다|같은데|같아서|아마|혹시|잘 모르겠|듯해요|듯합니다|듯한|정도인|약간은|조금은|그런 편)/g
const KO_ASSERT = /(무조건|절대|반드시|확실히|100%|틀림없|당연히|보장(?:돼|됩|합니다|드립|해 드))/g
const KO_COMPLETE_END = /(다|요|죠|까|네|네요|군요|니다|세요|습니다|입니다)[.!?…]*$|[.!?]$/
const KO_TRAILING = /(고|서|는데|지만|면|니까|서요|고요|하고|이고|라서|해서)[,…]*$|…$/
const KO_POLITE_END = /(요|죠|습니다|니다|세요|십니까|까요)[.!?…]*(\s|$)/g
const KO_PLAIN_END = /(?<![습니])(다|야|지|어|아|냐|니|라)[.!?…]+(\s|$)/g
const EN_FILLER = /\b(um+|uh+|erm|like|you know|kind of|sort of|basically|actually|I mean)\b/gi
const EN_HEDGE = /\b(maybe|probably|I think|I guess|not sure|perhaps|I suppose)\b/gi

function count(text: string, re: RegExp, out?: string[]): number {
  let n = 0
  for (const m of text.matchAll(re)) { n++; if (out && out.length < 4) out.push(m[0].trim()) }
  return n
}

export function summarizeSpeech(turns: SpeechTurnLike[], lang: 'ko' | 'en' = 'ko'): SpeechSummary {
  const users = turns.filter((t) => t.role === 'user')
  const s: SpeechSummary = {
    userTurns: users.length, timedTurns: 0, cpmTurns: 0,
    avgLatencyMs: null, maxLatencyMs: null, maxLatencyTurn: null,
    avgCpm: null, avgAnswerChars: 0, maxAnswerChars: 0, avgAnswerSec: null, maxAnswerSec: null, maxAnswerTurn: null,
    fillers: 0, fillerExamples: [], hedges: 0, hedgeExamples: [], assertives: 0, assertiveExamples: [],
    completeRatio: null, incompleteTurns: [], honorificMix: false, questions: 0, lang,
  }
  if (!users.length) return s
  const lat: number[] = []; const cpm: number[] = []; const secs: number[] = []; const chars: number[] = []
  let polite = 0, plain = 0, completeCount = 0, completeJudged = 0
  users.forEach((t, i) => {
    const text = t.text.trim()
    const len = lang === 'en' ? text.split(/\s+/).filter(Boolean).length : text.replace(/\s/g, '').length
    chars.push(len)
    if (len > s.maxAnswerChars) s.maxAnswerChars = len
    const tm = t.timing
    if (tm && !tm.textMode) {
      if (typeof tm.latencyMs === 'number' && tm.latencyMs >= 0 && tm.latencyMs < 60_000) {
        lat.push(tm.latencyMs)
        if (s.maxLatencyMs === null || tm.latencyMs > s.maxLatencyMs) { s.maxLatencyMs = tm.latencyMs; s.maxLatencyTurn = i + 1 }
      }
      if (typeof tm.speakMs === 'number' && tm.speakMs >= 800) {
        s.timedTurns++
        const sec = tm.speakMs / 1000
        secs.push(sec)
        if (s.maxAnswerSec === null || sec > s.maxAnswerSec) { s.maxAnswerSec = sec; s.maxAnswerTurn = i + 1 }
        // 말 속도는 표본이 있을 때만: "안녕하세요" 한마디(5자·1초)로는 재지 않는다
        const enough = lang === 'en' ? len >= 5 : len >= 12
        if (enough && tm.speakMs >= 2000) { cpm.push(len / (tm.speakMs / 60_000)); s.cpmTurns++ }
      }
    }
    if (lang === 'en') {
      s.fillers += count(text, EN_FILLER, s.fillerExamples)
      s.hedges += count(text, EN_HEDGE, s.hedgeExamples)
    } else {
      s.fillers += count(text, KO_FILLER, s.fillerExamples)
      s.hedges += count(text, KO_HEDGE, s.hedgeExamples)
      s.assertives += count(text, KO_ASSERT, s.assertiveExamples)
      if (len >= 4) {
        completeJudged++
        if (KO_TRAILING.test(text) || !KO_COMPLETE_END.test(text)) s.incompleteTurns.push(i + 1)
        else completeCount++
      }
      polite += count(text + ' ', KO_POLITE_END)
      plain += count(text + ' ', KO_PLAIN_END)
    }
    if (/\?/.test(text) || /(까요|나요|인가요|세요\?|되나요|맞나요|맞죠)/.test(text)) s.questions++
  })
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
  s.avgLatencyMs = avg(lat) === null ? null : Math.round(avg(lat)!)
  s.avgCpm = avg(cpm) === null ? null : Math.round(avg(cpm)!)
  s.avgAnswerChars = Math.round(avg(chars) ?? 0)
  s.avgAnswerSec = avg(secs) === null ? null : Math.round(avg(secs)! * 10) / 10
  s.completeRatio = completeJudged ? Math.round((completeCount / completeJudged) * 100) : null
  s.honorificMix = lang === 'ko' && polite > 0 && plain >= 2
  return s
}

/** 리포트 카드용 짧은 표기 */
export function fmtLatency(ms: number | null): string { return ms === null ? '–' : `${(ms / 1000).toFixed(1)}초` }
export function fmtCpm(v: number | null, lang: 'ko' | 'en'): string { return v === null ? '–' : lang === 'en' ? `${v} wpm` : `${v}자/분` }

/** 코치 프롬프트용 서술. 숫자를 그대로 주고 해석은 화법 프로필의 기준에 맡긴다 */
export function describeSpeechForCoach(s: SpeechSummary): string {
  if (!s.userTurns) return '(훈련자 발화 없음)'
  const L: string[] = []
  L.push(`- 내 발화 ${s.userTurns}회 (음성으로 시간 측정된 발화 ${s.timedTurns}회). 텍스트로 답한 턴은 시간 지표에서 제외.`)
  if (s.avgLatencyMs !== null) L.push(`- 첫 반응 지연: 평균 ${(s.avgLatencyMs / 1000).toFixed(1)}초, 최대 ${((s.maxLatencyMs ?? 0) / 1000).toFixed(1)}초 (내 발화 ${s.maxLatencyTurn}번째)`)
  if (s.avgCpm !== null) L.push(`- 말 속도: 평균 ${s.avgCpm}${s.lang === 'en' ? ' wpm' : '자/분(공백 제외)'} (${s.cpmTurns}회 발화 기준)`)
  else if (s.timedTurns > 0) L.push('- 말 속도: 답이 짧아(12자·2초 미만) 측정하지 않음. 속도를 평가하지 말 것')
  L.push(`- 답변 길이: 평균 ${s.avgAnswerChars}${s.lang === 'en' ? '단어' : '자'}, 최대 ${s.maxAnswerChars}${s.lang === 'en' ? '단어' : '자'}${s.avgAnswerSec !== null ? `, 평균 ${s.avgAnswerSec}초, 최장 ${s.maxAnswerSec}초 (내 발화 ${s.maxAnswerTurn}번째)` : ''}`)
  L.push(`- 필러(인식된 것만): ${s.fillers}회${s.fillerExamples.length ? ` (${s.fillerExamples.join(', ')})` : ''} · 완충 표현: ${s.hedges}회${s.hedgeExamples.length ? ` (${s.hedgeExamples.join(', ')})` : ''} · 단정 표현: ${s.assertives}회${s.assertiveExamples.length ? ` (${s.assertiveExamples.join(', ')})` : ''}`)
  if (s.completeRatio !== null) L.push(`- 문장 완결: ${s.completeRatio}% 의 발화가 끝맺음 어미로 끝남${s.incompleteTurns.length ? ` (말끝 흐림·연결어로 끝난 발화: ${s.incompleteTurns.join(', ')}번째)` : ''}`)
  if (s.honorificMix) L.push('- 존댓말과 반말이 섞임')
  L.push(`- 되묻기·확인 질문: ${s.questions}회`)
  return L.join('\n')
}
