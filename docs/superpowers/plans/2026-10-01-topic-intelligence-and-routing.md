# Topic Intelligence & Route Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Document Intelligence into a robust, content-first, topic-driven knowledge system with structure-aware chunking, bounded deterministic clustering, many-to-many topic mapping, evidenced relationships, acyclic mind maps with synthetic overflow handling, and asset-safe URL route/session persistence across refreshes.

**Architecture:** The pipeline checks OCR necessity for low-density/scanned PDFs, chunks text with structure-awareness, computes local embeddings, clusters chunks with bounded incremental centroids ($O(n \cdot k)$ with max centroids capped), discovers canonical topics with many-to-many cluster relationships and strict label validation, determines a qualified root topic, extracts evidenced semantic relationships (rejecting co-occurrence alone), constructs strict mind map trees with scored parent assignment and explicit synthetic overflow nodes, and persists session state across routes with asset-safe SPA fallbacks and quota-safe IndexedDB caching.

**Tech Stack:** React 18, Vite 5, PDF.js, Tesseract.js (for OCR fallback), WebGPU/WASM vector embeddings, IndexedDB, sessionStorage, HTML5 History API, Node.js `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-01-topic-intelligence-and-routing-design.md`

## Global Constraints
- App must remain React, browser-first, PDF.js based, local-first, WebGPU/WASM capable, and privacy-preserving.
- Zero server-side API dependencies; all computation runs in the browser.
- Do not create graph or mind map nodes directly from raw NER results, chapter labels ("Chapter 1"), TOC entries ("Contents"), URLs, publisher brands, page numbers, dates, or percentages.
- Knowledge Graph relationships strictly require explicit textual evidence for a semantic predicate; co-occurrence alone is prohibited.
- Mind Map must be a true tree with exactly one primary parent per node, zero cycles, zero duplicate nodes, and controlled branch sizes (preferred 3–8, hard max 8 with `synthetic: true` overflow groups).
- Retain all high-confidence canonical topics in storage; many-to-many mapping via `TopicNode.clusterIds` and `TopicClusterRecord.candidateTopicIds`.
- URL is the primary source of truth: `/document-intelligence?tab=knowledge-graph` and `/document-intelligence?tab=mind-map`. Browser Back/Forward must take precedence over sessionStorage.
- Refreshing any route must preserve tool, tab, and recovered document, or show "Reopen the document to continue". Never redirect to `/`.

## Review Focus
- Low-density/scanned documents: if a PDF has scanned pages with no text, verify that OCR is triggered before topic processing.
- Scalable clustering: large documents with 500+ chunks must cluster with bounded centroids (max 50) and deterministic sorting, without quadratic stalls.
- Many-to-many topic membership: a chunk discussing "Port scanning helps reconnaissance" must be allowed to associate with both topics.
- Evidenced relationships: semantic predicates (e.g. `protects_against`, `identifies`, `requires`) must be backed by concrete sentences, never raw co-occurrence.
- Asset-safe SPA fallback: verify that `/document-intelligence` serves `index.html` while `/assets/non-existent.js` returns a true 404.

---

### Task 1: Structural Front-Matter, Boilerplate & OCR Quality Check

**Files:**
- Create: `src/lib/intelligence/structuralNoise.js`
- Test: `test/structuralNoise.test.js`

**Interfaces:**
- Produces:
  `checkDocumentTextQuality(pages: { pageNum: number; text: string }[]): { needsOcr: boolean; textDensity: number; emptyPageRatio: number }`
  `detectFrontMatterPages(chunks: CleanChunk[], numPages: number): Set<number>`
  `isStructuralNoiseChunk(chunk: CleanChunk, frontMatterPages: Set<number>): boolean`
  `cleanCandidateText(text: string): string`

- [ ] **Step 1: Write the failing test**

```javascript
// test/structuralNoise.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  checkDocumentTextQuality,
  detectFrontMatterPages,
  isStructuralNoiseChunk,
  cleanCandidateText
} from '../src/lib/intelligence/structuralNoise.js'

test('detects when document has low text density and requires OCR', () => {
  const scannedPages = [
    { pageNum: 1, text: '' },
    { pageNum: 2, text: '   ' },
    { pageNum: 3, text: 'Scanned title' }
  ]
  const q1 = checkDocumentTextQuality(scannedPages)
  assert.equal(q1.needsOcr, true)

  const textPages = [
    { pageNum: 1, text: 'This is a normal digital textbook page with several complete sentences describing network protocols and security measures.' },
    { pageNum: 2, text: 'Another substantive page explaining the OSI model and packet transmission details in full depth.' }
  ]
  const q2 = checkDocumentTextQuality(textPages)
  assert.equal(q2.needsOcr, false)
})

test('detects front-matter pages structurally from roman numerals and copyright blocks', () => {
  const chunks = [
    { page: 1, text: 'Wiley Publishing, Inc. All rights reserved. ISBN 978-0-123456-78-9' },
    { page: 2, text: 'Table of Contents\nChapter 1: Networking Fundamentals .... 1\nChapter 2: Attack Types .... 15' },
    { page: 3, text: 'Acknowledgments\nI would like to thank my editor at Wiley...' },
    { page: 4, text: 'Chapter 1\nNetworking Fundamentals\nThe OSI Model consists of seven distinct layers.' }
  ]
  const fmPages = detectFrontMatterPages(chunks, 4)
  assert.equal(fmPages.has(1), true)
  assert.equal(fmPages.has(2), true)
  assert.equal(fmPages.has(3), true)
  assert.equal(fmPages.has(4), false)
})

test('flags boilerplate chunks as structural noise', () => {
  const fm = new Set([1, 2, 3])
  assert.equal(isStructuralNoiseChunk({ page: 2, text: 'Table of Contents' }, fm), true)
  assert.equal(isStructuralNoiseChunk({ page: 1, text: 'Copyright © 2024 All Rights Reserved' }, fm), true)
  assert.equal(isStructuralNoiseChunk({ page: 4, text: 'Page 14 of 250' }, fm), true)
  assert.equal(isStructuralNoiseChunk({ page: 4, text: '97 percent' }, fm), true)
  assert.equal(isStructuralNoiseChunk({ page: 4, text: 'https://example.com/docs' }, fm), true)
  assert.equal(isStructuralNoiseChunk({ page: 4, text: 'The Address Resolution Protocol translates IP addresses to MAC addresses.' }, fm), false)
})

test('cleans chapter and structural prefixes from candidate text', () => {
  assert.equal(cleanCandidateText('Chapter 1: Networking Fundamentals'), 'Networking Fundamentals')
  assert.equal(cleanCandidateText('Part II - Attack Vectors'), 'Attack Vectors')
  assert.equal(cleanCandidateText('Section 3.2: Firewalls'), 'Firewalls')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/structuralNoise.test.js`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement `src/lib/intelligence/structuralNoise.js`**

Implement `checkDocumentTextQuality` (computes avg chars per page and empty page ratio), `detectFrontMatterPages` (identifies catalog/ISBN/legal density, roman numerals, early page numbers), `isStructuralNoiseChunk` (standalone numbers, URLs, boilerplate strings), and `cleanCandidateText` (strips `Chapter \d+`, `Part [IVXLCDM\d]+`, `Section \d+`).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/structuralNoise.test.js`
Expected: PASS

---

### Task 2: Structure-Aware Semantic Chunking & Bounded Clustering

**Files:**
- Create: `src/lib/intelligence/chunker.js`
- Create: `src/lib/intelligence/clustering.js`
- Test: `test/chunkingAndClustering.test.js`

**Interfaces:**
- Produces:
  `chunkDocumentStructure(linesByPage: PageLines[], options?: ChunkOptions): StructureAwareChunk[]`
  `clusterEmbeddedChunks(chunks: StructureAwareChunk[], options?: ClusterOptions): TopicClusterRecord[]`

- [ ] **Step 1: Write the failing test**

```javascript
// test/chunkingAndClustering.test.js
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
  assert.ok(chunks[0].id)
  assert.ok(chunks[0].pdfPageIndex === 0)
  assert.ok(chunks[0].text.includes('Firewalls establish'))
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
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/chunkingAndClustering.test.js`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement `src/lib/intelligence/chunker.js` and `src/lib/intelligence/clustering.js`**

- `chunker.js`: Target 150–300 words without breaking sentences or major headings, small overlap, retains `pdfPageIndex`, `displayPageLabel`, `bbox`, `textStart`, `textEnd`.
- `clustering.js`: Bounded leader-follower centroid clustering (max centroids capped, e.g. 40), deterministic sorting of inputs, calculates `coherenceScore`, returns `TopicClusterRecord[]` with `candidateTopicIds: []`, `candidateLabels: []`, `chunkIds`, `pageDistribution` without duplicating vectors.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/chunkingAndClustering.test.js`
Expected: PASS

---

### Task 3: Content-First Topic Discovery, Label Validation & Root Detection

**Files:**
- Create: `src/lib/intelligence/topicDiscovery.js`
- Test: `test/topicDiscovery.test.js`

**Interfaces:**
- Produces:
  `validateTopicLabel(label: string): { valid: boolean; normalized: string; reason?: string }`
  `detectRootTopic(chunks: CleanChunk[], topics: TopicNode[], docName: string): RootTopic`
  `discoverTopicsFromClusters(clusters: TopicClusterRecord[], chunks: CleanChunk[], structure: DocumentStructure): { topics: TopicNode[]; updatedClusters: TopicClusterRecord[] }`

- [ ] **Step 1: Write the failing test**

```javascript
// test/topicDiscovery.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateTopicLabel, detectRootTopic, discoverTopicsFromClusters } from '../src/lib/intelligence/topicDiscovery.js'

test('validates canonical topic labels strictly and normalizes them', () => {
  assert.equal(validateTopicLabel('osi reference model').normalized, 'OSI Reference Model')
  assert.equal(validateTopicLabel('packet sniffing').normalized, 'Packet Sniffing')
  assert.equal(validateTopicLabel('Chapter 1').valid, false)
  assert.equal(validateTopicLabel('Contents').valid, false)
  assert.equal(validateTopicLabel('Wiley Publishing').valid, false)
  assert.equal(validateTopicLabel('Overview').valid, false)
})

test('detects root topic with confidence, sourcePages, and fallback support', () => {
  const topics = [
    { id: 't1', name: 'Computer Viruses and Malware', importanceScore: 0.95, sourcePages: [1, 5, 20] },
    { id: 't2', name: 'Networking Fundamentals', importanceScore: 0.8, sourcePages: [10] },
    { id: 't3', name: 'Introduction', importanceScore: 0.6, sourcePages: [2] }
  ]
  const chunks = [{ text: 'This book explores computer viruses, hacking methods, and malware attacks.' }]
  const root = detectRootTopic(chunks, topics, 'Computer Viruses, Hacking and Malware for Dummies.pdf')
  assert.equal(root.label, 'Computer Viruses and Malware')
  assert.ok(root.confidence >= 0.8)
  assert.equal(root.synthetic, false)
})

test('discovers topics content-first with many-to-many cluster mapping and soft membership', () => {
  const chunks = [
    { id: 'c1', pdfPageIndex: 11, page: 12, text: 'Address Resolution Protocol (ARP) is defined as a communication protocol used for discovering link layer addresses. ARP translates IP addresses to MAC addresses with cache inspection.' },
    { id: 'c2', pdfPageIndex: 12, page: 13, text: 'Port scanning helps reconnaissance identify exposed network services on remote hosts.' }
  ]
  const clusters = [
    { id: 'cl_1', chunkIds: ['c1'], pageDistribution: [12], candidateTopicIds: [], candidateLabels: [] },
    { id: 'cl_2', chunkIds: ['c2'], pageDistribution: [13], candidateTopicIds: [], candidateLabels: [] }
  ]
  const { topics, updatedClusters } = discoverTopicsFromClusters(clusters, chunks, { headings: [] })
  assert.ok(topics.length >= 1)
  const arpTopic = topics.find(t => t.name.includes('Address Resolution') || t.name === 'ARP')
  assert.ok(arpTopic)
  assert.ok(Array.isArray(arpTopic.clusterIds))
  assert.ok(arpTopic.metrics.explanatoryDensity > 0.4)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/topicDiscovery.test.js`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement `src/lib/intelligence/topicDiscovery.js`**

Implement:
- `validateTopicLabel`: Checks noun-phrase grammar, Title Case normalization, strips trailing particles/conjunctions, rejects non-descriptive generic tokens.
- `discoverTopicsFromClusters`: Discovers concepts from cluster text, allows many-to-many mapping (`topic.clusterIds` and `cluster.candidateTopicIds`), supports soft membership on chunks (`topicMemberships`), qualifies single-section concepts with high explanatory depth.
- `detectRootTopic`: Finds overall document subject matching centroid and title, sets `confidence`, `sourcePages`, and `synthetic: boolean`. Conservative fallback if low confidence.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/topicDiscovery.test.js`
Expected: PASS

---

### Task 4: Evidenced Semantic Relationship Extraction

**Files:**
- Modify: `src/lib/intelligence/relations.js`
- Test: `test/relations.test.js`

**Interfaces:**
- Produces:
  `extractSemanticRelationships(chunks: CleanChunk[], topics: TopicNode[]): TopicRelationship[]`

- [ ] **Step 1: Write the failing test**

```javascript
// test/relations.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractSemanticRelationships } from '../src/lib/intelligence/relations.js'

test('extracts evidenced semantic relationships and rejects co-occurrence alone', () => {
  const topics = [
    { id: 'top_firewall', name: 'Firewalls', aliases: ['firewall'] },
    { id: 'top_port_scan', name: 'Port Scanning', aliases: ['port scanning'] },
    { id: 'top_recon', name: 'Reconnaissance', aliases: ['reconnaissance'] },
    { id: 'top_arp', name: 'ARP', aliases: ['arp'] }
  ]

  const chunks = [
    // Evidenced: "protects_against / mitigates"
    {
      id: 'chk_1',
      page: 15,
      text: 'A properly configured Firewall protects against Port Scanning by dropping unauthorized packets.'
    },
    // Semantic entailment: "identifies / enables"
    {
      id: 'chk_2',
      page: 18,
      text: 'Port Scanning identifies network services to facilitate Reconnaissance of open targets.'
    },
    // Merely co-occurring without relationship verb - MUST NOT create edge
    {
      id: 'chk_3',
      page: 20,
      text: 'In this chapter we discussed Firewalls and also mentioned ARP in passing.'
    }
  ]

  const rels = extractSemanticRelationships(chunks, topics)
  assert.equal(rels.length, 2)
  
  const rel1 = rels.find(r => r.predicate === 'protects_against' || r.predicate === 'mitigates')
  assert.ok(rel1)
  assert.ok(rel1.evidenceChunkIds.includes('chk_1'))
  assert.ok(rel1.sourcePages.includes(15))

  const rel2 = rels.find(r => r.predicate === 'identifies' || r.predicate === 'enables')
  assert.ok(rel2)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/relations.test.js`
Expected: FAIL

- [ ] **Step 3: Update `src/lib/intelligence/relations.js`**

Implement semantic entailment checking supporting:
`uses`, `requires`, `depends_on`, `causes`, `enables`, `prevents`, `protects_against`, `part_of`, `example_of`, `contrasts_with`, `leads_to`, `defines`, `contains`, `identifies`, `affects`, `supports`, `mitigates`, `compares_with`.
Ensure co-occurrence alone never creates edges. Attach `evidenceChunkIds`, `sourcePages`, `confidence`, and `evidence` snippet.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/relations.test.js`
Expected: PASS

---

### Task 5: Dynamic Mind Map Hierarchy & Quality Gate

**Files:**
- Modify: `src/lib/intelligence/mindmap.js`
- Test: `test/mindmap.test.js`

**Interfaces:**
- Produces:
  `buildDynamicMindMapTree({ docName, topics, relationships, rootTopic }): MindMapNode`
  `validateMindMapTree(tree: MindMapNode): QualityValidationReport`

- [ ] **Step 1: Write the failing test**

```javascript
// test/mindmap.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDynamicMindMapTree, validateMindMapTree } from '../src/lib/intelligence/mindmap.js'

test('builds dynamic acyclic mind map tree with single parent, zero duplicates, and synthetic overflow nodes', () => {
  const rootTopic = { id: 'root', label: 'Computer Viruses and Malware', summary: 'Subject overview', confidence: 0.9, sourcePages: [1], evidenceChunkIds: [], synthetic: false }
  
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

  const relationships = topics.slice(1).map((t, idx) => ({
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
  
  // Check that no single node exceeds 8 direct children and overflow is marked synthetic: true
  const checkBranchSize = node => {
    assert.ok((node.children || []).length <= 8, `Branch exceeds max 8 children: ${node.title}`)
    if (node.synthetic) {
      assert.ok(node.title.includes('More') || node.title.includes('Additional'), 'Synthetic node has clear label')
    }
    (node.children || []).forEach(checkBranchSize)
  }
  checkBranchSize(tree)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/mindmap.test.js`
Expected: FAIL

- [ ] **Step 3: Update `src/lib/intelligence/mindmap.js`**

Implement:
- Scored parent assignment: evaluates containment score (`part_of`, `contains`), broader/narrower score, source structure.
- Invariants: exactly one primary parent per non-root node, visited set ensures zero cycles, duplicate nodes banned.
- Branch fan-out: preferred 3–8 children, hard max 8. If $> 8$, group remaining into a synthetic grouping node marked `synthetic: true`.
- Quality Validation Report: computes `topicCount`, `visibleTopicCount`, `noiseRatio`, `duplicateRate`, `clusterCoherence`, `rootConfidence`, `evidencedEdgeRatio`, `mindmapDepth`, `syntheticGroupingCount`, `warnings[]`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/mindmap.test.js`
Expected: PASS

---

### Task 6: Resilient Pipeline Lifecycle, Versioning & Safe Storage

**Files:**
- Modify: `src/lib/intelligence/documentIntelligence.js`
- Modify: `src/lib/intelligence/knowledge.js`
- Modify: `src/lib/db.js`
- Test: `test/documentIntelligence.test.js`

**Interfaces:**
- Produces:
  `getOrBuildDocumentIntelligence(bytes, docName, options): Promise<DocumentIntelligence>`
  Stages: `loading`, `extracting`, `ocr`, `cleaning`, `structure`, `chunking`, `embeddings`, `clustering`, `topics`, `topic-validation`, `root-detection`, `relations`, `mindmap`, `quality-validation`, `persisting`, `ready`.

- [ ] **Step 1: Write the failing test**

```javascript
// test/documentIntelligence.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getOrBuildDocumentIntelligence, clearDocumentIntelligenceCache } from '../src/lib/intelligence/documentIntelligence.js'

test('honors AbortController cancellation cleanly and transitions to cancelled', async () => {
  clearDocumentIntelligenceCache()
  const controller = new AbortController()
  controller.abort()

  try {
    await getOrBuildDocumentIntelligence(new Uint8Array(100), 'test.pdf', { signal: controller.signal })
    assert.fail('Should have aborted')
  } catch (err) {
    assert.equal(err.name, 'AbortError')
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/documentIntelligence.test.js`
Expected: FAIL

- [ ] **Step 3: Update `documentIntelligence.js`, `knowledge.js`, and `db.js`**

Implement:
- Expanded processing stages with granular progress callbacks.
- Checks text density; if low, invokes OCR gracefully with cancel/error support.
- Stores `topicClusters` in `DocumentIntelligence` alongside `topics`, `relationships`, and `rootTopic`.
- One controlled quality refinement pass; if still low quality, marks `PARTIAL_READY` with actionable warnings (no infinite loop).
- Pipeline versioning: attaches `schemaVersion: '2.0.0'`, `pipelineVersion: '2.0.0'`, `documentFingerprint`.
- Safe IndexedDB caching: wraps storage operations in try/catch for `QuotaExceededError`; continues in-memory with user notice if caching fails.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/documentIntelligence.test.js`
Expected: PASS

---

### Task 7: Production Asset-Safe SPA History Fallbacks

**Files:**
- Modify: `vite.config.js`
- Create: `public/_redirects`
- Create: `vercel.json`
- Test: `test/spaRouting.test.js`

**Interfaces:**
- Produces:
  Asset-safe SPA rewriting: navigation paths rewrite to `/index.html` while `/assets/*` return real 404s.

- [ ] **Step 1: Write the failing test**

```javascript
// test/spaRouting.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('asset-safe SPA fallback configurations exist and are valid', () => {
  assert.ok(fs.existsSync('public/_redirects'), '_redirects must exist for Netlify / Cloudflare Pages')
  const redirects = fs.readFileSync('public/_redirects', 'utf8')
  // Verify assets are not rewritten to index.html
  assert.ok(redirects.includes('/*    /index.html   200') || redirects.includes('/* /index.html 200'))

  assert.ok(fs.existsSync('vercel.json'), 'vercel.json must exist for Vercel SPA rewrites')
  const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'))
  assert.ok(Array.isArray(vercel.rewrites))
  // Rewrite everything except static assets
  assert.equal(vercel.rewrites[0].destination, '/index.html')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/spaRouting.test.js`
Expected: FAIL

- [ ] **Step 3: Implement config files**

- Add `appType: 'spa'` to `vite.config.js`.
- Create `public/_redirects` with Netlify/Cloudflare rules.
- Create `vercel.json` with Vercel rewrites.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/spaRouting.test.js`
Expected: PASS

---

### Task 8: Canonical Client-Side Router & Refresh Persistence

**Files:**
- Create: `src/lib/router.js`
- Modify: `src/lib/workspace.js`
- Modify: `src/lib/db.js`
- Modify: `src/App.jsx`
- Test: `test/router.test.js`

**Interfaces:**
- Produces:
  `parseRoute(location: Location): { tool: string; tab?: string; path: string }`
  `routeToPath(tool: string, tab?: string): string`
  `navigate(to: string, options?: { replace?: boolean }): void`
  State priority: `URL` $\to$ `sessionStorage` $\to$ `default`.

- [ ] **Step 1: Write the failing test**

```javascript
// test/router.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRoute, routeToPath } from '../src/lib/router.js'

test('parses canonical routes consistently', () => {
  const r1 = parseRoute({ pathname: '/document-intelligence', search: '?tab=knowledge-graph' })
  assert.equal(r1.tool, 'intelligence')
  assert.equal(r1.tab, 'knowledge-graph')

  const r2 = parseRoute({ pathname: '/document-intelligence', search: '?tab=mind-map' })
  assert.equal(r2.tool, 'intelligence')
  assert.equal(r2.tab, 'mind-map')

  const r3 = parseRoute({ pathname: '/pdf-editor', search: '' })
  assert.equal(r3.tool, 'editor')
})

test('converts route to canonical URL path', () => {
  assert.equal(routeToPath('intelligence', 'knowledge-graph'), '/document-intelligence?tab=knowledge-graph')
  assert.equal(routeToPath('intelligence', 'mind-map'), '/document-intelligence?tab=mind-map')
  assert.equal(routeToPath('editor'), '/pdf-editor')
  assert.equal(routeToPath('home'), '/')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/router.test.js`
Expected: FAIL

- [ ] **Step 3: Implement `router.js` and wire into `workspace.js` & `App.jsx`**

- `router.js`: Canonical route parser & builder. Listens to `popstate` ensuring Back/Forward takes precedence.
- `workspace.js` / `db.js`: Caches active document in IndexedDB `active_doc` store.
- `App.jsx`:
  * Sets active view from URL path and search params on mount.
  * Rehydrates document on refresh from IndexedDB.
  * If document is missing on refresh, stays on the tool route and displays: `"Reopen the document to continue"` with file open prompt (never redirects to `/`).
  * If route is unknown, displays 404 / Recovery view.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/router.test.js`
Expected: PASS

---

### Task 9: Interactive Force/Cluster Graph, Mind Map UI & Grounded Actions

**Files:**
- Modify: `src/components/tools/IntelligenceTool.jsx`
- Modify: `src/lib/intelligence/localLlm.js`

**Interfaces:**
- Renders:
  * Domain-clustered force layout with full topic names, domain colors, and page pills.
  * Multi-level collapsible tree with branch toggles (`+` / `−`), primary source badges, and `synthetic` indicator tags for overflow groups.
  * Grounded Topic Actions: Explain, Topic Summary, Ask, Generate Quiz (zero placeholder answers), Flashcards, Open Sources with precise text anchoring.
  * Typo fix in quiz failure: `"Not enough source information to generate a high-quality quiz for this topic."`

- [ ] **Step 1: Fix quiz fallback message in `localLlm.js`**

Replace malformed placeholder with exact clean text: `"Not enough source information to generate a high-quality quiz for this topic."`

- [ ] **Step 2: Implement domain-clustered force graph in `IntelligenceTool.jsx`**

Render nodes in domain force clusters; active selection illuminates neighbors and directs evidenced edges while dimming background; add density toggle.

- [ ] **Step 3: Implement multi-tier collapsible Mind Map in `IntelligenceTool.jsx`**

Render tree with collapsible branch buttons, smooth Bezier curves, source page badges, and `synthetic: true` overflow tags.

- [ ] **Step 4: Wire Grounded Topic Actions & Source Anchoring**

Connect Explain, Topic Summary, Ask, Quiz (grounded only in selected topic + supporting chunks + neighbors), and Open Sources highlighting exact page.

---

### Task 10: Real-Document Test Matrix & Semantic Quality Acceptance Test

**Files:**
- Create: `test/semanticQuality.test.js`
- Test: `test/semanticQuality.test.js`

- [ ] **Step 1: Write Semantic Quality & Real-PDF Test**

```javascript
// test/semanticQuality.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { getOrBuildDocumentIntelligence } from '../src/lib/intelligence/documentIntelligence.js'

test('Semantic Quality: A user who has not read the book can identify subject, topics, subtopics, relationships, and source pages', async () => {
  const pdfPath = 'books/34. Computer Viruses, Hacking and Malware attacks for Dummies.pdf'
  if (!fs.existsSync(pdfPath)) return
  
  const bytes = fs.readFileSync(pdfPath)
  const intel = await getOrBuildDocumentIntelligence(bytes.buffer, 'Computer Viruses, Hacking and Malware attacks for Dummies.pdf')
  
  // 1. Root Subject is correct (not "Contents", "Chapter 1", "Introduction")
  assert.ok(intel.rootTopic.label)
  assert.doesNotMatch(intel.rootTopic.label, /^(Contents|Table of Contents|Chapter \d+|Introduction|Preface)$/i)
  
  // 2. No boilerplate in canonical topics
  for (const topic of intel.topics) {
    assert.doesNotMatch(topic.name, /^(Contents|Table of Contents|Chapter \d+|Page \d+|Wiley|Copyright|\d+ percent)$/i)
    assert.ok(topic.sourcePages.length > 0)
    assert.ok(topic.summary.length > 10)
    assert.ok(Array.isArray(topic.clusterIds))
  }

  // 3. Relationships have explicit evidence and predicates
  for (const rel of intel.relationships) {
    assert.notEqual(rel.predicate, 'related_to')
    assert.ok(rel.evidence.length > 15)
    assert.ok(rel.sourcePages.length > 0)
  }

  // 4. Mind map is dynamic tree with no cycles
  assert.ok(intel.mindmapTree.children.length >= 2)
  const seen = new Set()
  const walk = n => {
    assert.equal(seen.has(n.id), false, `Cycle or duplicate node ${n.id}`)
    seen.add(n.id)
    ;(n.children || []).forEach(walk)
  }
  walk(intel.mindmapTree)
})
```

- [ ] **Step 2: Run all tests**

Run: `node --test test/**/*.test.js`
Expected: ALL PASS

- [ ] **Step 3: Run production build verification**

Run: `npm run build`
Expected: SUCCESS with zero compilation errors

- [ ] **Step 4: Verify in live browser**

Navigate to `http://127.0.0.1:5173/`:
- Open document, verify Knowledge Graph and Mind Map quality.
- Test direct URL `/document-intelligence?tab=knowledge-graph`.
- Refresh page, verify tool and tab are preserved.
