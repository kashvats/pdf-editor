import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { getOrBuildDocumentIntelligence } from '../src/lib/intelligence/documentIntelligence.js'

test('Semantic Quality: A user who has not read the book can identify subject, topics, subtopics, relationships, and source pages', async () => {
  const pdfPath = 'books/34. Computer Viruses, Hacking and Malware attacks for Dummies.pdf'
  if (!fs.existsSync(pdfPath)) {
    console.log('Skipping real-PDF test as file is not present')
    return
  }

  const buffer = fs.readFileSync(pdfPath)
  const intel = await getOrBuildDocumentIntelligence(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    '34. Computer Viruses, Hacking and Malware attacks for Dummies.pdf'
  )

  // 1. Root Subject is correct (not "Contents", "Chapter 1", "Introduction", "Wiley")
  assert.ok(intel.rootTopic.label, 'Root topic must have a label')
  assert.doesNotMatch(
    intel.rootTopic.label,
    /^(Contents|Table of Contents|Chapter \d+|Introduction|Preface|Wiley)$/i,
    'Root topic must not be boilerplate'
  )
  assert.ok(intel.rootTopic.confidence >= 0.5, 'Root topic must have confidence score')

  // 2. No boilerplate in canonical topics
  assert.ok(intel.topics.length >= 5, 'Must discover substantive canonical topics')
  for (const topic of intel.topics) {
    assert.doesNotMatch(
      topic.name,
      /^(Contents|Table of Contents|Chapter \d+|Page \d+|Wiley|Copyright|\d+ percent)$/i,
      `Topic "${topic.name}" must not be boilerplate`
    )
    assert.ok(topic.sourcePages.length > 0, `Topic ${topic.name} must have source pages`)
    assert.ok(topic.summary.length > 10, `Topic ${topic.name} must have a substantive summary`)
    assert.ok(Array.isArray(topic.clusterIds), `Topic ${topic.name} must map to cluster IDs`)
  }

  // 3. Cluster Traceability
  assert.ok(Array.isArray(intel.topicClusters), 'topicClusters must be present')
  assert.ok(intel.topicClusters.length > 0, 'topicClusters must contain records')

  // 4. Relationships have explicit evidence and predicates
  for (const rel of intel.relationships) {
    assert.notEqual(rel.predicate, 'related_to', 'Relationships must not default to generic related_to')
    assert.ok(rel.evidence.length > 10, 'Relationship must have textual evidence')
    assert.ok(rel.sourcePages.length > 0, 'Relationship must link to source pages')
  }

  // 5. Mind Map is a dynamic tree with no cycles or duplicates
  assert.ok(intel.mindmapTree.children.length >= 2, 'Mind map must have substantive branches')
  const seenNodeIds = new Set()
  function checkTree(node) {
    assert.equal(seenNodeIds.has(node.id), false, `Cycle or duplicate node ID: ${node.id}`)
    seenNodeIds.add(node.id)
    assert.doesNotMatch(
      node.title,
      /^(Contents|Table of Contents|Chapter \d+|Wiley)$/i,
      `Mind map node "${node.title}" must not be boilerplate`
    )
    assert.ok((node.children || []).length <= 8, `Branch ${node.title} must not exceed 8 direct children`)
    for (const child of (node.children || [])) {
      checkTree(child)
    }
  }
  checkTree(intel.mindmapTree)

  // 6. Quality Report is present and valid
  assert.ok(intel.qualityReport, 'Quality report must be generated')
  assert.equal(intel.qualityReport.duplicateRate, 0, 'Duplicate rate must be 0')
})
