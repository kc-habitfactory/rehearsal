/* 공고·이력서 파일에서 텍스트만 뽑는다. 전부 브라우저 안에서 처리하고 파일은 서버로 보내지 않는다.
 * PDF는 pdf.js(텍스트 레이어), TXT·MD는 그대로. 스캔 PDF·이미지는 텍스트가 없어 안내만 한다. */
// pdf.js는 무거우므로(약 400KB) 파일을 실제로 놓았을 때만 불러온다
async function loadPdfjs() {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  return pdfjs
}

export const DOC_MAX_CHARS = 6000

export async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.txt') || name.endsWith('.md') || file.type.startsWith('text/')) {
    return normalize(await file.text())
  }
  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    const pdfjs = await loadPdfjs()
    const buf = await file.arrayBuffer()
    const doc = await pdfjs.getDocument({ data: buf }).promise
    const parts: string[] = []
    for (let i = 1; i <= Math.min(doc.numPages, 12); i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      let line = ''
      let lastY: number | null = null
      for (const it of content.items as Array<{ str?: string; transform?: number[]; hasEOL?: boolean }>) {
        if (!it.str) continue
        const y = it.transform?.[5] ?? null
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 4) { parts.push(line.trim()); line = '' }
        line += it.str + (it.hasEOL ? '\n' : ' ')
        lastY = y
      }
      parts.push(line.trim())
    }
    const text = normalize(parts.join('\n'))
    if (text.replace(/\s/g, '').length < 40) throw new Error('이 PDF에는 읽을 수 있는 글자가 거의 없습니다(스캔·이미지 PDF). 내용을 복사해 붙여 주세요.')
    return text
  }
  if (name.endsWith('.docx') || name.endsWith('.doc') || name.endsWith('.hwp')) {
    throw new Error('워드·한글 문서는 아직 읽지 못합니다. 내용을 복사해 붙여 주세요.')
  }
  throw new Error('PDF 또는 TXT 파일만 읽을 수 있습니다.')
}

function normalize(t: string): string {
  return t.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** 길이 제한. 넘으면 앞부분만 쓰고 잘렸다는 표시를 붙인다 */
export function clampDoc(t: string): { text: string; truncated: boolean } {
  if (t.length <= DOC_MAX_CHARS) return { text: t, truncated: false }
  return { text: t.slice(0, DOC_MAX_CHARS) + '\n…(이후 생략)', truncated: true }
}
