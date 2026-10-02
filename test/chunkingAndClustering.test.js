import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chunkDocumentStructure } from '../src/lib/intelligence/chunker.js'
import { clusterEmbeddedChunks } from '../src/lib/intelligence/clustering.js'

test('chunks document preserving sentence boundaries and heading splits', () => {
  const pages = [{
    pageNum: 1,
    lines: [
      { text: 'Chapter 1: Network Security', fontSize: 20, bold: true, y: 50, x: 20, w: 200, rectH: 24 },
      { text: 'Network security consists of policies and practices adopted to prevent unauthorized access.', fontSize: 12, y: 80, x: 20, w: 400, rectH: 14 },
      { text: 'Firewalls establish a barrier between secured internal networks and untrusted outside networks.', fontSize: 12, y: 100, x: 20, w: 400, rectH: 14 },
      { text: 'Port Scanning is a method used by administrators to verify security policies.', fontSize: 12, y: 120, x: 20, w: 400, rectH: 14 }
    ]
  }]

  const chunks = chunkDocumentStructure(pages, { targetWordCount: 50 })
  assert.ok(chunks.length >= 1)
  const bodyChunk = chunks.find(c => !c.isHeading) || chunks[0]
  assert.ok(bodyChunk.id)
  assert.equal(bodyChunk.pdfPageIndex, 0)
  assert.ok(bodyChunk.text.includes('Firewalls establish'))
  assert.ok(bodyChunk.bbox)
})

test('clusters embedded chunks with bounded centroids and coherence scores', () => {
  const chunks = []
  for (let i = 0; i < 60; i++) {
    const isTopicA = i % 2 === 0
    const vec = new Array(128).fill(0)
    vec[isTopicA ? 5 : 85] = 1.0
    chunks.push({
      id: `chk_${i}`,
      pdfPageIndex: Math.floor(i / 10),
      page: Math.floor(i / 10) + 1,
      text: isTopicA ? `Port scanning and reconnaissance passage ${i}` : `Firewall filtering and packet inspection passage ${i}`,
      vector: vec
    })
  }

  const clusters = clusterEmbeddedChunks(chunks, { maxCentroids: 10, simThreshold: 0.75 })
  assert.ok(clusters.length >= 2)
  assert.ok(clusters.length <= 10) // Bounded k
  assert.ok(typeof clusters[0].coherenceScore === 'number')
  assert.ok(Array.isArray(clusters[0].chunkIds))
  assert.ok(Array.isArray(clusters[0].candidateTopicIds))
  assert.ok(Array.isArray(clusters[0].pageDistribution))
})
