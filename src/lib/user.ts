/* 로그인 없이 기기별로 사용자를 식별한다. localStorage에 키 하나만 둔다. */

const KEY = 'rehearsal.userKey'
const NICK = 'rehearsal.nickname'

export function getUserKey(): string {
  try {
    let k = localStorage.getItem(KEY)
    if (!k) {
      k = 'u_' + (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, '')
      localStorage.setItem(KEY, k)
    }
    return k
  } catch {
    return 'u_anonymous'
  }
}

export function getNickname(): string | null {
  try {
    return localStorage.getItem(NICK)
  } catch {
    return null
  }
}

export function setNickname(n: string) {
  try {
    localStorage.setItem(NICK, n)
  } catch {
    /* noop */
  }
}
