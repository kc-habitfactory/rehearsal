import type { NonverbalEvent, NonverbalSummary, Report, Turn } from '../lib/types'

interface Props {
  title: string
  durationMs: number
  turns: Turn[]
  events: NonverbalEvent[]
  overall: NonverbalSummary
  report: Report | null
  loading?: boolean
  loadingStage?: 'saving' | 'queued' | 'writing' | 'retrying'
  error?: string | null
  counterpart?: string
  hasVision?: boolean // false면 시선·자세 카드 대신 통화 요약
}

export const fmtDur = (ms: number) => `${Math.floor(ms / 60000)}분 ${Math.floor((ms % 60000) / 1000)}초`

/** 리포트 화면과 기록 상세 화면이 공유하는 본문 */
const STAGE_TEXT = {
  saving: { step: 1, text: '훈련 기록을 저장하고 있습니다' },
  queued: { step: 2, text: '코치에게 전달됐습니다. 순서를 기다리는 중' },
  writing: { step: 3, text: '코치가 대화와 지표를 읽고 리포트를 쓰고 있습니다. 30초 정도 걸립니다' },
  retrying: { step: 3, text: '첫 시도가 실패해 다시 작성하고 있습니다' },
} as const

export function ReportView({ title, durationMs, turns, events, overall: o, report, loading, loadingStage = 'saving', error, counterpart = '상대', hasVision = true }: Props) {
  return (
    <>
      <p className="muted">{title} · {fmtDur(durationMs)} · 질문 {turns.filter((t) => t.role === 'interviewer').length}개</p>

      {hasVision ? (
        <div className="stats">
          <div className="stat"><div className="num">{o.eyeContactPct}%</div><div className="lbl">시선 유지</div></div>
          <div className="stat"><div className="num">{o.postureBreaks}</div><div className="lbl">자세 이탈</div></div>
          <div className="stat"><div className="num">{o.faceTouches}</div><div className="lbl">얼굴 접촉</div></div>
          <div className="stat"><div className="num">{Math.round(o.longestGazeAwayMs / 1000)}초</div><div className="lbl">시선 이탈 최장</div></div>
        </div>
      ) : (
        <div className="stats stats-2">
          <div className="stat"><div className="num">{turns.filter((t) => t.role === 'user').length}</div><div className="lbl">내 발화</div></div>
          <div className="stat"><div className="num">{fmtDur(durationMs)}</div><div className="lbl">통화 시간</div></div>
        </div>
      )}

      {events.length > 0 && (
        <div className="events">
          {events.map((e, i) => (
            <span key={i} className={`ev ${e.kind}`}>
              {fmtDur(e.at)} · {e.kind === 'gaze_away' ? '시선 이탈' : e.kind === 'posture_break' ? '자세 이탈' : '얼굴 접촉'}
              {e.durationMs ? ` ${Math.round(e.durationMs / 1000)}초` : ''}
            </span>
          ))}
        </div>
      )}

      {loading && (
        <div className="waiting">
          <div className="spinner" />
          <div>
            <div className="stage-steps">
              {(['saving', 'queued', 'writing'] as const).map((k, i) => (
                <span key={k} className={`step ${STAGE_TEXT[loadingStage].step > i + 1 ? 'done' : STAGE_TEXT[loadingStage].step === i + 1 ? 'now' : ''}`}>
                  {i + 1}. {k === 'saving' ? '저장' : k === 'queued' ? '전달' : '작성'}
                </span>
              ))}
            </div>
            <p className="muted" style={{ margin: '6px 0 0' }}>{STAGE_TEXT[loadingStage].text}</p>
          </div>
        </div>
      )}
      {error && <p className="error">리포트 생성 실패: {error}</p>}

      {report && (
        <>
          <div className={`score-card ${report.scoreBreakdown?.length ? 'with-breakdown' : ''}`}>
            <div className="score-wrap">
              <div className="score">{report.score}</div>
              <div className="score-unit">종합 점수 / 100</div>
            </div>
            <div className="headline">{report.headline}</div>
          </div>
          {/* 항목별 배점과 근거. 총평 바로 아래에 항상 보인다 (예전 리포트는 데이터가 없어 생략) */}
          {report.scoreBreakdown?.length ? (
            <div className="breakdown">
              {report.scoreBreakdown.map((b, i) => (
                <div key={i} className="breakdown-row">
                  <div className="breakdown-head">
                    <span className="item">{b.item}</span>
                    <span className="pts"><b>{b.score}</b><span className="muted"> / {b.max}</span></span>
                  </div>
                  <div className="breakdown-bar"><div className="breakdown-fill" style={{ width: `${b.max ? Math.min(100, (b.score / b.max) * 100) : 0}%` }} /></div>
                  <div className="muted small">{b.note}</div>
                </div>
              ))}
            </div>
          ) : null}
          <section>
            <h3>잘한 점</h3>
            <ul>{report.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </section>
          <section>
            <h3>보완할 점</h3>
            <ul>{report.improvements.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </section>
          <section>
            <h3>질문별</h3>
            {report.perQuestion.map((q, i) => (
              <div key={i} className="qa"><div className="q">Q. {q.question}</div><div className="a">{q.comment}</div></div>
            ))}
          </section>
          <section>
            {/* 카메라 상황은 시선·자세, 전화 상황은 코치가 어조·통화 흐름을 쓴다 */}
            <h3>{hasVision ? '시선과 자세' : '말투와 흐름'}</h3>
            <ul>{report.nonverbal.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </section>
          <section className="next">
            <h3>다음 훈련</h3>
            <p>{report.nextTraining}</p>
          </section>
        </>
      )}

      {turns.length > 0 && (
        <details className="transcript-box">
          <summary>대화 전체 보기</summary>
          <div className="transcript">
            {turns.map((t, i) => (
              <div key={i} className={`line ${t.role}`}>
                <span className="who">{t.role === 'user' ? '나' : counterpart}</span> {t.text}
              </div>
            ))}
          </div>
        </details>
      )}
    </>
  )
}
