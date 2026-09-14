import { useState } from 'react'
import { DOMAINS, domainById, type DomainId } from '../lib/domains'
import type { SetupInput } from '../lib/types'
import { getNickname } from '../lib/user'
import { extractText, clampDoc, DOC_MAX_CHARS } from '../lib/extract-text'

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
  const [presetIdx, setPresetIdx] = useState<number | null>(0) // 예시 칩 선택 상태. 칸을 고치면 강조가 풀린다

  const pickDomain = (id: DomainId) => {
    setDomainId(id)
    setFields(domainById(id).presets[0])
    setPresetIdx(0)
    try { localStorage.setItem(LAST_DOMAIN_KEY, id) } catch { /* noop */ }
  }
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setFields({ ...fields, [k]: e.target.value })
  // 예시 적용: 짧은 칸만 바꾸고, 붙여 둔 공고·이력서는 유지한다
  const applyPreset = (i: number) => {
    setPresetIdx(i)
    setFields((prev) => {
      const preset = dom.presets[i]
      const keep: Record<string, string> = {}
      for (const d of dom.docs ?? []) if (prev[d.key]) keep[d.key] = prev[d.key]
      return { ...preset, ...keep }
    })
  }
  const random = () => {
    let i = Math.floor(Math.random() * dom.presets.length)
    if (dom.presets.length > 1 && i === presetIdx) i = (i + 1) % dom.presets.length // 같은 것 연속 방지
    applyPreset(i)
  }
  // 칩 라벨: 예시의 앞 두 칸을 "직무 · 회사"처럼 붙인다. 사내 케이스(해빗팩토리·핀랩)는 ★
  const INTERNAL = /해빗팩토리|시그널플래너|핀랩|시그널파이낸셜랩/
  const chipLabel = (p: Record<string, string>) => {
    const vals = dom.fields.map((f) => (p[f.key] ?? '').trim()).filter(Boolean)
    const cut = (v: string) => (v.length > 22 ? v.slice(0, 21) + '…' : v)
    return vals.slice(0, 2).map(cut).join(' · ')
  }
  const isInternal = (p: Record<string, string>) => Object.values(p).some((v) => INTERNAL.test(v))
  // 선택된 칩 강조는 칸 값이 예시와 같을 때만 (고치면 풀림)
  const chipActive = (i: number) => presetIdx === i && dom.fields.every((f) => (fields[f.key] ?? '').trim() === (dom.presets[i][f.key] ?? '').trim())
  const [docStatus, setDocStatus] = useState<Record<string, string>>({})
  const setDoc = (key: string, raw: string) => {
    const { text, truncated } = clampDoc(raw)
    setFields((prev) => ({ ...prev, [key]: text }))
    setDocStatus((st) => ({ ...st, [key]: truncated ? `${DOC_MAX_CHARS.toLocaleString()}자까지만 사용합니다 (앞부분)` : '' }))
  }
  const loadDocFile = async (key: string, file: File | undefined) => {
    if (!file) return
    setDocStatus((st) => ({ ...st, [key]: `${file.name} 읽는 중…` }))
    try {
      const text = await extractText(file)
      setDoc(key, text)
      setDocStatus((st) => ({ ...st, [key]: `${file.name} · ${text.replace(/\s/g, '').length.toLocaleString()}자 읽음 (파일은 서버로 보내지 않습니다)` }))
    } catch (e) {
      setDocStatus((st) => ({ ...st, [key]: (e as Error).message }))
    }
  }

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
      <div className="presets">
        <div className="presets-head">
          <span className="muted small">예시로 채우기 · {dom.presets.length}개{dom.presets.some(isInternal) ? ' · ★ 사내 케이스' : ''}</span>
          <button type="button" className="ghost small" onClick={random} title="예시 중 하나를 무작위로 채웁니다"><span aria-hidden>🎲</span> 랜덤</button>
        </div>
        <div className="chips">
          {dom.presets.map((p, i) => (
            <button key={i} type="button" className={`chip ${chipActive(i) ? 'active' : ''} ${isInternal(p) ? 'internal' : ''}`} onClick={() => applyPreset(i)} title={dom.fields.map((f) => `${f.label.replace(/\s*\(.*$/, '')}: ${p[f.key] ?? ''}`).join('\n')}>
              {isInternal(p) && <span className="star" aria-label="사내 케이스">★</span>}{chipLabel(p)}
            </button>
          ))}
        </div>
      </div>

      {dom.docs && (
        <div className="docs">
          {dom.docs.map((d) => (
            <div key={d.key} className="doc" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void loadDocFile(d.key, e.dataTransfer.files?.[0]) }}>
              <div className="doc-head">
                <label htmlFor={`doc-${d.key}`}>{d.label}</label>
                <span className="muted small">{(fields[d.key] ?? '').length ? `${(fields[d.key] ?? '').replace(/\s/g, '').length.toLocaleString()}자` : ''}</span>
              </div>
              <textarea id={`doc-${d.key}`} rows={5} value={fields[d.key] ?? ''} onChange={(e) => setDoc(d.key, e.target.value)} placeholder={d.hint} />
              <div className="doc-tools">
                <label className="ghost small file-btn">
                  PDF·TXT 파일
                  <input type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" onChange={(e) => { void loadDocFile(d.key, e.target.files?.[0]); e.currentTarget.value = '' }} />
                </label>
                {d.sample && !(fields[d.key] ?? '').trim() && <button type="button" className="ghost small" onClick={() => setDoc(d.key, d.sample!.text)}>{d.sample.label}</button>}
                {(fields[d.key] ?? '').trim() && <button type="button" className="ghost small" onClick={() => { setFields((p) => ({ ...p, [d.key]: '' })); setDocStatus((st) => ({ ...st, [d.key]: '' })) }}>지우기</button>}
                <span className="muted small doc-status">{docStatus[d.key] ?? ''}</span>
              </div>
            </div>
          ))}
          <p className="muted small docs-note">공고를 붙이면 직무·회사 유형은 공고 기준으로 봅니다(위 칸과 다르면 공고 우선). 이력서 직무가 공고와 달라도 됩니다. 그 차이를 묻는 전환 지원 면접이 됩니다. 파일은 이 브라우저에서 글자만 뽑아 쓰고 서버로 보내지 않으며, 이력서 원문은 기록에 남지 않고 요약만 저장됩니다. 스캔 PDF는 글자를 읽을 수 없으니 내용을 붙여 주세요.</p>
        </div>
      )}
      <p className="muted small">
        {dom.id === 'scam_call'
          ? '사기 전화인지 진짜 기관의 전화인지는 미리 알려주지 않습니다. 통화 중에 스스로 판단하세요.'
          : `${dom.counterpart}의 성향과 돌발 변수는 AI가 정하고 미리 알려주지 않습니다.`}
        {' '}칸은 자유롭게 적어도 됩니다. 예시를 누른 뒤 고쳐 써도 됩니다.
      </p>

      <div className="row">
        <button className="primary" onClick={() => onNext({ domain: domainId, fields: { ...fields, name: getNickname() ?? '' } })}>다음: 준비</button>
      </div>
    </div>
  )
}
