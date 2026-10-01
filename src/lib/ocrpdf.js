import pdfjs from './pdfjs'
import { BASE_SCALE, sanitizeWinAnsi } from './../utils/misc'
import { ocrPage } from './ocr'
import { winAnsiCanEncode, LIBERATION, fontUrl } from './fonts'

// A searchable scan is the picture of the page with the recognised words laid
// over it, invisibly, where they were found. The page still looks exactly the
// same; the difference is that the text can now be selected, searched and
// copied.
export async function ocrToSearchablePdf(bytes, { langs, onlyEmpty = true }, onProgress) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })

  const clone = new Uint8Array(bytes.byteLength)
  clone.set(new Uint8Array(bytes))
  const view = await pdfjs.getDocument({ data: clone }).promise

  const pages = doc.getPages()
  const targets = []
  for (let i = 0; i < pages.length; i++) {
    if (!onlyEmpty) { targets.push(i); continue }
    const tc = await (await view.getPage(i + 1)).getTextContent()
    const hasText = tc.items.some(it => typeof it.str === 'string' && it.str.trim())
    if (!hasText) targets.push(i)
  }
  if (!targets.length) {
    throw new Error(
      onlyEmpty
        ? 'Every page already carries a text layer — there is nothing here to recognise.'
        : 'Nothing to recognise.'
    )
  }

  const helvetica = await doc.embedFont(StandardFonts.Helvetica)
  let unicode = null
  const fontFor = async text => {
    if (winAnsiCanEncode(text)) return { font: helvetica, encode: sanitizeWinAnsi }
    if (unicode === null) {
      try {
        const fontkit = (await import('@pdf-lib/fontkit')).default
        doc.registerFontkit(fontkit)
        const res = await fetch(fontUrl(LIBERATION['sans-serif'][0]))
        unicode = res.ok ? await doc.embedFont(await res.arrayBuffer(), { subset: true }) : false
      } catch { unicode = false }
    }
    return unicode ? { font: unicode, encode: t => t } : { font: helvetica, encode: sanitizeWinAnsi }
  }

  const k = 1 / BASE_SCALE
  let words = 0
  let done = 0

  for (const index of targets) {
    const pdfPage = await view.getPage(index + 1)
    const lines = await ocrPage(pdfPage, index, langs, m => {
      const inner = typeof m.progress === 'number' ? m.progress : 0
      onProgress?.({
        label: `${m.status || 'recognising'} — page ${done + 1} of ${targets.length}`,
        pct: (done + inner) / targets.length
      })
    }, { group: false })

    const page = pages[index]
    const { height } = page.getSize()

    for (const line of lines) {
      const raw = line.text.trim()
      if (!raw) continue
      const { font, encode } = await fontFor(raw)
      const text = encode(raw)
      const target = line.w * k
      let size = Math.max(1, line.fontSize * k)
      // Match the run's own width so a selection lands on the right words.
      try {
        const natural = font.widthOfTextAtSize(text, size)
        if (natural > 0) size = Math.max(1, Math.min(size * (target / natural), size * 3))
      } catch { /* keep the estimate */ }

      try {
        page.drawText(text, {
          x: line.x * k,
          y: height - line.baselineY * k,
          size,
          font,
          color: rgb(0, 0, 0),
          opacity: 0
        })
        words += raw.split(/\s+/).filter(Boolean).length
      } catch { /* a run this font cannot encode is simply not laid down */ }
    }

    done++
  }

  if (!words) {
    throw new Error(
      'No readable text was found. This usually means the writing is too small or too soft to ' +
      'make out — a sharper scan gives it something to read.'
    )
  }

  const out = await doc.save({ useObjectStreams: false })
  return { blob: new Blob([out], { type: 'application/pdf' }), pages: targets.length, words }
}

export async function ocrToWord(bytes, { langs, onlyEmpty = true }, onProgress) {
  const { buildDocx } = await import('./docx')
  const { extractLines } = await import('./extract')

  const clone = new Uint8Array(bytes.byteLength)
  clone.set(new Uint8Array(bytes))
  const view = await pdfjs.getDocument({ data: clone }).promise

  const docxPages = []
  let totalWords = 0

  for (let i = 0; i < view.numPages; i++) {
    const pdfPage = await view.getPage(i + 1)
    const vp = pdfPage.getViewport({ scale: 1, rotation: 0 })
    let lines = []

    const tc = await pdfPage.getTextContent()
    const hasText = tc.items.some(it => typeof it.str === 'string' && it.str.trim())

    if (hasText && onlyEmpty) {
      lines = await extractLines(pdfPage, BASE_SCALE, i)
    } else {
      lines = await ocrPage(pdfPage, i, langs, m => {
        const inner = typeof m.progress === 'number' ? m.progress : 0
        onProgress?.({
          label: `${m.status || 'recognising'} — page ${i + 1} of ${view.numPages}`,
          pct: (i + inner) / view.numPages
        })
      }, { group: true })
      if (!lines.length && hasText) {
        lines = await extractLines(pdfPage, BASE_SCALE, i)
      }
    }

    const blocks = lines
      .filter(l => l.text && l.text.trim())
      .map(l => {
        const wordsInLine = l.text.trim().split(/\s+/).filter(Boolean).length
        totalWords += wordsInLine
        return {
          text: l.text,
          fontSizePt: (l.fontSize || 12) / BASE_SCALE,
          xPt: (l.x || 0) / BASE_SCALE,
          wPt: (l.w || vp.width) / BASE_SCALE,
          family: l.family || 'sans-serif',
          bold: !!l.bold,
          italic: !!l.italic,
          color: null
        }
      })

    docxPages.push({
      widthPt: vp.width,
      heightPt: vp.height,
      blocks
    })
  }

  if (!totalWords) {
    throw new Error('No readable text was found in this document.')
  }

  return { blob: buildDocx(docxPages), pages: view.numPages, words: totalWords }
}

export async function ocrToMarkdown(bytes, { langs, onlyEmpty = true }, onProgress) {
  const { extractLines } = await import('./extract')

  const clone = new Uint8Array(bytes.byteLength)
  clone.set(new Uint8Array(bytes))
  const view = await pdfjs.getDocument({ data: clone }).promise

  const allPages = []
  let totalWords = 0

  for (let i = 0; i < view.numPages; i++) {
    const pdfPage = await view.getPage(i + 1)
    let lines = []

    const tc = await pdfPage.getTextContent()
    const hasText = tc.items.some(it => typeof it.str === 'string' && it.str.trim())

    if (hasText && onlyEmpty) {
      lines = await extractLines(pdfPage, BASE_SCALE, i)
    } else {
      lines = await ocrPage(pdfPage, i, langs, m => {
        const inner = typeof m.progress === 'number' ? m.progress : 0
        onProgress?.({
          label: `${m.status || 'recognising'} — page ${i + 1} of ${view.numPages}`,
          pct: (i + inner) / view.numPages
        })
      }, { group: true })
      if (!lines.length && hasText) {
        lines = await extractLines(pdfPage, BASE_SCALE, i)
      }
    }

    const validLines = lines.filter(l => l.text && l.text.trim())
    const fontSizes = validLines.map(l => l.fontSize || 12).filter(s => s > 4).sort((a, b) => a - b)
    const bodySize = fontSizes.length ? fontSizes[Math.floor(fontSizes.length * 0.45)] : 12

    const pageBlocks = []
    for (const line of validLines) {
      const raw = line.text.trim()
      if (!raw) continue

      totalWords += raw.split(/\s+/).filter(Boolean).length
      const ratio = (line.fontSize || 12) / bodySize
      const bulletMatch = /^([•–—*○■▸►]|\d+\.|\([0-9a-zA-Z]\))\s+(.+)$/.exec(raw)

      let formatted = raw
      if (bulletMatch) {
        const isNum = /^\d+\./.test(bulletMatch[1])
        const marker = isNum ? bulletMatch[1] : '-'
        formatted = `${marker} ${bulletMatch[2]}`
      } else if (ratio >= 1.6) {
        formatted = `# ${raw}`
      } else if (ratio >= 1.3) {
        formatted = `## ${raw}`
      } else if (ratio >= 1.15 && line.bold) {
        formatted = `### ${raw}`
      } else if (line.bold) {
        formatted = `**${raw}**`
      } else if (line.italic) {
        formatted = `*${raw}*`
      }

      pageBlocks.push(formatted)
    }

    if (pageBlocks.length) {
      allPages.push(pageBlocks.join('\n\n'))
    }
  }

  if (!totalWords) {
    throw new Error('No readable text was found in this document.')
  }

  return { text: allPages.join('\n\n---\n\n'), pages: view.numPages, words: totalWords }
}


