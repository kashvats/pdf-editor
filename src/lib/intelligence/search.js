import { generateEmbedding, cosineSimilarity } from './embeddings.js'

export function semanticSearch(query, embeddedChunks, topK = 5) {
  if (!query || !query.trim() || !embeddedChunks || !embeddedChunks.length) return []

  const queryVec = generateEmbedding(query)
  const qTokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 2)

  const scored = embeddedChunks.map(chunk => {
    const chunkVec = new Float32Array(chunk.vector || generateEmbedding(chunk.text))
    const semScore = cosineSimilarity(queryVec, chunkVec)

    // Keyword overlap boost
    let kwBoost = 0
    const lowerText = chunk.text.toLowerCase()
    for (const t of qTokens) {
      if (lowerText.includes(t)) kwBoost += 0.15
    }

    const totalScore = semScore * 0.7 + Math.min(0.3, kwBoost)

    return {
      chunkId: chunk.id,
      page: chunk.page,
      text: chunk.text,
      isHeading: chunk.isHeading,
      score: Math.max(0, Math.min(1, totalScore)),
      box: chunk.box
    }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK).filter(r => r.score > 0.05)
}
