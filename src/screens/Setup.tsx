import { useState } from 'react'
import { DOMAINS, domainById, type DomainId } from '../lib/domains'
import type { SetupInput } from '../lib/types'
import { getNickname } from '../lib/user'
import { extractText, clampDoc, DOC_MAX_CHARS } from '../lib/extract-text'

const LAST_DOMAIN_KEY = 'rehearsal.lastDomain'

function loadLastDomain(): DomainId {
  try {
    const v = localStorage.getItem(LAST_DOMAIN_KEY) as DomainId | null
    return v && DOMAINS.some((d) => d.id === v) ? v : DOMAINS[0].id
  } catch {
    return DOMAINS[0].id
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
  // 칩 라벨: 첫 칸은 온전히(최대 40자), 둘째 칸은 작은 보조 텍스트로. 사내 케이스(해빗팩토리·핀랩)는 ★ 를 붙이고 맨 앞에 정렬
  const INTERNAL = /해빗팩토리|시그널플래너|핀랩|시그널파이낸셜랩/
  const chipLabel = (p: Record<string, string>) => {
    const vals = dom.fields.map((f) => (p[f.key] ?? '').trim()).filter(Boolean)
    const main = vals[0] ?? ''
    const sub = vals[1] ?? ''
    // 잘린 듯 보이지 않게: 첫 칸은 그대로(아주 길면 40자), 둘째 칸은 14자 이하일 때만 붙이고 아니면 툴팁에만
    return { main: main.length > 40 ? main.slice(0, 39) + '…' : main, sub: sub.length <= 14 ? sub : '' }
  }
  const isInternal = (p: Record<string, string>) => Object.values(p).some((v) => INTERNAL.test(v))
  const presetOrder = dom.presets.map((_, i) => i).sort((a, b) => Number(isInternal(dom.presets[b])) - Number(isInternal(dom.presets[a])) || a - b)
  // 선택된 칩 강조는 칸 값이 예시와 같을 때만 (고치면 풀림)
  const chipActive = (i: number) => presetIdx === i && dom.fields.every((f) => (fields[f.key] ?? '').trim() === (dom.presets[i][f.key] ?? '').trim())
  const [docStatus, setDocStatus] = useState<Record<string, string>>({})
  const [docName, setDocName] = useState<Record<string, string>>({}) // 올린 파일 이름
  const [docOpen, setDocOpen] = useState<Record<string, boolean>>({}) // 붙여넣기 칸 펼침
  const setDoc = (key: string, raw: string) => {
    const { text, truncated } = clampDoc(raw)
    setFields((prev) => ({ ...prev, [key]: text }))
    setDocStatus((st) => ({ ...st, [key]: truncated ? `${DOC_MAX_CHARS.toLocaleString()}자까지만 사용합니다 (앞부분)` : '' }))
  }
  const clearDoc = (key: string) => {
    setFields((p) => ({ ...p, [key]: '' }))
    setDocStatus((st) => ({ ...st, [key]: '' }))
    setDocName((n) => ({ ...n, [key]: '' }))
  }
  const loadDocFile = async (key: string, file: File | undefined) => {
    if (!file) return
    setDocStatus((st) => ({ ...st, [key]: `${file.name} 읽는 중…` }))
    try {
      const text = await extractText(file)
      setDoc(key, text)
      setDocName((n) => ({ ...n, [key]: file.name }))
      setDocOpen((o) => ({ ...o, [key]: false }))
      setDocStatus((st) => ({ ...st, [key]: '' }))
    } catch (e) {
      setDocStatus((st) => ({ ...st, [key]: (e as Error).message }))
    }
  }

  // 선택 요약 카드: 첫 칸이 제목, 나머지 칸은 태그. 이전/다음은 예시 정렬 순서를 따라간다
  const docKeys = new Set((dom.docs ?? []).map((d) => d.key))
  const shortFields = dom.fields.filter((f) => !docKeys.has(f.key))
  const title = (fields[shortFields[0]?.key] ?? '').trim() || dom.name
  const tags = shortFields.slice(1).map((f) => (fields[f.key] ?? '').trim()).filter(Boolean)
  const pos = presetIdx !== null ? presetOrder.indexOf(presetIdx) : -1
  const step = (d: 1 | -1) => applyPreset(presetOrder[(pos < 0 ? (d > 0 ? 0 : presetOrder.length - 1) : (pos + d + presetOrder.length) % presetOrder.length)])
  const activePreset = presetIdx !== null && chipActive(presetIdx) ? dom.presets[presetIdx] : null
  const tagLabel = activePreset ? (isInternal(activePreset) ? '★ 추천 케이스' : '예시') : '내 설정'
  const start = () => onNext({ domain: domainId, fields: { ...fields, name: getNickname() ?? '' } })

  return (
    <div className="setup">
      <aside className="setup-side">
        <button className="link" onClick={onBack}>← 홈</button>
        <h2>어떤 상황을 <br />연습할까요?</h2>
        <p className="muted small">상황을 고르면 AI가 상대 역할을 맡아 실제처럼 대화합니다.</p>
        <nav className="dom-list">
          {DOMAINS.map((d) => (
            <button key={d.id} className={`dom-item ${d.id === domainId ? 'active' : ''}`} onClick={(e) => { pickDomain(d.id); e.currentTarget.scrollIntoView({ inline: 'center', block: 'nearest' }) }}>
              <span className="dom-ico" aria-hidden>{d.icon}</span>
              <span className="dom-name">{d.name}</span>
              <span className="dom-count">{d.presets.length}개</span>
              <span className="dom-chev" aria-hidden>›</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="setup-main">
        <header className="dom-head">
          <div className="dom-head-ico" aria-hidden>{dom.icon}</div>
          <div>
            <h2>{dom.name}</h2>
            <p className="muted">{dom.description}</p>
          </div>
        </header>

        <div className="fields">
          {shortFields.map((f) => (
            <label key={f.key} className="field">
              <span>{f.label}</span>
              <input value={fields[f.key] ?? ''} onChange={set(f.key)} placeholder={f.placeholder} />
            </label>
          ))}
        </div>

        <section className="pick-card">
          <div className="pick-body">
            <span className={`pick-tag ${activePreset && isInternal(activePreset) ? 'internal' : ''}`}>{tagLabel}</span>
            <div className="pick-title-row">
              <h3>{title}</h3>
              {tags.map((t, i) => <span key={i} className="pick-chip">{t}</span>)}
            </div>
            <p className="muted small">
              {dom.id === 'scam_call'
                ? '사기 전화인지 진짜 기관의 전화인지는 미리 알려주지 않습니다. 통화 중에 스스로 판단하세요.'
                : `${dom.counterpart}의 성향과 돌발 변수는 AI가 정하고 미리 알려주지 않습니다.`}
              {' '}칸은 자유롭게 고쳐 써도 됩니다.
            </p>
          </div>
          <div className="pick-actions">
            <button className="primary go" onClick={start}>바로 연습하기 →</button>
            <div className="pager">
              <button type="button" className="pager-btn" onClick={() => step(-1)} aria-label="이전 예시">‹</button>
              <span>{pos >= 0 ? pos + 1 : '–'} / {dom.presets.length}</span>
              <button type="button" className="pager-btn" onClick={() => step(1)} aria-label="다음 예시">›</button>
            </div>
          </div>
        </section>

        <section className="presets">
          <div className="presets-head">
            <span className="presets-title"><span className="star" aria-hidden>★</span> 예시로 채워보기 <span className="muted">· {dom.presets.length}개</span>{dom.presets.some(isInternal) && <span className="mini-badge">★ 추천 케이스</span>}</span>
            <button type="button" className="random-btn" onClick={random} title="예시 중 하나를 무작위로 채웁니다"><span aria-hidden>🎲</span> 랜덤 예시</button>
          </div>
          <div className="chips">
            {presetOrder.map((i) => { const p = dom.presets[i]; const l = chipLabel(p); return (
              <button key={i} type="button" className={`chip ${chipActive(i) ? 'active' : ''} ${isInternal(p) ? 'internal' : ''}`} onClick={() => applyPreset(i)} title={dom.fields.map((f) => `${f.label.replace(/\s*\(.*$/, '')}: ${p[f.key] ?? ''}`).join('\n')}>
                {isInternal(p) && <span className="star" aria-label="추천 케이스">★</span>}
                <span className="chip-main">{l.main}</span>
                {l.sub && <span className="chip-sub">{l.sub}</span>}
              </button>
            ) })}
          </div>
        </section>

        {dom.docs?.map((d) => {
          const val = fields[d.key] ?? ''
          const chars = val.replace(/\s/g, '').length
          const open = !!docOpen[d.key] || (!!val.trim() && !docName[d.key])
          return (
            <section key={d.key} className="doc-card" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void loadDocFile(d.key, e.dataTransfer.files?.[0]) }}>
              <div className="doc-row">
                <div className="doc-ico" aria-hidden>📎</div>
                <div className="doc-text">
                  <div className="doc-title">{d.label.replace(/\s*\([^)]*\)\s*$/, '')} <span className="muted small">(선택)</span></div>
                  <div className="muted small">{d.hint}</div>
                </div>
                <div className="doc-actions">
                  {val.trim() ? (
                    <span className="file-chip" title={val.slice(0, 200)}>
                      <span className="file-name">{docName[d.key] || '붙여넣은 내용'}</span>
                      <span className="muted small">{chars.toLocaleString()}자</span>
                      <button type="button" className="x" onClick={() => clearDoc(d.key)} aria-label="지우기">×</button>
                    </span>
                  ) : (
                    <>
                      <label className="upload-btn">
                        ⬆ 파일 업로드
                        <input type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" onChange={(e) => { void loadDocFile(d.key, e.target.files?.[0]); e.currentTarget.value = '' }} />
                      </label>
                      <button type="button" className="ghost small" onClick={() => setDocOpen((o) => ({ ...o, [d.key]: !o[d.key] }))}>붙여넣기</button>
                      {d.sample && <button type="button" className="ghost small" onClick={() => { setDoc(d.key, d.sample!.text); setDocName((n) => ({ ...n, [d.key]: d.sample!.label })) }}>{d.sample.label}</button>}
                    </>
                  )}
                </div>
              </div>
              {open && <textarea id={`doc-${d.key}`} rows={6} value={val} onChange={(e) => { setDoc(d.key, e.target.value); setDocName((n) => ({ ...n, [d.key]: '' })) }} placeholder={d.hint} autoFocus={!val} />}
              {docStatus[d.key] && <p className="muted small doc-status">{docStatus[d.key]}</p>}
            </section>
          )
        })}
        {dom.docs && (
          <p className="muted small docs-note">파일은 이 브라우저에서 글자만 뽑아 쓰고 서버로 보내지 않습니다. 원문은 기록에 남지 않고 요약만 저장됩니다. 공고를 붙이면 위 칸보다 공고 기준으로 봅니다. 스캔 PDF는 글자를 읽을 수 없으니 내용을 붙여 주세요.</p>
        )}
      </main>
    </div>
  )
}
