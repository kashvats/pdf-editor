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

  const evidence = {
    INVOICE: [],
    CONTRACT: [],
    EDUCATIONAL: [],
    RESEARCH: [],
    BUSINESS_REPORT: [],
    FINANCIAL_STATEMENT: [],
    RESUME: [],
    GENERAL: ['Standard document structure and prose']
  }

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
  if (/(?:invoice|bill|inv|receipt|factura|rechnung|facture|schet|счет|chalan)/i.test(name)) { scores.INVOICE += 40; evidence.INVOICE.push('Filename indicates invoice/bill') }
  if (/(?:contract|agreement|nda|terms|mou|sla|vertrag|contrato|contrat|dogovor|договор)/i.test(name)) { scores.CONTRACT += 40; evidence.CONTRACT.push('Filename indicates legal contract') }
  if (/(?:resume|cv|curriculum|lebenslauf|резюме)/i.test(name)) { scores.RESUME += 50; evidence.RESUME.push('Filename indicates resume/CV') }
  if (/(?:report|quarterly|q[1-4]|review|annual|business|bericht|rapport|отчет)/i.test(name)) { scores.BUSINESS_REPORT += 35; evidence.BUSINESS_REPORT.push('Filename indicates business report') }
  if (/(?:statement|bank|ledger|balance|kontoauszug|releve|выписка)/i.test(name)) { scores.FINANCIAL_STATEMENT += 40; evidence.FINANCIAL_STATEMENT.push('Filename indicates financial statement') }
  if (/(?:paper|thesis|dissertation|research|study|proceedings|arxiv)/i.test(name)) { scores.RESEARCH += 35; evidence.RESEARCH.push('Filename indicates research paper') }
  if (/(?:chapter|textbook|lecture|course|syllabus|notes|vorlesung|lehrbuch|guide|handbook|manual|for\s*dummies|tutorial|edition)/i.test(name)) { scores.EDUCATIONAL += 45; evidence.EDUCATIONAL.push('Filename indicates educational book/guide') }

  // 2. Invoice / Bill Content Signals (Invoices/Bills are strictly short documents, 1-8 pages max)
  if (numPages <= 8) {
    if (facts.money && facts.money.length > 0) {
      scores.INVOICE += facts.money.length >= 2 ? 30 : 15
      scores.FINANCIAL_STATEMENT += 15
      evidence.INVOICE.push(`Contains currency amounts (${facts.money.length} found)`)
      evidence.FINANCIAL_STATEMENT.push(`Contains currency amounts (${facts.money.length} found)`)
    }
    if (/\b(?:invoice\s*#|invoice\s*number|amount\s*due|subtotal|tax\s*amount|remit\s*to|bill\s*to|ship\s*to|vat\s*reg|gst\s*no|factura|total\s*a\s*pagar|rechnung|gesamtbetrag|rechnungsnummer|mwst|ust-id|facture|montant\s*total|tva|счет-фактура|к\s*оплате|चालान|रसीद)\b/i.test(allText)) {
      scores.INVOICE += 50
      evidence.INVOICE.push('Contains invoice/billing identifiers & tax terms')
    }
  }

  // 3. Contract / Legal Content Signals (Multilingual & Structural)
  if (/\b(?:by\s+and\s+between|parties|whereas|indemnif|governing\s*law|severability|in\s*witness\s*whereof|confidentiality\s*agreement|effective\s*date|terms\s*and\s*conditions|force\s*majeure|contrato|acuerdo|partes\s*contratantes|vertrag|vereinbarung|vertragsparteien|contrat|entre\s*les\s*soussignés|договор|соглашение|стороны)\b/i.test(allText)) {
    scores.CONTRACT += 50
    evidence.CONTRACT.push('Contains legal boilerplate, clauses and party designations')
  }

  // 4. Financial Statement Content Signals (Multilingual & Structural)
  if (/\b(?:balance\s*sheet|cash\s*flow|income\s*statement|account\s*number|debit|credit|ending\s*balance|statement\s*period|ledger|deposits|withdrawals|beginning\s*balance|kontoauszug|kontonummer|relevé\s*bancaire|банковская\s*выписка)\b/i.test(allText)) {
    scores.FINANCIAL_STATEMENT += 45
    evidence.FINANCIAL_STATEMENT.push('Contains banking ledger, balance, and transaction terms')
  }

  // 5. Resume / CV Content Signals (Multilingual & Structural - strictly 1-4 pages)
  if (numPages <= 4 && /\b(?:experience|education|skills|curriculum\s*vitae|objective|summary\s*of\s*qualifications|work\s*history|certifications|employment\s*history|lebenslauf|berufserfahrung|formation|compétences|резюме|опыт\s*работы)\b/i.test(allText)) {
    scores.RESUME += 45
    if (facts.emails?.length > 0 || numPages <= 2) {
      scores.RESUME += 25
    }
    evidence.RESUME.push('Contains resume sections (Experience, Education, Skills, Contact)')
  }

  // 6. Research Paper Content Signals (Academic structural markers)
  if (/\b(?:abstract|introduction|methodology|experiments|results|discussion|conclusion|references|doi:|et\s*al\.|ieee|arxiv|proceedings\s*of|bibliography)\b/i.test(allText)) {
    scores.RESEARCH += 45
    evidence.RESEARCH.push('Contains academic paper structure (Abstract, References, Methodology, Citations)')
  }

  // 7. Educational / Textbook Signals (Pedagogy markers, chapters, book structure)
  if (/\b(?:table\s*of\s*contents|contents\s*at\s*a\s*glance|part\s*[ivx\d]+|chapter\s*\d+|for\s*dummies|exercise|homework|learning\s*objectives|quiz|key\s*terms|problem\s*set|review\s*questions|summary\s*of\s*chapter|kapitel|leçon)\b/i.test(allText)) {
    scores.EDUCATIONAL += 55
    if (numPages >= 15) scores.EDUCATIONAL += 35
    evidence.EDUCATIONAL.push('Contains book/textbook structure (Chapters, Table of Contents, Parts)')
  }

  // 8. Business Report Signals (Executive summary & performance)
  if (/\b(?:quarterly\s*business|revenue\s*grew|churn|key\s*highlights|strategic\s*findings|executive\s*summary|market\s*share|year\s*over\s*year|q[1-4]\s*results)\b/i.test(allText)) {
    scores.BUSINESS_REPORT += 45
    evidence.BUSINESS_REPORT.push('Contains executive review, business metrics & growth KPIs')
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
  const characteristics = evidence[topType] && evidence[topType].length ? evidence[topType] : ['Standard document structure and prose']

  return {
    type: topType,
    typeLabel,
    confidence,
    characteristics,
    pipeline,
    isLowConfidence: confidence < 65
  }
}
