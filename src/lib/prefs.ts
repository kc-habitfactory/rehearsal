/* 사용자 환경 설정 키. 컴포넌트 파일에서 분리해 두어야 Vite Fast Refresh가 화면 상태를 유지한다 (비컴포넌트 export가 섞이면 전체 새로고침) */
export const TTS_PREF_KEY = 'rehearsal.tts' // 'server' | 'browser'. UI 없음. 디버그용으로 localStorage에 'browser'를 넣으면 브라우저 음성.

export function loadTtsPref(): 'server' | 'browser' {
  try {
    return localStorage.getItem(TTS_PREF_KEY) === 'browser' ? 'browser' : 'server'
  } catch {
    return 'server'
  }
}
