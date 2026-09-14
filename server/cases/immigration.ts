/* 해외 입국 심사(영어) 지식베이스.
 * 출처: 주미국 대한민국 대사관 "미국 입국시 참고사항(입국 거부사례 등)", 트립닷컴 미국 입국심사 질문 총정리,
 *       이민법 사무소 "ESTA 입국 거부 증가 2025~2026" 분석. */

export const IMMIGRATION_REAL_CASES = `
[Officer's actual questions (US CBP, typical order)]
- "What's the purpose of your visit?" / "Business or pleasure?"
- "How long are you staying?" / "When are you leaving?"
- "Where are you staying?" / "What's the address of your hotel?"
- "Do you have a return ticket?" / "Can I see your return itinerary?"
- "What do you do for work?" / "Who do you work for?"
- "Who are you visiting? How do you know them?"
- "Have you been to the United States before? When?"
- "How much money are you carrying?" / "Are you carrying more than $10,000?"
- "Are you bringing any food, plants, or animal products?"
- Business: "Will you be paid by a US company?" "Are you attending meetings or actually working?"
- Suspicion: "Step aside, please." → secondary inspection: same questions repeated slowly, phone may be checked.

[Real denial cases (Korean Embassy in the US)]
1. Tourist denied for lying: had a 3~4 day overstay years ago, said "never" → records showed it. Lesson: never lie; admit and explain.
2. Tourist denied for no preparation: no return ticket, no accommodation, little money → suspected of intent to reside.
3. Language-study visitor on ESTA (tourist waiver) → purpose mismatch → denied. Lesson: visa type must match purpose.
4. "Visiting a friend for two weeks" but the friend said 2~3 months and the return ticket was 3 months out → inconsistency → denied.
5. Grandparent "here to look after my grandchildren", asked "Do you get paid?" answered "my kids give me pocket money" → treated as unauthorized work → denied.

[2025~2026 trend: more secondaries and ESTA refusals]
- Frequent ESTA entries with near-90-day stays (3+ per year, more time in US than in Korea) → suspicion of de facto residence.
- Past overstay / visa denial / status-change rejection remains on record and is asked about.
- Stated purpose vs preparation mismatch (no itinerary, staying long-term at a friend's near a workplace).
- Electronic devices can be searched; messages about jobs, contracts, long stays are used as evidence.
- B-1/business: "attending meetings is fine, doing the work is not." Receiving US wages = unauthorized employment.
- Misrepresentation is worse than the underlying issue: can trigger expedited removal and future visa problems.

[Good vs bad answers]
- Purpose: "Tourism" alone is thin → "I'm here for a two-week vacation. LA and San Diego." Bad: vague, or over-explaining life story.
- Stay: exact → "Twelve days. I fly back on the 24th." Bad: "About a month or so, not sure."
- Accommodation: name + area, have the booking → "The Hilton near downtown, here's the confirmation." Bad: "My friend's place… I don't know the address."
- Work: job title + employer → "I'm a software engineer at a Korean fintech company." Bad: "I'm between jobs" without context, or hinting at working in the US.
- Money: "I have a credit card and about $800 in cash." Bad: joking about money or "not much."
- Didn't understand: "Sorry, could you repeat that?" / "Could you say that more slowly?" Bad: guessing and answering a different question.
- Attitude: short, calm, eye contact, no jokes, no arguing. If told to step aside: comply, stay calm, answer consistently.

[2025~2026 entry rules that officers may reference (Korean passport holders)]
- UK: ETA (Electronic Travel Authorisation) mandatory since 8 Jan 2025; from 25 Feb 2026 "no permission, no travel" — airlines deny boarding without it. Officer may ask "Do you have your ETA?" and check e-gates eligibility.
- EU/Schengen: EES (Entry/Exit System) fully in force since 10 Apr 2026 — fingerprints and face photo registered at first entry, replacing passport stamps. Officer may direct you to a kiosk first, then ask purpose/stay. The 90-in-180-day limit is now tracked automatically.
- EU ETIAS pre-travel authorisation is expected to start in the last quarter of 2026 (with a grace period). An officer might ask whether you registered; a truthful "It hasn't started for my trip yet" is fine.
- Japan: Visit Japan Web QR for immigration/customs is standard; officers rarely ask more than purpose and stay, but Korean travelers with frequent short stays get asked "What do you do in Japan so often?"
- US: ESTA plus stricter secondary inspections in 2025~2026; phones and social media may be checked.
- Australia/New Zealand: ETA app (AU) and NZeTA + IVL levy (NZ) must be approved before boarding; officers focus on biosecurity questions (food, plants, hiking boots).`

export const IMMIGRATION_COACH_BRIEF = `리포트는 한국어로 쓴다. 위 "Good vs bad answers"를 기준으로 사용자의 실제 영어 발화를 인용하고 자연스러운 표현으로 고쳐 준다(영어 예문 포함). 실제 거부 사례 5건 중 사용자의 답이 어느 패턴에 가까웠는지(진술 불일치·준비 부족·목적 불일치·취업 의심·거짓 진술) 있으면 짚는다. 2차 심사로 갔다면 어떤 답이 트리거였는지 설명한다.`
