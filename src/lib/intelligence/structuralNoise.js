// Structural Noise, Front-Matter & Boilerplate Detection Engine
// Identifies catalog, publication metadata, TOC, and pagination structurally

const FRONT_MATTER_PATTERNS = [
  /\b(?:table\s*of\s*contents|brief\s*contents|contents)\b/i,
  /\b(?:isbn(?:-1[03])?|issn)\b/i,
  /\b(?:all\s*rights\s*reserved|copyright\s*©?|\(c\)\s*\d{4})\b/i,
  /\b(?:cataloging-in-publication|library\s*of\s*congress)\b/i,
  /\b(?:acknowledgments?|preface|foreword|dedication|about\s*the\s*author)\b/i,
  /\b(?:published\s*by|printed\s*in|printed\s*and\s*bound)\b/i,
  /\b(?:vice\s*president|executive\s*publisher|managing\s*editor|project\s*editor|copy\s*editor|composition\s*services|editorial\s*manager|media\s*development|production\s*services|technical\s*editor|proofreader|indexer)\b/i,
  /\b(?:for\s+dummies|dummies\s+press|wiley\s+publishing)\b/i
]

const NOISE_LINE_PATTERNS = [
  /^(?:page\s*)?[ivxlcdm\d]+(?:\s*(?:of|\/|-)\s*[ivxlcdm\d]+)?$/i,
  /^\d+(?:\.\d+)?\s*(?:%|percent)\.?$/i,
  /^https?:\/\/[^\s]+$/i,
  /^www\.[a-z0-9-]+\.[a-z]{2,}/i,
  /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$/,
  /^(?:©|\(c\)|copyright)\b/i,
  /^all\s*rights\s*reserved\.?$/i,
  /^isbn(?:\s*-\s*1[03])?:?\s*[0-9-x]+/i,
  /^[•–—\-*|~·_+=\s]{1,4}$/,
  /^(?:table\s*of\s*contents|contents|index|glossary|appendix\s*[a-z0-9]+)$/i,
  /^(?:for\s+dummies|the\s+part\s+of\s+tens|part\s+[ivxlcdm\d]+(?::\s*.*)?)$/i,
  /^(?:this\s+book|about\s+this\s+book|how\s+this\s+book\s+is\s+organized)$/i
]

const STRUCTURAL_PREFIXES = [
  /^(?:chapter\s*\d+|part\s*[ivxlcdm\d]+|section\s*\d+(?:\.\d+)*|unit\s*\d+|module\s*\d+)\s*[:.\-—]\s*/i,
  /^(?:chapter\s*\d+|part\s*[ivxlcdm\d]+|section\s*\d+(?:\.\d+)*|unit\s*\d+|module\s*\d+)\s+/i,
  /^\d+(?:\.\d+)*\s+/
]

/**
 * Checks overall text extraction quality to determine if OCR is required.
 */
export function checkDocumentTextQuality(pages) {
  if (!pages || !pages.length) {
    return { needsOcr: true, textDensity: 0, emptyPageRatio: 1 }
  }

  let totalChars = 0
  let emptyPages = 0

  for (const p of pages) {
    const text = (p.text || '').trim()
    if (text.length < 25) {
      emptyPages++
    }
    totalChars += text.length
  }

  const avgCharsPerPage = totalChars / pages.length
  const emptyPageRatio = emptyPages / pages.length

  // If over 50% of sampled pages are empty or average page has fewer than 80 chars, flag OCR
  const needsOcr = emptyPageRatio > 0.5 || avgCharsPerPage < 80

  return {
    needsOcr,
    textDensity: Math.round(avgCharsPerPage),
    emptyPageRatio: Math.round(emptyPageRatio * 100) / 100
  }
}

/**
 * Identifies front-matter pages (copyright, TOC, preface, acknowledgments)
 * structurally from early document zone and metadata pattern density.
 */
export function detectFrontMatterPages(chunks, numPages = 20) {
  const frontMatterPages = new Set()
  if (!chunks || !chunks.length) return frontMatterPages

  // Front matter typically lives in the first 25% of pages or first 15 pages
  const maxSearchPage = Math.min(Math.max(3, Math.ceil(numPages * 0.25)), 15)
  const pageScores = new Map()

  for (const c of chunks) {
    const page = c.page || (c.pdfPageIndex != null ? c.pdfPageIndex + 1 : 1)
    if (page > maxSearchPage) continue

    const text = c.text || ''
    let score = pageScores.get(page) || 0

    // Check front-matter pattern density
    for (const pat of FRONT_MATTER_PATTERNS) {
      if (pat.test(text)) score += 3
    }

    // Check for TOC dotted leaders (e.g. "Chapter 1 .... 12")
    if (/\.{3,}\s*\d+/g.test(text)) {
      score += 4
    }

    pageScores.set(page, score)
  }

  pageScores.forEach((score, page) => {
    // If threshold reached, mark as front matter
    if (score >= 3) {
      frontMatterPages.add(page)
    }
  })

  return frontMatterPages
}

/**
 * Determines whether an individual chunk is structural boilerplate/noise.
 */
export function isStructuralNoiseChunk(chunk, frontMatterPages = new Set()) {
  if (!chunk) return true
  const raw = (chunk.text || '').trim()
  if (raw.length < 2) return true

  const page = chunk.page || (chunk.pdfPageIndex != null ? chunk.pdfPageIndex + 1 : 1)

  // Direct noise line patterns
  for (const pat of NOISE_LINE_PATTERNS) {
    if (pat.test(raw)) return true
  }

  // If on front-matter page, check for catalog / TOC / preface signatures
  if (frontMatterPages.has(page)) {
    for (const pat of FRONT_MATTER_PATTERNS) {
      if (pat.test(raw)) return true
    }
    if (/\.{3,}\s*\d+/.test(raw)) return true
  }

  return false
}

/**
 * Strips structural numbering, chapter prefixes, and leading determiners/articles from candidate topic strings.
 */
export function cleanCandidateText(text) {
  if (!text) return ''
  let cleaned = text
    .replace(/[\u2122\u00AE\u00A9]/g, '') // ™, ®, ©
    .replace(/\bTM\b/g, '')
    .trim()

  for (const prefix of STRUCTURAL_PREFIXES) {
    cleaned = cleaned.replace(prefix, '')
  }

  // Strip running footer/page pipe suffixes: e.g. " | 3" or " | 15"
  cleaned = cleaned.replace(/\s*\|\s*(?:\d+|[ivxlcdm]+)\s*$/i, '')
  // Strip running header page pipe prefixes: e.g. "6 | " or "16 | "
  cleaned = cleaned.replace(/^\s*(?:\d+|[ivxlcdm]+)\s*\|\s*/i, '')

  // Strip leading articles, determiners and possessives (e.g. "The Internet" -> "Internet", "Your Computer" -> "Computer")
  cleaned = cleaned.replace(/^(?:the|a|an|your|my|our|their|his|her|its)\s+/i, '')

  return cleaned.replace(/\s+/g, ' ').trim()
}
