import pdfjs from '../pdfjs.js'
import { BASE_SCALE } from '../../utils/misc.js'
import { extractLines } from '../extract.js'
import { readTable } from '../tables.js'

// Deterministic regex patterns for facts and metadata
const PATTERNS = {
  date: /\b(?:(?:19|20)\d\d[-/.](?:0?[1-9]|1[012])[-/.](?:0?[1-9]|[12]\d|3[01])|(?:0?[1-9]|[12]\d|3[01])[-/.](?:0?[1-9]|1[012])[-/.](?:19|20)\d\d|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+(?:19|20)\d\d)\b/gi,
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  url: /https?:\/\/[^\s/$.?#].[^\s]*/gi,
  money: /(?:\$|€|£|¥|₹|USD|EUR|GBP|INR)\s*[0-9,]+(?:\.[0-9]{2})?\b/gi,
  metric: /\b\d+(?:\.\d+)?\s*(?:%|percent|ms|s|sec|min|hours?|days?|kg|km|MB|GB|TB|users?|clients?|customers?)\b/gi,
  regulation: /\b(?:GDPR|HIPAA|ISO\s*\d+|SOC\s*2|PCI[- ]DSS|CCPA|FERPA|NIST|Section\s*\d+)\b/gi
}

// Noise patterns to exclude from knowledge extraction and mind maps
const NOISE_PATTERNS = [
  /^(?:page\s*)?\d+(?:\s*(?:of|\/|-)\s*\d+)?$/i,
  /^editpdf(?:\s*-\s*page.*)?$/i,
  /^(?:©|\(c\)|copyright)\b/i,
  /^all\s*rights\s*reserved\.?$/i,
  /^https?:\/\//i,
  /^www\.[a-z0-9-]+\.[a-z]{2,}/i,
  /^[•–—\-*|~·_+=\s]{1,4}$/,
  /^(?:privacy\s*policy|terms\s*of\s*service|cookie\s*policy)$/i,
  /^(?:for\s+)?dummies$/i
]

export function isTextNoise(text) {
  if (!text) return true
  const clean = text.trim()
  if (clean.length < 2) return true
  for (const pat of NOISE_PATTERNS) {
    if (pat.test(clean)) return true
  }
  return false
}

export function cleanTextContent(text) {
  if (!text) return ''
  return text
    .replace(/[\u2122\u00AE\u00A9]/g, '') // Strip ™, ®, © symbols
    .replace(/\bTM\b/g, '')
    .replace(/\s*\|\s*(?:\d+|[ivxlcdm]+)\s*$/i, '') // Strip running footer/page pipe suffixes: e.g. " | 3"
    .replace(/^\s*(?:\d+|[ivxlcdm]+)\s*\|\s*/i, '') // Strip running header page pipe prefixes: e.g. "6 | "
    .replace(/\s+/g, ' ')
    .trim()
}

export async function processDocumentStructure(bytes, onProgress) {
  const clone = new Uint8Array(bytes.byteLength)
  clone.set(new Uint8Array(bytes))
  const doc = await pdfjs.getDocument({ data: clone }).promise

  const chunks = []
  const headings = []
  const sections = []
  const facts = {
    dates: new Set(),
    emails: new Set(),
    urls: new Set(),
    money: new Set(),
    metrics: new Set(),
    regulations: new Set()
  }

  let pageLabels = []
  try {
    pageLabels = await doc.getPageLabels() || []
  } catch {
    pageLabels = []
  }

  let chunkIdCounter = 0
  const rawPageLines = []
  const maxPagesToProcess = Math.min(doc.numPages, 180)

  // Step A: Extract lines across representative pages and identify repeated running headers/footers
  for (let pageNum = 1; pageNum <= maxPagesToProcess; pageNum++) {
    const page = await doc.getPage(pageNum)
    const lines = await extractLines(page, BASE_SCALE, pageNum - 1)
    rawPageLines.push({ pageNum, lines })
    onProgress?.((pageNum / maxPagesToProcess) * 0.5)
  }

  // Count occurrences of exact first/last lines across pages (to eliminate running headers/footers)
  const headerFooterFreq = new Map()
  if (rawPageLines.length >= 2) {
    for (const { lines } of rawPageLines) {
      if (lines.length > 0) {
        const topText = lines[0].text.trim().toLowerCase()
        const botText = lines[lines.length - 1].text.trim().toLowerCase()
        headerFooterFreq.set(topText, (headerFooterFreq.get(topText) || 0) + 1)
        headerFooterFreq.set(botText, (headerFooterFreq.get(botText) || 0) + 1)
      }
    }
  }

  const RUNNING_PIPE_PAGE_REGEX = /^(?:.+?\s*\|\s*(?:\d+|[ivxlcdm]+)|(?:\d+|[ivxlcdm]+)\s*\|\s*.+)$/i

  const isRunningHeaderFooter = (text, lineIdx, totalLines) => {
    const lower = text.trim().toLowerCase()
    if (rawPageLines.length >= 2 && (headerFooterFreq.get(lower) || 0) >= 2) return true
    if ((lineIdx === 0 || lineIdx === totalLines - 1) && RUNNING_PIPE_PAGE_REGEX.test(text)) return true
    return false
  }

  let currentSection = {
    id: 'sec_root',
    title: 'Document Overview',
    level: 1,
    page: 1,
    subsections: [],
    chunkIds: []
  }
  sections.push(currentSection)

  // Step B: Process clean lines, hierarchy, and chunks
  for (const { pageNum, lines } of rawPageLines) {
    // Detect body font size baseline for this page
    const fontSizes = lines.map(l => l.fontSize || 12).filter(s => s > 4).sort((a, b) => a - b)
    const bodySize = fontSizes.length ? fontSizes[Math.floor(fontSizes.length * 0.45)] : 12
    const displayPageLabel = (pageLabels && pageLabels[pageNum - 1]) ? String(pageLabels[pageNum - 1]) : String(pageNum)

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx]
      const rawText = line.text?.trim()
      if (!rawText) continue

      // Filter noise lines and repeated headers/footers
      if (isTextNoise(rawText) || isRunningHeaderFooter(rawText, lineIdx, lines.length)) continue

      const cleanText = cleanTextContent(rawText)
      if (!cleanText || cleanText.length < 2) continue

      const ratio = (line.fontSize || 12) / bodySize
      const isBold = !!line.bold
      let headingLevel = 0

      // Real heading heuristic
      if ((ratio >= 1.5 || (ratio >= 1.3 && isBold)) && cleanText.length < 90 && !/[.!?]$/.test(cleanText)) {
        headingLevel = 1
      } else if ((ratio >= 1.22 || (ratio >= 1.12 && isBold)) && cleanText.length < 110 && !/[.!?]$/.test(cleanText)) {
        headingLevel = 2
      } else if (ratio >= 1.08 && isBold && cleanText.length < 80) {
        headingLevel = 3
      }

      const chunkId = `chk_${pageNum}_${++chunkIdCounter}`

      if (headingLevel > 0) {
        const headingObj = {
          id: `h_${headings.length + 1}`,
          level: headingLevel,
          text: cleanText,
          page: pageNum,
          pdfPageNumber: pageNum,
          displayPageLabel,
          chunkId,
          lineId: line.id
        }
        headings.push(headingObj)

        if (headingLevel === 1) {
          currentSection = {
            id: `sec_${sections.length + 1}`,
            title: cleanText,
            level: 1,
            page: pageNum,
            pdfPageNumber: pageNum,
            displayPageLabel,
            subsections: [],
            chunkIds: [chunkId]
          }
          sections.push(currentSection)
        } else if (headingLevel === 2) {
          const sub = {
            id: `subsec_${headings.length}`,
            title: cleanText,
            level: 2,
            page: pageNum,
            pdfPageNumber: pageNum,
            displayPageLabel,
            chunkIds: [chunkId]
          }
          currentSection.subsections.push(sub)
        }
      } else {
        currentSection.chunkIds.push(chunkId)
      }

      // Collect deterministic facts
      const matchDates = rawText.match(PATTERNS.date) || []
      matchDates.forEach(d => facts.dates.add(cleanTextContent(d)))

      const matchEmails = rawText.match(PATTERNS.email) || []
      matchEmails.forEach(e => facts.emails.add(e.trim()))

      const matchUrls = rawText.match(PATTERNS.url) || []
      matchUrls.forEach(u => facts.urls.add(u.trim()))

      const matchMoney = rawText.match(PATTERNS.money) || []
      matchMoney.forEach(m => facts.money.add(m.trim()))

      const matchMetrics = rawText.match(PATTERNS.metric) || []
      matchMetrics.forEach(m => facts.metrics.add(m.trim()))

      const matchRegs = rawText.match(PATTERNS.regulation) || []
      matchRegs.forEach(r => facts.regulations.add(r.trim()))

      chunks.push({
        id: chunkId,
        page: pageNum,
        pdfPageNumber: pageNum,
        displayPageLabel,
        text: cleanText,
        rawText,
        isHeading: headingLevel > 0,
        headingLevel,
        sectionTitle: currentSection.title,
        fontSize: Math.round((line.fontSize || 12) * 10) / 10,
        bold: isBold,
        box: { x: line.x, y: line.y, w: line.w, h: line.rectH }
      })
    }

    onProgress?.(0.5 + (pageNum / maxPagesToProcess) * 0.5)
  }

  return {
    numPages: doc.numPages,
    pageLabels,
    chunks,
    headings,
    sections,
    facts: {
      dates: Array.from(facts.dates),
      emails: Array.from(facts.emails),
      urls: Array.from(facts.urls),
      money: Array.from(facts.money),
      metrics: Array.from(facts.metrics),
      regulations: Array.from(facts.regulations)
    }
  }
}

