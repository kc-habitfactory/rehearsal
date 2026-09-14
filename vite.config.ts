import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 외부에서 접근할 때 쓰는 터널 주소. ngrok을 5173으로 열면 /api도 프록시를 타고 함께 나간다.
const TUNNEL_HOST = 'regular-usefully-hen.ngrok-free.app'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // 0.0.0.0 바인딩. 같은 와이파이의 다른 기기에서도 접근 가능
    port: 5173,
    allowedHosts: [TUNNEL_HOST, '.ngrok-free.app', '.ngrok.app'],
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: true },
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
})
