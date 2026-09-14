import { useRef, useState } from 'react'
import { loadInflight } from './lib/inflight'
import { Home } from './screens/Home'
import { Setup } from './screens/Setup'
import { Prep } from './screens/Prep'
import { Session } from './screens/Session'
import { Report } from './screens/Report'
import { History } from './screens/History'
import { Spectator } from './screens/Spectator'
import { Admin } from './screens/Admin'
import type { VisionEngine } from './lib/vision'
import type { Scenario, Screen, SessionLog, SetupInput } from './lib/types'

export default function App() {
  // #watch=<userKey> 로 열면 관전 화면 (다른 기기에서 훈련자의 진행을 본다)
  const watch = /^#watch=([A-Za-z0-9_-]+)/.exec(location.hash)?.[1]
  if (watch) return <div className="app"><Spectator userKey={watch} /></div>
  if (location.hash === '#admin') return <div className="app"><Admin /></div>
  return <MainApp />
}

function MainApp() {
  // 새로고침(개발 서버 재배포 포함) 직전에 진행 중이던 세션이 있으면 홈이 아니라 그 세션으로 바로 돌아간다
  const [inflight] = useState(loadInflight)
  const resumeRef = useRef(inflight)
  const [screen, setScreen] = useState<Screen>(inflight ? 'session' : 'home')
  const [setup, setSetup] = useState<SetupInput | null>(inflight?.setup ?? null)
  const [scenario, setScenario] = useState<Scenario | null>(inflight?.scenario ?? null)
  const [log, setLog] = useState<SessionLog | null>(null)
  const [historyId, setHistoryId] = useState<number | null>(null)
  const engineRef = useRef<VisionEngine | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const releaseCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    engineRef.current?.close()
    engineRef.current = null
  }

  return (
    <div className="app">
      {screen === 'home' && (
        <Home
          onStart={() => setScreen('setup')}
          onOpenHistory={(id) => {
            setHistoryId(id)
            setScreen('history')
          }}
        />
      )}
      {screen === 'history' && historyId !== null && <History sessionId={historyId} onBack={() => setScreen('home')} />}
      {screen === 'setup' && (
        <Setup
          onBack={() => setScreen('home')}
          onNext={(s) => {
            setSetup(s)
            setScreen('prep')
          }}
        />
      )}
      {screen === 'prep' && setup && (
        <Prep
          setup={setup}
          engineRef={engineRef}
          streamRef={streamRef}
          onBack={() => {
            releaseCamera()
            setScreen('setup')
          }}
          onReady={(sc, realMode) => {
            setSetup((s) => (s ? { ...s, realMode } : s))
            setScenario(sc)
            setScreen('session')
          }}
        />
      )}
      {screen === 'session' && setup && scenario && (
        <Session
          setup={setup}
          scenario={scenario}
          engine={engineRef.current}
          stream={streamRef.current}
          resume={resumeRef.current ?? undefined}
          onFinish={(l) => {
            resumeRef.current = null
            setLog(l)
            releaseCamera()
            setScreen('report')
          }}
        />
      )}
      {screen === 'report' && log && (
        <Report
          log={log}
          onRestart={() => {
            setLog(null)
            setScenario(null)
            setScreen('setup')
          }}
          onHome={() => {
            setLog(null)
            setScenario(null)
            setScreen('home')
          }}
        />
      )}
    </div>
  )
}
