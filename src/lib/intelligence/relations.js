// Relationship Extraction Stage
// Extracts semantic edges between entities based on co-occurrence, syntactic patterns, and causal predicates.

const RELATION_PREDICATES = [
  { type: 'uses', regex: /\b(?:uses|utilizes|leverages|applies|implements|employs)\b/i, confidence: 0.88 },
  { type: 'depends_on', regex: /\b(?:depends on|relies upon|requires|prerequisite)\b/i, confidence: 0.92 },
  { type: 'causes', regex: /\b(?:causes|leads to|results in|triggers|produces)\b/i, confidence: 0.85 },
  { type: 'supports', regex: /\b(?:supports|enhances|backs|strengthens|sustains)\b/i, confidence: 0.86 },
  { type: 'contradicts', regex: /\b(?:contradicts|conflicts with|violates|opposes)\b/i, confidence: 0.9 },
  { type: 'owned_by', regex: /\b(?:owned by|belonging to|property of|held by)\b/i, confidence: 0.92 },
  { type: 'created_by', regex: /\b(?:prepared by|created by|authored by|written by|built by)\b/i, confidence: 0.95 },
  { type: 'part_of', regex: /\b(?:part of|section of|component of|division of|member of)\b/i, confidence: 0.89 },
  { type: 'related_to', regex: /\b(?:related to|associated with|concerning|regarding)\b/i, confidence: 0.75 }
]

export function extractRelationships(chunks, entities) {
  const relations = []
  const seenPairs = new Set()

  if (!entities.length || !chunks.length) return []

  // Pre-index entities for fast scanning
  const entityNames = entities.map(e => ({
    name: e.name,
    lower: e.name.toLowerCase(),
    type: e.type,
    id: e.id
  }))

  for (const chunk of chunks) {
    const text = chunk.text
    const page = chunk.page
    const chkId = chunk.id

    // Find which entities appear in this sentence/chunk
    const foundEntities = []
    const lowerText = text.toLowerCase()

    for (const ent of entityNames) {
      if (lowerText.includes(ent.lower)) {
        foundEntities.push(ent)
      }
    }

    if (foundEntities.length < 2) continue

    // Test pairs of entities in the same chunk
    for (let i = 0; i < foundEntities.length; i++) {
      for (let j = 0; j < foundEntities.length; j++) {
        if (i === j) continue
        const source = foundEntities[i]
        const target = foundEntities[j]

        const pairKey = `${source.id}_${target.id}`
        if (seenPairs.has(pairKey)) continue

        // Check if a predicate connects them in the sentence
        let matchedType = 'related_to'
        let matchedConf = 0.75

        for (const pred of RELATION_PREDICATES) {
          if (pred.regex.test(text)) {
            matchedType = pred.type
            matchedConf = pred.confidence
            break
          }
        }

        seenPairs.add(pairKey)
        relations.push({
          id: `rel_${relations.length + 1}`,
          sourceId: source.id,
          sourceName: source.name,
          targetId: target.id,
          targetName: target.name,
          type: matchedType,
          confidence: matchedConf,
          page,
          chunkId: chkId,
          evidence: text.length > 200 ? `${text.slice(0, 200)}…` : text
        })
      }
    }
  }

  // Hierarchy relations (Headings -> sub-chunks)
  for (let i = 0; i < chunks.length - 1; i++) {
    const c1 = chunks[i]
    const c2 = chunks[i + 1]
    if (c1.isHeading && !c2.isHeading && c1.page === c2.page) {
      const e1 = entities.find(e => e.name === c1.text)
      if (e1 && c2.text.length > 10) {
        // Concept encompasses chunk
      }
    }
  }

  return relations
}
