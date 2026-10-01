import pdfjs from './pdfjs'
import { BASE_SCALE } from '../utils/misc'
import { pageSegments, groupRows } from './extract'

function escapeCell(s) {
  return String(s || '').trim().replace(/\|/g, '\\|') || ' '
}

// Splits segments into distinct table cells based on horizontal gaps
function rowCells(group) {
  const ss = group.segs.filter(s => s.str.trim()).sort((a, b) => a.x - b.x)
  if (!ss.length) return []
  const cells = []
  let cur = ''
  let pen = null
  for (const s of ss) {
    if (pen) {
      const gap = s.x - (pen.x + pen.w)
      if (gap > Math.max(pen.h, s.h) * 1.5) {
        cells.push(cur.trim())
        cur = ''
      } else if (gap > pen.h * 0.12 && !/\s$/.test(cur) && !/^\s/.test(s.str)) {
        cur += ' '
      }
    }
    cur += s.str
    pen = s
  }
  if (cur.trim()) cells.push(cur.trim())
  return cells
}

export async function pdfToMarkdown(bytes, onProgress) {
  const clone = new Uint8Array(bytes.byteLength)
  clone.set(new Uint8Array(bytes))
  const doc = await pdfjs.getDocument({ data: clone }).promise

  const allPages = []

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const { segs } = await pageSegments(page, BASE_SCALE)
    const groups = groupRows(segs)

    // Calculate median font size for headings
    const fontSizes = segs.map(s => s.h).filter(h => h > 4).sort((a, b) => a - b)
    const bodySize = fontSizes.length ? fontSizes[Math.floor(fontSizes.length * 0.45)] : 12

    const blocks = []
    let iRow = 0

    while (iRow < groups.length) {
      const g = groups[iRow]
      const cells = rowCells(g)

      // Detect table: 2 or more consecutive rows with 2+ columns
      if (cells.length >= 2) {
        const tableRows = [cells]
        let nextRow = iRow + 1
        while (nextRow < groups.length) {
          const nextCells = rowCells(groups[nextRow])
          if (nextCells.length >= 2) {
            tableRows.push(nextCells)
            nextRow++
          } else {
            break
          }
        }

        if (tableRows.length >= 2) {
          // Format as Markdown table
          const maxCols = Math.max(...tableRows.map(r => r.length))
          const header = tableRows[0]
          const headerPadded = Array.from({ length: maxCols }, (_, c) => escapeCell(header[c]))
          const sep = Array.from({ length: maxCols }, () => '---')
          const body = tableRows.slice(1).map(r =>
            Array.from({ length: maxCols }, (_, c) => escapeCell(r[c]))
          )

          const mdTable = [
            `| ${headerPadded.join(' | ')} |`,
            `| ${sep.join(' | ')} |`,
            ...body.map(r => `| ${r.join(' | ')} |`)
          ].join('\n')

          blocks.push(mdTable)
          iRow = nextRow
          continue
        }
      }

      // Normal text row
      const lineText = cells.join(' ').trim()
      if (!lineText) {
        iRow++
        continue
      }

      const domSeg = g.segs.reduce((a, b) => (b.str.length > a.str.length ? b : a), g.segs[0] || {})
      const fs = domSeg.h || bodySize
      const isBold = !!domSeg.bold
      const isItalic = !!domSeg.italic
      const ratio = fs / bodySize

      const bulletMatch = /^([•–—*○■▸►]|\d+\.|\([0-9a-zA-Z]\))\s+(.+)$/.exec(lineText)

      let formatted = lineText
      if (bulletMatch) {
        const isNum = /^\d+\./.test(bulletMatch[1])
        const marker = isNum ? bulletMatch[1] : '-'
        formatted = `${marker} ${bulletMatch[2]}`
      } else if (ratio >= 1.6) {
        formatted = `# ${lineText}`
      } else if (ratio >= 1.25) {
        formatted = `## ${lineText}`
      } else if (ratio >= 1.12 && isBold) {
        formatted = `### ${lineText}`
      } else if (domSeg.fam === 'monospace') {
        formatted = `\`${lineText}\``
      } else if (isBold && isItalic) {
        formatted = `***${lineText}***`
      } else if (isBold) {
        formatted = `**${lineText}**`
      } else if (isItalic) {
        formatted = `*${lineText}*`
      }

      blocks.push(formatted)
      iRow++
    }

    if (blocks.length) {
      allPages.push(blocks.join('\n\n'))
    }
    onProgress?.(i / doc.numPages)
  }

  const finalMd = allPages.join('\n\n---\n\n')
  if (!finalMd.trim()) {
    throw new Error('This PDF contains no extractable text. If it is a scan, use the OCR tool to extract it.')
  }

  return finalMd
}

