// Specialized Entity Extraction (NER)
// Uses deterministic rules, capital-sequence heuristics, and domain vocabularies
// without relying on heavy external cloud models.

const KNOWN_COMPANIES = new Set([
  'Apple', 'Google', 'Microsoft', 'Amazon', 'Meta', 'Netflix', 'Adobe', 'Oracle',
  'Salesforce', 'IBM', 'Intel', 'Cisco', 'Stripe', 'Spotify', 'Uber', 'Airbnb',
  'Twitter', 'GitHub', 'OpenAI', 'Anthropic', 'NVIDIA', 'Tesla', 'Siemens', 'SAP'
])

const KNOWN_TECHNOLOGIES = new Set([
  'React', 'JavaScript', 'TypeScript', 'Python', 'Node.js', 'Vite', 'Docker',
  'Kubernetes', 'AWS', 'Azure', 'GCP', 'PostgreSQL', 'MongoDB', 'Redis', 'GraphQL',
  'REST', 'WebAssembly', 'WebGPU', 'Tesseract', 'Linux', 'Git', 'CSS', 'HTML', 'SQL'
])

const KNOWN_LOCATIONS = new Set([
  'North America', 'Europe', 'Asia Pacific', 'Latin America', 'United States',
  'Canada', 'United Kingdom', 'Germany', 'France', 'India', 'Japan', 'Australia',
  'San Francisco', 'New York', 'London', 'Berlin', 'Tokyo', 'Paris', 'Singapore'
])

const HONORIFICS = /^(?:Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.|Sir)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/

export function extractEntities(chunks, facts = {}) {
  const entityMap = new Map()

  const addEntity = (name, type, page, chunkId, confidence = 0.9) => {
    const clean = String(name || '').trim().replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '')
    if (!clean || clean.length < 2 || clean.length > 50) return
    if (/^(The|This|That|These|Those|With|From|Into|About|Above|Below|After|Before|Between)$/i.test(clean)) return

    const key = `${type.toLowerCase()}:${clean.toLowerCase()}`
    if (!entityMap.has(key)) {
      entityMap.set(key, {
        id: `ent_${clean.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        name: clean,
        type,
        confidence,
        count: 0,
        pages: new Set(),
        chunkIds: new Set()
      })
    }

    const ent = entityMap.get(key)
    ent.count++
    if (page) ent.pages.add(page)
    if (chunkId) ent.chunkIds.add(chunkId)
  }

  // 1. Process deterministic facts from document processor
  ;(facts.dates || []).forEach(d => addEntity(d, 'Date', null, null, 1.0))
  ;(facts.regulations || []).forEach(r => addEntity(r, 'Regulation', null, null, 1.0))
  ;(facts.money || []).forEach(m => addEntity(m, 'Metric', null, null, 0.95))
  ;(facts.metrics || []).forEach(m => addEntity(m, 'Metric', null, null, 0.95))

  // 2. Scan chunks for entities
  for (const chunk of chunks) {
    const text = chunk.text
    const page = chunk.page
    const chkId = chunk.id

    // Check honorifics / names
    const nameMatch = HONORIFICS.exec(text)
    if (nameMatch) addEntity(nameMatch[0], 'Person', page, chkId, 0.95)

    // Capitalized sequences (e.g. "Product Team", "Quarterly Business Review", "Jane Doe")
    const words = text.split(/\s+/)
    for (let i = 0; i < words.length; i++) {
      const w = words[i].replace(/[.,;:()]/g, '')

      if (KNOWN_COMPANIES.has(w)) addEntity(w, 'Company', page, chkId, 0.98)
      if (KNOWN_TECHNOLOGIES.has(w)) addEntity(w, 'Technology', page, chkId, 0.98)
      if (KNOWN_LOCATIONS.has(w)) addEntity(w, 'Location', page, chkId, 0.95)

      // Two-word location / company phrases
      if (i < words.length - 1) {
        const twoWords = `${w} ${words[i + 1].replace(/[.,;:()]/g, '')}`
        if (KNOWN_LOCATIONS.has(twoWords)) addEntity(twoWords, 'Location', page, chkId, 0.98)
        if (KNOWN_COMPANIES.has(twoWords)) addEntity(twoWords, 'Company', page, chkId, 0.98)
      }

      // Title Case Person heuristic (e.g. "John Smith", "David Miller")
      if (/^[A-Z][a-z]{2,15}$/.test(w) && i < words.length - 1) {
        const next = words[i + 1].replace(/[.,;:()]/g, '')
        if (/^[A-Z][a-z]{2,15}$/.test(next) && !KNOWN_COMPANIES.has(w) && !KNOWN_LOCATIONS.has(w)) {
          // If followed by title or preceded by by
          if (i > 0 && /^(by|from|contact|lead|officer|author):?$/i.test(words[i - 1])) {
            addEntity(`${w} ${next}`, 'Person', page, chkId, 0.9)
          }
        }
      }
    }

    // Key concepts from Headings
    if (chunk.isHeading && text.length < 40) {
      addEntity(text, 'Concept', page, chkId, 0.88)
    }
  }

  // Convert Sets to arrays for serialization
  return Array.from(entityMap.values()).map(e => ({
    ...e,
    pages: Array.from(e.pages).sort((a, b) => a - b),
    chunkIds: Array.from(e.chunkIds)
  }))
}
