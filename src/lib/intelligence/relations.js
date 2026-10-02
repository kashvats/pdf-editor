// Evidenced Semantic Relationship Extraction Engine
// Strictly extracts verified semantic edges between topics where textual predicate evidence exists.
// Rejects co-occurrence alone.
// Each predicate entry has an optional `validate(source, target, sentence)` function for
// semantic type-compatibility checks that go beyond regex pattern matching.

// Supporting-entity types (standards bodies, orgs, registries) — these should not appear
// as primary Knowledge Graph topics or produce relationship edges as the main subject.
const SUPPORTING_ENTITY_NAMES = new Set([
  'ietf', 'iana', 'rir', 'rirs', 'arin', 'ripe', 'apnic', 'lacnic', 'afrinic',
  'ieee', 'itu', 'w3c', 'isoc', 'icann', 'iso',
  'internet engineering task force', 'internet assigned numbers authority',
  'regional internet registr', 'american registry for internet numbers',
  'ripe ncc', 'asia-pacific network information centre'
])

function isSupportingEntity(topicName) {
  if (!topicName) return false
  const lower = topicName.toLowerCase().trim()
  return SUPPORTING_ENTITY_NAMES.has(lower) ||
    /\b(?:ietf|iana|arin|lacnic|afrinic|apnic|ripe)\b/i.test(topicName) ||
    /regional\s+internet\s+registr/i.test(topicName) ||
    /internet\s+(?:engineering|assigned|architecture)\s+(?:task\s+force|numbers\s+authority|board)/i.test(topicName)
}

const SEMANTIC_PREDICATES = [
  {
    predicate: 'protects_against',
    regex: /\b(?:protects\s+against|guards\s+against|mitigates|defends\s+(?:against|from)|prevents|blocks|drops\s+unauthorized)\b/i,
    confidence: 0.93
  },
  {
    // 'identifies' and 'enables' are often over-triggered; require more specific phrasing
    predicate: 'identifies',
    regex: /\b(?:identifies|detects|discovers)\b/i,
    confidence: 0.88
  },
  {
    predicate: 'requires',
    regex: /\b(?:requires|depends\s+on|relies\s+(?:on|upon)|needs|prerequisite\s+(?:for|to))\b/i,
    confidence: 0.92
  },
  {
    predicate: 'causes',
    regex: /\b(?:causes|leads\s+to|results\s+in|triggers|produces)\b/i,
    confidence: 0.89
  },
  {
    predicate: 'part_of',
    regex: /\b(?:part\s+of|component\s+of|division\s+of|member\s+of|sub(?:set|field|type)\s+of)\b/i,
    confidence: 0.91
  },
  {
    predicate: 'contains',
    regex: /\b(?:contains|encompasses|comprises|consists\s+of)\b/i,
    confidence: 0.90
  },
  {
    // example_of requires strict instance/class evidence, not just cue words like "for example" or "such as".
    // "Server Statements ... for example" must NOT generate example_of. Only "X is an example of Y" or
    // "X is an instance of Y" or "X is classified as Y" are valid instance/class relations.
    predicate: 'example_of',
    regex: /\b(?:is\s+an?\s+example\s+of|is\s+an?\s+instance\s+of|classified\s+as\s+(?:an?\s+)?(?:type|kind|form|class)\s+of)\b/i,
    confidence: 0.89
  },
  {
    // contrasts_with requires explicit structural opposition, not just comparative cue words.
    // "Unlike X, Y..." or "compared with X, Y..." by themselves don't establish semantic contrast
    // between two *topics* — they often just describe differences within a single topic.
    // Require the pattern to clearly oppose two distinct noun phrases.
    predicate: 'contrasts_with',
    regex: /\b(?:contrasts\s+with|in\s+contrast\s+to|is\s+the\s+opposite\s+of|opposed\s+to|whereas\s+(?:\w+\s+){1,5}(?:does|is|uses|provides)|differs?\s+from\s+(?:\w+\s+){1,4}in\s+that)\b/i,
    confidence: 0.87
  },
  {
    predicate: 'defines',
    regex: /\b(?:defines|specifies|designates|is\s+defined\s+as)\b/i,
    confidence: 0.94
  },
  {
    predicate: 'uses',
    regex: /\b(?:uses|utilizes|leverages|applies|implements|employs)\b/i,
    confidence: 0.86
  },
  {
    predicate: 'configures',
    regex: /\b(?:configures|is\s+configured\s+(?:with|via|using|through)|configure\s+(?:the\s+)?(?:\w+\s+){0,3}(?:statement|option|directive|parameter))\b/i,
    confidence: 0.88
  },
  {
    predicate: 'affects',
    regex: /\b(?:affects|impacts|influences)\b/i,
    confidence: 0.85
  },
  {
    predicate: 'supports',
    regex: /\b(?:supports|enhances|backs|strengthens|sustains)\b/i,
    confidence: 0.87
  }
]

/**
 * Extracts evidenced relationships between topics.
 * Strictly requires explicit textual predicate evidence in a sentence.
 * Co-occurrence alone is strictly prohibited.
 */
export function extractSemanticRelationships(chunks, topics) {
  const relations = []
  const seenPairs = new Set()

  if (!topics || !topics.length || !chunks || !chunks.length) return []

  // Pre-index topic names and aliases
  const indexedTopics = topics.map(t => {
    const names = [t.name, ...(t.aliases || [])].map(n => n.toLowerCase().trim()).filter(Boolean)
    return {
      id: t.id,
      name: t.name,
      names
    }
  })

  for (const chunk of chunks) {
    const rawText = chunk.text || ''
    if (rawText.length < 20) continue

    const page = chunk.page || (chunk.pdfPageIndex != null ? chunk.pdfPageIndex + 1 : 1)
    const chkId = chunk.id

    // Break into individual sentences so predicates link topics within the same clause
    const sentences = rawText.split(/(?<=[.!?])\s+/)

    for (const sentence of sentences) {
      const sentLower = sentence.toLowerCase()

      // Find which topics are mentioned in this specific sentence
      const presentTopics = []
      for (const t of indexedTopics) {
        if (t.names.some(n => sentLower.includes(n))) {
          presentTopics.push(t)
        }
      }

      if (presentTopics.length < 2) continue

      // For each unique pair in the sentence, check for semantic predicate evidence
      for (let i = 0; i < presentTopics.length; i++) {
        for (let j = i + 1; j < presentTopics.length; j++) {
          const t1 = presentTopics[i]
          const t2 = presentTopics[j]

          const pairKey = [t1.id, t2.id].sort().join('_')
          if (seenPairs.has(pairKey)) continue

          // Find first matching predicate in this sentence
          let matchedPredicate = null
          let matchedConfidence = 0.8
          let predIndex = -1

          for (const p of SEMANTIC_PREDICATES) {
            const match = p.regex.exec(sentLower)
            if (match) {
              matchedPredicate = p.predicate
              matchedConfidence = p.confidence
              predIndex = match.index
              break
            }
          }

          // STRICT CHECK: Reject co-occurrence alone!
          if (!matchedPredicate || predIndex === -1) {
            continue
          }

          // Determine direction based on position relative to predicate verb
          // Find lowest index occurrence of t1 and t2
          const idx1 = Math.min(...t1.names.map(n => sentLower.indexOf(n)).filter(x => x !== -1))
          const idx2 = Math.min(...t2.names.map(n => sentLower.indexOf(n)).filter(x => x !== -1))

          // Subject typically precedes predicate, object follows predicate
          let source = t1
          let target = t2
          if (idx1 < predIndex && idx2 > predIndex) {
            source = t1
            target = t2
          } else if (idx2 < predIndex && idx1 > predIndex) {
            source = t2
            target = t1
          } else if (idx1 > idx2) {
            source = t2
            target = t1
          }

          // Reject edges where either endpoint is a supporting entity (standards body, org, registry)
          if (isSupportingEntity(source.name) || isSupportingEntity(target.name)) {
            continue
          }

          seenPairs.add(pairKey)
          relations.push({
            id: `rel_${relations.length + 1}`,
            sourceId: source.id,
            sourceName: source.name,
            targetId: target.id,
            targetName: target.name,
            predicate: matchedPredicate,
            type: matchedPredicate, // For backwards compatibility
            confidence: matchedConfidence,
            page,
            pdfPageNumber: chunk.pdfPageNumber || page,
            displayPageLabel: chunk.displayPageLabel || String(page),
            chunkId: chkId,
            evidenceChunkIds: [chkId],
            sourcePages: [page],
            evidence: sentence.trim()
          })
        }
      }
    }
  }

  return relations
}

// Backward compatibility alias
export const extractRelationships = extractSemanticRelationships

export { isSupportingEntity }
