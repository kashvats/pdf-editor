import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDynamicMindMapTree, validateMindMapTree } from '../src/lib/intelligence/mindmap.js'

test('builds dynamic acyclic mind map tree with single parent, zero duplicates, and synthetic overflow nodes', () => {
  const rootTopic = {
    id: 'root',
    label: 'Computer Viruses and Malware',
    summary: 'Subject overview',
    confidence: 0.9,
    sourcePages: [1],
    evidenceChunkIds: [],
    synthetic: false
  }

  // 12 subtopics under one domain to test branch size bounding (preferred 3-8, max 8)
  const topics = []
  for (let i = 1; i <= 12; i++) {
    topics.push({
      id: `t_${i}`,
      name: `Attack Vector ${i}`,
      domain: 'Attacks',
      importanceScore: 0.9 - i * 0.02,
      sourcePages: [10 + i],
      summary: `Technique ${i}`
    })
  }

  const relationships = topics.slice(1).map((t) => ({
    sourceId: topics[0].id,
    targetId: t.id,
    predicate: 'example_of',
    evidence: `${t.name} is an example of Attack Vectors`
  }))

  const tree = buildDynamicMindMapTree({ docName: 'test.pdf', topics, relationships, rootTopic })
  const report = validateMindMapTree(tree)

  assert.equal(report.valid, true)
  assert.equal(report.duplicateRate, 0)
  assert.ok(report.mindmapDepth >= 2)
  assert.equal(tree.id, 'mm_root')
  assert.equal(tree.title, 'Computer Viruses and Malware')

  // Check that no single node exceeds 8 direct children and overflow/synthetic is meaningful
  const checkBranchSize = node => {
    assert.ok((node.children || []).length <= 8, `Branch exceeds max 8 children: ${node.title}`)
    if (node.synthetic) {
      // Synthetic nodes may be semantic groupings (any meaningful label) or overflow indicators
      assert.ok(node.title && node.title.length >= 3, `Synthetic node has empty label: ${node.title}`)
    }
    (node.children || []).forEach(checkBranchSize)
  }
  checkBranchSize(tree)
})
