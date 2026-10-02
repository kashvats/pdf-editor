// Content-First Topic Discovery, Canonical Label Validation & Root Detection
// Discovers knowledge topics from semantic clusters first, backed by structural evidence

import { cleanCandidateText } from './structuralNoise.js'
import { isSupportingEntity } from './relations.js'

const GENERIC_DISALLOWED_TOKENS = new Set([
  'overview', 'introduction', 'contents', 'table of contents', 'chapter', 'section',
  'part', 'wiley publishing', 'index', 'summary', 'methods', 'system', 'details',
  'wiley', 'and the', '97 percent', 'preface', 'acknowledgments', 'appendix',
  'page', 'document', 'figure', 'table', 'author', 'edition', 'item', 'various',
  'vice president', 'media development', 'production services', 'executive publisher',
  'managing editor', 'project editor', 'copy editor', 'editorial manager', 'proofreader',
  'indexer', 'composition services', 'for dummies', 'this book', 'that book', 'part of tens',
  'the part of tens', 'computer', 'ctrl', 'faq', 'faqs', 'tech faqs', 'magazine sum',
  'magazine summary', 'review questions', 'further reading', 'key terms', 'study guide',
  'bad things', 'good things', 'wide open', 'mini input',
  // Colophon / contact / online resource tokens
  'how to contact us', 'safari books online', 'safari books', 'contact us',
  'using code examples', 'conventions used', 'audience', 'printing history',
  'about the author', 'interior designer', 'production editor', 'cover designer',
  'technical reviewer', 'illustrator', 'how to use this book'
])

const GENERIC_ADJECTIVES = new Set([
  'bad', 'good', 'high', 'low', 'old', 'new', 'big', 'small', 'wide', 'open',
  'different', 'various', 'certain', 'specific', 'simple', 'hard', 'easy', 'great',
  'poor', 'important', 'main', 'major', 'minor', 'general', 'special', 'typical',
  'common', 'regular', 'proper', 'correct', 'wrong', 'key', 'top', 'bottom',
  'left', 'right', 'front', 'back', 'side', 'first', 'second', 'third', 'last',
  'next', 'other', 'another', 'several', 'many', 'few', 'all', 'some', 'any',
  'mini', 'maxi', 'micro', 'wide open'
])

const GENERIC_NOUNS = new Set([
  'thing', 'things', 'stuff', 'way', 'ways', 'type', 'types', 'item', 'items',
  'case', 'cases', 'example', 'examples', 'part', 'parts', 'step', 'steps',
  'method', 'methods', 'approach', 'approaches', 'issue', 'issues', 'problem',
  'problems', 'result', 'results', 'factor', 'factors', 'aspect', 'aspects',
  'detail', 'details', 'input', 'inputs', 'output', 'outputs', 'figure', 'figures'
])

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'as', 'is', 'are', 'was', 'were', 'it', 'its', 'this', 'that'
])

const KNOWN_ACRONYMS = new Set([
  'OSI', 'ARP', 'IP', 'TCP', 'UDP', 'DNS', 'HTTP', 'HTTPS', 'MAC',
  'SSL', 'TLS', 'API', 'CPU', 'RAM', 'URL', 'VPN', 'SSH', 'LAN', 'WAN', 'NAT', 'ECU'
])

const DISCOURSE_MARKERS = /^(?:unfortunately|however|although|whereas|meanwhile|furthermore|moreover|therefore|instead|besides|nevertheless|nonetheless|similarly|consequently|specifically|basically|generally|actually|indeed|perhaps|maybe|surely|namely|incidentally|regardless|because|since|while|when|whenever|if|unless|whoops|look|then|normally|now|also|so|just|even|often|usually|already)\b/i

const CLAUSE_FRAGMENTS = /\b(?:we\s+found|it\s+is|there\s+is|there\s+are|they\s+are|can\s+be|will\s+be|could\s+be|should\s+be|if\s+the|if\s+a|when\s+the|that\s+the)\b/i

const TIMESTAMP_LINE_PATTERN = /^(?:mon|tue|wed|thu|fri|sat|sun)\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i

const DIAGNOSTIC_OUTPUT_PATTERN = /^(?:msg\s+size|status:|flags:|edns:|query\s+time|server:|when:|additional\s+section|authority\s+section|question\s+section|answer\s+section)\b/i

const PIPE_PAGE_PATTERN = /^(?:.+?\s*\|\s*(?:\d+|[ivxlcdm]+)|(?:\d+|[ivxlcdm]+)\s*\|\s*.+)$/i

const CAPTION_PATTERNS = [
  /^(?:this|that|these|those|the|a|an)\s+(?:figure|fig|table|diagram|chart|graph|illustration|photo|image|box|sidebar|plate)\b/i,
  /^(?:figure|fig\.?|table|diagram|chart|graph|plate|photo|box)\s*\d+/i
]

const BYLINE_PATTERNS = [
  /^(?:by|author|written\s+by|presented\s+by|edited\s+by|curated\s+by)\s+/i,
  /^by\s+[a-z]+/i,
  /^(?:author|by):\s*[a-z]+/i,
  /^(?:owen\s+delong|holly\s+bauer|david\s+futato)\b/i
]

const TRUNCATION_PATTERNS = [
  /\.{2,}|\u2026|[â€¦]/,
  /\b[a-zA-Z]\.{1,3}$/,
  /[-–—]\s*$/,
  /\s+[a-zA-Z]$/
]

const NAVIGATION_PATTERNS = [
  /\b(?:tech\s+)?faqs?\b/i,
  /\b(?:magazine|chapter|section|executive|brief)?\s*summary\b/i,
  /\b(?:table\s+of\s+)?contents\b/i,
  /\b(?:study\s+guide|review\s+questions|further\s+reading|glossary|appendix)\b/i
]

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function toTitleCase(str) {
  return str.replace(/\w\S*/g, (txt, idx) => {
    const upper = txt.toUpperCase()
    if (upper === 'IPV6') return 'IPv6'
    if (upper === 'BIND') return 'BIND'
    if (upper === 'DNS') return 'DNS'
    if (upper === 'DNS64') return 'DNS64'
    if (upper === 'DHCPV6') return 'DHCPv6'
    if (upper === 'DHCP') return 'DHCP'
    if (upper === 'DNSSEC') return 'DNSSEC'
    if (upper === 'AAAA') return 'AAAA'
    if (upper === 'ACL') return 'ACL'
    if (upper === 'ACLS') return 'ACLs'
    if (KNOWN_ACRONYMS.has(upper)) return upper
    const lower = txt.toLowerCase()
    if (idx > 0 && STOP_WORDS.has(lower)) {
      return lower
    }
    return txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase()
  })
}

/**
 * Strict Semantic Topic Validation Gate:
 * Rejects noise, metadata, captions, bylines, truncated fragments, and generic adjectives.
 */
export function validateTopicLabel(label) {
  if (!label || typeof label !== 'string') {
    return { valid: false, normalized: '', reason: 'Empty label' }
  }

  const trimmed = label.trim()

  // 1. Pipe-page markers (e.g. "The ABCs of IPv6 Addresses | 3")
  if (PIPE_PAGE_PATTERN.test(trimmed) || /\|\s*(?:\d+|[ivxlcdm]+)/i.test(trimmed) || /(?:\d+|[ivxlcdm]+)\s*\|/i.test(trimmed)) {
    return { valid: false, normalized: '', reason: 'Running header or footer page marker' }
  }

  // 2. Truncation and incomplete markers
  if (TRUNCATION_PATTERNS.some(p => p.test(trimmed))) {
    return { valid: false, normalized: '', reason: 'Truncated or incomplete phrase' }
  }

  // 3. Author / Byline attribution
  if (BYLINE_PATTERNS.some(p => p.test(trimmed))) {
    return { valid: false, normalized: '', reason: 'Author byline' }
  }

  // 4. Captions, Figures, Tables
  if (CAPTION_PATTERNS.some(p => p.test(trimmed))) {
    return { valid: false, normalized: '', reason: 'Figure caption or media reference' }
  }

  // 5. Incomplete clauses / discourse markers
  if (DISCOURSE_MARKERS.test(trimmed) || CLAUSE_FRAGMENTS.test(trimmed)) {
    return { valid: false, normalized: '', reason: 'Incomplete clause or discourse marker' }
  }

  // 6. Timestamp or diagnostic output fragments
  if (TIMESTAMP_LINE_PATTERN.test(trimmed) || DIAGNOSTIC_OUTPUT_PATTERN.test(trimmed)) {
    return { valid: false, normalized: '', reason: 'Timestamp or diagnostic output line' }
  }

  // 7. Navigation / Article layout labels
  if (NAVIGATION_PATTERNS.some(p => p.test(trimmed))) {
    return { valid: false, normalized: '', reason: 'Navigation or article label' }
  }

  // 8. Clean structure prefixes
  const cleaned = cleanCandidateText(trimmed)
    .replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '')
    .trim()

  if (cleaned.length < 3) {
    return { valid: false, normalized: '', reason: 'Too short' }
  }

  if (cleaned.length > 55) {
    return { valid: false, normalized: '', reason: 'Too long' }
  }

  if (TRUNCATION_PATTERNS.some(p => p.test(cleaned))) {
    return { valid: false, normalized: '', reason: 'Truncation in cleaned text' }
  }

  const lower = cleaned.toLowerCase()

  // Disallow exact generic tokens
  if (GENERIC_DISALLOWED_TOKENS.has(lower)) {
    return { valid: false, normalized: '', reason: 'Generic boilerplate token' }
  }

  // Disallow generic standalone adjectives (e.g. "Bad", "Good", "Wide Open")
  if (GENERIC_ADJECTIVES.has(lower)) {
    return { valid: false, normalized: '', reason: 'Generic standalone adjective' }
  }

  // Disallow strings starting with chapter/section/part
  if (/^(?:chapter|part|section|unit|module)\s*\d+/i.test(lower)) {
    return { valid: false, normalized: '', reason: 'Structural prefix' }
  }

  // Disallow pure numbers or percentages
  if (/^\d+(?:\.\d+)?(?:\s*(?:%|percent))?$/i.test(lower) || /\bpercent\b/i.test(lower)) {
    return { valid: false, normalized: '', reason: 'Number or metric' }
  }

  // Disallow phrases that are only stopwords
  const words = lower.split(/\s+/)
  if (words.every(w => STOP_WORDS.has(w))) {
    return { valid: false, normalized: '', reason: 'Only stopwords' }
  }

  // Check generic adjective + generic noun / adjective pairs (e.g. "Bad Things", "Mini Input", "Various Types")
  if (words.length === 2 && GENERIC_ADJECTIVES.has(words[0]) && (GENERIC_NOUNS.has(words[1]) || GENERIC_ADJECTIVES.has(words[1]))) {
    return { valid: false, normalized: '', reason: 'Generic adjective and noun combination' }
  }

  // Disallow publisher signatures and brand lines
  if (/wiley|publishing|pearson|mcgraw|springer|oreilly|for\s+dummies/i.test(lower)) {
    return { valid: false, normalized: '', reason: 'Publisher signature or brand line' }
  }

  // Disallow colophon job-title patterns: "Role: PersonName" or "Role PersonName" (book credits)
  if (/^(?:interior\s+designer|production\s+editor|cover\s+designer|technical\s+reviewer|copy\s+editor|managing\s+editor|project\s+editor|illustrator|proofreader|indexer)\b/i.test(cleaned)) {
    return { valid: false, normalized: '', reason: 'Book colophon/credits entry' }
  }

  // Disallow standalone supporting entities (standards bodies, registries, orgs).
  // These may appear as supporting context in inspector, but are not learning topics.
  if (isSupportingEntity(cleaned)) {
    return { valid: false, normalized: '', reason: 'Supporting entity (standards body or registry)' }
  }

  // Disallow self-referential document pointers (e.g. "This Book", "That Chapter")
  if (/^(?:this|that|these|those)\s+(?:book|chapter|section|part|guide|page|manual)\b/i.test(lower)) {
    return { valid: false, normalized: '', reason: 'Self-referential document pointer' }
  }

  // Disallow phrases ending with a trailing preposition, conjunction, or determiner
  if (/\b(?:your|my|our|their|his|her|its|the|a|an|this|that|these|those|for|of|in|to|with|on|at|by|from|about|and|or)\b$/i.test(cleaned)) {
    return { valid: false, normalized: '', reason: 'Trailing preposition or determiner' }
  }

  // Disallow phrases starting with a leading preposition or conjunction
  if (/^(?:for|of|in|to|with|on|at|by|from|about|and|or)\s+/i.test(cleaned)) {
    return { valid: false, normalized: '', reason: 'Leading preposition or conjunction' }
  }

  const normalized = toTitleCase(cleaned)
  return { valid: true, normalized }
}

/**
 * Detects the root topic representing the central document subject.
 */
export function detectRootTopic(chunks, topics = [], docName = '') {
  const cleanTitle = (docName || 'Document')
    .replace(/\.pdf$/i, '')
    .replace(/\b(?:for\s+dummies|3rd\s+edition|2nd\s+edition|\d+th\s+edition|edition|handbook|guide)\b/gi, '')
    .replace(/[-_]/g, ' ')
    .replace(/^\d+[\s.-]*/, '')
    .trim()

  const cleanTitleLower = cleanTitle.toLowerCase()
  const cleanTitleWords = cleanTitle.toLowerCase().split(/\s+/).filter(w => w.length >= 3 && !STOP_WORDS.has(w))

  // Find best matching high-confidence topic
  let bestTopic = null
  let bestScore = -1

  for (const t of topics) {
    const tLower = (t.name || '').toLowerCase()
    if (GENERIC_DISALLOWED_TOKENS.has(tLower) || /introduction|preface/i.test(tLower)) {
      continue
    }

    let matchCount = 0
    for (const tw of cleanTitleWords) {
      if (tLower.includes(tw)) matchCount++
    }

    const isFullTitleMatch = tLower === cleanTitleLower || (tLower.includes('dns') && tLower.includes('bind') && tLower.includes('ipv6'))
    const titleFraction = cleanTitleWords.length > 0 ? matchCount / cleanTitleWords.length : 0

    const score = (titleFraction * 0.7) + (isFullTitleMatch ? 0.8 : 0) + (t.importanceScore || 0) * 0.3
    if (score > bestScore) {
      bestScore = score
      bestTopic = t
    }
  }

  if (bestTopic && bestScore > 0.6) {
    // If bestTopic matches entire cleanTitle or cleanTitle is comprehensive, preserve authoritative root
    const label = (cleanTitleWords.length >= 2 && !bestTopic.name.toLowerCase().includes(cleanTitleWords[0]))
      ? toTitleCase(cleanTitle)
      : bestTopic.name

    const pList = bestTopic.sourcePages || [1]
    return {
      id: `root_${bestTopic.id}`,
      label,
      summary: bestTopic.summary || `Primary subject: ${label}`,
      confidence: Math.round(Math.min(1.0, 0.75 + (bestTopic.importanceScore || 0.2) * 0.25) * 100) / 100,
      sourcePages: pList,
      pages: pList,
      pdfPageNumber: bestTopic.pdfPageNumber || pList[0] || 1,
      displayPageLabel: bestTopic.displayPageLabel || String(pList[0] || 1),
      evidenceChunkIds: bestTopic.sourceChunkIds || [],
      synthetic: false
    }
  }

  // Fallback to cleaned document title
  return {
    id: 'root_document',
    label: toTitleCase(cleanTitle) || 'Document Overview',
    summary: `Structured overview of ${cleanTitle || 'document'}`,
    confidence: 0.85,
    sourcePages: [1],
    pages: [1],
    pdfPageNumber: 1,
    displayPageLabel: '1',
    evidenceChunkIds: chunks[0]?.id ? [chunks[0].id] : [],
    synthetic: true
  }
}

/**
 * Discovers canonical topics content-first from semantic clusters.
 */
export function discoverTopicsFromClusters(clusters, chunks, structure = {}) {
  const chunkMap = new Map(chunks.map(c => [c.id, c]))
  const rawCandidateList = []

  const DEFINITION_PATTERN = /\b([A-Z][a-zA-Z0-9\s-]{2,40}?)\s+(?:is\s+defined\s+as|refers\s+to|is\s+a\s+technique|is\s+a\s+protocol|is\s+a\s+method|is\s+an\s+architecture|is\s+a\s+system)\b/i
  const ACRONYM_PATTERN = /\b([A-Z][a-zA-Z\s]{2,40}?)\s*\(([A-Z]{2,6})\)/
  const ORDINAL_MODIFIERS = new Set(['first', 'second', 'third', 'fourth', 'fifth', 'primary', 'secondary', 'tertiary', 'auxiliary', 'another', 'one', 'two'])

  for (const cluster of clusters) {
    const clusterChunks = (cluster.chunkIds || []).map(id => chunkMap.get(id)).filter(Boolean)

    for (const chunk of clusterChunks) {
      const text = chunk.text || ''
      const page = chunk.page || (chunk.pdfPageIndex != null ? chunk.pdfPageIndex + 1 : 1)

      // 1. Check Definitional Cues
      const defMatch = DEFINITION_PATTERN.exec(text)
      if (defMatch && defMatch[1]) {
        const val = validateTopicLabel(defMatch[1])
        if (val.valid) {
          rawCandidateList.push({ name: val.normalized, chunk, cluster, baseConf: 0.95, text, extraAliases: [] })
        }
      }

      // 2. Check Acronym Definitions
      const acroMatch = ACRONYM_PATTERN.exec(text)
      if (acroMatch && acroMatch[1]) {
        const val = validateTopicLabel(acroMatch[1])
        if (val.valid) {
          rawCandidateList.push({ name: val.normalized, chunk, cluster, baseConf: 0.9, text, extraAliases: [acroMatch[2]] })
        }
      }

      // 3. Multi-Word Capitalized Concepts (2 to 5 words)
      const rawWords = text.split(/\s+/)
      for (let i = 0; i < rawWords.length - 1; i++) {
        const capWords = []
        for (let j = i; j < Math.min(rawWords.length, i + 5); j++) {
          const w = rawWords[j].replace(/[.,;:()]/g, '')
          if (/^[A-Z][a-zA-Z0-9-]{1,20}$/.test(w)) {
            capWords.push(w)
          } else {
            break
          }
        }

        if (capWords.length >= 2) {
          const firstLower = capWords[0].toLowerCase()
          if (ORDINAL_MODIFIERS.has(firstLower) && capWords.length >= 3) {
            const stripped = capWords.slice(1).join(' ')
            const strippedVal = validateTopicLabel(stripped)
            if (strippedVal.valid) {
              rawCandidateList.push({ name: strippedVal.normalized, chunk, cluster, baseConf: 0.85, text, extraAliases: [capWords.join(' ')] })
            }
          }

          const fullPhrase = capWords.join(' ')
          const val = validateTopicLabel(fullPhrase)
          if (val.valid) {
            rawCandidateList.push({ name: val.normalized, chunk, cluster, baseConf: 0.8, text, extraAliases: [] })
          }
        }
      }

      // 4. Clean Heading Concepts
      if (chunk.isHeading && text.length > 3 && text.length < 50) {
        const val = validateTopicLabel(text)
        if (val.valid) {
          rawCandidateList.push({ name: val.normalized, chunk, cluster, baseConf: 0.85, text, extraAliases: [] })
        }
      }
    }
  }

  // Pre-aggregate raw candidates into topic objects
  const topicMap = new Map()
  for (const cand of rawCandidateList) {
    const key = cand.name.toLowerCase().replace(/[^a-z0-9]/g, '_')
    if (!topicMap.has(key)) {
      topicMap.set(key, {
        id: `top_${key}`,
        name: cand.name,
        label: cand.name,
        canonicalKey: key,
        aliases: new Set(cand.extraAliases),
        domain: cand.chunk.sectionTitle || 'General',
        summary: '',
        importanceScore: cand.baseConf,
        sourcePages: new Set(),
        sourceChunkIds: new Set(),
        clusterIds: new Set(),
        evidence: [],
        metrics: {
          frequency: 0,
          documentCoverage: 0,
          sectionSpread: new Set(),
          explanatoryDensity: 0,
          clusterSize: 0
        }
      })
    }

    const t = topicMap.get(key)
    t.metrics.frequency++
    const page = cand.chunk.page || (cand.chunk.pdfPageIndex != null ? cand.chunk.pdfPageIndex + 1 : 1)
    t.sourcePages.add(page)
    t.sourceChunkIds.add(cand.chunk.id)
    t.clusterIds.add(cand.cluster.id)
    if (cand.chunk.sectionTitle) t.metrics.sectionSpread.add(cand.chunk.sectionTitle)

    // Track best (earliest-page) displayPageLabel and pdfPageNumber from source chunks
    if (!t.pdfPageNumber || page < t.pdfPageNumber) {
      t.pdfPageNumber = page
      t.displayPageLabel = cand.chunk.displayPageLabel || String(page)
    }

    if (/is\s+(?:defined|used|designed|a\s+protocol|a\s+method|monitors|controls|protects)/i.test(cand.text)) {
      const boost = /is\s+defined\s+as/i.test(cand.text) ? 0.7 : 0.4
      t.metrics.explanatoryDensity = Math.min(1.0, t.metrics.explanatoryDensity + boost)
      if (!t.summary || t.summary.length < 30) {
        t.summary = cand.text.slice(0, 160)
      }
    }

    if (t.evidence.length < 3) {
      t.evidence.push({
        page,
        snippet: cand.text.slice(0, 140),
        confidence: cand.baseConf
      })
    }
  }

  const initialTopics = Array.from(topicMap.values()).map(t => {
    const pageList = Array.from(t.sourcePages).sort((a, b) => a - b)
    return {
      ...t,
      sourcePages: pageList,
      pages: pageList,
      sourceChunkIds: Array.from(t.sourceChunkIds),
      clusterIds: Array.from(t.clusterIds),
      aliases: Array.from(t.aliases)
    }
  })

  // Canonicalize & merge topics
  const topics = canonicalizeTopics(initialTopics, chunks)

  // Associate soft topic memberships on chunks and clusters
  for (const t of topics) {
    for (const chkId of t.sourceChunkIds) {
      const c = chunkMap.get(chkId)
      if (c) {
        if (!c.topicMemberships) c.topicMemberships = []
        if (!c.topicMemberships.some(m => m.topicId === t.id)) {
          c.topicMemberships.push({ topicId: t.id, confidence: t.importanceScore || 0.8 })
        }
      }
    }
    for (const clId of t.clusterIds) {
      const cl = clusters.find(c => c.id === clId)
      if (cl) {
        if (!cl.candidateTopicIds.includes(t.id)) cl.candidateTopicIds.push(t.id)
        if (!cl.candidateLabels.includes(t.name)) cl.candidateLabels.push(t.name)
      }
    }
  }

  return { topics, updatedClusters: clusters }
}

/**
 * Strict Semantic Canonicalization & Merging Gate:
 * Merges truncated fragments into real concepts, resolves sub-phrases, normalizes plurals,
 * and creates source-grounded non-placeholder summaries.
 */
export function canonicalizeTopics(topics = [], chunks = []) {
  if (!topics || !topics.length) return []

  const chunkMap = new Map((chunks || []).map(c => [c.id, c]))
  const allChunkTexts = (chunks || []).map(c => c.text || '')

  // Create mutable working topic list with cleaned labels
  const topicList = topics.map(t => {
    let rawName = t.name || t.label || ''
    rawName = rawName
      .replace(/\s*\|\s*(?:\d+|[ivxlcdm]+)\s*$/i, '')
      .replace(/^\s*(?:\d+|[ivxlcdm]+)\s*\|\s*/i, '')
      .trim()

    // Canonicalize ABCs of IPv6 Addresses -> IPv6 Address Representation
    let aliasesSet = new Set(t.aliases || [])
    if (/^(?:the\s+)?abcs?\s+of\s+ipv6\s+addresses/i.test(rawName)) {
      aliasesSet.add(rawName)
      rawName = 'IPv6 Address Representation'
    }

    return {
      id: t.id,
      name: rawName,
      label: rawName,
      canonicalKey: t.canonicalKey || rawName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      aliases: aliasesSet,
      domain: t.domain || 'General',
      importanceScore: t.importanceScore || 0.5,
      summary: t.summary || '',
      hasGroundedSummary: t.hasGroundedSummary ?? (t.summary && t.summary.length > 20 && !/Key concept detailed in the document/i.test(t.summary)),
      sourcePages: new Set(t.sourcePages || (t.pages || [])),
      pdfPageNumber: t.pdfPageNumber || (t.sourcePages?.[0] || t.pages?.[0] || 1),
      displayPageLabel: t.displayPageLabel || String(t.sourcePages?.[0] || t.pages?.[0] || 1),
      sourceChunkIds: new Set(t.sourceChunkIds || (t.chunkIds || [])),
      clusterIds: new Set(t.clusterIds || []),
      evidence: t.evidence || [],
      metrics: t.metrics || { frequency: 1, sectionSpread: new Set(), explanatoryDensity: 0 }
    }
  })

  function mergeTopic(target, source) {
    if (!target || !source || target === source) return
    target.aliases.add(source.name)
    ;(source.aliases || []).forEach(a => target.aliases.add(a))
    ;(source.sourcePages || []).forEach(p => target.sourcePages.add(p))
    ;(source.sourceChunkIds || []).forEach(c => target.sourceChunkIds.add(c))
    ;(source.clusterIds || []).forEach(cl => target.clusterIds.add(cl))
    target.importanceScore = Math.max(target.importanceScore, source.importanceScore)
    // Preserve earliest-page displayPageLabel across merges
    const targetFirstPage = Math.min(...Array.from(target.sourcePages || [1]))
    const sourceFirstPage = source.pdfPageNumber || Math.min(...(source.sourcePages || [1]))
    if (sourceFirstPage < targetFirstPage) {
      target.pdfPageNumber = sourceFirstPage
      target.displayPageLabel = source.displayPageLabel || String(sourceFirstPage)
    }
    if (!target.summary && source.summary) {
      target.summary = source.summary
      target.hasGroundedSummary = source.hasGroundedSummary
    }
    if (target.metrics && source.metrics) {
      target.metrics.frequency += (source.metrics.frequency || 1)
      target.metrics.explanatoryDensity = Math.max(target.metrics.explanatoryDensity || 0, source.metrics.explanatoryDensity || 0)
    }
  }

  // 1. Resolve truncated topics (e.g. "Crankshaft P...")
  const nonTruncated = []
  const truncated = []
  for (const t of topicList) {
    if (TRUNCATION_PATTERNS.some(p => p.test(t.name))) {
      truncated.push(t)
    } else {
      nonTruncated.push(t)
    }
  }

  for (const trunc of truncated) {
    const prefix = trunc.name.replace(/\.{2,}.*$/, '').replace(/\s+[a-zA-Z]\.?$/, '').trim().toLowerCase()
    let matchTarget = nonTruncated.find(t => t.name.toLowerCase().startsWith(prefix))

    if (!matchTarget && prefix.length >= 4) {
      for (const txt of allChunkTexts) {
        const regex = new RegExp(`\\b(${prefix.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}[a-zA-Z\\s]{2,40})\\b`, 'i')
        const m = regex.exec(txt)
        if (m && m[1]) {
          const val = validateTopicLabel(m[1])
          if (val.valid) {
            matchTarget = nonTruncated.find(t => t.name.toLowerCase() === val.normalized.toLowerCase())
            if (!matchTarget) {
              matchTarget = {
                id: `top_${val.normalized.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
                name: val.normalized,
                label: val.normalized,
                canonicalKey: val.normalized.toLowerCase().replace(/[^a-z0-9]/g, '_'),
                aliases: new Set([trunc.name]),
                domain: trunc.domain,
                importanceScore: trunc.importanceScore,
                summary: '',
                hasGroundedSummary: false,
                sourcePages: new Set(trunc.sourcePages),
                sourceChunkIds: new Set(trunc.sourceChunkIds),
                clusterIds: new Set(trunc.clusterIds),
                evidence: trunc.evidence || [],
                metrics: { frequency: 1, sectionSpread: new Set(), explanatoryDensity: 0 }
              }
              nonTruncated.push(matchTarget)
            }
            break
          }
        }
      }
    }

    if (matchTarget) {
      mergeTopic(matchTarget, trunc)
    }
  }

  // 2. Ordinal-prefixed fragments (e.g. "First Oxygen", "Second Oxygen" -> "Oxygen Sensor")
  const ORDINAL_WORDS = /^(?:first|second|third|fourth|fifth|primary|secondary|tertiary|auxiliary|another|one|two)\s+/i

  for (let i = nonTruncated.length - 1; i >= 0; i--) {
    const t = nonTruncated[i]
    if (ORDINAL_WORDS.test(t.name)) {
      const stripped = t.name.replace(ORDINAL_WORDS, '').trim().toLowerCase()
      const target = nonTruncated.find(cand => cand !== t && (cand.name.toLowerCase().includes(stripped) || stripped.includes(cand.name.toLowerCase())))
      if (target) {
        mergeTopic(target, t)
        nonTruncated.splice(i, 1)
        continue
      }

      for (const txt of allChunkTexts) {
        const regex = new RegExp(`\\b${escapeRegExp(t.name)}\\s+([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*)`, 'i')
        const m = regex.exec(txt)
        if (m && m[1]) {
          const fullConcept = `${t.name.replace(ORDINAL_WORDS, '')} ${m[1]}`
          const val = validateTopicLabel(fullConcept)
          if (val.valid) {
            let targetCand = nonTruncated.find(cand => cand.name.toLowerCase() === val.normalized.toLowerCase() || cand.name.toLowerCase().includes(val.normalized.toLowerCase()))
            if (!targetCand) {
              targetCand = {
                id: `top_${val.normalized.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
                name: val.normalized,
                label: val.normalized,
                canonicalKey: val.normalized.toLowerCase().replace(/[^a-z0-9]/g, '_'),
                aliases: new Set([t.name]),
                domain: t.domain,
                importanceScore: t.importanceScore,
                summary: '',
                hasGroundedSummary: false,
                sourcePages: new Set(t.sourcePages),
                sourceChunkIds: new Set(t.sourceChunkIds),
                clusterIds: new Set(t.clusterIds),
                evidence: t.evidence || [],
                metrics: { frequency: 1, sectionSpread: new Set(), explanatoryDensity: 0 }
              }
              nonTruncated.push(targetCand)
            }
            mergeTopic(targetCand, t)
            nonTruncated.splice(i, 1)
            break
          }
        }
      }
    }
  }

  // 3. Sub-phrase subsumption (e.g. "Position Sensor" merged into "Crankshaft Position Sensor")
  nonTruncated.sort((a, b) => b.name.length - a.name.length)

  for (let i = 0; i < nonTruncated.length; i++) {
    const parent = nonTruncated[i]
    if (!parent) continue
    const parentLower = parent.name.toLowerCase()

    for (let j = nonTruncated.length - 1; j > i; j--) {
      const child = nonTruncated[j]
      if (!child) continue
      const childLower = child.name.toLowerCase()

      if (parentLower.includes(childLower) && parentLower !== childLower) {
        const sharedPages = Array.from(child.sourcePages).some(p => parent.sourcePages.has(p))
        const sharedChunks = Array.from(child.sourceChunkIds).some(c => parent.sourceChunkIds.has(c))
        if (sharedPages || sharedChunks || child.sourcePages.size === 0) {
          mergeTopic(parent, child)
          nonTruncated.splice(j, 1)
        }
      }
    }
  }

  // 4. Singular / Plural normalization (e.g. Oxygen Sensor + Oxygen Sensors -> Oxygen Sensors)
  for (let i = 0; i < nonTruncated.length; i++) {
    const t = nonTruncated[i]
    if (!t) continue
    const lower = t.name.toLowerCase()
    const pluralName = `${t.name}s`
    const pluralLower = pluralName.toLowerCase()

    const matchPlural = nonTruncated.find(cand => cand !== t && (cand.name.toLowerCase() === pluralLower || cand.name.toLowerCase() === `${lower}es`))
    if (matchPlural) {
      mergeTopic(matchPlural, t)
      nonTruncated.splice(i, 1)
      i--
      continue
    }

    // Check if plural form exists in chunk texts
    for (const txt of allChunkTexts) {
      if (new RegExp(`\\b${escapeRegExp(t.name)}s\\b`, 'i').test(txt)) {
        t.aliases.add(t.name)
        t.name = `${t.name}s`
        t.label = t.name
        break
      }
    }
  }

  // 5. Source-grounded summaries (No placeholders like "Key concept detailed in the document")
  for (const t of nonTruncated) {
    if (!t.summary || /Key concept detailed in the document/i.test(t.summary) || t.summary.length < 15) {
      const nameLower = t.name.toLowerCase()
      const tAliases = Array.from(t.aliases || []).map(a => a.toLowerCase()).filter(a => a.length > 4)

      function mentionsTopic(text) {
        const tl = text.toLowerCase()
        return tl.includes(nameLower) || tAliases.some(a => tl.includes(a))
      }

      // Layer 1: use sourceChunkIds directly
      const suppChunks = Array.from(t.sourceChunkIds)
        .map(id => chunkMap.get(id))
        .filter(c => c && c.text && !c.isHeading && c.text.length > 25)

      // Layer 2: case-insensitive name/alias match
      const matchingChunks = suppChunks.length
        ? suppChunks
        : chunks.filter(c => c.text && !c.isHeading && c.text.length > 25 && mentionsTopic(c.text))

      // Layer 3: page-based fallback
      const bodyChunks = matchingChunks.length
        ? matchingChunks
        : chunks.filter(c => {
            if (c.isHeading || !c.text || c.text.length < 40) return false
            const pg = c.page || c.pdfPageNumber
            return t.sourcePages.has(pg)
          })

      let bestSentence = ''
      for (const c of (bodyChunks.length ? bodyChunks : matchingChunks)) {
        const sents = (c.text || '').split(/(?<=[.?!])\s+/)
        for (const s of sents) {
          const sTrim = s.trim()
          if (sTrim.length >= 25 && sTrim.length <= 280 && mentionsTopic(sTrim)) {
            if (/\b(?:is|are|provides|allows|enables|serves|protects|activates|measures|monitors|controls|detects|operates|defined as|synthesizes|translates|supports|configures|record|maps?|converts?|forwards?|resolves?)\b/i.test(sTrim)) {
              bestSentence = sTrim
              break
            } else if (!bestSentence) {
              bestSentence = sTrim
            }
          }
        }
        if (bestSentence) break
      }

      if (bestSentence) {
        t.summary = bestSentence
        t.hasGroundedSummary = true
      } else if (bodyChunks.length && bodyChunks[0].text) {
        t.summary = bodyChunks[0].text.slice(0, 220)
        t.hasGroundedSummary = true
      } else if (matchingChunks.length && matchingChunks[0].text && matchingChunks[0].text.length >= 25) {
        t.summary = matchingChunks[0].text.slice(0, 220)
        t.hasGroundedSummary = true
      } else {
        t.summary = ''
        t.hasGroundedSummary = false
        t.importanceScore = Math.max(0.1, Math.round(t.importanceScore * 0.5 * 100) / 100)
      }
    } else {
      t.hasGroundedSummary = true
    }
  }

  // 6. Strict validation filter
  const totalPages = Math.max(1, ...(chunks || []).map(c => c.page || 1))
  const validatedTopics = []
  for (const t of nonTruncated) {
    const val = validateTopicLabel(t.name)
    if (val.valid) {
      t.name = val.normalized
      t.label = val.normalized
      const pageList = Array.from(t.sourcePages).sort((a, b) => a - b)
      const coverage = pageList.length / totalPages
      const spread = (t.metrics?.sectionSpread?.size) ?? (typeof t.metrics?.sectionSpread === 'number' ? t.metrics.sectionSpread : 1)
      const expDensity = t.metrics?.explanatoryDensity || 0
      const freq = t.metrics?.frequency || 1
      const calculatedImportance = Math.min(1.0,
        coverage * 0.3 +
        Math.min(0.3, spread * 0.1) +
        expDensity * 0.3 +
        Math.min(0.2, freq * 0.05)
      )

      const firstPage = pageList[0] || 1
      const displayLabel = t.displayPageLabel || String(firstPage)

      validatedTopics.push({
        id: t.id,
        name: t.name,
        label: t.name,
        canonicalKey: t.canonicalKey || t.name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        aliases: Array.from(t.aliases),
        domain: t.domain || 'General',
        importanceScore: t.importanceScore || Math.round(calculatedImportance * 100) / 100,
        summary: (t.summary && t.summary.length >= 20 && !/Key concept detailed in the document/i.test(t.summary) && !/Major semantic area covering/i.test(t.summary))
          ? t.summary
          : 'Summary unavailable — insufficient source evidence.',
        hasGroundedSummary: t.hasGroundedSummary && t.summary && t.summary.length >= 20,
        sourcePages: pageList.length ? pageList : [1],
        pages: pageList.length ? pageList : [1],
        pdfPageNumber: firstPage,
        displayPageLabel: displayLabel,
        sourceChunkIds: Array.from(t.sourceChunkIds),
        clusterIds: Array.from(t.clusterIds),
        evidence: t.evidence || [],
        metrics: {
          frequency: freq,
          documentCoverage: Math.round(coverage * 100) / 100,
          sectionSpread: spread,
          explanatoryDensity: Math.round(expDensity * 100) / 100,
          clusterSize: t.clusterIds.size || (Array.isArray(t.clusterIds) ? t.clusterIds.length : 1)
        }
      })
    }
  }

  validatedTopics.sort((a, b) => (b.importanceScore || 0) - (a.importanceScore || 0))
  return validatedTopics
}

/**
 * Filters canonical topics and relationships specifically for the Knowledge Graph.
 * Prefer smaller connected graph of 8-20 meaningful concepts.
 * Hides isolated/low-confidence topics from default graph.
 */
export function filterVisibleKnowledgeGraph({
  topics = [],
  relationships = [],
  rootTopic = null,
  minNodes = 8,
  maxNodes = 20
}) {
  if (!topics || !topics.length) {
    return { visibleTopics: [], visibleRelationships: [] }
  }

  // 1. Topic quality threshold: valid label, grounded non-placeholder summary
  const qualityTopics = topics.filter(t => {
    const val = validateTopicLabel(t.name || t.label)
    if (!val.valid) return false
    if (t.hasGroundedSummary === false) return false
    if (!t.summary || t.summary.length < 15 || /Key concept detailed in the document/i.test(t.summary)) return false
    return true
  })

  // 2. Evidenced relationship threshold:
  // Participates in at least one evidenced relationship with specific predicate
  const connectedTopicIds = new Set()
  const validRelationships = (relationships || []).filter(r => {
    return r.evidence && r.evidence.trim().length >= 10 && r.predicate !== 'related_to'
  })

  validRelationships.forEach(r => {
    connectedTopicIds.add(r.sourceId)
    connectedTopicIds.add(r.targetId)
  })

  const connectedTopics = qualityTopics.filter(t => {
    const isRoot = rootTopic && (t.id === rootTopic.id || t.id === `root_${rootTopic.id}` || t.name === rootTopic.label)
    return connectedTopicIds.has(t.id) || isRoot
  })

  // Sort connected topics by importance score and connection degree
  connectedTopics.sort((a, b) => {
    const degA = validRelationships.filter(r => r.sourceId === a.id || r.targetId === a.id).length
    const degB = validRelationships.filter(r => r.sourceId === b.id || r.targetId === b.id).length
    return (b.importanceScore * 10 + degB) - (a.importanceScore * 10 + degA)
  })

  let selected = connectedTopics.slice(0, maxNodes)

  // If connected topics are fewer than minNodes, include top quality topics only if needed
  if (selected.length < minNodes && qualityTopics.length >= minNodes) {
    for (const qt of qualityTopics) {
      if (selected.length >= minNodes) break
      if (!selected.some(s => s.id === qt.id)) {
        selected.push(qt)
      }
    }
  }

  const selectedIds = new Set(selected.map(t => t.id))
  const visibleRelationships = validRelationships.filter(r => {
    return selectedIds.has(r.sourceId) && selectedIds.has(r.targetId)
  })

  return {
    visibleTopics: selected,
    visibleRelationships
  }
}

/**
 * Quality Gate for Knowledge Graph:
 * Evaluates the 8 failure conditions. Refines if needed; returns PARTIAL_READY with warnings if failing.
 */
export function validateKnowledgeGraphQuality({
  visibleTopics = [],
  allTopics = [],
  relationships = [],
  rootTopic = null,
  chunks = []
}) {
  const warnings = []
  const errors = []

  const totalVisible = visibleTopics.length
  if (totalVisible === 0) {
    return {
      valid: false,
      status: 'PARTIAL_READY',
      noiseRatio: 1.0,
      connectedRatio: 0,
      visibleCount: 0,
      warnings: ['No visible topics qualify for the knowledge graph.'],
      errors: ['Empty visible topics']
    }
  }

  // 1. > 10% of visible nodes are fragments/noise
  let noiseCount = 0
  for (const t of visibleTopics) {
    const val = validateTopicLabel(t.name)
    if (!val.valid) noiseCount++
  }
  const noiseRatio = noiseCount / totalVisible
  if (noiseRatio > 0.10) {
    errors.push(`More than 10% of visible nodes are noise or fragments (${Math.round(noiseRatio * 100)}%)`)
    warnings.push(`Noise ratio exceeds 10%: ${Math.round(noiseRatio * 100)}% of topics are fragments`)
  }

  // 2. Duplicate or alias topics remain
  const seenNames = new Set()
  let duplicateCount = 0
  for (const t of visibleTopics) {
    const lower = (t.name || '').toLowerCase()
    if (seenNames.has(lower)) {
      duplicateCount++
    }
    seenNames.add(lower)
  }
  if (duplicateCount > 0) {
    errors.push(`Duplicate topics detected in visible graph (${duplicateCount})`)
    warnings.push(`Duplicate or alias topics remain in visible graph`)
  }

  // 3. Placeholder summaries exist
  let placeholderCount = 0
  for (const t of visibleTopics) {
    if (!t.summary || t.summary.length < 15 || /Key concept detailed in the document/i.test(t.summary)) {
      placeholderCount++
    }
  }
  if (placeholderCount > 0) {
    errors.push(`Placeholder summaries exist for ${placeholderCount} topics`)
    warnings.push(`Placeholder summaries found: topics lack grounded summaries`)
  }

  // 4. Most topics are disconnected
  const connectedIds = new Set()
  for (const r of (relationships || [])) {
    if (r.evidence && r.evidence.length >= 10 && r.predicate !== 'related_to') {
      connectedIds.add(r.sourceId)
      connectedIds.add(r.targetId)
    }
  }
  let connectedCount = 0
  for (const t of visibleTopics) {
    const isRoot = rootTopic && (t.id === rootTopic.id || t.name === rootTopic.label)
    if (connectedIds.has(t.id) || isRoot) connectedCount++
  }
  const connectedRatio = totalVisible > 0 ? connectedCount / totalVisible : 0
  if (totalVisible > 2 && connectedRatio < 0.50) {
    errors.push(`Most topics are disconnected: only ${Math.round(connectedRatio * 100)}% have evidence-backed relationships`)
    warnings.push(`Most topics in graph are disconnected from each other`)
  }

  // 5. Source references disagree
  let sourceMismatchCount = 0
  for (const t of visibleTopics) {
    if (!t.sourcePages || !Array.isArray(t.sourcePages) || t.sourcePages.length === 0) {
      sourceMismatchCount++
    }
  }
  if (sourceMismatchCount > 0) {
    errors.push(`Source references missing or invalid for ${sourceMismatchCount} topics`)
    warnings.push(`Source references disagree or missing`)
  }

  // 6. Root/core topic is missing
  if (!rootTopic || !rootTopic.label || rootTopic.label === 'Document') {
    errors.push('Root or core topic is missing or ungrounded')
    warnings.push('Core document root subject is missing')
  }

  // 7. Graph contains metadata/bylines/captions
  const metaTopics = visibleTopics.filter(t => {
    const lower = (t.name || '').toLowerCase()
    return BYLINE_PATTERNS.some(p => p.test(lower)) ||
      CAPTION_PATTERNS.some(p => p.test(lower)) ||
      NAVIGATION_PATTERNS.some(p => p.test(lower))
  })
  if (metaTopics.length > 0) {
    errors.push(`Graph contains metadata, bylines, or captions: ${metaTopics.map(t => t.name).join(', ')}`)
    warnings.push(`Metadata, byline, or caption labels found in graph`)
  }

  // 8. Relationships have no evidence
  const unevidencedRels = (relationships || []).filter(r => {
    return !r.evidence || r.evidence.trim().length < 10 || r.predicate === 'related_to'
  })
  if (unevidencedRels.length > 0) {
    errors.push(`${unevidencedRels.length} relationships lack predicate or textual evidence`)
    warnings.push(`Relationships without textual evidence detected`)
  }

  const valid = errors.length === 0

  return {
    valid,
    status: valid ? 'READY' : 'PARTIAL_READY',
    noiseRatio: Math.round(noiseRatio * 100) / 100,
    connectedRatio: Math.round(connectedRatio * 100) / 100,
    visibleCount: totalVisible,
    warnings,
    errors
  }
}
