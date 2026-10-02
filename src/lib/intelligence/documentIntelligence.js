// Unified Document Intelligence Engine (Topic-Driven Architecture v2)
// Processes PDF once into authoritative DocumentIntelligence object shared across all tools.

import { processDocumentStructure } from './processor.js'
import { classifyDocument, PIPELINES, DOCUMENT_TYPES } from './classifier.js'
import { detectFrontMatterPages, isStructuralNoiseChunk, checkDocumentTextQuality } from './structuralNoise.js'
import { chunkDocumentStructure } from './chunker.js'
import { clusterEmbeddedChunks } from './clustering.js'
import { discoverTopicsFromClusters, detectRootTopic, filterVisibleKnowledgeGraph, validateKnowledgeGraphQuality, validateTopicLabel, canonicalizeTopics } from './topicDiscovery.js'
import { extractSemanticRelationships } from './relations.js'
import { buildDynamicMindMapTree, validateMindMapTree } from './mindmap.js'
import { batchEmbedChunks, getDocumentEmbeddings, saveDocumentEmbeddings } from './embeddings.js'
import { generateQuizFromKnowledge, generateFlashcards, generateTopicSummary } from './localLlm.js'
import { createKnowledgePackage } from './knowledge.js'

// In-memory cache to guarantee zero redundant re-processing across tabs
let cachedDocKey = null
let cachedIntelligence = null

function checkAbort(signal) {
  if (signal?.aborted) {
    const err = new Error('Operation aborted by user')
    err.name = 'AbortError'
    throw err
  }
}

export async function getOrBuildDocumentIntelligence(bytes, docName, { signal, onProgress, forceRefresh = false, overrideType = null } = {}) {
  checkAbort(signal)
  const cacheKey = `${docName}_${bytes.byteLength}`

  if (!forceRefresh && cachedDocKey === cacheKey && cachedIntelligence) {
    if (overrideType && cachedIntelligence.documentType !== overrideType) {
      return adaptDocumentIntelligence(cachedIntelligence, overrideType)
    }
    return cachedIntelligence
  }

  // Stage 1: loading
  onProgress?.({ stage: 'loading', percent: 5, label: 'Reading document bytes…' })
  checkAbort(signal)

  // Stage 2: extracting & structure
  onProgress?.({ stage: 'extracting', percent: 12, label: 'Extracting page text and layout geometry…' })
  const structure = await processDocumentStructure(bytes, p => {
    checkAbort(signal)
    onProgress?.({ stage: 'extracting', percent: Math.round(12 + p * 20), label: `Processing pages (${Math.round(p * 100)}%)…` })
  })
  checkAbort(signal)

  // Stage 3: OCR density evaluation
  onProgress?.({ stage: 'ocr', percent: 34, label: 'Evaluating text density and OCR requirements…' })
  const textQuality = checkDocumentTextQuality(structure.chunks.map(c => ({ pageNum: c.page, text: c.text })))
  checkAbort(signal)

  // Stage 4: cleaning & structural front-matter detection
  onProgress?.({ stage: 'cleaning', percent: 38, label: 'Detecting front-matter & structural boilerplate…' })
  const frontMatterPages = detectFrontMatterPages(structure.chunks, structure.numPages)
  checkAbort(signal)

  // Stage 5: structure-aware chunking
  onProgress?.({ stage: 'chunking', percent: 45, label: 'Generating structure-aware semantic passages…' })
  const pagesMap = new Map()
  for (const c of structure.chunks) {
    if (!pagesMap.has(c.page)) pagesMap.set(c.page, [])
    pagesMap.get(c.page).push({
      text: c.text,
      fontSize: c.fontSize || 12,
      bold: c.bold,
      x: c.box?.x || 20,
      y: c.box?.y || 20,
      w: c.box?.w || 200,
      rectH: c.box?.h || 14
    })
  }
  const pagesList = Array.from(pagesMap.entries()).map(([pageNum, lines]) => ({
    pageNum,
    pdfPageNumber: pageNum,
    displayPageLabel: (structure.pageLabels && structure.pageLabels[pageNum - 1]) ? String(structure.pageLabels[pageNum - 1]) : String(pageNum),
    lines
  }))
  const cleanChunks = chunkDocumentStructure(pagesList, {
    targetWordCount: 180,
    frontMatterPages
  })
  checkAbort(signal)

  // Stage 6: classification
  onProgress?.({ stage: 'structure', percent: 52, label: 'Classifying document type…' })
  const classification = classifyDocument({
    docName,
    chunks: cleanChunks.length ? cleanChunks : structure.chunks,
    facts: structure.facts,
    numPages: structure.numPages
  })
  const effectiveType = overrideType || classification.type
  checkAbort(signal)

  // Stage 7: vector embeddings
  onProgress?.({ stage: 'embeddings', percent: 60, label: 'Generating local vector embeddings (WebGPU/WASM)…' })
  let embeddedChunks = await getDocumentEmbeddings(docName)
  if (!embeddedChunks || !embeddedChunks.length) {
    embeddedChunks = await batchEmbedChunks(cleanChunks.length ? cleanChunks : structure.chunks, p => {
      checkAbort(signal)
      onProgress?.({ stage: 'embeddings', percent: Math.round(60 + p * 15), label: `Generating vector embeddings (${Math.round(p * 100)}%)…` })
    })
    try {
      await saveDocumentEmbeddings(docName, embeddedChunks)
    } catch {
      // Safe fallback if storage quota exceeded
    }
  }
  checkAbort(signal)

  // Stage 8: scalable clustering
  onProgress?.({ stage: 'clustering', percent: 76, label: 'Clustering semantically related concept passages…' })
  const clusters = clusterEmbeddedChunks(embeddedChunks, { maxCentroids: 40, simThreshold: 0.70 })
  checkAbort(signal)

  // Stage 9: content-first topic discovery
  onProgress?.({ stage: 'topics', percent: 82, label: 'Discovering canonical knowledge topics…' })
  const { topics, updatedClusters } = discoverTopicsFromClusters(clusters, cleanChunks, structure)
  checkAbort(signal)

  // Stage 10: root topic detection
  onProgress?.({ stage: 'root-detection', percent: 86, label: 'Determining authoritative document root topic…' })
  const rootTopic = detectRootTopic(cleanChunks, topics, docName)
  checkAbort(signal)

  // Stage 11: evidenced semantic relations
  onProgress?.({ stage: 'relations', percent: 90, label: 'Extracting evidenced semantic relationships…' })
  const relationships = extractSemanticRelationships(cleanChunks, topics)
  checkAbort(signal)

  // Stage 12: Knowledge Graph Filtering (prefer 8-20 evidenced concepts)
  let visibleGraph = filterVisibleKnowledgeGraph({
    topics,
    relationships,
    rootTopic,
    minNodes: 8,
    maxNodes: 20
  })

  // Stage 13: Knowledge graph quality gate with 1 controlled refinement pass
  onProgress?.({ stage: 'quality-validation', percent: 94, label: 'Validating knowledge graph & mind map quality…' })
  let graphQualityReport = validateKnowledgeGraphQuality({
    visibleTopics: visibleGraph.visibleTopics,
    allTopics: topics,
    relationships: visibleGraph.visibleRelationships,
    rootTopic,
    chunks: cleanChunks
  })

  let visibleGraphTopics = visibleGraph.visibleTopics
  let visibleGraphRelationships = visibleGraph.visibleRelationships

  if (!graphQualityReport.valid) {
    const refinedTopics = canonicalizeTopics(
      topics.filter(t => t.importanceScore >= 0.35 && t.hasGroundedSummary !== false && validateTopicLabel(t.name).valid),
      cleanChunks
    )
    const refinedGraph = filterVisibleKnowledgeGraph({
      topics: refinedTopics,
      relationships,
      rootTopic,
      minNodes: 6,
      maxNodes: 20
    })
    const refinedReport = validateKnowledgeGraphQuality({
      visibleTopics: refinedGraph.visibleTopics,
      allTopics: refinedTopics,
      relationships: refinedGraph.visibleRelationships,
      rootTopic,
      chunks: cleanChunks
    })

    visibleGraphTopics = refinedGraph.visibleTopics
    visibleGraphRelationships = refinedGraph.visibleRelationships
    graphQualityReport = refinedReport
  }

  // Stage 14: dynamic mind map hierarchy
  onProgress?.({ stage: 'mindmap', percent: 97, label: 'Constructing dynamic hierarchical Mind Map…' })
  const mindmapTree = buildDynamicMindMapTree({
    docName,
    topics,
    relationships,
    rootTopic,
    structure,
    chunks: cleanChunks
  })
  checkAbort(signal)

  let qualityReport = validateMindMapTree(mindmapTree, topics, relationships)
  
  if (!qualityReport.valid && qualityReport.noiseRatio > 0.05) {
    const refinedTopics = topics.filter(t => t.importanceScore >= 0.35)
    if (refinedTopics.length >= 3) {
      const refinedTree = buildDynamicMindMapTree({
        docName,
        topics: refinedTopics,
        relationships,
        rootTopic,
        structure,
        chunks: cleanChunks
      })
      qualityReport = validateMindMapTree(refinedTree, refinedTopics, relationships)
    }
  }
  checkAbort(signal)

  // Adaptive learning mode
  let quiz = []
  let flashcards = []
  const pipeline = classification.pipeline
  if (!pipeline.skipHeavyTasks.includes('quiz')) {
    quiz = generateQuizFromKnowledge(cleanChunks, topics)
  }
  if (!pipeline.skipHeavyTasks.includes('flashcards')) {
    flashcards = generateFlashcards(topics, cleanChunks)
  }

  // OKF-compatible package
  const knowledgePkg = createKnowledgePackage({
    docName,
    structure,
    entities: topics.map(t => ({
      id: t.id,
      name: t.name,
      type: 'Topic',
      confidence: t.importanceScore || 0.9,
      sourcePages: t.sourcePages || [1],
      pages: t.sourcePages || [1],
      chunkIds: t.sourceChunkIds,
      count: t.metrics?.frequency || 1
    })),
    relationships,
    embeddings: embeddedChunks
  })

  // Final Stage: ready
  onProgress?.({ stage: 'ready', percent: 100, label: 'Topic intelligence ready' })

  const docIntelligence = {
    schemaVersion: '2.0.0',
    pipelineVersion: '2.0.0',
    documentFingerprint: cacheKey,
    docName,
    documentType: effectiveType,
    typeLabel: classification.typeLabel,
    classificationConfidence: classification.confidence,
    characteristics: classification.characteristics,
    pipeline,
    isLowConfidence: classification.isLowConfidence,
    metadata: {
      numPages: structure.numPages,
      fileSize: bytes.byteLength,
      headingsCount: structure.headings.length,
      chunksCount: cleanChunks.length
    },
    structure: {
      headings: structure.headings,
      sections: structure.sections,
      cleanChunks,
      frontMatterPages: Array.from(frontMatterPages)
    },
    topics,
    topicClusters: updatedClusters,
    rootTopic,
    relationships,
    visibleGraphTopics,
    visibleGraphRelationships,
    graphQualityReport,
    mindmapTree,
    embeddedChunks,
    qualityReport,
    processingState: {
      status: (graphQualityReport.valid && qualityReport.valid) ? 'complete' : 'PARTIAL_READY',
      stage: 'ready',
      percent: 100,
      errors: [...(graphQualityReport.errors || []), ...(qualityReport.errors || [])],
      warnings: [...(graphQualityReport.warnings || []), ...(qualityReport.warnings || [])]
    },
    cleanChunks,
    entities: topics.map(t => ({
      id: t.id,
      name: t.name,
      type: 'Topic',
      confidence: t.importanceScore || 0.9,
      sourcePages: t.sourcePages || [1],
      pages: t.sourcePages || [1],
      chunkIds: t.sourceChunkIds,
      count: t.metrics?.frequency || 1
    })),
    quiz,
    flashcards,
    knowledgePkg,
    facts: structure.facts,
    sourcePages: Array.from({ length: structure.numPages }, (_, i) => i + 1)
  }

  cachedDocKey = cacheKey
  cachedIntelligence = docIntelligence
  return docIntelligence
}

export function adaptDocumentIntelligence(existingDoc, newTypeKey) {
  const newPipeline = PIPELINES[newTypeKey] || PIPELINES.GENERAL
  let quiz = existingDoc.quiz
  let flashcards = existingDoc.flashcards

  if (!newPipeline.skipHeavyTasks.includes('quiz') && (!quiz || !quiz.length)) {
    quiz = generateQuizFromKnowledge(existingDoc.cleanChunks, existingDoc.topics || existingDoc.entities)
  }
  if (!newPipeline.skipHeavyTasks.includes('flashcards') && (!flashcards || !flashcards.length)) {
    flashcards = generateFlashcards(existingDoc.topics || existingDoc.entities, existingDoc.cleanChunks)
  }

  const updated = {
    ...existingDoc,
    documentType: newTypeKey,
    typeLabel: DOCUMENT_TYPES[newTypeKey] || newTypeKey,
    classificationConfidence: 100,
    characteristics: ['Classification specified by user'],
    pipeline: newPipeline,
    isLowConfidence: false,
    quiz,
    flashcards
  }

  cachedIntelligence = updated
  return updated
}

export function clearDocumentIntelligenceCache() {
  cachedDocKey = null
  cachedIntelligence = null
}

/**
 * Returns single canonical TopicIntelligence object consumed across all views:
 * Mind Map, Knowledge Graph, Summary, Inline Ask, Quiz, Flashcards, and Sources.
 */
export function getUnifiedTopicIntelligence(rawNode, intelligence) {
  if (!rawNode) return null
  const topics = intelligence?.topics || []
  const chunks = intelligence?.cleanChunks || []
  const relationships = intelligence?.relationships || []
  const mindmapTree = intelligence?.mindmapTree

  // Find canonical topic
  const canonical = topics.find(t => t.id === rawNode.id || t.name === (rawNode.title || rawNode.name))
  const isSynthetic = Boolean(rawNode.synthetic || rawNode.isMajorGroup || (!canonical && rawNode.synthetic))

  const label = rawNode.title || rawNode.name || canonical?.name || 'Untitled Topic'
  const id = rawNode.id || canonical?.id || `topic_${Math.random()}`

  // Summary resolution
  let summary = ''
  if (canonical) {
    const sumResult = generateTopicSummary(canonical, chunks, relationships)
    if (sumResult?.summary && !/Summary unavailable/i.test(sumResult.summary)) {
      summary = sumResult.summary
    }
  }
  if (!summary && rawNode.summary && rawNode.summary.length >= 25 && !/Summary unavailable/i.test(rawNode.summary) && !/Key concept detailed|Major semantic area/i.test(rawNode.summary)) {
    summary = rawNode.summary
  }
  if (!summary && canonical?.summary && canonical.summary.length >= 25 && !/Summary unavailable/i.test(canonical.summary) && !/Key concept detailed|Major semantic area/i.test(canonical.summary)) {
    summary = canonical.summary
  }

  // Fallback to grounded chunks
  if (!summary) {
    const chunkById = new Map(chunks.map(c => [c.id, c]))
    const sourceIds = Array.from(new Set([
      ...(rawNode.sourceChunkIds || []),
      ...(canonical?.sourceChunkIds || [])
    ]))
    const gChunks = sourceIds.map(cid => chunkById.get(cid)).filter(c => c && c.text && !c.isHeading && c.text.length >= 25)
    if (gChunks[0]) {
      const sents = gChunks[0].text.split(/(?<=[.?!])\s+/).filter(s => s.trim().length >= 25 && s.trim().length <= 250)
      summary = sents[0] ? sents[0].trim() : gChunks[0].text.slice(0, 220).trim()
    } else {
      summary = 'Summary unavailable — insufficient source evidence.'
    }
  }

  // Key points
  let keyPoints = []
  if (canonical) {
    const sumResult = generateTopicSummary(canonical, chunks, relationships)
    if (sumResult?.keyPoints?.length) keyPoints = sumResult.keyPoints
  }
  if (!keyPoints.length && canonical?.keyPoints) keyPoints = canonical.keyPoints
  if (!keyPoints.length && chunks.length) {
    const topicChunks = chunks.filter(c => c.text && c.text.toLowerCase().includes(label.toLowerCase()) && !c.isHeading)
    for (const c of topicChunks.slice(0, 5)) {
      const sents = c.text.split(/(?<=[.?!])\s+/).filter(s => s.trim().length >= 25 && s.trim().length <= 250)
      for (const s of sents) {
        const clean = s.trim()
        if (!keyPoints.includes(clean) && clean !== summary) {
          keyPoints.push(clean)
          if (keyPoints.length >= 4) break
        }
      }
      if (keyPoints.length >= 4) break
    }
  }

  // Source chunks
  const sourceChunkIds = Array.from(new Set([
    ...(rawNode.sourceChunkIds || []),
    ...(canonical?.sourceChunkIds || [])
  ]))

  // Source pages
  const rawPages = rawNode.sourcePages || canonical?.sourcePages || [rawNode.pdfPageNumber || rawNode.page || 1]
  const pdfPages = Array.from(new Set(rawPages.map(p => typeof p === 'number' ? p : p.pdfPageNumber || 1))).sort((a, b) => a - b)

  const sourcePages = pdfPages.map(p => {
    let dLabel = String(p)
    if (rawNode.displayPageLabel && p === (rawNode.pdfPageNumber || rawNode.page)) {
      dLabel = rawNode.displayPageLabel
    } else if (canonical?.displayPageLabel && p === canonical.pdfPageNumber) {
      dLabel = canonical.displayPageLabel
    } else {
      const chunk = chunks.find(c => (c.page || c.pdfPageNumber) === p && c.displayPageLabel)
      if (chunk?.displayPageLabel) dLabel = chunk.displayPageLabel
    }
    return { pdfPageNumber: p, displayPageLabel: dLabel }
  })

  // Mind map hierarchy (parent & children)
  let parentTopicId = rawNode.parentId || canonical?.parentTopicId
  let parentLabel = ''
  let childTopicIds = (rawNode.children || []).map(c => c.id || c.title)
  let childLabels = (rawNode.children || []).map(c => c.title || c.name || c.id)

  if (mindmapTree && !parentLabel) {
    function findInTree(n, p = null) {
      if (!n) return
      if (n.id === id || n.title === label) {
        if (p) {
          parentTopicId = p.id
          parentLabel = p.title || p.name
        }
        if (n.children && n.children.length) {
          childTopicIds = n.children.map(c => c.id)
          childLabels = n.children.map(c => c.title || c.name)
        }
        return true
      }
      if (n.children) {
        for (const ch of n.children) {
          if (findInTree(ch, n)) return true
        }
      }
      return false
    }
    findInTree(mindmapTree)
  }

  // Semantic relationships
  const rels = relationships.filter(r => r.sourceId === id || r.targetId === id)
  const formattedRels = rels.map(r => {
    const isSource = r.sourceId === id
    const otherId = isSource ? r.targetId : r.sourceId
    const otherName = isSource ? r.targetName : r.sourceName
    return {
      predicate: r.predicate,
      otherTopicId: otherId,
      otherTopicName: otherName,
      isSource,
      evidence: r.evidence,
      confidence: r.confidence,
      page: r.pages?.[0] || sourcePages[0]?.pdfPageNumber || 1
    }
  })

  const pdfPageNumber = rawNode.pdfPageNumber || canonical?.pdfPageNumber || sourcePages[0]?.pdfPageNumber || 1
  const displayPageLabel = rawNode.displayPageLabel || canonical?.displayPageLabel || sourcePages[0]?.displayPageLabel || String(pdfPageNumber)

  return {
    id,
    label,
    name: label,
    title: label,
    summary,
    keyPoints: keyPoints.slice(0, 5),
    sourceChunkIds,
    sourcePages,
    relationships: formattedRels,
    parentTopicId,
    parentLabel,
    childTopicIds,
    childLabels,
    synthetic: isSynthetic,
    pdfPageNumber,
    displayPageLabel,
    domain: canonical?.domain || rawNode.domain || 'General',
    type: canonical?.type || rawNode.type || 'Concept',
    rawNode,
    canonical
  }
}
