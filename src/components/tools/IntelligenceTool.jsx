import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import {
  getOrBuildDocumentIntelligence,
  adaptDocumentIntelligence,
  clearDocumentIntelligenceCache,
  exportCompleteZip,
  exportKnowledgeJson,
  exportNodesCsv,
  exportEdgesCsv,
  detectHardwareCapabilities,
  REGISTERED_MODELS,
  semanticSearch,
  explainConceptSimply,
  generateTopicSummary,
  generateQuestionsForTopic,
  generateTopicQuiz,
  generateTopicFlashcards,
  getTopicMastery,
  saveTopicMastery,
  getAllTopicMastery,
  getUnifiedTopicIntelligence,
  DOCUMENT_TYPES,
  PIPELINES
} from '../../lib/intelligence'
import { DropArea, PageThumb, ToolShell, baseOf, download, prettySize, usePdf } from './shell'


// Helper to format source page string per spec: Book page X · PDF page Y · N sources
function formatTopicSourcesString(topic) {
  if (!topic) return ''
  const displayPages = topic.sourcePages || []
  if (displayPages.length === 0) {
    const p = topic.pdfPageNumber || 1
    const d = topic.displayPageLabel
    if (d && String(d) !== String(p)) {
      return `Book page ${d} · PDF page ${p}`
    }
    return `PDF page ${p}`
  }

  const pdfNums = displayPages.map(p => typeof p === 'number' ? p : p.pdfPageNumber).filter(Boolean)
  const bookLabels = displayPages.map(p => typeof p === 'object' ? p.displayPageLabel : null).filter(Boolean)

  const minPdf = Math.min(...pdfNums)
  const maxPdf = Math.max(...pdfNums)
  const pdfRangeStr = minPdf === maxPdf ? `PDF page ${minPdf}` : `PDF pages ${minPdf}–${maxPdf}`

  let bookRangeStr = ''
  if (bookLabels.length > 0) {
    const minBook = bookLabels[0]
    const maxBook = bookLabels[bookLabels.length - 1]
    bookRangeStr = minBook === maxBook ? `Book page ${minBook}` : `Book pages ${minBook}–${maxBook}`
  } else if (topic.displayPageLabel && String(topic.displayPageLabel) !== String(minPdf)) {
    bookRangeStr = `Book page ${topic.displayPageLabel}`
  }

  const chunkCount = topic.sourceChunkIds?.length || displayPages.length || 1
  const countStr = `${chunkCount} source${chunkCount === 1 ? '' : 's'}`

  if (bookRangeStr && bookRangeStr !== pdfRangeStr) {
    return `${bookRangeStr} · ${pdfRangeStr} · ${countStr}`
  }
  return `${pdfRangeStr} · ${countStr}`
}

export default function IntelligenceTool({ tool, initialTab = 'overview', onTabChange, onBack }) {
  const [pdf, open, clear] = usePdf()
  const [tab, setTabState] = useState(initialTab) // 'overview' | 'ask' | 'search' | 'knowledgemap' | 'export' | 'models'

  const setTab = (newTab) => {
    setTabState(newTab)
    onTabChange?.(newTab)
  }

  useEffect(() => {
    if (initialTab && initialTab !== tab) {
      setTabState(initialTab)
    }
  }, [initialTab])

  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState({ stage: '', percent: 0, label: '' })

  // Reusable authoritative DocumentIntelligence object
  const [intelligence, setIntelligence] = useState(null)
  const [whyOpen, setWhyOpen] = useState(false)

  // Hardware capabilities
  const [hardware, setHardware] = useState(null)

  // Ask Q&A State
  const [chatMessages, setChatMessages] = useState([])
  const [question, setQuestion] = useState('')

  // Semantic Search State
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])

  // Knowledge Graph State
  const [selectedNode, setSelectedNode] = useState(null)
  const [nodeViewMode, setNodeViewMode] = useState('summary') // 'summary' | 'questions'
  const [filterType, setFilterType] = useState('All')
  const [densityMode, setDensityMode] = useState('core') // 'core' | 'all'
  const [hoveredNodeId, setHoveredNodeId] = useState(null)
  const [collapsedNodeIds, setCollapsedNodeIds] = useState(new Set())
  const [graphZoom, setGraphZoom] = useState(1)
  const [graphPan, setGraphPan] = useState({ x: 0, y: 0 })
  const [graphIsDragging, setGraphIsDragging] = useState(false)
  const graphDragStart = useRef(null)
  const graphContainerRef = useRef(null)
  const [nodeExplanation, setNodeExplanation] = useState(null)
  const [topicAnswers, setTopicAnswers] = useState({})
  const [quizConfig, setQuizConfig] = useState({ count: 3, difficulty: 'medium', focus: 'mixed' })
  const [quizConfigOpen, setQuizConfigOpen] = useState(false)
  const [topicCustomQuiz, setTopicCustomQuiz] = useState(null)
  const [masteryData, setMasteryData] = useState({})

  // Mind Map State
  const [selectedMmNode, setSelectedMmNode] = useState(null)
  const [mmZoom, setMmZoom] = useState(1)
  const [mmPan, setMmPan] = useState({ x: 0, y: 0 })
  const [mmIsDragging, setMmIsDragging] = useState(false)
  const mmDragStart = useRef(null)
  const mmContainerRef = useRef(null)
  const svgRef = useRef(null)

  // Learning State (Quiz & Flashcards)
  const [learningTab, setLearningTab] = useState('quiz') // 'quiz' | 'flashcards'
  const [learningTopicFilter, setLearningTopicFilter] = useState('All')
  const [learningViewMode, setLearningViewMode] = useState('questions') // 'questions' | 'summary'
  const [userAnswers, setUserAnswers] = useState({})
  const [currentCardIdx, setCurrentCardIdx] = useState(0)
  const [cardFlipped, setCardFlipped] = useState(false)

  // Knowledge Map unified tab state
  const [kmView, setKmView] = useState(() => (initialTab === 'graph' || initialTab === 'knowledge-graph') ? 'graph' : 'mindmap')
  const [drawerNode, setDrawerNode] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerExpanded, setDrawerExpanded] = useState(false)
  const [drawerSection, setDrawerSection] = useState('summary') // 'summary' | 'ask' | 'quiz' | 'flashcards' | 'sources'
  const [drawerAskQuery, setDrawerAskQuery] = useState('')
  const [drawerAskAnswer, setDrawerAskAnswer] = useState(null)
  const [drawerAskLoading, setDrawerAskLoading] = useState(false)
  const [drawerAskMessages, setDrawerAskMessages] = useState([])
  const [drawerQuiz, setDrawerQuiz] = useState(null)
  const [drawerFlashcards, setDrawerFlashcards] = useState([])
  const [drawerFlashcardIdx, setDrawerFlashcardIdx] = useState(0)
  const [drawerFlashcardFlipped, setDrawerFlashcardFlipped] = useState(false)
  const [kmSearchQuery, setKmSearchQuery] = useState('')

  // Canvas container & dimensions
  const canvasContainerRef = useRef(null)
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 900, height: 520 })

  useEffect(() => {
    if (!canvasContainerRef.current) return
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) {
          setCanvasDimensions({ width: Math.round(width), height: Math.round(height) })
        }
      }
    })
    ro.observe(canvasContainerRef.current)
    return () => ro.disconnect()
  }, [])

  // Hover preview state
  const [hoveredNode, setHoveredNode] = useState(null)
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 })

  // Document-keyed persistence for map view/zoom/pan/positions
  const storageKey = pdf.name ? `editpdf_km_${pdf.name}` : null
  const [customNodePositions, setCustomNodePositions] = useState({})

  useEffect(() => {
    if (!storageKey) return
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.customNodePositions) setCustomNodePositions(parsed.customNodePositions)
        if (parsed.kmView) setKmView(parsed.kmView)
        if (parsed.graphZoom) setGraphZoom(parsed.graphZoom)
        if (parsed.graphPan) setGraphPan(parsed.graphPan)
        if (parsed.mmZoom) setMmZoom(parsed.mmZoom)
        if (parsed.mmPan) setMmPan(parsed.mmPan)
        if (Array.isArray(parsed.collapsedNodeIds)) setCollapsedNodeIds(new Set(parsed.collapsedNodeIds))
      }
    } catch {}
  }, [storageKey])

  const persistKmState = useCallback((patch = {}) => {
    if (!storageKey) return
    try {
      const current = JSON.parse(localStorage.getItem(storageKey) || '{}')
      localStorage.setItem(storageKey, JSON.stringify({ ...current, ...patch }))
    } catch {}
  }, [storageKey])

  // Hardware detection & Mastery loading
  useEffect(() => {
    detectHardwareCapabilities().then(h => setHardware(h))
  }, [])

  useEffect(() => {
    if (pdf.name) {
      setMasteryData(getAllTopicMastery(pdf.name))
    }
  }, [pdf.name])

  // Process Document ONCE into single DocumentIntelligence object
  useEffect(() => {
    if (!pdf.doc || !pdf.bytes) {
      setIntelligence(null)
      setSelectedNode(null)
      setSelectedMmNode(null)
      setChatMessages([])
      setSearchResults([])
      return
    }

    let cancelled = false
    setLoading(true)

    getOrBuildDocumentIntelligence(pdf.bytes, pdf.name, {
      onProgress: p => {
        if (!cancelled) setProgress(p)
      }
    }).then(docIntel => {
      if (cancelled) return
      setIntelligence(docIntel)
      setSelectedNode(docIntel.entities[0] || null)
      setSelectedMmNode(docIntel.mindmapTree?.children?.[0] || docIntel.mindmapTree || null)

      // Seed initial welcoming message in Ask
      setChatMessages([
        {
          role: 'assistant',
          text: `I've analyzed ${pdf.name} and identified it as a ${docIntel.typeLabel} (${docIntel.classificationConfidence}% confidence). You can ask any question, search concepts, or explore its knowledge graph below.`,
          citation: `Document contains ${docIntel.metadata.numPages} pages and ${docIntel.entities.length} verified entities.`
        }
      ])
      setLoading(false)
    }).catch(err => {
      console.warn('Document intelligence error:', err)
      if (!cancelled) setLoading(false)
    })

    return () => { cancelled = true }
  }, [pdf.doc, pdf.bytes])

  // Shared pan/zoom handlers for Knowledge Graph and Mind Map
  const makeViewportHandlers = (zoom, setZoom, pan, setPan, isDragging, setIsDragging, dragStart) => ({
    onMouseDown: (e) => {
      if (e.target.closest('[data-node]')) return // Don't pan when clicking nodes
      e.preventDefault()
      setIsDragging(true)
      dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
    },
    onMouseMove: (e) => {
      if (!isDragging || !dragStart.current) return
      setPan({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y })
    },
    onMouseUp: () => { setIsDragging(false); dragStart.current = null },
    onMouseLeave: () => { setIsDragging(false); dragStart.current = null },
    onWheel: (e) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      setZoom(z => Math.max(0.25, Math.min(4, z * delta)))
    }
  })

  const kgHandlers = makeViewportHandlers(graphZoom, setGraphZoom, graphPan, setGraphPan, graphIsDragging, setGraphIsDragging, graphDragStart)
  const mmHandlers = makeViewportHandlers(mmZoom, setMmZoom, mmPan, setMmPan, mmIsDragging, setMmIsDragging, mmDragStart)
  const handleAsk = e => {
    e?.preventDefault()
    if (!question.trim() || !intelligence) return
    const userQ = question.trim()
    setQuestion('')

    // Retrieve most relevant chunks using semantic search
    const matches = semanticSearch(userQ, intelligence.embeddedChunks, 3)
    let answerText = ''
    let citationText = ''

    if (matches.length > 0) {
      const topMatch = matches[0]
      const pages = Array.from(new Set(matches.map(m => m.page))).sort((a, b) => a - b)
      answerText = matches.map(m => m.text).join(' ')
      citationText = `Verified from Page ${pages.join(', ')}`
    } else {
      answerText = `I couldn't find a direct reference in ${pdf.name} answering that query.`
    }

    setChatMessages(prev => [
      ...prev,
      { role: 'user', text: userQ },
      { role: 'assistant', text: answerText, citation: citationText }
    ])
  }

  // Handle Semantic Search
  const handleSearch = e => {
    e?.preventDefault()
    if (!searchQuery.trim() || !intelligence) return
    const results = semanticSearch(searchQuery, intelligence.embeddedChunks, 8)
    setSearchResults(results)
  }

  // Handle Reclassification Override
  const handleOverrideType = (typeKey) => {
    if (!intelligence) return
    const updated = adaptDocumentIntelligence(intelligence, typeKey)
    setIntelligence(updated)
  }

  const handleExplainNode = () => {
    if (!selectedNode || !intelligence) return
    const related = intelligence.cleanChunks.filter(c => c.text.includes(selectedNode.name || selectedNode.title))
    const exp = explainConceptSimply(selectedNode.name || selectedNode.title, related)
    setNodeExplanation(exp)
  }

  const openDrawer = useCallback((rawNode) => {
    if (!rawNode) return
    const unified = getUnifiedTopicIntelligence(rawNode, intelligence) || rawNode
    setDrawerNode(unified)
    setDrawerOpen(true)
    setDrawerSection('summary')
    setDrawerAskQuery('')
    setDrawerAskAnswer(null)
    setDrawerAskLoading(false)
    setDrawerQuiz(null)
    setDrawerFlashcardIdx(0)
    setDrawerFlashcardFlipped(false)

    if (intelligence) {
      const cards = generateTopicFlashcards(unified, intelligence.cleanChunks, intelligence.relationships)
      setDrawerFlashcards(cards)
    }
  }, [intelligence])

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') setDrawerOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const reset = () => {
    clear()
    clearDocumentIntelligenceCache()
    setIntelligence(null)
    setChatMessages([])
    setSearchResults([])
  }

  const canonicalTopics = (densityMode === 'core' && intelligence?.visibleGraphTopics && intelligence.visibleGraphTopics.length)
    ? intelligence.visibleGraphTopics
    : ((intelligence?.topics && intelligence.topics.length)
      ? intelligence.topics
      : (intelligence?.entities || []))

  const canonicalRelationships = (densityMode === 'core' && intelligence?.visibleGraphRelationships && intelligence.visibleGraphRelationships.length)
    ? intelligence.visibleGraphRelationships
    : (intelligence?.relationships || [])

  const domains = ['All', ...new Set(canonicalTopics.map(t => t.domain || t.type || 'General'))]

  const limitedTopics = densityMode === 'core'
    ? canonicalTopics.slice(0, 20)
    : canonicalTopics

  const visibleNodes = limitedTopics.filter(t => filterType === 'All' || (t.domain || t.type || 'General') === filterType)

  // Compute radial domain cluster layout
  const domainList = Array.from(new Set(visibleNodes.map(t => t.domain || t.type || 'General')))
  const domainAngleMap = new Map()
  domainList.forEach((d, idx) => {
    domainAngleMap.set(d, (idx / Math.max(1, domainList.length)) * 2 * Math.PI)
  })

  const nodePositions = new Map()
  const domainCounts = new Map()
  visibleNodes.forEach((t) => {
    const d = t.domain || t.type || 'General'
    const count = domainCounts.get(d) || 0
    domainCounts.set(d, count + 1)

    const angleD = domainAngleMap.get(d) || 0
    const cx = 350 + Math.cos(angleD) * 160
    const cy = 240 + Math.sin(angleD) * 135

    const subAngle = angleD + (count * 0.95)
    const subRadius = 40 + (count % 3) * 24
    const x = Math.max(65, Math.min(635, Math.round(cx + Math.cos(subAngle) * subRadius)))
    const y = Math.max(45, Math.min(435, Math.round(cy + Math.sin(subAngle) * subRadius)))
    nodePositions.set(t.id, { x, y })
  })

  const activeTopicId = selectedNode?.id || hoveredNodeId
  const connectedEdges = (canonicalRelationships || []).filter(r => r.sourceId === activeTopicId || r.targetId === activeTopicId)
  const connectedTopicIds = new Set(connectedEdges.flatMap(r => [r.sourceId, r.targetId]))
  if (activeTopicId) connectedTopicIds.add(activeTopicId)

  return (
    <ToolShell tool={tool} onBack={onBack}>
      {!pdf.doc ? (
        <div style={{ maxWidth: '520px', margin: '40px auto', textAlign: 'center' }}>
          <div style={{ fontSize: '40px', marginBottom: '10px' }}>📄</div>
          <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '6px', color: 'var(--ink)' }}>
            Reopen the document to continue
          </h3>
          <p style={{ color: 'var(--sub)', fontSize: '13px', marginBottom: '20px', lineHeight: '1.5' }}>
            Open or drop a PDF to explore its Knowledge Graph, Mind Map, Topic Quizzes, and Semantic Search without server processing.
          </p>
          <DropArea
            label="Choose PDF or drop here"
            hint="PDF files up to 200MB (fully local & privacy-preserving)"
            onFiles={f => open(f[0])}
          />
        </div>
      ) : (
        <div>
          {/* Top Document Strip & Tabs */}
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '10px', padding: '12px 16px', marginBottom: '14px', boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <PageThumb doc={pdf.doc} index={0} width={42} />
                <div>
                  <strong style={{ fontSize: '14.5px', color: 'var(--ink)' }}>{pdf.name}</strong>
                  <div style={{ fontSize: '12px', color: 'var(--sub)', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                    <span>{pdf.count} pages · {prettySize(pdf.size)}</span>
                    <span style={{ background: '#ecfdf5', color: '#047857', padding: '2px 6px', borderRadius: '4px', fontWeight: '600' }}>
                      ⚡ {hardware?.recommendedBackend || 'Local WASM'}
                    </span>
                  </div>
                </div>
              </div>

              <button className="btn btn-white sm" onClick={reset}>
                Choose another file
              </button>
            </div>

            {/* Document Intelligence Tabs */}
            <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', borderTop: '1px solid var(--line)', paddingTop: '10px' }}>
              {[
                ['overview', '📋 Overview'],
                ['ask', '💬 Ask PDF'],
                ['search', '🔎 Semantic Search'],
                ['knowledgemap', '🗺️ Knowledge Map'],
                ['export', '📦 Export'],
                ['models', '⚙️ Models']
              ].map(([tKey, label]) => (
                <button
                  key={tKey}
                  className={`btn sm ${tab === tKey ? 'btn-primary' : 'btn-white'}`}
                  style={{
                    borderRadius: '6px',
                    fontSize: '12px',
                    padding: '5px 12px',
                    height: '28px',
                    background: tab === tKey ? 'var(--ink)' : '#fff',
                    color: tab === tKey ? '#fff' : 'var(--sub)',
                    borderColor: tab === tKey ? 'var(--ink)' : 'var(--line)'
                  }}
                  onClick={() => setTab(tKey)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {loading && (
            <div style={{ background: '#f8fafc', border: '1px solid var(--line)', borderRadius: '10px', padding: '20px', textAlign: 'center', marginBottom: '16px' }}>
              <div className="spinner" style={{ margin: '0 auto 12px', width: '28px', height: '28px' }} />
              <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--ink)', marginBottom: '4px' }}>
                {progress.label || 'Analyzing document…'}
              </div>
              <div className="ocr-bar" style={{ maxWidth: '320px', margin: '0 auto' }}>
                <span style={{ width: `${progress.percent || 20}%` }} />
              </div>
            </div>
          )}

          {/* TAB 1: OVERVIEW & CLASSIFICATION */}
          {tab === 'overview' && intelligence && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Classification Card */}
              <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '10px', padding: '16px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '20px' }}>
                      {intelligence.documentType === 'INVOICE' ? '🧾' :
                       intelligence.documentType === 'CONTRACT' ? '📜' :
                       intelligence.documentType === 'EDUCATIONAL' ? '🎓' :
                       intelligence.documentType === 'FINANCIAL_STATEMENT' ? '🏦' :
                       intelligence.documentType === 'RESUME' ? '👤' :
                       intelligence.documentType === 'RESEARCH' ? '🔬' :
                       intelligence.documentType === 'BUSINESS_REPORT' ? '📊' : '📄'}
                    </span>
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--ink)' }}>
                        Detected: {intelligence.typeLabel}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--sub)' }}>
                        Confidence: <strong>{intelligence.classificationConfidence}%</strong>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--sub)' }}>Change Type:</span>
                    {['INVOICE', 'CONTRACT', 'EDUCATIONAL', 'RESEARCH', 'BUSINESS_REPORT', 'GENERAL'].map(tKey => (
                      <button
                        key={tKey}
                        className="btn btn-white sm"
                        style={{
                          fontSize: '11px',
                          padding: '3px 8px',
                          height: '24px',
                          background: intelligence.documentType === tKey ? 'var(--ink)' : '#fff',
                          color: intelligence.documentType === tKey ? '#fff' : 'var(--sub)'
                        }}
                        onClick={() => handleOverrideType(tKey)}
                      >
                        {DOCUMENT_TYPES[tKey]?.split('/')[0] || tKey}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Collapsible Evidence Accordion */}
                <div style={{ borderTop: '1px solid var(--line)', paddingTop: '10px', marginTop: '10px' }}>
                  <button
                    onClick={() => setWhyOpen(w => !w)}
                    style={{ fontSize: '12px', fontWeight: '600', color: 'var(--green-dark)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <span>{whyOpen ? '▾' : '▸'} Why was this detected?</span>
                  </button>

                  {whyOpen && (
                    <div style={{ marginTop: '8px', padding: '10px 14px', background: '#f8fafc', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '12.5px', color: 'var(--sub)' }}>
                      <div style={{ fontWeight: '600', marginBottom: '4px', color: 'var(--ink)' }}>Identified Characteristics:</div>
                      <ul style={{ margin: 0, paddingLeft: '18px', lineHeight: '1.6' }}>
                        {intelligence.characteristics.map((c, ci) => (
                          <li key={ci}>{c}</li>
                        ))}
                      </ul>
                      <div style={{ marginTop: '6px', fontSize: '11.5px', color: 'var(--muted)' }}>
                        Active Pipeline Features: {intelligence.pipeline.features.join(' · ')}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Statistics Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '10px', padding: '14px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--sub)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Document Pages</div>
                  <div style={{ fontSize: '24px', fontWeight: '700', marginTop: '4px', color: 'var(--ink)' }}>{intelligence.metadata.numPages}</div>
                </div>
                <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '10px', padding: '14px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--sub)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Headings & Sections</div>
                  <div style={{ fontSize: '24px', fontWeight: '700', marginTop: '4px', color: 'var(--ink)' }}>{intelligence.metadata.headingsCount}</div>
                </div>
                <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '10px', padding: '14px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--sub)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Clean Chunks</div>
                  <div style={{ fontSize: '24px', fontWeight: '700', marginTop: '4px', color: 'var(--ink)' }}>{intelligence.metadata.chunksCount}</div>
                </div>
                <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '10px', padding: '14px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--sub)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Verified Entities</div>
                  <div style={{ fontSize: '24px', fontWeight: '700', marginTop: '4px', color: 'var(--green-dark)' }}>{intelligence.entities.length}</div>
                </div>
              </div>

              {/* Quick Intelligence Action Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                <button
                  className="home-card"
                  style={{ cursor: 'pointer', margin: 0 }}
                  onClick={() => setTab('ask')}
                >
                  <strong style={{ fontSize: '14px', display: 'block', marginBottom: '4px' }}>💬 Ask Document</strong>
                  <span style={{ fontSize: '12px', color: 'var(--sub)' }}>Ask specific questions with exact page references</span>
                </button>
                <button
                  className="home-card"
                  style={{ cursor: 'pointer', margin: 0 }}
                  onClick={() => setTab('graph')}
                >
                  <strong style={{ fontSize: '14px', display: 'block', marginBottom: '4px' }}>🕸️ Knowledge Graph</strong>
                  <span style={{ fontSize: '12px', color: 'var(--sub)' }}>Explore mapped concepts, metrics and entities</span>
                </button>
                <button
                  className="home-card"
                  style={{ cursor: 'pointer', margin: 0 }}
                  onClick={() => setTab('mindmap')}
                >
                  <strong style={{ fontSize: '14px', display: 'block', marginBottom: '4px' }}>🗺️ Mind Map</strong>
                  <span style={{ fontSize: '12px', color: 'var(--sub)' }}>Interactive visual hierarchy of topics & chapters</span>
                </button>
                <button
                  className="home-card"
                  style={{ cursor: 'pointer', margin: 0 }}
                  onClick={() => setTab('search')}
                >
                  <strong style={{ fontSize: '14px', display: 'block', marginBottom: '4px' }}>🔎 Semantic Search</strong>
                  <span style={{ fontSize: '12px', color: 'var(--sub)' }}>Search by meaning rather than exact words</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: ASK (CHAT WITH PDF) */}
          {tab === 'ask' && intelligence && (
            <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '520px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
              <div style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {chatMessages.map((m, idx) => (
                  <div
                    key={idx}
                    style={{
                      alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '85%',
                      padding: '12px 16px',
                      borderRadius: '10px',
                      background: m.role === 'user' ? 'var(--ink)' : '#f8fafc',
                      color: m.role === 'user' ? '#fff' : 'var(--ink)',
                      border: m.role === 'user' ? 'none' : '1px solid var(--line)',
                      fontSize: '13.5px',
                      lineHeight: '1.6'
                    }}
                  >
                    <div>{m.text}</div>
                    {m.citation && (
                      <div style={{ fontSize: '11px', marginTop: '8px', color: m.role === 'user' ? '#cbd5e1' : 'var(--green-dark)', fontWeight: '600' }}>
                        {m.citation}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <form onSubmit={handleAsk} style={{ display: 'flex', gap: '8px', padding: '12px', borderTop: '1px solid var(--line)', background: '#fafbfa' }}>
                <input
                  type="text"
                  placeholder='Ask anything about this document (e.g. "What are the payment terms?", "Summarize findings")...'
                  className="tool-input"
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  style={{ flex: 1, margin: 0, height: '40px' }}
                />
                <button type="submit" className="btn btn-primary" disabled={!question.trim()}>
                  Ask
                </button>
              </form>
            </div>
          )}

          {/* TAB 3: SEMANTIC SEARCH */}
          {tab === 'search' && intelligence && (
            <div>
              <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <input
                  type="text"
                  placeholder='Search by meaning (e.g. "How is authentication handled?", "Financial growth numbers")...'
                  className="tool-input"
                  style={{ flex: 1, margin: 0, height: '42px', fontSize: '13.5px' }}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
                <button type="submit" className="btn btn-primary" disabled={!searchQuery.trim()}>
                  Search Meaning
                </button>
              </form>

              {searchResults.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--sub)' }}>
                    Top Semantic Matches ({searchResults.length}):
                  </div>
                  {searchResults.map((r, i) => (
                    <div
                      key={i}
                      style={{
                        background: '#fff',
                        border: '1px solid var(--line)',
                        borderRadius: '8px',
                        padding: '14px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '11px', background: '#ecfdf5', color: '#047857', fontWeight: '700', padding: '2px 6px', borderRadius: '4px' }}>
                          {Math.round(r.score * 100)}% Match
                        </span>
                        <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--sub)' }}>
                          Page {r.page}
                        </span>
                      </div>
                      <div style={{ fontSize: '13.5px', lineHeight: '1.55', color: 'var(--ink)' }}>
                        "{r.text}"
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ border: '2px dashed var(--line)', borderRadius: '10px', padding: '40px', textAlign: 'center', color: 'var(--sub)', fontSize: '13px' }}>
                  Type a concept above to query local vector embeddings and find relevant sections by meaning.
                </div>
              )}
            </div>
          )}

          {/* TAB 4: KNOWLEDGE MAP (Unified Mind Map + Knowledge Graph) */}
          {tab === 'knowledgemap' && intelligence && (
            <div>
              {intelligence.graphQualityReport?.status === 'PARTIAL_READY' && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '10px 14px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12.5px', color: '#92400e' }}>
                  <span style={{ fontSize: '16px' }}>⚠️</span>
                  <div>
                    <strong>PARTIAL_READY:</strong> Knowledge graph refined with quality warnings: {intelligence.graphQualityReport.warnings.join('; ')}
                  </div>
                </div>
              )}

              {/* Full-width Knowledge Map Card */}
              <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', position: 'relative' }}>
                
                {/* Simplified Unified Toolbar */}
                <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', flexWrap: 'wrap', gap: '8px' }}>
                  {/* Left: View Switcher & Topic Density */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', background: '#e2e8f0', borderRadius: '6px', padding: '2px' }}>
                      <button
                        className="btn sm"
                        style={{
                          height: '24px',
                          fontSize: '11.5px',
                          padding: '0 10px',
                          background: kmView === 'mindmap' ? '#fff' : 'transparent',
                          color: kmView === 'mindmap' ? 'var(--ink)' : 'var(--sub)',
                          fontWeight: kmView === 'mindmap' ? '600' : '400',
                          border: 'none',
                          borderRadius: '4px',
                          boxShadow: kmView === 'mindmap' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                        }}
                        onClick={() => { setKmView('mindmap'); persistKmState({ kmView: 'mindmap' }) }}
                      >
                        🗺️ Mind Map
                      </button>
                      <button
                        className="btn sm"
                        style={{
                          height: '24px',
                          fontSize: '11.5px',
                          padding: '0 10px',
                          background: kmView === 'graph' ? '#fff' : 'transparent',
                          color: kmView === 'graph' ? 'var(--ink)' : 'var(--sub)',
                          fontWeight: kmView === 'graph' ? '600' : '400',
                          border: 'none',
                          borderRadius: '4px',
                          boxShadow: kmView === 'graph' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                        }}
                        onClick={() => { setKmView('graph'); persistKmState({ kmView: 'graph' }) }}
                      >
                        🕸️ Knowledge Graph
                      </button>
                    </div>

                    <div style={{ display: 'flex', background: '#e2e8f0', borderRadius: '6px', padding: '2px' }}>
                      <button
                        className="btn sm"
                        style={{
                          height: '24px',
                          fontSize: '11px',
                          padding: '0 8px',
                          background: densityMode === 'core' ? '#fff' : 'transparent',
                          color: densityMode === 'core' ? 'var(--ink)' : 'var(--sub)',
                          fontWeight: densityMode === 'core' ? '600' : '400',
                          border: 'none',
                          borderRadius: '4px',
                          boxShadow: densityMode === 'core' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                        }}
                        onClick={() => setDensityMode('core')}
                      >
                        Core Topics
                      </button>
                      <button
                        className="btn sm"
                        style={{
                          height: '24px',
                          fontSize: '11px',
                          padding: '0 8px',
                          background: densityMode === 'all' ? '#fff' : 'transparent',
                          color: densityMode === 'all' ? 'var(--ink)' : 'var(--sub)',
                          fontWeight: densityMode === 'all' ? '600' : '400',
                          border: 'none',
                          borderRadius: '4px',
                          boxShadow: densityMode === 'all' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                        }}
                        onClick={() => setDensityMode('all')}
                      >
                        All ({canonicalTopics.length})
                      </button>
                    </div>

                    {kmView === 'graph' && domains.slice(0, 4).map(t => (
                      <button
                        key={t}
                        className="btn btn-white sm"
                        style={{
                          height: '24px',
                          fontSize: '11px',
                          padding: '0 8px',
                          background: filterType === t ? 'var(--ink)' : '#fff',
                          color: filterType === t ? '#fff' : 'var(--ink)'
                        }}
                        onClick={() => setFilterType(t)}
                      >
                        {t}
                      </button>
                    ))}

                    {kmView === 'mindmap' && (
                      <div style={{ display: 'flex', gap: '3px' }}>
                        <button
                          className="btn btn-white sm"
                          style={{ height: '24px', fontSize: '10.5px', padding: '0 8px' }}
                          onClick={() => {
                            setCollapsedNodeIds(new Set())
                            persistKmState({ collapsedNodeIds: [] })
                          }}
                        >
                          ➕ Expand All
                        </button>
                        <button
                          className="btn btn-white sm"
                          style={{ height: '24px', fontSize: '10.5px', padding: '0 8px' }}
                          onClick={() => {
                            const allParents = new Set()
                            if (intelligence?.mindmapTree) {
                              function collect(n) {
                                if (n.children && n.children.length > 0 && n.depth !== 0) allParents.add(n.id)
                                (n.children || []).forEach(collect)
                              }
                              collect(intelligence.mindmapTree)
                            }
                            setCollapsedNodeIds(allParents)
                            persistKmState({ collapsedNodeIds: Array.from(allParents) })
                          }}
                        >
                          ➖ Collapse
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Middle: Real-time Search Filter */}
                  <div style={{ flex: '1 1 180px', maxWidth: '280px', position: 'relative' }}>
                    <input
                      type="text"
                      placeholder="Search topics..."
                      value={kmSearchQuery}
                      onChange={e => setKmSearchQuery(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '4px 26px 4px 8px',
                        fontSize: '11.5px',
                        borderRadius: '6px',
                        border: '1px solid var(--line)',
                        background: '#fff',
                        boxSizing: 'border-box'
                      }}
                    />
                    {kmSearchQuery && (
                      <button
                        style={{
                          position: 'absolute',
                          right: '6px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          border: 'none',
                          background: 'none',
                          cursor: 'pointer',
                          fontSize: '12px',
                          color: 'var(--sub)'
                        }}
                        onClick={() => setKmSearchQuery('')}
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Right: Zoom & Navigation Controls */}
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <button
                      className="btn btn-white sm"
                      style={{ height: '24px', padding: '0 6px' }}
                      onClick={() => {
                        if (kmView === 'graph') setGraphZoom(z => Math.max(0.25, z - 0.15))
                        else setMmZoom(z => Math.max(0.25, z - 0.15))
                      }}
                    >
                      −
                    </button>
                    <span style={{ fontSize: '11px', color: 'var(--sub)', minWidth: '34px', textAlign: 'center' }}>
                      {Math.round((kmView === 'graph' ? graphZoom : mmZoom) * 100)}%
                    </span>
                    <button
                      className="btn btn-white sm"
                      style={{ height: '24px', padding: '0 6px' }}
                      onClick={() => {
                        if (kmView === 'graph') setGraphZoom(z => Math.min(4, z + 0.15))
                        else setMmZoom(z => Math.min(4, z + 0.15))
                      }}
                    >
                      +
                    </button>
                    <button
                      className="btn btn-white sm"
                      style={{ height: '24px', padding: '0 8px', fontSize: '11px' }}
                      onClick={() => {
                        if (kmView === 'graph') {
                          setGraphZoom(1)
                          setGraphPan({ x: 0, y: 0 })
                          persistKmState({ graphZoom: 1, graphPan: { x: 0, y: 0 } })
                        } else {
                          setMmZoom(1)
                          setMmPan({ x: 0, y: 0 })
                          persistKmState({ mmZoom: 1, mmPan: { x: 0, y: 0 } })
                        }
                      }}
                    >
                      ⛶ Fit View
                    </button>
                    <button
                      className="btn btn-white sm"
                      style={{ height: '24px', padding: '0 8px', fontSize: '11px' }}
                      disabled={!drawerNode}
                      onClick={() => {
                        if (!drawerNode) return
                        if (kmView === 'graph') {
                          const pos = customNodePositions[drawerNode.id] || nodePositions.get(drawerNode.id)
                          if (pos) {
                            setGraphPan({
                              x: (canvasDimensions.width / 2) - pos.x * graphZoom,
                              y: (canvasDimensions.height / 2) - pos.y * graphZoom
                            })
                          }
                        } else {
                          setMmPan({ x: 40, y: 60 })
                        }
                      }}
                    >
                      🎯 Center Selected
                    </button>
                    <button
                      className="btn btn-white sm"
                      style={{ height: '24px', padding: '0 8px', fontSize: '11px' }}
                      onClick={() => {
                        setCustomNodePositions({})
                        setGraphZoom(1)
                        setGraphPan({ x: 0, y: 0 })
                        setMmZoom(1)
                        setMmPan({ x: 0, y: 0 })
                        if (storageKey) {
                          try {
                            localStorage.removeItem(storageKey)
                          } catch {}
                        }
                      }}
                    >
                      ↺ Reset Layout
                    </button>
                  </div>
                </div>

                {/* Full-width Map Canvas Container */}
                <div
                  ref={canvasContainerRef}
                  style={{
                    height: '520px',
                    position: 'relative',
                    overflow: 'hidden',
                    background: '#fafbfc',
                    cursor: (kmView === 'graph' ? graphIsDragging : mmIsDragging) ? 'grabbing' : 'grab'
                  }}
                  {...(kmView === 'graph' ? kgHandlers : mmHandlers)}
                >
                  {/* VIEW 1: KNOWLEDGE GRAPH */}
                  {kmView === 'graph' && (
                    <svg
                      width="100%"
                      height="100%"
                      viewBox={`0 0 ${canvasDimensions.width} ${canvasDimensions.height}`}
                      style={{ display: 'block' }}
                    >
                      <defs>
                        <marker id="km-arrow" viewBox="0 0 10 10" refX="24" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                          <path d="M 0 0 L 10 5 L 0 10 z" fill="#047857" />
                        </marker>
                        <marker id="km-arrow-neutral" viewBox="0 0 10 10" refX="24" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
                        </marker>
                      </defs>

                      <g transform={`translate(${graphPan.x}, ${graphPan.y}) scale(${graphZoom})`}>
                        {/* Evidenced Semantic Edges */}
                        {(canonicalRelationships || []).map((rel, ri) => {
                          const p1 = customNodePositions[rel.sourceId] || nodePositions.get(rel.sourceId)
                          const p2 = customNodePositions[rel.targetId] || nodePositions.get(rel.targetId)
                          if (!p1 || !p2) return null

                          const isConnectedToActive = activeTopicId && (rel.sourceId === activeTopicId || rel.targetId === activeTopicId)
                          const isDimmed = activeTopicId && !isConnectedToActive
                          const midX = (p1.x + p2.x) / 2
                          const midY = (p1.y + p2.y) / 2
                          const predLabel = (rel.predicate || 'relates_to').replace(/_/g, ' ')

                          return (
                            <g key={`edge_${ri}`} opacity={isDimmed ? 0.15 : 1} style={{ transition: 'opacity 0.2s' }}>
                              <line
                                x1={p1.x}
                                y1={p1.y}
                                x2={p2.x}
                                y2={p2.y}
                                stroke={isConnectedToActive ? '#047857' : '#94a3b8'}
                                strokeWidth={isConnectedToActive ? 2.5 : 1.3}
                                strokeDasharray={rel.predicate === 'contrasts_with' ? '4 3' : 'none'}
                                markerEnd={isConnectedToActive ? 'url(#km-arrow)' : 'url(#km-arrow-neutral)'}
                              />
                              <text
                                x={midX}
                                y={midY - 4}
                                textAnchor="middle"
                                fontSize="9"
                                fill={isConnectedToActive ? '#065f46' : '#64748b'}
                                fontWeight={isConnectedToActive ? '700' : '500'}
                                style={{ pointerEvents: 'none', userSelect: 'none' }}
                              >
                                {predLabel}
                              </text>
                            </g>
                          )
                        })}

                        {/* Domain Cluster Nodes */}
                        {visibleNodes.map((t) => {
                          const basePos = nodePositions.get(t.id) || { x: 350, y: 240 }
                          const pos = customNodePositions[t.id] || basePos
                          const isSelected = (selectedNode?.id === t.id) || (drawerNode?.id === t.id)
                          const isHovered = hoveredNodeId === t.id
                          const isConnected = connectedTopicIds.has(t.id)
                          const isDimmed = activeTopicId && !isConnected
                          const matchesSearch = kmSearchQuery && t.name.toLowerCase().includes(kmSearchQuery.toLowerCase())
                          const color = t.domainColor || '#0284c7'
                          const pLabel = t.displayPageLabel || String(t.pdfPageNumber || t.page || 1)

                          return (
                            <g
                              key={t.id}
                              transform={`translate(${pos.x}, ${pos.y})`}
                              data-node="true"
                              onClick={() => {
                                setSelectedNode(t)
                                openDrawer(t)
                              }}
                              onDoubleClick={() => {
                                setGraphPan({
                                  x: (canvasDimensions.width / 2) - pos.x * graphZoom,
                                  y: (canvasDimensions.height / 2) - pos.y * graphZoom
                                })
                              }}
                              onMouseEnter={(e) => {
                                setHoveredNodeId(t.id)
                                const rect = canvasContainerRef.current?.getBoundingClientRect()
                                if (rect) {
                                  setHoverPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
                                  setHoveredNode(t)
                                }
                              }}
                              onMouseLeave={() => {
                                setHoveredNodeId(null)
                                setHoveredNode(null)
                              }}
                              style={{ cursor: 'pointer', transition: 'opacity 0.2s' }}
                              opacity={isDimmed && !matchesSearch ? 0.25 : 1}
                            >
                              <circle
                                r={isSelected ? 26 : (isHovered ? 24 : 20)}
                                fill={isSelected ? color : '#ffffff'}
                                stroke={matchesSearch ? '#f59e0b' : color}
                                strokeWidth={isSelected ? 3.5 : (matchesSearch ? 3.5 : 2)}
                                filter={isSelected || matchesSearch ? 'drop-shadow(0 2px 6px rgba(0,0,0,0.18))' : 'none'}
                              />
                              <text
                                y="4"
                                textAnchor="middle"
                                fontSize="11"
                                fontWeight="700"
                                fill={isSelected ? '#ffffff' : color}
                                style={{ pointerEvents: 'none', userSelect: 'none' }}
                              >
                                {t.name.slice(0, 2).toUpperCase()}
                              </text>
                              <text
                                y="34"
                                textAnchor="middle"
                                fontSize="10.5"
                                fontWeight={isSelected ? '700' : '600'}
                                fill={isSelected ? 'var(--ink)' : '#334155'}
                                style={{ pointerEvents: 'none', userSelect: 'none' }}
                              >
                                {t.name.length > 20 ? t.name.slice(0, 18) + '…' : t.name}
                              </text>
                              <text
                                y="46"
                                textAnchor="middle"
                                fontSize="9"
                                fill="var(--sub)"
                                style={{ pointerEvents: 'none', userSelect: 'none' }}
                              >
                                p. {pLabel}
                              </text>
                            </g>
                          )
                        })}
                      </g>
                    </svg>
                  )}

                  {/* VIEW 2: MIND MAP TREE */}
                  {kmView === 'mindmap' && (() => {
                    const visibleTreeRows = []
                    function flattenTree(node, depth, parentY = null) {
                      if (!node) return
                      const y = visibleTreeRows.length * 52 + 30
                      const isCollapsed = collapsedNodeIds.has(node.id)
                      const hasChildren = node.children && node.children.length > 0
                      visibleTreeRows.push({ node, depth, y, parentY, isCollapsed, hasChildren })
                      if (hasChildren && !isCollapsed) {
                        for (const child of node.children) {
                          flattenTree(child, depth + 1, y)
                        }
                      }
                    }
                    flattenTree(intelligence.mindmapTree, 0)
                    const totalSvgHeight = Math.max(520, visibleTreeRows.length * 52 + 60)

                    return (
                      <svg
                        ref={svgRef}
                        width="100%"
                        height="100%"
                        viewBox={`0 0 ${Math.max(900, canvasDimensions.width)} ${totalSvgHeight}`}
                        style={{ display: 'block' }}
                      >
                        <g transform={`translate(${mmPan.x}, ${mmPan.y}) scale(${mmZoom})`}>
                          {visibleTreeRows.map((row) => {
                            const { node, depth, y, parentY, isCollapsed, hasChildren } = row
                            const x = depth === 0 ? 30 : (depth === 1 ? 230 : (depth === 2 ? 460 : 690))
                            const w = depth === 0 ? 175 : 195
                            const h = 36
                            const isSelected = selectedMmNode?.id === node.id || drawerNode?.id === node.id
                            const parentX = depth === 1 ? 205 : (depth === 2 ? 425 : 655)
                            const matchesSearch = kmSearchQuery && (node.title || node.name || '').toLowerCase().includes(kmSearchQuery.toLowerCase())
                            const pLabel = node.displayPageLabel || String(node.pdfPageNumber || node.page || 1)

                            return (
                              <g key={node.id}>
                                {parentY != null && (
                                  <path
                                    d={`M ${parentX} ${parentY + 18} C ${parentX + 25} ${parentY + 18}, ${x - 25} ${y + 18}, ${x} ${y + 18}`}
                                    fill="none"
                                    stroke={isSelected ? '#059669' : '#cbd5e1'}
                                    strokeWidth={isSelected ? 2.5 : 1.5}
                                  />
                                )}

                                <g
                                  transform={`translate(${x}, ${y})`}
                                  data-node="true"
                                  onClick={() => {
                                    setSelectedMmNode(node)
                                    openDrawer(node)
                                  }}
                                  onDoubleClick={() => {
                                    setMmPan({ x: 40, y: (canvasDimensions.height / 2) - y * mmZoom })
                                  }}
                                  onMouseEnter={(e) => {
                                    const rect = canvasContainerRef.current?.getBoundingClientRect()
                                    if (rect) {
                                      setHoverPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
                                      setHoveredNode(node)
                                    }
                                  }}
                                  onMouseLeave={() => setHoveredNode(null)}
                                  style={{ cursor: 'pointer' }}
                                >
                                  <rect
                                    width={w}
                                    height={h}
                                    rx="8"
                                    fill={isSelected ? (depth === 0 ? 'var(--ink)' : '#ecfdf5') : (depth === 0 ? '#1e293b' : (node.synthetic ? '#fefce8' : '#ffffff'))}
                                    stroke={matchesSearch ? '#f59e0b' : (isSelected ? '#059669' : (node.synthetic ? '#fde047' : '#e2e8f0'))}
                                    strokeWidth={isSelected ? 2.2 : (matchesSearch ? 2.5 : 1.2)}
                                    filter={isSelected ? 'drop-shadow(0 2px 5px rgba(0,0,0,0.08))' : 'none'}
                                  />

                                  <text
                                    x="10"
                                    y="17"
                                    fontSize="11.5"
                                    fontWeight={depth === 0 ? '700' : '600'}
                                    fill={isSelected && depth === 0 ? '#fff' : (depth === 0 ? '#fff' : (isSelected ? '#065f46' : 'var(--ink)'))}
                                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                                  >
                                    {(node.title || node.name || '').length > 22 ? (node.title || node.name || '').slice(0, 20) + '…' : (node.title || node.name || '')}
                                  </text>

                                  <text
                                    x="10"
                                    y="29"
                                    fontSize="9"
                                    fill={depth === 0 ? '#94a3b8' : 'var(--sub)'}
                                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                                  >
                                    {node.synthetic ? '⚙ group' : `p. ${pLabel}`}
                                  </text>

                                  {hasChildren && (
                                    <g
                                      transform={`translate(${w - 22}, 8)`}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setCollapsedNodeIds(prev => {
                                          const next = new Set(prev)
                                          if (next.has(node.id)) next.delete(node.id)
                                          else next.add(node.id)
                                          persistKmState({ collapsedNodeIds: Array.from(next) })
                                          return next
                                        })
                                      }}
                                    >
                                      <circle r="8" cx="8" cy="8" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1" />
                                      <text x="8" y="11.5" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#475569">
                                        {isCollapsed ? '+' : '−'}
                                      </text>
                                    </g>
                                  )}
                                </g>
                              </g>
                            )
                          })}
                        </g>
                      </svg>
                    )
                  })()}

                  {/* Lightweight Node Hover Preview Tooltip */}
                  {hoveredNode && (
                    <div
                      style={{
                        position: 'absolute',
                        left: Math.min(canvasDimensions.width - 240, hoverPos.x + 14),
                        top: Math.max(10, hoverPos.y - 10),
                        background: '#0f172a',
                        color: '#fff',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                        maxWidth: '260px',
                        pointerEvents: 'none',
                        zIndex: 30,
                        fontSize: '12px'
                      }}
                    >
                      <div style={{ fontWeight: '700', fontSize: '12.5px', marginBottom: '4px', color: '#f8fafc' }}>
                        {hoveredNode.title || hoveredNode.name || 'Concept'}
                      </div>
                      <div style={{ color: '#94a3b8', fontSize: '11px', lineHeight: '1.45', marginBottom: '6px' }}>
                        {hoveredNode.summary && hoveredNode.summary.length >= 20 && !/Summary unavailable/i.test(hoveredNode.summary)
                          ? (hoveredNode.summary.length > 120 ? hoveredNode.summary.slice(0, 115) + '…' : hoveredNode.summary)
                          : 'Supporting concept identified in the document.'}
                      </div>
                      <div style={{ fontSize: '10px', color: '#38bdf8', fontWeight: '600' }}>
                        {formatTopicSourcesString(hoveredNode) || `Page ${hoveredNode.displayPageLabel || hoveredNode.pdfPageNumber || 1}`}
                      </div>
                    </div>
                  )}

                  {/* Collapsible Bottom Drawer */}
                  {drawerOpen && drawerNode && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        background: '#ffffff',
                        borderTop: '2px solid #e2e8f0',
                        boxShadow: '0 -6px 25px rgba(0,0,0,0.12)',
                        zIndex: 40,
                        height: drawerExpanded ? '460px' : '260px',
                        transition: 'height 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
                        display: 'flex',
                        flexDirection: 'column'
                      }}
                    >
                      {/* Drawer Header Strip */}
                      <div
                        style={{
                          padding: '8px 16px',
                          borderBottom: '1px solid #f1f5f9',
                          background: '#f8fafc',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '8px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '14.5px', fontWeight: '700', color: 'var(--ink)' }}>
                            {drawerNode.label || drawerNode.name}
                          </span>
                          <span style={{ fontSize: '11px', background: '#e2e8f0', color: '#475569', padding: '1px 7px', borderRadius: '4px', fontWeight: '600' }}>
                            {drawerNode.domain || drawerNode.type || 'Concept'}
                          </span>
                          {drawerNode.synthetic && (
                            <span style={{ fontSize: '11px', background: '#fef3c7', color: '#92400e', padding: '1px 7px', borderRadius: '4px', fontWeight: '600' }}>
                              ⚙ Synthetic Group
                            </span>
                          )}
                          <span style={{ fontSize: '11px', color: 'var(--sub)' }}>
                            {formatTopicSourcesString(drawerNode)}
                          </span>
                        </div>

                        {/* Action Navigation Tabs & Controls */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {[
                            ['summary', '📄 Summary'],
                            ['ask', '💬 Ask This Topic'],
                            ['quiz', '⚡ Generate Quiz'],
                            ['flashcards', `🗂️ Flashcards (${drawerFlashcards.length || 0})`],
                            ['sources', `📖 Sources (${drawerNode.sourceChunkIds?.length || 1})`]
                          ].map(([sKey, sLabel]) => (
                            <button
                              key={sKey}
                              className="btn sm"
                              style={{
                                height: '24px',
                                fontSize: '11px',
                                padding: '0 8px',
                                background: drawerSection === sKey ? 'var(--ink)' : '#fff',
                                color: drawerSection === sKey ? '#fff' : 'var(--ink)',
                                border: '1px solid var(--line)',
                                borderRadius: '4px'
                              }}
                              onClick={() => setDrawerSection(sKey)}
                            >
                              {sLabel}
                            </button>
                          ))}

                          <button
                            className="btn btn-white sm"
                            style={{ height: '24px', padding: '0 8px', fontSize: '11px' }}
                            title={drawerExpanded ? 'Minimize drawer' : 'Expand drawer'}
                            onClick={() => setDrawerExpanded(exp => !exp)}
                          >
                            {drawerExpanded ? '⤡' : '⤢'}
                          </button>
                          <button
                            className="btn btn-white sm"
                            style={{ height: '24px', padding: '0 8px', fontSize: '11px', fontWeight: '700' }}
                            title="Close drawer (Esc)"
                            onClick={() => setDrawerOpen(false)}
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {/* Drawer Body Area */}
                      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', background: '#fff' }}>
                        
                        {/* 1. DEFAULT SUMMARY SECTION */}
                        {drawerSection === 'summary' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ background: '#f8fafc', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px 16px', fontSize: '13px', lineHeight: '1.6', color: 'var(--ink)' }}>
                              {drawerNode.summary || 'Summary unavailable — insufficient source evidence.'}
                            </div>

                            {/* Key Points */}
                            {drawerNode.keyPoints && drawerNode.keyPoints.length > 0 && (
                              <div>
                                <div style={{ fontSize: '11.5px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--sub)', marginBottom: '6px' }}>
                                  📌 Key Points
                                </div>
                                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12.5px', lineHeight: '1.55', color: '#334155' }}>
                                  {drawerNode.keyPoints.map((kp, kpi) => (
                                    <li key={kpi} style={{ marginBottom: '3px' }}>{kp}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Semantic Relationships & Mind Map Hierarchy */}
                            <div>
                              <div style={{ fontSize: '11.5px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--sub)', marginBottom: '6px' }}>
                                🔗 Relationships & Hierarchy
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', fontSize: '12px' }}>
                                {drawerNode.parentLabel && (
                                  <span style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '3px 8px' }}>
                                    Parent: <strong>{drawerNode.parentLabel}</strong>
                                  </span>
                                )}
                                {drawerNode.childLabels && drawerNode.childLabels.length > 0 && (
                                  drawerNode.childLabels.map((ch, chi) => (
                                    <span key={chi} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '3px 8px' }}>
                                      Subtopic: <strong>{ch}</strong>
                                    </span>
                                  ))
                                )}
                                {(drawerNode.relationships || []).map((rel, reli) => (
                                  <span
                                    key={reli}
                                    style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', borderRadius: '4px', padding: '3px 8px', cursor: 'pointer' }}
                                    title={rel.evidence || ''}
                                    onClick={() => {
                                      const target = canonicalTopics.find(t => t.id === rel.otherTopicId || t.name === rel.otherTopicName)
                                      if (target) openDrawer(target)
                                    }}
                                  >
                                    {rel.predicate.replace(/_/g, ' ')} → <strong>{rel.otherTopicName}</strong>
                                  </span>
                                ))}
                              </div>
                            </div>

                            {/* Quick Action Buttons */}
                            <div style={{ display: 'flex', gap: '8px', paddingTop: '4px' }}>
                              <button className="btn btn-white sm" onClick={() => setDrawerSection('ask')}>
                                💬 Ask This Topic
                              </button>
                              <button className="btn btn-white sm" onClick={() => setDrawerSection('quiz')}>
                                ⚡ Test with Quiz
                              </button>
                              <button className="btn btn-white sm" onClick={() => setDrawerSection('flashcards')}>
                                🗂️ Study Flashcards
                              </button>
                              <button className="btn btn-white sm" onClick={() => setDrawerSection('sources')}>
                                📖 Read Verified Sources
                              </button>
                            </div>
                          </div>
                        )}

                        {/* 2. INLINE ASK THIS TOPIC */}
                        {drawerSection === 'ask' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ fontSize: '12px', color: 'var(--sub)' }}>
                              Ask questions scoped specifically to <strong>{drawerNode.label}</strong> using its verified source chunks.
                            </div>

                            <form
                              onSubmit={(e) => {
                                e.preventDefault()
                                if (!drawerAskQuery.trim()) return
                                const qText = drawerAskQuery.trim()
                                setDrawerAskQuery('')
                                setDrawerAskLoading(true)

                                // Scoped retrieval: topic chunks first
                                const chunkById = new Map((intelligence.cleanChunks || []).map(c => [c.id, c]))
                                const grounded = (drawerNode.sourceChunkIds || []).map(id => chunkById.get(id)).filter(Boolean)
                                const pool = grounded.length ? grounded : (intelligence.cleanChunks || [])

                                const matches = semanticSearch(qText, pool.filter(c => !c.isHeading && c.text), 3)
                                let answer = ''
                                let cit = formatTopicSourcesString(drawerNode)

                                if (matches.length > 0) {
                                  const sents = matches[0].text.split(/(?<=[.?!])s+/).filter(s => s.length >= 25)
                                  answer = sents.slice(0, 3).join(' ') || matches[0].text.slice(0, 240)
                                  cit = `Book page ${matches[0].displayPageLabel || matches[0].page} · PDF page ${matches[0].page}`
                                } else {
                                  answer = `No direct evidence found in ${drawerNode.label} addressing that query.`
                                }

                                setDrawerAskMessages(prev => [
                                  ...prev,
                                  { id: Date.now(), q: qText, a: answer, citation: cit }
                                ])
                                setDrawerAskLoading(false)
                              }}
                              style={{ display: 'flex', gap: '8px' }}
                            >
                              <input
                                type="text"
                                placeholder={`Ask about ${drawerNode.label}...`}
                                value={drawerAskQuery}
                                onChange={e => setDrawerAskQuery(e.target.value)}
                                style={{ flex: 1, padding: '7px 10px', fontSize: '12.5px', borderRadius: '6px', border: '1px solid var(--line)' }}
                              />
                              <button type="submit" className="btn btn-primary sm" disabled={drawerAskLoading}>
                                {drawerAskLoading ? 'Searching…' : 'Ask'}
                              </button>
                            </form>

                            {/* Q&A Conversation History */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                              {drawerAskMessages.map(msg => (
                                <div key={msg.id} style={{ background: '#f8fafc', border: '1px solid var(--line)', borderRadius: '8px', padding: '10px 14px', fontSize: '12.5px' }}>
                                  <div style={{ fontWeight: '700', color: 'var(--ink)', marginBottom: '4px' }}>
                                    Q: {msg.q}
                                  </div>
                                  <div style={{ lineHeight: '1.5', color: '#334155', marginBottom: '4px' }}>
                                    {msg.a}
                                  </div>
                                  <div style={{ fontSize: '10.5px', color: '#047857', fontWeight: '600' }}>
                                    Sources: {msg.citation}
                                  </div>
                                </div>
                              ))}
                              {!drawerAskMessages.length && (
                                <div style={{ fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic', padding: '8px 0' }}>
                                  No questions asked yet. Try asking how {drawerNode.label} operates or is defined.
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* 3. GENERATE QUIZ */}
                        {drawerSection === 'quiz' && (() => {
                          const activeQuiz = drawerQuiz || generateTopicQuiz(drawerNode, intelligence.cleanChunks, intelligence.entities, intelligence.relationships, { count: 3 })
                          const questions = activeQuiz.questions || []
                          const error = activeQuiz.error

                          if (error || !questions.length) {
                            return (
                              <div style={{ padding: '12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', fontSize: '12.5px', color: '#92400e' }}>
                                {error || 'Insufficient source text to generate a full quiz for this topic.'}
                              </div>
                            )
                          }

                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                              <div style={{ fontSize: '12px', color: 'var(--sub)' }}>
                                Instant quiz verified from source chunks for <strong>{drawerNode.label}</strong>:
                              </div>

                              {questions.map((q, qi) => {
                                const selected = (activeQuiz.userAnswers || {})[q.id]
                                const isAnswered = selected !== undefined
                                const isCorrect = selected === q.answer

                                return (
                                  <div key={q.id || qi} style={{ border: '1px solid var(--line)', borderRadius: '8px', padding: '12px 14px', background: '#fafbfc' }}>
                                    <div style={{ fontWeight: '600', fontSize: '13px', color: 'var(--ink)', marginBottom: '8px' }}>
                                      {qi + 1}. {q.question}
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '6px' }}>
                                      {q.options.map((opt, oi) => {
                                        const optSelected = selected === opt
                                        let bg = '#fff'
                                        let border = 'var(--line)'
                                        if (isAnswered) {
                                          if (opt === q.answer) { bg = '#ecfdf5'; border = '#059669' }
                                          else if (optSelected) { bg = '#fef2f2'; border = '#dc2626' }
                                        }
                                        return (
                                          <button
                                            key={oi}
                                            style={{
                                              padding: '6px 10px',
                                              fontSize: '12px',
                                              textAlign: 'left',
                                              borderRadius: '6px',
                                              background: bg,
                                              border: `1px solid ${border}`,
                                              cursor: isAnswered ? 'default' : 'pointer',
                                              color: 'var(--ink)'
                                            }}
                                            onClick={() => {
                                              if (isAnswered) return
                                              const updatedAnswers = { ...(activeQuiz.userAnswers || {}), [q.id]: opt }
                                              const newQuiz = { ...activeQuiz, userAnswers: updatedAnswers }
                                              setDrawerQuiz(newQuiz)

                                              // Track mastery
                                              saveTopicMastery(pdf.name, drawerNode.label, {
                                                correct: opt === q.answer ? 1 : 0,
                                                total: 1
                                              })
                                            }}
                                          >
                                            {opt}
                                          </button>
                                        )
                                      })}
                                    </div>
                                    {isAnswered && (
                                      <div style={{ marginTop: '8px', fontSize: '11.5px', color: isCorrect ? '#047857' : '#b91c1c' }}>
                                        {isCorrect ? '✓ Correct!' : `✗ Incorrect. Correct answer: ${q.answer}`} — {q.explanation}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })()}

                        {/* 4. FLASHCARDS */}
                        {drawerSection === 'flashcards' && (() => {
                          if (!drawerFlashcards.length) {
                            return (
                              <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', fontSize: '12.5px', color: 'var(--sub)' }}>
                                No flashcards available for this topic.
                              </div>
                            )
                          }

                          const currentCard = drawerFlashcards[drawerFlashcardIdx] || drawerFlashcards[0]

                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                              <div
                                onClick={() => setDrawerFlashcardFlipped(f => !f)}
                                style={{
                                  width: '100%',
                                  maxWidth: '480px',
                                  minHeight: '130px',
                                  background: drawerFlashcardFlipped ? '#f0fdf4' : '#ffffff',
                                  border: `2px solid ${drawerFlashcardFlipped ? '#059669' : '#e2e8f0'}`,
                                  borderRadius: '12px',
                                  padding: '16px 20px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  justifyContent: 'center',
                                  alignItems: 'center',
                                  textAlign: 'center',
                                  cursor: 'pointer',
                                  boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
                                }}
                              >
                                <span style={{ fontSize: '10.5px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: drawerFlashcardFlipped ? '#047857' : 'var(--sub)', marginBottom: '6px' }}>
                                  {drawerFlashcardFlipped ? 'EXPLANATION & EVIDENCE' : (currentCard.type || 'CONCEPT')}
                                </span>
                                <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--ink)', lineHeight: '1.5' }}>
                                  {drawerFlashcardFlipped ? currentCard.back : currentCard.front}
                                </div>
                                <div style={{ fontSize: '10.5px', color: 'var(--muted)', marginTop: '8px' }}>
                                  {drawerFlashcardFlipped ? `Source: Book page ${currentCard.displayPageLabel || currentCard.page} · PDF page ${currentCard.page}` : 'Click to flip'}
                                </div>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <button
                                  className="btn btn-white sm"
                                  disabled={drawerFlashcardIdx === 0}
                                  onClick={() => {
                                    setDrawerFlashcardIdx(i => Math.max(0, i - 1))
                                    setDrawerFlashcardFlipped(false)
                                  }}
                                >
                                  ◀ Prev
                                </button>
                                <span style={{ fontSize: '11.5px', color: 'var(--sub)' }}>
                                  Card {drawerFlashcardIdx + 1} of {drawerFlashcards.length}
                                </span>
                                <button
                                  className="btn btn-white sm"
                                  disabled={drawerFlashcardIdx === drawerFlashcards.length - 1}
                                  onClick={() => {
                                    setDrawerFlashcardIdx(i => Math.min(drawerFlashcards.length - 1, i + 1))
                                    setDrawerFlashcardFlipped(false)
                                  }}
                                >
                                  Next ▶
                                </button>
                                <button
                                  className="btn btn-primary sm"
                                  onClick={() => setDrawerFlashcardFlipped(f => !f)}
                                >
                                  ⤾ Flip Card
                                </button>
                              </div>
                            </div>
                          )
                        })()}

                        {/* 5. OPEN SOURCES */}
                        {drawerSection === 'sources' && (() => {
                          const chunkById = new Map((intelligence.cleanChunks || []).map(c => [c.id, c]))
                          const sourceIds = drawerNode.sourceChunkIds || []
                          let matching = sourceIds.map(id => chunkById.get(id)).filter(Boolean)
                          if (!matching.length) {
                            matching = (intelligence.cleanChunks || []).filter(c => c.text && c.text.includes(drawerNode.label))
                          }

                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              <div style={{ fontSize: '12px', color: 'var(--sub)' }}>
                                Showing <strong>{matching.length}</strong> authoritative evidence chunks backing <strong>{drawerNode.label}</strong>:
                              </div>
                              {matching.map((chunk, ci) => (
                                <div key={chunk.id || ci} style={{ background: '#f8fafc', border: '1px solid var(--line)', borderRadius: '8px', padding: '10px 14px', fontSize: '12px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', fontSize: '11px', color: 'var(--sub)' }}>
                                    <span style={{ fontWeight: '600', color: '#047857' }}>
                                      Book page {chunk.displayPageLabel || chunk.page} · PDF page {chunk.page}
                                    </span>
                                    <span>Chunk #{chunk.id}</span>
                                  </div>
                                  <div style={{ lineHeight: '1.5', color: 'var(--ink)' }}>
                                    {chunk.text}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )
                        })()}

                      </div>
                    </div>
                  )}

                </div>
              </div>
            </div>
          )}

{/* TAB 7: EXPORT */}
          {tab === 'export' && intelligence && (
            <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '12px', padding: '20px' }}>
              <h3 style={{ margin: '0 0 8px', fontSize: '16px' }}>Export Structured Intelligence</h3>
              <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--sub)' }}>
                Export extracted knowledge package (OKF-compatible), vector embeddings, and verified node & relation tables.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    const zip = exportCompleteZip(intelligence.knowledgePkg, intelligence.embeddedChunks)
                    download(zip, `${baseOf(pdf.name)}-knowledge-pack.zip`)
                  }}
                >
                  📦 Complete Knowledge ZIP
                </button>
                <button
                  className="btn btn-white"
                  onClick={() => {
                    const str = exportKnowledgeJson(intelligence.knowledgePkg)
                    download(new Blob([str], { type: 'application/json' }), `${baseOf(pdf.name)}-knowledge.json`)
                  }}
                >
                  JSON (OKF Format)
                </button>
                <button
                  className="btn btn-white"
                  onClick={() => {
                    const csv = exportNodesCsv(intelligence.knowledgePkg.nodes)
                    download(new Blob([csv], { type: 'text/csv' }), `${baseOf(pdf.name)}-nodes.csv`)
                  }}
                >
                  Nodes Table (.csv)
                </button>
                <button
                  className="btn btn-white"
                  onClick={() => {
                    const csv = exportEdgesCsv(intelligence.knowledgePkg.relationships)
                    download(new Blob([csv], { type: 'text/csv' }), `${baseOf(pdf.name)}-relationships.csv`)
                  }}
                >
                  Relationships (.csv)
                </button>
              </div>
            </div>
          )}

          {/* TAB 8: MODELS */}
          {tab === 'models' && (
            <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '12px', padding: '20px' }}>
              <h3 style={{ margin: '0 0 8px', fontSize: '16px' }}>Local Intelligence & Hardware Status</h3>
              <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--sub)' }}>
                Hardware acceleration status and specialized local on-device models. Zero server tracking.
              </p>

              <div style={{ background: '#f8fafc', border: '1px solid var(--line)', borderRadius: '8px', padding: '14px', marginBottom: '18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', fontSize: '12.5px' }}>
                <div>
                  <span style={{ color: 'var(--sub)' }}>WebGPU Available:</span>
                  <strong> {hardware?.webgpu ? '✓ Yes' : '✗ No (Fallback to WASM)'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--sub)' }}>WASM SIMD:</span>
                  <strong> {hardware?.simd ? '✓ Supported' : 'Standard WASM'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--sub)' }}>CPU Concurrency:</span>
                  <strong> {hardware?.threads || 4} threads</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--sub)' }}>Active Backend:</span>
                  <strong style={{ color: 'var(--green-dark)' }}> {hardware?.recommendedBackend}</strong>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {REGISTERED_MODELS.map(m => (
                  <div key={m.id} style={{ border: '1px solid var(--line)', borderRadius: '8px', padding: '12px 14px', background: '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '13.5px', color: 'var(--ink)' }}>{m.name}</strong>
                      <span style={{ fontSize: '11px', background: '#ecfdf5', color: '#047857', padding: '2px 7px', borderRadius: '4px', fontWeight: '700' }}>
                        {m.status}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--sub)', margin: '4px 0' }}>
                      {m.description}
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                      Footprint: {m.size} · Engine: {m.hardware}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </ToolShell>
  )
}
