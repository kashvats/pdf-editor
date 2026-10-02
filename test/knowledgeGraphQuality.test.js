import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateTopicLabel,
  discoverTopicsFromClusters,
  canonicalizeTopics,
  filterVisibleKnowledgeGraph,
  validateKnowledgeGraphQuality
} from '../src/lib/intelligence/topicDiscovery.js'
import { generateTopicSummary, generateQuizFromKnowledge, generateFlashcards } from '../src/lib/intelligence/localLlm.js'
import { extractSemanticRelationships } from '../src/lib/intelligence/relations.js'

test('Semantic Topic Validation Gate rejects noise, fragments, captions, bylines, and generic adjectives', () => {
  const rejectedCases = [
    'Wide Open',
    'This Figure',
    'That Figure',
    'The Figure',
    'Figure 12',
    'Mini Input',
    'Bad Things',
    'Bad',
    'Unfortunately...',
    'Unfortunately',
    'However, we found',
    'Magazine Sum...',
    'tech FAQs',
    'FAQ',
    'by Matt Richter',
    'By John Doe',
    'Author: Jane Doe',
    'Good',
    'Various Types',
    'Crankshaft P...'
  ]

  for (const label of rejectedCases) {
    const res = validateTopicLabel(label)
    assert.equal(res.valid, false, `Label "${label}" should be rejected but passed with reason: ${res.reason || 'none'}`)
  }

  const acceptedCases = [
    'Oxygen Sensors',
    'Crankshaft Position Sensor',
    'Engine Protection System',
    'Address Resolution Protocol',
    'Packet Sniffing',
    'Intrusion Detection'
  ]

  for (const label of acceptedCases) {
    const res = validateTopicLabel(label)
    assert.equal(res.valid, true, `Label "${label}" should be valid but was rejected: ${res.reason}`)
  }
})

test('Canonicalization merges related fragments into clean real concepts', () => {
  // Case 1: First Oxygen, Second Oxygen, Oxygen Sensor -> Oxygen Sensors
  const inputTopics1 = [
    { id: 't1', name: 'First Oxygen', label: 'First Oxygen', sourcePages: [3], sourceChunkIds: ['c1'], clusterIds: ['cl1'], importanceScore: 0.6 },
    { id: 't2', name: 'Second Oxygen', label: 'Second Oxygen', sourcePages: [3], sourceChunkIds: ['c1'], clusterIds: ['cl1'], importanceScore: 0.6 },
    { id: 't3', name: 'Oxygen Sensor', label: 'Oxygen Sensor', sourcePages: [3, 4], sourceChunkIds: ['c1', 'c2'], clusterIds: ['cl1'], importanceScore: 0.8 }
  ]
  const chunks1 = [
    { id: 'c1', page: 3, text: 'The engine uses First Oxygen Sensor and Second Oxygen Sensor for air-fuel feedback.' },
    { id: 'c2', page: 4, text: 'Oxygen Sensors monitor exhaust gases to protect the catalytic converter.' }
  ]

  const merged1 = canonicalizeTopics(inputTopics1, chunks1)
  const names1 = merged1.map(t => t.name)
  assert.ok(names1.includes('Oxygen Sensors') || names1.includes('Oxygen Sensor'), `Should merge into Oxygen Sensors, got: ${names1.join(', ')}`)
  assert.equal(names1.includes('First Oxygen'), false, 'Should not contain fragment First Oxygen')
  assert.equal(names1.includes('Second Oxygen'), false, 'Should not contain fragment Second Oxygen')
  const oxygenTopic = merged1.find(t => t.name.startsWith('Oxygen Sensor'))
  assert.ok(oxygenTopic.sourcePages.includes(3) && oxygenTopic.sourcePages.includes(4), 'Should merge sourcePages')

  // Case 2: Position Sensor, Crankshaft P... -> Crankshaft Position Sensor
  const inputTopics2 = [
    { id: 't4', name: 'Position Sensor', label: 'Position Sensor', sourcePages: [5], sourceChunkIds: ['c3'], clusterIds: ['cl2'], importanceScore: 0.7 },
    { id: 't5', name: 'Crankshaft P...', label: 'Crankshaft P...', sourcePages: [5], sourceChunkIds: ['c3'], clusterIds: ['cl2'], importanceScore: 0.5 },
    { id: 't6', name: 'Crankshaft Position Sensor', label: 'Crankshaft Position Sensor', sourcePages: [5, 6], sourceChunkIds: ['c3', 'c4'], clusterIds: ['cl2'], importanceScore: 0.9 }
  ]
  const chunks2 = [
    { id: 'c3', page: 5, text: 'The Crankshaft Position Sensor determines engine speed and position.' },
    { id: 'c4', page: 6, text: 'A faulty Crankshaft Position Sensor prevents ignition startup.' }
  ]

  const merged2 = canonicalizeTopics(inputTopics2, chunks2)
  const names2 = merged2.map(t => t.name)
  assert.ok(names2.includes('Crankshaft Position Sensor'), 'Must retain full canonical concept')
  assert.equal(names2.includes('Position Sensor'), false, 'Sub-phrase should merge into Crankshaft Position Sensor')
  assert.equal(names2.includes('Crankshaft P...'), false, 'Truncated label must never be canonical topic name')
})

test('Grounded summaries remove placeholders and fallbacks', () => {
  const topic = {
    id: 't_ep',
    name: 'Engine Protection',
    type: 'Concept',
    sourcePages: [3]
  }
  const chunks = [
    { id: 'c1', page: 3, text: 'Engine Protection activates emergency limp-mode when coolant temperature exceeds threshold.' }
  ]
  const summary = generateTopicSummary(topic, chunks, [])
  assert.ok(summary.summary.includes('Engine Protection activates'), `Summary must be grounded, got: ${summary.summary}`)
  assert.doesNotMatch(summary.summary, /Key concept detailed in the document/i, 'Must not use placeholder')
  assert.deepEqual(summary.sourcePages, [3], 'Summary sourcePages must match [3]')
})

test('Source consistency: canonical sourcePages[] is synchronized across inspector, summary, quiz, and flashcards', () => {
  const topic = {
    id: 't_ep',
    name: 'Engine Protection',
    type: 'Concept',
    sourcePages: [3],
    pages: [3]
  }
  const chunks = [
    { id: 'c1', page: 3, text: 'Engine Protection activates emergency limp-mode when coolant temperature exceeds threshold.' },
    { id: 'c2', page: 7, text: 'Coolant Sensor monitors temperature for Engine Protection.' }
  ]
  const entities = [
    topic,
    { id: 't_cs', name: 'Coolant Sensor', type: 'Concept', sourcePages: [7], pages: [7] },
    { id: 't_lm', name: 'Limp Mode', type: 'Concept', sourcePages: [3], pages: [3] },
    { id: 't_ec', name: 'ECU', type: 'Technology', sourcePages: [3], pages: [3] }
  ]
  const relationships = [
    { id: 'r1', sourceId: 't_cs', sourceName: 'Coolant Sensor', targetId: 't_ep', targetName: 'Engine Protection', type: 'supports', predicate: 'supports', sourcePages: [7], page: 7, evidence: 'Coolant Sensor monitors temperature for Engine Protection.' }
  ]

  const summary = generateTopicSummary(topic, chunks, relationships)
  assert.deepEqual(summary.sourcePages, [3], 'Summary citations must have sourcePages [3]')

  const quiz = generateQuizFromKnowledge(chunks, entities, 1)
  assert.ok(quiz.length > 0)
  assert.ok(Array.isArray(quiz[0].sourcePages), 'Quiz must have sourcePages array')
  assert.deepEqual(quiz[0].sourcePages, [quiz[0].sourcePage], 'sourcePages and sourcePage must agree')

  const flashcards = generateFlashcards(entities, chunks)
  assert.ok(flashcards.length > 0)
  const epCard = flashcards.find(fc => fc.front === 'Engine Protection')
  assert.ok(epCard)
  assert.ok(Array.isArray(epCard.sourcePages), 'Flashcard must have sourcePages array')
  assert.deepEqual(epCard.sourcePages, [3], 'Flashcard sourcePages must be [3]')
})

test('Knowledge Graph filtering limits to 8-20 evidenced connected concepts and excludes isolated nodes', () => {
  // Create 30 topics, but only 10 participate in evidenced relationships
  const topics = []
  for (let i = 1; i <= 30; i++) {
    topics.push({
      id: `t_${i}`,
      name: `Topic ${i}`,
      importanceScore: 0.8 - (i * 0.01),
      summary: `Grounding for Topic ${i} on page ${i}`,
      hasGroundedSummary: true,
      sourcePages: [i],
      metrics: { frequency: 5 }
    })
  }

  const relationships = [
    { id: 'r1', sourceId: 't_1', targetId: 't_2', predicate: 'causes', confidence: 0.9, evidence: 'Topic 1 causes Topic 2.' },
    { id: 'r2', sourceId: 't_2', targetId: 't_3', predicate: 'requires', confidence: 0.9, evidence: 'Topic 2 requires Topic 3.' },
    { id: 'r3', sourceId: 't_3', targetId: 't_4', predicate: 'supports', confidence: 0.9, evidence: 'Topic 3 supports Topic 4.' },
    { id: 'r4', sourceId: 't_4', targetId: 't_5', predicate: 'identifies', confidence: 0.9, evidence: 'Topic 4 identifies Topic 5.' },
    { id: 'r5', sourceId: 't_5', targetId: 't_6', predicate: 'defines', confidence: 0.9, evidence: 'Topic 5 defines Topic 6.' },
    { id: 'r6', sourceId: 't_6', targetId: 't_7', predicate: 'uses', confidence: 0.9, evidence: 'Topic 6 uses Topic 7.' },
    { id: 'r7', sourceId: 't_7', targetId: 't_8', predicate: 'contains', confidence: 0.9, evidence: 'Topic 7 contains Topic 8.' },
    { id: 'r8', sourceId: 't_8', targetId: 't_9', predicate: 'part_of', confidence: 0.9, evidence: 'Topic 8 is part_of Topic 9.' },
    { id: 'r9', sourceId: 't_9', targetId: 't_10', predicate: 'protects_against', confidence: 0.9, evidence: 'Topic 9 protects_against Topic 10.' }
  ]

  const rootTopic = { id: 'root_t_1', label: 'Topic 1', sourcePages: [1] }

  const visibleGraph = filterVisibleKnowledgeGraph({
    topics,
    relationships,
    rootTopic,
    minNodes: 8,
    maxNodes: 20
  })

  assert.ok(visibleGraph.visibleTopics.length >= 8 && visibleGraph.visibleTopics.length <= 20, `Visible topics must be between 8 and 20, got: ${visibleGraph.visibleTopics.length}`)
  // Topics 11-30 are isolated and have no relationships
  for (const t of visibleGraph.visibleTopics) {
    const isRoot = t.id === 't_1' || t.name === rootTopic.label
    const hasRel = visibleGraph.visibleRelationships.some(r => r.sourceId === t.id || r.targetId === t.id)
    assert.ok(hasRel || isRoot, `Visible topic ${t.name} must participate in an evidenced relationship or be root`)
  }
})

test('Knowledge Graph Quality Gate triggers refinement and returns PARTIAL_READY when criteria fail', () => {
  // Graph with >10% noise and unevidenced relationships
  const noisyTopics = [
    { id: 'n1', name: 'This Figure', summary: 'Key concept detailed in the document.', importanceScore: 0.5, sourcePages: [1] },
    { id: 'n2', name: 'Wide Open', summary: 'Key concept detailed in the document.', importanceScore: 0.5, sourcePages: [1] },
    { id: 'n3', name: 'Bad Things', summary: 'Key concept detailed in the document.', importanceScore: 0.5, sourcePages: [1] },
    { id: 't1', name: 'Engine Protection', summary: 'Engine Protection activates limp mode.', importanceScore: 0.9, sourcePages: [3] }
  ]
  const badRelationships = [
    { id: 'r1', sourceId: 'n1', targetId: 'n2', predicate: 'related_to', evidence: '' }
  ]
  const rootTopic = { id: 'root', label: 'Document', synthetic: true }

  const report = validateKnowledgeGraphQuality({
    visibleTopics: noisyTopics,
    relationships: badRelationships,
    rootTopic
  })

  assert.equal(report.valid, false, 'Quality gate must fail on noisy graph')
  assert.equal(report.status, 'PARTIAL_READY', 'Status must be PARTIAL_READY')
  assert.ok(report.warnings.length > 0, 'Must provide quality warnings')
})

test('End-to-End Automotive Diagnostics Pipeline filters noise, merges fragments, grounds summaries, and keeps source consistency', () => {
  const chunks = [
    {
      id: 'c1',
      page: 3,
      text: 'Engine Protection activates emergency limp mode when sensor anomalies occur. The Engine Protection system monitors critical engine operating parameters.',
      topicMemberships: []
    },
    {
      id: 'c2',
      page: 3,
      text: 'First Oxygen Sensor and Second Oxygen Sensor provide real-time air fuel feedback. Oxygen Sensors monitor exhaust gas oxygen content to protect the catalytic converter.',
      topicMemberships: []
    },
    {
      id: 'c3',
      page: 4,
      text: 'The Crankshaft Position Sensor measures engine rotational speed and angular position. A failed Crankshaft Position Sensor causes engine stalling.',
      topicMemberships: []
    },
    {
      id: 'c4',
      page: 4,
      text: 'Wide Open throttle induces maximum manifold pressure. This Figure illustrates the sensor mounting bracket. Mini Input signals must be filtered. Bad Things happen if timing drifts.',
      topicMemberships: []
    },
    {
      id: 'c5',
      page: 5,
      text: 'tech FAQs and Magazine Sum... by Matt Richter provides background notes. Unfortunately... calibration requires diagnostic tools.',
      topicMemberships: []
    },
    {
      id: 'c6',
      page: 5,
      text: 'Crankshaft Position Sensor requires Engine Protection protocols during overspeed. Engine Protection protects against catalytic damage when Oxygen Sensors detect lean conditions.',
      topicMemberships: []
    }
  ]

  const clusters = [
    { id: 'cl_1', chunkIds: ['c1', 'c2'], candidateTopicIds: [], candidateLabels: [] },
    { id: 'cl_2', chunkIds: ['c3', 'c4'], candidateTopicIds: [], candidateLabels: [] },
    { id: 'cl_3', chunkIds: ['c5', 'c6'], candidateTopicIds: [], candidateLabels: [] }
  ]

  const { topics } = discoverTopicsFromClusters(clusters, chunks, {})
  const topicNames = topics.map(t => t.name)

  // 1. Verify bad phrases are completely rejected
  const noisy = ['Wide Open', 'This Figure', 'Mini Input', 'Bad Things', 'Bad', 'Unfortunately...', 'Magazine Sum...', 'tech FAQs', 'by Matt Richter']
  for (const n of noisy) {
    assert.equal(topicNames.includes(n), false, `Discovered topics must never include "${n}"`)
  }

  // 2. Canonicalization merges
  assert.ok(topicNames.includes('Oxygen Sensors') || topicNames.includes('Oxygen Sensor'), 'Must have canonical Oxygen Sensors')
  assert.equal(topicNames.includes('First Oxygen'), false, 'First Oxygen must be merged')
  assert.equal(topicNames.includes('Second Oxygen'), false, 'Second Oxygen must be merged')

  assert.ok(topicNames.includes('Crankshaft Position Sensor'), 'Must have Crankshaft Position Sensor')
  assert.equal(topicNames.includes('Position Sensor'), false, 'Position Sensor sub-phrase must be merged')

  // 3. Relationships have evidence
  const relationships = extractSemanticRelationships(chunks, topics)
  for (const r of relationships) {
    assert.notEqual(r.predicate, 'related_to', 'Relationships must not default to related_to')
    assert.ok(r.evidence.length >= 10, 'Relationship must have textual evidence')
  }

  // 4. Source consistency on Engine Protection
  const epTopic = topics.find(t => t.name.startsWith('Engine Protection'))
  assert.ok(epTopic, 'Engine Protection must be discovered')
  assert.ok(epTopic.sourcePages.includes(3), 'Engine Protection sourcePages must include 3')
  assert.equal(epTopic.sourcePages[0], 3, 'First source page must be 3')

  const epSummary = generateTopicSummary(epTopic, chunks, relationships)
  assert.equal(epSummary.sourcePages[0], 3, 'Summary sourcePages must agree with topic sourcePages')
  assert.doesNotMatch(epSummary.summary, /Key concept detailed in the document/i, 'Must not use placeholder summary')
})
