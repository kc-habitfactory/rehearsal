import { FaceLandmarker, PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import type { NonverbalEvent, NonverbalSummary } from './types'

const FACE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const POSE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

export interface FrameMetrics {
  yaw: number
  pitch: number
  roll: number
  eyeH: number
  eyeV: number
  smile: number
  shoulderTilt: number
  slouch: number // 코-어깨중심 거리 / 어깨너비. 작아지면 웅크림
  shouldersVisible: boolean // 양 어깨가 화면 안에 신뢰도 있게 잡혔는가. 아니면 자세 판정을 건너뛴다
  faceNearHand: boolean
  faceFound: boolean
}

export interface LiveState {
  eyeContact: boolean
  postureOk: boolean
  eyeContactPct: number // 최근 30초
  smile: number
  calibrating: boolean
  calibrationProgress: number // 0~1
  faceFound: boolean
}

type Sample = { ts: number; eyeContact: boolean; postureOk: boolean; smile: number; faceTouch: boolean }

const WINDOW_MS = 30_000
const CALIBRATION_MS = 3_000

export class VisionEngine {
  private face!: FaceLandmarker
  private pose!: PoseLandmarker
  private ema: Record<string, number> = {}
  private baseline: FrameMetrics | null = null
  private calibSamples: FrameMetrics[] = []
  private calibStart = 0
  private samples: Sample[] = []
  private allSamples: Sample[] = []
  private events: NonverbalEvent[] = []
  private gazeAwaySince: number | null = null
  private postureBreakSince: number | null = null
  private faceTouchSince: number | null = null
  private lastPoseTs = 0
  private poseResult: ReturnType<PoseLandmarker['detectForVideo']> | null = null
  private sessionStart = 0
  private eyeState = false
  private eyeStateCount = 0
  private postureState = true
  private postureStateCount = 0

  async init() {
    const vision = await FilesetResolver.forVisionTasks('/wasm')
    this.face = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: FACE_MODEL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    })
    this.pose = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: POSE_MODEL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numPoses: 1,
    })
  }

  startCalibration() {
    this.baseline = null
    this.calibSamples = []
    this.calibStart = performance.now()
  }

  startSession() {
    this.sessionStart = performance.now()
    this.samples = []
    this.allSamples = []
    this.events = []
  }

  get isCalibrated() {
    return this.baseline !== null
  }

  /** 매 프레임 호출. 반환값은 UI용 상태. */
  process(video: HTMLVideoElement, ts: number): LiveState | null {
    const m = this.measure(video, ts)
    if (!m) return null

    if (!this.baseline) {
      if (this.calibStart === 0) this.calibStart = ts
      if (m.faceFound) this.calibSamples.push(m)
      const progress = Math.min(1, (ts - this.calibStart) / CALIBRATION_MS)
      if (progress >= 1 && this.calibSamples.length > 5) {
        this.baseline = average(this.calibSamples)
      }
      return {
        eyeContact: true,
        postureOk: true,
        eyeContactPct: 100,
        smile: m.smile,
        calibrating: true,
        calibrationProgress: progress,
        faceFound: m.faceFound,
      }
    }

    const b = this.baseline
    const rawEye =
      m.faceFound &&
      Math.abs(m.yaw - b.yaw) < 15 &&
      Math.abs(m.pitch - b.pitch) < 15 &&
      Math.abs(m.eyeH - b.eyeH) < 0.3 &&
      Math.abs(m.eyeV - b.eyeV) < 0.3
    // 어깨가 안 보이거나 기준값에 어깨가 없었으면 자세를 판정하지 않는다(안정으로 둔다)
    const canJudgePosture = m.faceFound && m.shouldersVisible && b.shouldersVisible && b.slouch > 0
    const rawPosture =
      !canJudgePosture ||
      (Math.abs(m.shoulderTilt - b.shoulderTilt) < 8 && m.slouch > b.slouch * 0.75)

    // 이력 현상: 시선은 연속 8프레임(약 0.5초), 자세는 15프레임(약 1초) 이상 유지될 때만 상태 전환
    this.eyeState = hysteresis(this.eyeState, rawEye, () => this.eyeStateCount, (v) => (this.eyeStateCount = v))
    this.postureState = hysteresis(this.postureState, rawPosture, () => this.postureStateCount, (v) => (this.postureStateCount = v), 15)

    const rel = this.sessionStart ? ts - this.sessionStart : 0
    if (this.sessionStart) {
      const s: Sample = { ts, eyeContact: this.eyeState, postureOk: this.postureState, smile: m.smile, faceTouch: m.faceNearHand }
      this.samples.push(s)
      this.allSamples.push(s)
      while (this.samples.length && ts - this.samples[0].ts > WINDOW_MS) this.samples.shift()
      this.trackEvents(rel)
    }

    const pct = this.samples.length ? (this.samples.filter((s) => s.eyeContact).length / this.samples.length) * 100 : 100
    return {
      eyeContact: this.eyeState,
      postureOk: this.postureState,
      eyeContactPct: pct,
      smile: m.smile,
      calibrating: false,
      calibrationProgress: 1,
      faceFound: m.faceFound,
    }
  }

  private trackEvents(rel: number) {
    // 시선 이탈
    if (!this.eyeState) {
      if (this.gazeAwaySince === null) this.gazeAwaySince = rel
    } else if (this.gazeAwaySince !== null) {
      const d = rel - this.gazeAwaySince
      if (d >= 2000) this.events.push({ at: this.gazeAwaySince, kind: 'gaze_away', durationMs: d })
      this.gazeAwaySince = null
    }
    // 자세 이탈
    if (!this.postureState) {
      if (this.postureBreakSince === null) this.postureBreakSince = rel
    } else if (this.postureBreakSince !== null) {
      const d = rel - this.postureBreakSince
      if (d >= 1500) this.events.push({ at: this.postureBreakSince, kind: 'posture_break', durationMs: d })
      this.postureBreakSince = null
    }
    // 얼굴 접촉
    const last = this.allSamples[this.allSamples.length - 1]
    if (last?.faceTouch) {
      if (this.faceTouchSince === null) this.faceTouchSince = rel
    } else if (this.faceTouchSince !== null) {
      if (rel - this.faceTouchSince >= 500) this.events.push({ at: this.faceTouchSince, kind: 'face_touch', durationMs: rel - this.faceTouchSince })
      this.faceTouchSince = null
    }
  }

  /** 최근 30초 요약 (LLM 컨텍스트용) */
  recentSummary(): NonverbalSummary {
    return summarize(this.samples, this.events.filter((e) => e.at >= (performance.now() - this.sessionStart) - WINDOW_MS))
  }

  /** 세션 전체 요약 */
  overallSummary(): NonverbalSummary {
    return summarize(this.allSamples, this.events)
  }

  getEvents(): NonverbalEvent[] {
    return [...this.events]
  }

  private measure(video: HTMLVideoElement, ts: number): FrameMetrics | null {
    if (video.readyState < 2) return null
    const f = this.face.detectForVideo(video, ts)
    if (ts - this.lastPoseTs > 200) {
      this.poseResult = this.pose.detectForVideo(video, ts)
      this.lastPoseTs = ts
    }
    if (!f.faceLandmarks.length) {
      return { yaw: 0, pitch: 0, roll: 0, eyeH: 0, eyeV: 0, smile: 0, shoulderTilt: 0, slouch: 0, shouldersVisible: false, faceNearHand: false, faceFound: false }
    }
    const mtx = f.facialTransformationMatrixes?.[0]?.data
    const { yaw, pitch, roll } = mtx ? headAngles(mtx) : { yaw: 0, pitch: 0, roll: 0 }
    const s = f.faceBlendshapes?.[0]?.categories ?? []
    const eyeH = (blend(s, 'eyeLookOutLeft') - blend(s, 'eyeLookInLeft') + blend(s, 'eyeLookInRight') - blend(s, 'eyeLookOutRight')) / 2
    const eyeV = (blend(s, 'eyeLookUpLeft') + blend(s, 'eyeLookUpRight') - blend(s, 'eyeLookDownLeft') - blend(s, 'eyeLookDownRight')) / 2
    const smile = (blend(s, 'mouthSmileLeft') + blend(s, 'mouthSmileRight')) / 2

    let shoulderTilt = 0
    let slouch = 0
    let faceNearHand = false
    let shouldersVisible = false
    const p = this.poseResult?.landmarks?.[0]
    if (p) {
      const L = p[11], R = p[12], nose = p[0]
      // 어깨가 화면 안(y < 0.98)에 있고 신뢰도가 충분할 때만 자세를 본다. 카메라가 가까워 어깨가 잘리면 값이 널뛰기한다
      shouldersVisible = (L.visibility ?? 1) > 0.6 && (R.visibility ?? 1) > 0.6 && L.y < 0.98 && R.y < 0.98
      shoulderTilt = (Math.atan2(R.y - L.y, R.x - L.x) * 180) / Math.PI
      const width = Math.hypot(R.x - L.x, R.y - L.y) || 1
      slouch = ((L.y + R.y) / 2 - nose.y) / width
      // 손목(15,16)이 얼굴(코) 근처에 오면 얼굴 접촉으로 간주
      for (const wrist of [p[15], p[16]]) {
        if (wrist && (wrist.visibility ?? 1) > 0.4 && Math.hypot(wrist.x - nose.x, wrist.y - nose.y) < width * 0.55) faceNearHand = true
      }
    }

    return {
      yaw: this.smooth('yaw', yaw),
      pitch: this.smooth('pitch', pitch),
      roll: this.smooth('roll', roll),
      eyeH: this.smooth('eyeH', eyeH),
      eyeV: this.smooth('eyeV', eyeV),
      smile: this.smooth('smile', smile),
      shoulderTilt: shouldersVisible ? this.smooth('tilt', shoulderTilt) : this.ema['tilt'] ?? 0,
      slouch: shouldersVisible ? this.smooth('slouch', slouch) : this.ema['slouch'] ?? 0,
      shouldersVisible,
      faceNearHand,
      faceFound: true,
    }
  }

  private smooth(k: string, v: number, a = 0.25) {
    this.ema[k] = this.ema[k] === undefined ? v : this.ema[k] * (1 - a) + v * a
    return this.ema[k]
  }

  close() {
    this.face?.close()
    this.pose?.close()
  }
}

function hysteresis(current: boolean, raw: boolean, get: () => number, set: (v: number) => void, need = 8) {
  if (raw === current) {
    set(0)
    return current
  }
  const n = get() + 1
  set(n)
  if (n >= need) {
    set(0)
    return raw
  }
  return current
}

function headAngles(m: Float32Array | number[]) {
  // 열 우선 4x4. 부호는 카메라 좌표계에 따라 뒤집힐 수 있으나 기준값 대비 편차만 쓰므로 무관.
  const yaw = (Math.asin(clamp(-m[2], -1, 1)) * 180) / Math.PI
  const pitch = (Math.atan2(m[6], m[10]) * 180) / Math.PI
  const roll = (Math.atan2(m[1], m[0]) * 180) / Math.PI
  return { yaw, pitch, roll }
}

function blend(cats: { categoryName: string; score: number }[], name: string) {
  return cats.find((c) => c.categoryName === name)?.score ?? 0
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

function average(list: FrameMetrics[]): FrameMetrics {
  const n = list.length
  const sum = (k: keyof FrameMetrics) => list.reduce((a, m) => a + (m[k] as number), 0) / n
  const withShoulders = list.filter((m) => m.shouldersVisible)
  const avgS = (k: 'shoulderTilt' | 'slouch') => (withShoulders.length ? withShoulders.reduce((a, m) => a + m[k], 0) / withShoulders.length : 0)
  return {
    yaw: sum('yaw'), pitch: sum('pitch'), roll: sum('roll'), eyeH: sum('eyeH'), eyeV: sum('eyeV'), smile: sum('smile'),
    shoulderTilt: avgS('shoulderTilt'), slouch: avgS('slouch'),
    shouldersVisible: withShoulders.length >= n / 2, // 보정 중 절반 이상 어깨가 보였을 때만 자세 판정을 켠다
    faceNearHand: false, faceFound: true,
  }
}

function summarize(samples: Sample[], events: NonverbalEvent[]): NonverbalSummary {
  const n = samples.length || 1
  return {
    eyeContactPct: Math.round((samples.filter((s) => s.eyeContact).length / n) * 100),
    postureBreaks: events.filter((e) => e.kind === 'posture_break').length,
    faceTouches: events.filter((e) => e.kind === 'face_touch').length,
    smileAvg: Number((samples.reduce((a, s) => a + s.smile, 0) / n).toFixed(2)),
    longestGazeAwayMs: Math.max(0, ...events.filter((e) => e.kind === 'gaze_away').map((e) => e.durationMs ?? 0)),
  }
}

export function formatNonverbal(s: NonverbalSummary) {
  return `[비언어 · 최근 30초] 시선 유지 ${s.eyeContactPct}% / 자세 이탈 ${s.postureBreaks}회 / 얼굴 접촉 ${s.faceTouches}회 / 미소 ${s.smileAvg} / 시선 이탈 최장 ${Math.round(s.longestGazeAwayMs / 1000)}초`
}
