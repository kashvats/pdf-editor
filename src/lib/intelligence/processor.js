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

export async function processDocumentStructure(bytes, onProgress) {
  const clone = new Uint8Array(bytes.byteLength)
  clone.set(new Uint8Array(bytes))
  const doc = await pdfjs.getDocument({ data: clone }).promise

  const chunks = []
  const headings = []
  const facts = {
    dates: new Set(),
    emails: new Set(),
    urls: new Set(),
    money: new Set(),
    metrics: new Set(),
    regulations: new Set()
  }

  let chunkIdCounter = 0

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum)
    const lines = await extractLines(page, BASE_SCALE, pageNum - 1)

    // Check for tables
    let table = null
    try {
      table = await readTable(page, BASE_SCALE)
    } catch {
      table = null
    }

    // Detect body font size baseline for this page
    const fontSizes = lines.map(l => l.fontSize || 12).filter(s => s > 4).sort((a, b) => a - b)
    const bodySize = fontSizes.length ? fontSizes[Math.floor(fontSizes.length * 0.45)] : 12

    for (const line of lines) {
      const text = line.text?.trim()
      if (!text) continue

      const ratio = (line.fontSize || 12) / bodySize
      const isBold = !!line.bold
      let headingLevel = 0

      if (ratio >= 1.6 || (ratio >= 1.35 && isBold)) headingLevel = 1
      else if (ratio >= 1.25 || (ratio >= 1.15 && isBold)) headingLevel = 2
      else if (ratio >= 1.12 && isBold) headingLevel = 3

      if (headingLevel > 0) {
        headings.push({
          level: headingLevel,
          text,
          page: pageNum,
          lineId: line.id
        })
      }

      // Regex matches
      const matchDates = text.match(PATTERNS.date) || []
      matchDates.forEach(d => facts.dates.add(d.trim()))

      const matchEmails = text.match(PATTERNS.email) || []
      matchEmails.forEach(e => facts.emails.add(e.trim()))

      const matchUrls = text.match(PATTERNS.url) || []
      matchUrls.forEach(u => facts.urls.add(u.trim()))

      const matchMoney = text.match(PATTERNS.money) || []
      matchMoney.forEach(m => facts.money.add(m.trim()))

      const matchMetrics = text.match(PATTERNS.metric) || []
      matchMetrics.forEach(m => facts.metrics.add(m.trim()))

      const matchRegs = text.match(PATTERNS.regulation) || []
      matchRegs.forEach(r => facts.regulations.add(r.trim()))

      // Create indexed knowledge chunk
      const chunkId = `chk_${pageNum}_${++chunkIdCounter}`
      chunks.push({
        id: chunkId,
        page: pageNum,
        text,
        isHeading: headingLevel > 0,
        headingLevel,
        fontSize: Math.round((line.fontSize || 12) * 10) / 10,
        bold: isBold,
        box: { x: line.x, y: line.y, w: line.w, h: line.rectH }
      })
    }

    onProgress?.(pageNum / doc.numPages)
  }

  return {
    numPages: doc.numPages,
    chunks,
    headings,
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
