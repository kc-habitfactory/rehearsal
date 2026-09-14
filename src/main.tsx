import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// StrictMode는 효과를 두 번 실행해 카메라·TTS가 중복 시작되므로 이 앱에서는 끈다.
createRoot(document.getElementById('root')!).render(<App />)
