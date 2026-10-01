// Adaptive Document Intelligence: Document-Type Classifier
// Analyzes filename, metadata, headings, tables, and first pages using
// deterministic rules first and domain feature scoring.

export const DOCUMENT_TYPES = {
  INVOICE: 'Invoice / Bill',
  CONTRACT: 'Contract / Legal Document',
  EDUCATIONAL: 'Educational / Textbook',
  RESEARCH: 'Research Paper',
  BUSINESS_REPORT: 'Business Report',
  FINANCIAL_STATEMENT: 'Financial Statement',
  RESUME: 'Resume / CV',
  PURCHASE_ORDER: 'Purchase Order',
  GOVERNMENT_FORM: 'Government Form',
  TECHNICAL_DOC: 'Technical Documentation',
  GENERAL: 'General Document'
}

export const PIPELINES = {
  INVOICE: {
    id: 'invoice',
    label: 'Invoice & Bill Pipeline',
    features: ['Structured Field Extraction', 'Line Item Tables', 'Financial Totals', 'Export to Excel'],
    skipHeavyTasks: ['quiz', 'flashcards', 'heavy_graph'],
    enabledTabs: ['extraction', 'summary', 'search']
  },
  CONTRACT: {
    id: 'contract',
    label: 'Legal & Contract Pipeline',
    features: ['Clause Analysis', 'Parties & Obligations', 'Dates & Expirations', 'Term Verification'],
    skipHeavyTasks: ['quiz', 'flashcards'],
    enabledTabs: ['clauses', 'summary', 'search', 'graph']
  },
  EDUCATIONAL: {
    id: 'educational',
    label: 'Educational & Study Pipeline',
    features: ['Knowledge Graph', 'Concept Cards', 'Interactive Quiz', 'Semantic RAG Search'],
    skipHeavyTasks: [],
    enabledTabs: ['graph', 'learning', 'search']
  },
  RESEARCH: {
    id: 'research',
    label: 'Research & Report Pipeline',
    features: ['Findings & Metrics', 'Executive Summary', 'Entity Mapping', 'Data Tables'],
    skipHeavyTasks: ['flashcards'],
    enabledTabs: ['summary', 'graph', 'search', 'export']
  },
  BUSINESS_REPORT: {
    id: 'business_report',
    label: 'Business Review Pipeline',
    features: ['Key Highlights', 'Regional Metrics', 'Executive Summary', 'Action Items'],
    skipHeavyTasks: ['flashcards'],
    enabledTabs: ['summary', 'graph', 'search', 'export']
  },
  FINANCIAL_STATEMENT: {
    id: 'financial',
    label: 'Financial Statement Pipeline',
    features: ['Balance & Ledger Extraction', 'Statement Tables', 'Spreadsheet Export'],
    skipHeavyTasks: ['quiz', 'flashcards', 'heavy_graph'],
    enabledTabs: ['extraction', 'summary', 'search', 'export']
  },
  RESUME: {
    id: 'resume',
    label: 'Resume & Talent Profile Pipeline',
    features: ['Contact Information', 'Skills Extraction', 'Experience Timeline'],
    skipHeavyTasks: ['quiz', 'flashcards', 'heavy_graph'],
    enabledTabs: ['extraction', 'summary']
  },
  GENERAL: {
    id: 'general',
    label: 'Standard Document Pipeline',
    features: ['Overview Summary', 'Semantic Search', 'Knowledge Graph'],
    skipHeavyTasks: [],
    enabledTabs: ['graph', 'search', 'summary', 'learning', 'export']
  }
}

export function classifyDocument({ docName = '', chunks = [], facts = {}, numPages = 1 }) {
  const name = String(docName).toLowerCase()
  const allText = chunks.slice(0, 15).map(c => c.text).join(' ').toLowerCase()
  const characteristics = []

  let scores = {
    INVOICE: 0,
    CONTRACT: 0,
    EDUCATIONAL: 0,
    RESEARCH: 0,
    BUSINESS_REPORT: 0,
    FINANCIAL_STATEMENT: 0,
    RESUME: 0,
    GENERAL: 5
  }

  // 1. Filename Signals
  if (/(?:invoice|bill|inv|receipt)/.test(name)) { scores.INVOICE += 40; characteristics.push('Filename indicates invoice/bill') }
  if (/(?:contract|agreement|nda|terms|mou|sla)/.test(name)) { scores.CONTRACT += 40; characteristics.push('Filename indicates legal contract') }
  if (/(?:resume|cv|curriculum)/.test(name)) { scores.RESUME += 50; characteristics.push('Filename indicates resume/CV') }
  if (/(?:report|quarterly|q[1-4]|review|annual|business)/.test(name)) { scores.BUSINESS_REPORT += 35; characteristics.push('Filename indicates business report') }
  if (/(?:statement|bank|ledger|balance)/.test(name)) { scores.FINANCIAL_STATEMENT += 40; characteristics.push('Filename indicates financial statement') }
  if (/(?:paper|thesis|dissertation|research|study|proceedings)/.test(name)) { scores.RESEARCH += 35; characteristics.push('Filename indicates research paper') }
  if (/(?:chapter|textbook|lecture|course|syllabus|notes)/.test(name)) { scores.EDUCATIONAL += 35; characteristics.push('Filename indicates educational study material') }

  // 2. Invoice / Bill Pattern Signals
  if (facts.money && facts.money.length > 0) {
    scores.INVOICE += 15
    scores.FINANCIAL_STATEMENT += 15
    characteristics.push(`Contains currency amounts (${facts.money.length} found)`)
  }
  if (/\b(?:invoice\s*#|invoice\s*number|amount\s*due|subtotal|tax\s*amount|remit\s*to|bill\s*to|ship\s*to)\b/.test(allText)) {
    scores.INVOICE += 40
    characteristics.push('Contains invoice keywords (Invoice #, Bill To, Amount Due)')
  }

  // 3. Contract / Legal Signals
  if (/\b(?:by\s+and\s+between|parties|whereas|indemnif|governing\s*law|severability|in\s*witness\s*whereof|confidentiality\s*agreement|effective\s*date)\b/.test(allText)) {
    scores.CONTRACT += 45
    characteristics.push('Contains legal boilerplate and contract clauses')
  }

  // 4. Financial Statement Signals
  if (/\b(?:balance\s*sheet|cash\s*flow|income\s*statement|account\s*number|debit|credit|ending\s*balance|statement\s*period)\b/.test(allText)) {
    scores.FINANCIAL_STATEMENT += 40
    characteristics.push('Contains financial ledger & statement terms')
  }

  // 5. Resume / CV Signals
  if (/\b(?:experience|education|skills|curriculum\s*vitae|objective|summary\s*of\s*qualifications|work\s*history|certifications)\b/.test(allText) && (facts.emails?.length || numPages <= 3)) {
    scores.RESUME += 45
    characteristics.push('Contains resume sections (Experience, Education, Skills)')
  }

  // 6. Research Paper Signals
  if (/\b(?:abstract|introduction|methodology|experiments|results|discussion|conclusion|references|doi:)\b/.test(allText)) {
    scores.RESEARCH += 40
    characteristics.push('Contains academic paper structure (Abstract, References, Methodology)')
  }

  // 7. Educational / Textbook Signals
  if (/\b(?:chapter\s*\d+|exercise|homework|learning\s*objectives|quiz|key\s*terms|problem\s*set)\b/.test(allText)) {
    scores.EDUCATIONAL += 40
    characteristics.push('Contains chapter and textbook pedagogy markers')
  }

  // 8. Business Report Signals
  if (/\b(?:quarterly\s*business|revenue\s*grew|churn|key\s*highlights|strategic\s*findings|executive\s*summary|market\s*share)\b/.test(allText)) {
    scores.BUSINESS_REPORT += 40
    characteristics.push('Contains executive review & business metrics')
  }

  // Find highest scoring category
  let topType = 'GENERAL'
  let highestScore = 0

  for (const [type, score] of Object.entries(scores)) {
    if (score > highestScore) {
      highestScore = score
      topType = type
    }
  }

  // Calculate normalized confidence score
  const confidence = Math.min(99, Math.max(30, highestScore >= 70 ? 94 : highestScore >= 40 ? 78 : 52))

  const pipeline = PIPELINES[topType] || PIPELINES.GENERAL
  const typeLabel = DOCUMENT_TYPES[topType] || DOCUMENT_TYPES.GENERAL

  return {
    type: topType,
    typeLabel,
    confidence,
    characteristics,
    pipeline,
    isLowConfidence: confidence < 65
  }
}
