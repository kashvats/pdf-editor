import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateTopicLabel, detectRootTopic, discoverTopicsFromClusters } from '../src/lib/intelligence/topicDiscovery.js'

test('validates canonical topic labels strictly and normalizes them', () => {
  assert.equal(validateTopicLabel('osi reference model').normalized, 'OSI Reference Model')
  assert.equal(validateTopicLabel('packet sniffing').normalized, 'Packet Sniffing')
  assert.equal(validateTopicLabel('Chapter 1').valid, false)
  assert.equal(validateTopicLabel('Contents').valid, false)
  assert.equal(validateTopicLabel('Wiley Publishing').valid, false)
  assert.equal(validateTopicLabel('and the').valid, false)
  assert.equal(validateTopicLabel('97 percent').valid, false)
  assert.equal(validateTopicLabel('Overview').valid, false)
})

test('detects root topic with confidence, sourcePages, and fallback support', () => {
  const topics = [
    { id: 't1', name: 'Computer Viruses and Malware', importanceScore: 0.95, sourcePages: [1, 5, 20] },
    { id: 't2', name: 'Networking Fundamentals', importanceScore: 0.8, sourcePages: [10] },
    { id: 't3', name: 'Introduction', importanceScore: 0.6, sourcePages: [2] }
  ]
  const chunks = [{ id: 'c1', text: 'This book explores computer viruses, hacking methods, and malware attacks.' }]
  const root = detectRootTopic(chunks, topics, 'Computer Viruses, Hacking and Malware for Dummies.pdf')
  assert.equal(root.label, 'Computer Viruses and Malware')
  assert.ok(root.confidence >= 0.8)
  assert.equal(root.synthetic, false)
  assert.ok(Array.isArray(root.sourcePages))
  assert.ok(Array.isArray(root.evidenceChunkIds))
})

test('discovers topics content-first with many-to-many cluster mapping and soft membership', () => {
  const chunks = [
    { id: 'c1', pdfPageIndex: 11, page: 12, text: 'Address Resolution Protocol (ARP) is defined as a communication protocol used for discovering link layer addresses. ARP translates IP addresses to MAC addresses with cache inspection.', topicMemberships: [] },
    { id: 'c2', pdfPageIndex: 12, page: 13, text: 'Port scanning helps reconnaissance identify exposed network services on remote hosts.', topicMemberships: [] }
  ]
  const clusters = [
    { id: 'cl_1', chunkIds: ['c1'], pageDistribution: [12], candidateTopicIds: [], candidateLabels: [] },
    { id: 'cl_2', chunkIds: ['c2'], pageDistribution: [13], candidateTopicIds: [], candidateLabels: [] }
  ]
  const { topics, updatedClusters } = discoverTopicsFromClusters(clusters, chunks, { headings: [] })
  assert.ok(topics.length >= 1)
  const arpTopic = topics.find(t => t.name.includes('Address Resolution') || t.name === 'ARP')
  assert.ok(arpTopic, 'ARP topic must be discovered')
  assert.ok(Array.isArray(arpTopic.clusterIds))
  assert.ok(arpTopic.clusterIds.includes('cl_1'))
  assert.ok(arpTopic.metrics.explanatoryDensity > 0.4)
  assert.ok(arpTopic.sourcePages.includes(12))
  assert.ok(updatedClusters[0].candidateTopicIds.includes(arpTopic.id))
})
