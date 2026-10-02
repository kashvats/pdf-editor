// Structure-Aware Semantic Chunker
// Preserves sentence boundaries, avoids crossing major headings, targets 150-300 words with small overlap

import { isStructuralNoiseChunk, cleanCandidateText } from './structuralNoise.js'

export function chunkDocumentStructure(pages, options = {}) {
  const {
    targetWordCount = 200,
    minWordCount = 20,
    frontMatterPages = new Set()
  } = options

  const chunks = []
  let chunkCounter = 0

  for (const page of pages) {
    const pageNum = page.pageNum || 1
    const pdfPageIndex = pageNum - 1
    const lines = page.lines || []
    if (!lines.length) continue

    // Detect body font baseline
    const fontSizes = lines.map(l => l.fontSize || 12).filter(s => s > 4).sort((a, b) => a - b)
    const bodySize = fontSizes.length ? fontSizes[Math.floor(fontSizes.length * 0.45)] : 12

    let currentLines = []
    let currentWords = 0
    let lastHeading = ''

    const flushChunk = (isHeading = false, headingLevel = 0) => {
      if (!currentLines.length) return
      const fullText = currentLines.map(l => l.text).join(' ').trim()
      if (!fullText) {
        currentLines = []
        currentWords = 0
        return
      }

      // Compute bounding box covering all lines
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const l of currentLines) {
        minX = Math.min(minX, l.x || 0)
        minY = Math.min(minY, l.y || 0)
        maxX = Math.max(maxX, (l.x || 0) + (l.w || 0))
        maxY = Math.max(maxY, (l.y || 0) + (l.rectH || l.h || 12))
      }

      const displayPageLabel = page.displayPageLabel || String(pageNum)
      const pdfPageNumber = page.pdfPageNumber || pageNum

      const chunkObj = {
        id: `chk_${pageNum}_${++chunkCounter}`,
        pdfPageIndex,
        page: pageNum,
        pdfPageNumber,
        displayPageLabel,
        text: fullText,
        isHeading,
        headingLevel,
        sectionTitle: lastHeading || 'General',
        bbox: {
          x: Math.round(minX * 10) / 10,
          y: Math.round(minY * 10) / 10,
          w: Math.round((maxX - minX) * 10) / 10,
          h: Math.round((maxY - minY) * 10) / 10
        },
        topicMemberships: []
      }

      if (!isStructuralNoiseChunk(chunkObj, frontMatterPages)) {
        chunks.push(chunkObj)
      }

      currentLines = []
      currentWords = 0
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const rawText = (line.text || '').trim()
      if (!rawText) continue

      const ratio = (line.fontSize || 12) / bodySize
      const isBold = !!line.bold
      let headingLevel = 0

      // Real heading heuristic
      if ((ratio >= 1.45 || (ratio >= 1.25 && isBold)) && rawText.length < 90 && !/[.!?]$/.test(rawText)) {
        headingLevel = 1
      } else if ((ratio >= 1.2 || (ratio >= 1.1 && isBold)) && rawText.length < 110 && !/[.!?]$/.test(rawText)) {
        headingLevel = 2
      } else if (ratio >= 1.08 && isBold && rawText.length < 80) {
        headingLevel = 3
      }

      if (headingLevel > 0) {
        // Flush any preceding body lines
        flushChunk(false, 0)
        lastHeading = cleanCandidateText(rawText)
        currentLines.push(line)
        flushChunk(true, headingLevel)
      } else {
        const lineWords = rawText.split(/\s+/).length
        currentLines.push(line)
        currentWords += lineWords

        // Check if we hit target word count and end with a sentence terminator
        const endsWithPunctuation = /[.!?]["']?$/.test(rawText)
        if (currentWords >= targetWordCount && endsWithPunctuation) {
          flushChunk(false, 0)
        }
      }
    }

    // Flush remaining lines on page
    flushChunk(false, 0)
  }

  return chunks
}
