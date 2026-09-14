/* 전화 신호음 합성 (Web Audio, 음원 파일 없음).
 * out = 내가 거는 전화의 발신음(뚜르르, 440Hz 1초 on/1초 off), in = 걸려오는 전화의 착신음(따르릉, 440/480Hz 트릴 0.9초 on/0.9초 off).
 * 두 번 울린 뒤 끝난다. stop()으로 바로 끊을 수 있다(done 이 즉시 resolve). */
export type RingKind = 'in' | 'out'

export interface Ring { done: Promise<void>; stop: () => void }

export function playRing(kind: RingKind, rings = 2): Ring {
  let ctx: AudioContext | null = null
  let finished = false
  let resolveDone: () => void = () => {}
  const done = new Promise<void>((r) => { resolveDone = r })
  const timers: number[] = []
  const finish = () => {
    if (finished) return
    finished = true
    timers.forEach((t) => window.clearTimeout(t))
    try { ctx?.close() } catch { /* noop */ }
    resolveDone()
  }
  try {
    ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const master = ctx.createGain()
    master.gain.value = kind === 'in' ? 0.12 : 0.09
    master.connect(ctx.destination)
    const on = kind === 'in' ? 0.9 : 1.0
    const off = kind === 'in' ? 0.9 : 1.0
    let t = ctx.currentTime + 0.05
    for (let i = 0; i < rings; i++) {
      if (kind === 'out') {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 440
        const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.02); g.gain.setValueAtTime(1, t + on - 0.03); g.gain.linearRampToValueAtTime(0, t + on)
        o.connect(g); g.connect(master); o.start(t); o.stop(t + on)
      } else {
        // 따르릉: 두 음을 25Hz로 번갈아 울려 벨 느낌을 낸다
        const step = 0.04
        for (let k = 0; k * step < on; k++) {
          const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = k % 2 ? 480 : 440
          const g = ctx.createGain(); g.gain.value = 0.35
          o.connect(g); g.connect(master); o.start(t + k * step); o.stop(t + Math.min(on, (k + 1) * step))
        }
      }
      t += on + (i < rings - 1 ? off : 0)
    }
    const total = (t - ctx.currentTime) * 1000 + 150
    timers.push(window.setTimeout(finish, total))
  } catch {
    finish() // 오디오 컨텍스트가 없으면 바로 시작
  }
  return { done, stop: finish }
}
