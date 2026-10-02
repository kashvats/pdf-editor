// Bounded, Deterministic Semantic Clustering Engine
// Uses leader-follower canopy clustering with bounded centroids to guarantee O(n * k) performance

import { cosineSimilarity } from './embeddings.js'

export function clusterEmbeddedChunks(chunks, options = {}) {
  const {
    maxCentroids = 40,
    simThreshold = 0.70
  } = options

  if (!chunks || !chunks.length) return []

  // Ensure deterministic processing order
  const sortedChunks = [...chunks].sort((a, b) => {
    const pageA = a.pdfPageIndex != null ? a.pdfPageIndex : a.page || 0
    const pageB = b.pdfPageIndex != null ? b.pdfPageIndex : b.page || 0
    if (pageA !== pageB) return pageA - pageB
    return String(a.id).localeCompare(String(b.id))
  })

  const clusters = []

  for (const chunk of sortedChunks) {
    const vec = chunk.vector
    if (!vec || !vec.length) continue

    let bestIdx = -1
    let bestSim = -1

    for (let i = 0; i < clusters.length; i++) {
      const sim = cosineSimilarity(vec, clusters[i].centroid)
      if (sim > bestSim) {
        bestSim = sim
        bestIdx = i
      }
    }

    if (bestSim >= simThreshold && bestIdx !== -1) {
      // Assign to existing cluster and update moving centroid
      const cl = clusters[bestIdx]
      cl.chunkIds.push(chunk.id)
      cl.chunks.push(chunk)
      const count = cl.chunkIds.length

      // Update centroid
      for (let d = 0; d < vec.length; d++) {
        cl.centroid[d] = (cl.centroid[d] * (count - 1) + vec[d]) / count
      }
    } else if (clusters.length < maxCentroids) {
      // Spawn new cluster
      clusters.push({
        id: `cl_${clusters.length + 1}`,
        centroid: new Float32Array(vec),
        chunkIds: [chunk.id],
        chunks: [chunk]
      })
    } else if (bestIdx !== -1) {
      // Bounded k reached: assign to closest existing centroid
      const cl = clusters[bestIdx]
      cl.chunkIds.push(chunk.id)
      cl.chunks.push(chunk)
    }
  }

  // Finalize records with coherence scores and page distributions
  return clusters.map((cl, idx) => {
    const pages = new Set()
    let totalSim = 0

    for (const c of cl.chunks) {
      const p = c.page || (c.pdfPageIndex != null ? c.pdfPageIndex + 1 : 1)
      pages.add(p)
      if (c.vector) {
        totalSim += Math.max(0, cosineSimilarity(c.vector, cl.centroid))
      }
    }

    const coherence = cl.chunks.length > 0
      ? Math.round((totalSim / cl.chunks.length) * 100) / 100
      : 1.0

    return {
      id: `cluster_${idx + 1}`,
      chunkIds: cl.chunkIds,
      candidateTopicIds: [],
      candidateLabels: [],
      pageDistribution: Array.from(pages).sort((a, b) => a - b),
      coherenceScore: coherence,
      confidence: Math.min(1.0, 0.6 + coherence * 0.4)
    }
  })
}
