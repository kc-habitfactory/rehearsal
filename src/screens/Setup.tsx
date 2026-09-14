import { useState } from 'react'
import { DOMAINS, domainById, type DomainId } from '../lib/domains'
import type { SetupInput } from '../lib/types'
import { getNickname } from '../lib/user'

const LAST_DOMAIN_KEY = 'rehearsal.lastDomain'
export const TTS_PREF_KEY = 'rehearsal.tts' // 'server' | 'browser'. UI 없음. 디버그용으로 localStorage에 'browser'를 넣으면 브라우저 음성.

export function loadTtsPref(): 'server' | 'browser' {
  try {
    return localStorage.getItem(TTS_PREF_KEY) === 'browser' ? 'browser' : 'server'
  } catch {
    return 'server'
  }
}

function loadLastDomain(): DomainId {
  try {
    const v = localStorage.getItem(LAST_DOMAIN_KEY) as DomainId | null
    return v && DOMAINS.some((d) => d.id === v) ? v : 'interview'
  } catch {
    return 'interview'
  }
}

export function Setup({ onNext, onBack }: { onNext: (s: SetupInput) => void; onBack: () => void }) {
  const [domainId, setDomainId] = useState<DomainId>(loadLastDomain)
  const dom = domainById(domainId)
  const [fields, setFields] = useState<Record<string, string>>(dom.presets[0])

  const pickDomain = (id: DomainId) => {
    setDomainId(id)
    setFields(domainById(id).presets[0])
    try { localStorage.setItem(LAST_DOMAIN_KEY, id) } catch { /* noop */ }
  }
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setFields({ ...fields, [k]: e.target.value })
  const random = () => setFields(dom.presets[Math.floor(Math.random() * dom.presets.length)])

  return (
    <div className="screen">
      <button className="link" onClick={onBack}>← 홈</button>
      <h2>어떤 상황을 연습할까요?</h2>

      <div className="tabs">
        {DOMAINS.map((d) => (
          <button key={d.id} className={`tab ${d.id === domainId ? 'active' : ''}`} onClick={() => pickDomain(d.id)}>
            {d.name}
          </button>
        ))}
      </div>
      <p className="muted small">{dom.description}</p>

      <div className="form">
        {dom.fields.map((f) => (
          <label key={f.key}>
            {f.label}
            <input value={fields[f.key] ?? ''} onChange={set(f.key)} placeholder={f.placeholder} />
          </label>
        ))}
      </div>
      <p className="muted small">
        {dom.id === 'scam_call'
          ? '사기 전화인지 진짜 기관의 전화인지는 미리 알려주지 않습니다. 통화 중에 스스로 판단하세요.'
          : `${dom.counterpart}의 성향과 돌발 변수는 AI가 정하고 미리 알려주지 않습니다.`}
        {' '}칸은 자유롭게 적어도 됩니다. "랜덤으로"는 준비된 예시 {dom.presets.length}개 중 하나를 고릅니다.
      </p>

      <div className="row">
        <button onClick={random}>랜덤으로</button>
        <button className="primary" onClick={() => onNext({ domain: domainId, fields: { ...fields, name: getNickname() ?? '' } })}>다음: 준비</button>
      </div>
    </div>
  )
}
