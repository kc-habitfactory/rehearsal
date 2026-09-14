interface Props {
  label: string
  value: number // 0~100
  ok?: boolean
  hint?: string
}

export function Gauge({ label, value, ok = true, hint }: Props) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div className={`gauge ${ok ? 'ok' : 'warn'}`}>
      <div className="gauge-head">
        <span>{label}</span>
        <strong>{Math.round(v)}%</strong>
      </div>
      <div className="gauge-bar">
        <div className="gauge-fill" style={{ width: `${v}%` }} />
      </div>
      {hint && <div className="gauge-hint">{hint}</div>}
    </div>
  )
}

export function Pill({ label, ok }: { label: string; ok: boolean }) {
  return <span className={`pill ${ok ? 'ok' : 'warn'}`}>{label}</span>
}
