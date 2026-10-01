import React, { useEffect, useRef, useState } from 'react'
import {
  processDocumentStructure,
  batchEmbedChunks,
  saveDocumentEmbeddings,
  getDocumentEmbeddings,
  extractEntities,
  extractRelationships,
  createKnowledgePackage,
  exportCompleteZip,
  exportKnowledgeJson,
  exportNodesCsv,
  exportEdgesCsv,
  detectHardwareCapabilities,
  REGISTERED_MODELS,
  semanticSearch,
  generateQuizFromKnowledge,
  generateFlashcards,
  explainConceptSimply,
  classifyDocument,
  DOCUMENT_TYPES,
  PIPELINES
} from '../../lib/intelligence'
import { DropArea, PageThumb, ToolShell, baseOf, download, prettySize, usePdf } from './shell'

export default function IntelligenceTool({ tool, onBack }) {
  const [pdf, open, clear] = usePdf()
  const [tab, setTab] = useState('graph') // 'graph' | 'search' | 'learning' | 'export'
  const [loading, setLoading] = useState(false)
  const [progressText, setProgressText] = useState('')

  // Intelligence state
  const [structure, setStructure] = useState(null)
  const [classification, setClassification] = useState(null)
  const [entities, setEntities] = useState([])
  const [relationships, setRelationships] = useState([])
  const [embeddedChunks, setEmbeddedChunks] = useState([])
  const [knowledgePkg, setKnowledgePkg] = useState(null)

  // Hardware & Model Manager
  const [hardware, setHardware] = useState(null)
  const [modelModalOpen, setModelModalOpen] = useState(false)

  // Knowledge Graph State
  const [selectedNode, setSelectedNode] = useState(null)
  const [filterType, setFilterType] = useState('All')
  const [graphZoom, setGraphZoom] = useState(1)
  const [graphPan, setGraphPan] = useState({ x: 0, y: 0 })
  const [conceptExplanation, setConceptExplanation] = useState(null)

  // Semantic Search State
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])

  // Learning Mode State
  const [learningTab, setLearningTab] = useState('quiz') // 'quiz' | 'flashcards'
  const [quizList, setQuizList] = useState([])
  const [userAnswers, setUserAnswers] = useState({})
  const [flashcards, setFlashcards] = useState([])
  const [currentCardIdx, setCurrentCardIdx] = useState(0)
  const [cardFlipped, setCardFlipped] = useState(false)

  // Detect Hardware on mount
  useEffect(() => {
    detectHardwareCapabilities().then(h => setHardware(h))
  }, [])

  // Process Document
  useEffect(() => {
    if (!pdf.doc || !pdf.bytes) {
      setStructure(null)
      setEntities([])
      setRelationships([])
      setEmbeddedChunks([])
      setKnowledgePkg(null)
      setSelectedNode(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setProgressText('Extracting document geometry and hierarchy…')

    const runPipeline = async () => {
      try {
        // 1. Structure & Facts
        const struct = await processDocumentStructure(pdf.bytes, p => {
          if (!cancelled) setProgressText(`Analyzing structure (${Math.round(p * 100)}%)…`)
        })
        if (cancelled) return
        setStructure(struct)

        // 2. Adaptive Classification
        const docClass = classifyDocument({
          docName: pdf.name,
          chunks: struct.chunks,
          facts: struct.facts,
          numPages: struct.numPages
        })
        if (cancelled) return
        setClassification(docClass)

        // 3. Named Entity Recognition
        setProgressText(`Processing ${docClass.typeLabel}… extracting entities`)
        const ents = extractEntities(struct.chunks, struct.facts)
        if (cancelled) return
        setEntities(ents)

        // 4. Relationship Extraction (Adaptive)
        let rels = []
        if (!docClass.pipeline.skipHeavyTasks.includes('heavy_graph')) {
          setProgressText('Extracting relationships and predicates…')
          rels = extractRelationships(struct.chunks, ents)
        }
        if (cancelled) return
        setRelationships(rels)

        // 5. Local Vector Embeddings (Check IndexedDB first)
        setProgressText('Generating local semantic embeddings (WebGPU/WASM)…')
        let chunksWithVectors = await getDocumentEmbeddings(pdf.name)
        if (!chunksWithVectors || !chunksWithVectors.length) {
          chunksWithVectors = await batchEmbedChunks(struct.chunks)
          await saveDocumentEmbeddings(pdf.name, chunksWithVectors)
        }
        if (cancelled) return
        setEmbeddedChunks(chunksWithVectors)

        // 6. Build Unified Knowledge Package
        const pkg = createKnowledgePackage({
          docName: pdf.name,
          structure: struct,
          entities: ents,
          relationships: rels,
          embeddings: chunksWithVectors
        })
        setKnowledgePkg(pkg)

        // 7. Adaptive Learning Material (Avoid wasted compute on invoices/statements)
        if (!docClass.pipeline.skipHeavyTasks.includes('quiz')) {
          const generatedQuiz = generateQuizFromKnowledge(struct.chunks, ents)
          setQuizList(generatedQuiz)
        } else {
          setQuizList([])
        }

        if (!docClass.pipeline.skipHeavyTasks.includes('flashcards')) {
          const generatedCards = generateFlashcards(ents, struct.chunks)
          setFlashcards(generatedCards)
        } else {
          setFlashcards([])
        }

        if (ents.length) setSelectedNode(ents[0])

        // Smart Tab Routing based on document type
        if (docClass.type === 'INVOICE' || docClass.type === 'FINANCIAL_STATEMENT' || docClass.type === 'RESUME') {
          setTab('export')
        } else if (docClass.type === 'EDUCATIONAL') {
          setTab('learning')
        } else {
          setTab('graph')
        }
      } catch (err) {
        console.warn('Intelligence pipeline warning:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    runPipeline()
    return () => { cancelled = true }
  }, [pdf.doc, pdf.bytes])

  // Semantic Search handler
  const handleSearch = e => {
    e?.preventDefault()
    if (!searchQuery.trim() || !embeddedChunks.length) return
    const results = semanticSearch(searchQuery, embeddedChunks, 6)
    setSearchResults(results)
  }

  // Node selection in graph
  const handleNodeClick = node => {
    setSelectedNode(node)
    setConceptExplanation(null)
  }

  const handleExplainSimply = () => {
    if (!selectedNode || !structure) return
    const related = structure.chunks.filter(c => c.text.includes(selectedNode.name || selectedNode.title))
    const exp = explainConceptSimply(selectedNode.name || selectedNode.title, related)
    setConceptExplanation(exp)
  }

  const handleOverrideType = (typeKey) => {
    if (!structure) return
    const customPipeline = PIPELINES[typeKey] || PIPELINES.GENERAL
    const updated = {
      type: typeKey,
      typeLabel: DOCUMENT_TYPES[typeKey] || typeKey,
      confidence: 100,
      characteristics: ['User specified classification'],
      pipeline: customPipeline,
      isLowConfidence: false
    }
    setClassification(updated)

    if (!customPipeline.skipHeavyTasks.includes('quiz') && !quizList.length) {
      setQuizList(generateQuizFromKnowledge(structure.chunks, entities))
    }
    if (!customPipeline.skipHeavyTasks.includes('flashcards') && !flashcards.length) {
      setFlashcards(generateFlashcards(entities, structure.chunks))
    }
  }

  const reset = () => {
    clear()
    setStructure(null)
    setEntities([])
    setRelationships([])
    setKnowledgePkg(null)
    setSelectedNode(null)
    setSearchResults([])
  }

  // Filtered nodes for Knowledge Graph
  const visibleNodes = entities.filter(e => filterType === 'All' || e.type === filterType)
  const nodeTypes = ['All', ...new Set(entities.map(e => e.type))]

  return (
    <ToolShell tool={tool} onBack={onBack}>
      {!pdf.doc ? (
        <DropArea
          label="Drop your PDF here for Deep Knowledge Intelligence"
          hint="Local Embeddings, Knowledge Graph, Semantic Search & Quiz"
          onFiles={f => open(f[0])}
        />
      ) : (
        <div>
          {/* Header Strip */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', background: '#fff', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--line)', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <PageThumb doc={pdf.doc} index={0} width={42} />
              <div>
                <strong style={{ fontSize: '14px' }}>{pdf.name}</strong>
                <div style={{ fontSize: '11.5px', color: 'var(--sub)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>{pdf.count} pages · {prettySize(pdf.size)}</span>
                  <span style={{ background: '#ecfdf5', color: '#047857', padding: '2px 6px', borderRadius: '4px', fontWeight: '600' }}>
                    ⚡ {hardware?.recommendedBackend || 'Local WASM'}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                className={`btn sm ${tab === 'graph' ? 'btn-primary' : 'btn-white'}`}
                onClick={() => setTab('graph')}
              >
                🕸️ Knowledge Graph
              </button>
              <button
                className={`btn sm ${tab === 'search' ? 'btn-primary' : 'btn-white'}`}
                onClick={() => setTab('search')}
              >
                🔎 Semantic Search
              </button>
              <button
                className={`btn sm ${tab === 'learning' ? 'btn-primary' : 'btn-white'}`}
                onClick={() => setTab('learning')}
              >
                🎓 Learning Mode
              </button>
              <button
                className={`btn sm ${tab === 'export' ? 'btn-primary' : 'btn-white'}`}
                onClick={() => setTab('export')}
              >
                📦 Export Package
              </button>
              <button
                className="btn btn-white sm"
                onClick={() => setModelModalOpen(true)}
                title="Model Manager"
              >
                ⚙️ Models
              </button>
              <button className="btn btn-white sm" onClick={reset}>
                Change
              </button>
            </div>
          </div>

          {/* Adaptive Classification Banner */}
          {classification && (
            <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '16px' }}>
                    {classification.type === 'INVOICE' ? '🧾' :
                     classification.type === 'CONTRACT' ? '📜' :
                     classification.type === 'EDUCATIONAL' ? '🎓' :
                     classification.type === 'FINANCIAL_STATEMENT' ? '🏦' :
                     classification.type === 'RESUME' ? '👤' :
                     classification.type === 'RESEARCH' ? '🔬' :
                     classification.type === 'BUSINESS_REPORT' ? '📊' : '📄'}
                  </span>
                  <strong style={{ fontSize: '14px', color: 'var(--ink)' }}>
                    Detected: {classification.typeLabel}
                  </strong>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: '700',
                    padding: '2px 7px',
                    borderRadius: '4px',
                    background: classification.confidence >= 80 ? '#ecfdf5' : '#fef3c7',
                    color: classification.confidence >= 80 ? '#047857' : '#b45309'
                  }}>
                    {classification.confidence}% confidence
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {classification.characteristics.slice(0, 3).map((ch, ci) => (
                    <span key={ci} style={{ fontSize: '11px', background: '#f8fafc', border: '1px solid var(--line)', color: 'var(--sub)', padding: '2px 8px', borderRadius: '4px' }}>
                      ✓ {ch}
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--line)', paddingTop: '8px', flexWrap: 'wrap', gap: '8px', fontSize: '12px' }}>
                <div style={{ color: 'var(--sub)' }}>
                  <strong style={{ color: 'var(--ink)' }}>Adaptive Pipeline:</strong> {classification.pipeline.features.join(' · ')}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Is this different?</span>
                  {[
                    ['INVOICE', 'Invoice'],
                    ['CONTRACT', 'Contract'],
                    ['EDUCATIONAL', 'Study'],
                    ['BUSINESS_REPORT', 'Report'],
                    ['GENERAL', 'General']
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      className="btn btn-white sm"
                      style={{
                        padding: '1px 7px',
                        fontSize: '10.5px',
                        height: '22px',
                        background: classification.type === key ? 'var(--ink)' : '#fff',
                        color: classification.type === key ? '#fff' : 'var(--sub)'
                      }}
                      onClick={() => handleOverrideType(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {loading && (
            <div style={{ background: '#f8fafc', border: '1px solid var(--line)', borderRadius: '10px', padding: '16px', textAlign: 'center', marginBottom: '16px' }}>
              <div className="spinner" style={{ margin: '0 auto 10px', width: '26px', height: '26px' }} />
              <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--ink)' }}>{progressText}</div>
            </div>
          )}

          {/* TAB 1: KNOWLEDGE GRAPH */}
          {tab === 'graph' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) 300px', gap: '16px', alignItems: 'start' }}>
              <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                {/* Graph Controls */}
                <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', gap: '4px', overflowX: 'auto' }}>
                    {nodeTypes.map(t => (
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
                  </div>

                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <button className="btn btn-white sm" style={{ height: '24px', padding: '0 6px' }} onClick={() => setGraphZoom(z => Math.max(0.5, z - 0.2))}>−</button>
                    <span style={{ fontSize: '11px', color: 'var(--sub)' }}>{Math.round(graphZoom * 100)}%</span>
                    <button className="btn btn-white sm" style={{ height: '24px', padding: '0 6px' }} onClick={() => setGraphZoom(z => Math.min(2.5, z + 0.2))}>+</button>
                    <button className="btn btn-white sm" style={{ height: '24px', padding: '0 6px' }} onClick={() => { setGraphZoom(1); setGraphPan({ x: 0, y: 0 }) }}>Reset</button>
                  </div>
                </div>

                {/* Interactive SVG Knowledge Graph */}
                <div style={{ height: '480px', position: 'relative', overflow: 'hidden', background: '#fafbfc', cursor: 'grab' }}>
                  <svg
                    width="100%"
                    height="100%"
                    viewBox={`0 0 ${700 / graphZoom} ${480 / graphZoom}`}
                    style={{ transform: `translate(${graphPan.x}px, ${graphPan.y}px)` }}
                  >
                    <defs>
                      <marker id="arrow" viewBox="0 0 10 10" refX="18" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
                      </marker>
                    </defs>

                    {/* Edges / Relationships */}
                    {relationships.map((rel, ri) => {
                      const srcNodeIdx = visibleNodes.findIndex(n => n.id === rel.sourceId)
                      const tgtNodeIdx = visibleNodes.findIndex(n => n.id === rel.targetId)
                      if (srcNodeIdx === -1 || tgtNodeIdx === -1) return null

                      const cols = 4
                      const x1 = (srcNodeIdx % cols) * 160 + 100
                      const y1 = Math.floor(srcNodeIdx / cols) * 120 + 80
                      const x2 = (tgtNodeIdx % cols) * 160 + 100
                      const y2 = Math.floor(tgtNodeIdx / cols) * 120 + 80

                      return (
                        <g key={rel.id || ri}>
                          <line
                            x1={x1}
                            y1={y1}
                            x2={x2}
                            y2={y2}
                            stroke="#cbd5e1"
                            strokeWidth="1.6"
                            markerEnd="url(#arrow)"
                          />
                          <text
                            x={(x1 + x2) / 2}
                            y={(y1 + y2) / 2 - 4}
                            fontSize="9"
                            fill="#64748b"
                            textAnchor="middle"
                            fontWeight="600"
                          >
                            {rel.type}
                          </text>
                        </g>
                      )
                    })}

                    {/* Nodes */}
                    {visibleNodes.map((node, ni) => {
                      const cols = 4
                      const cx = (ni % cols) * 160 + 100
                      const cy = Math.floor(ni / cols) * 120 + 80
                      const isSelected = selectedNode?.id === node.id

                      const typeColor = {
                        Company: '#3b82f6',
                        Technology: '#10b981',
                        Person: '#f59e0b',
                        Location: '#8b5cf6',
                        Metric: '#ec4899',
                        Date: '#6366f1',
                        Regulation: '#ef4444',
                        Concept: '#14b8a6'
                      }[node.type] || '#64748b'

                      return (
                        <g
                          key={node.id}
                          onClick={() => handleNodeClick(node)}
                          style={{ cursor: 'pointer' }}
                        >
                          <circle
                            cx={cx}
                            cy={cy}
                            r={isSelected ? 22 : 18}
                            fill={isSelected ? typeColor : '#ffffff'}
                            stroke={typeColor}
                            strokeWidth={isSelected ? 3 : 2}
                          />
                          <text
                            x={cx}
                            y={cy + 4}
                            textAnchor="middle"
                            fill={isSelected ? '#ffffff' : typeColor}
                            fontSize="10"
                            fontWeight="bold"
                          >
                            {node.type.slice(0, 1)}
                          </text>
                          <text
                            x={cx}
                            y={cy + 34}
                            textAnchor="middle"
                            fill="var(--ink)"
                            fontSize="11"
                            fontWeight={isSelected ? '700' : '500'}
                          >
                            {node.name.length > 18 ? `${node.name.slice(0, 16)}…` : node.name}
                          </text>
                        </g>
                      )
                    })}
                  </svg>
                </div>
              </div>

              {/* Node Inspector */}
              <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '12px', padding: '16px' }}>
                <h4 style={{ margin: '0 0 10px', fontSize: '14px', borderBottom: '1px solid var(--line)', paddingBottom: '8px' }}>
                  Entity Inspector
                </h4>

                {selectedNode ? (
                  <div>
                    <span style={{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.04em', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', color: 'var(--sub)', fontWeight: '700' }}>
                      {selectedNode.type}
                    </span>
                    <div style={{ fontSize: '16px', fontWeight: '700', margin: '6px 0 2px', color: 'var(--ink)' }}>
                      {selectedNode.name || selectedNode.title}
                    </div>

                    <div style={{ fontSize: '12px', color: 'var(--sub)', marginBottom: '12px' }}>
                      Referenced on Page{selectedNode.pages?.length === 1 ? '' : 's'}: {selectedNode.pages?.join(', ') || '1'}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
                      <button
                        className="btn btn-white sm"
                        style={{ justifyContent: 'flex-start' }}
                        onClick={handleExplainSimply}
                      >
                        💡 Explain Simply
                      </button>
                      <button
                        className="btn btn-white sm"
                        style={{ justifyContent: 'flex-start' }}
                        onClick={() => {
                          setSearchQuery(`What does the document say about ${selectedNode.name || selectedNode.title}?`)
                          setTab('search')
                        }}
                      >
                        💬 Search in Context
                      </button>
                    </div>

                    {conceptExplanation && (
                      <div style={{ background: '#f8fafc', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px', fontSize: '12.5px', lineHeight: '1.5', whiteSpace: 'pre-wrap', marginBottom: '12px' }}>
                        {conceptExplanation}
                      </div>
                    )}

                    {selectedNode.pages?.[0] && (
                      <div style={{ textAlign: 'center', marginTop: '10px' }}>
                        <div style={{ fontSize: '11.5px', color: 'var(--sub)', marginBottom: '6px' }}>
                          Source View (Page {selectedNode.pages[0]})
                        </div>
                        <PageThumb doc={pdf.doc} index={Math.max(0, selectedNode.pages[0] - 1)} width={140} />
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ color: 'var(--sub)', fontSize: '12.5px' }}>Click any graph node to inspect relationships and source page.</div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: SEMANTIC SEARCH */}
          {tab === 'search' && (
            <div>
              <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <input
                  type="text"
                  placeholder='Ask or search by concept (e.g. "How is authentication handled?", "What were the quarterly revenue numbers?")'
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
                  Type a natural concept above to retrieve relevant PDF sections using local vector embeddings.
                </div>
              )}
            </div>
          )}

          {/* TAB 3: LEARNING MODE (QUIZ & FLASHCARDS) */}
          {tab === 'learning' && (
            <div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <button
                  className={`btn sm ${learningTab === 'quiz' ? 'btn-primary' : 'btn-white'}`}
                  onClick={() => setLearningTab('quiz')}
                >
                  📝 Generated Quiz ({quizList.length})
                </button>
                <button
                  className={`btn sm ${learningTab === 'flashcards' ? 'btn-primary' : 'btn-white'}`}
                  onClick={() => setLearningTab('flashcards')}
                >
                  🗂️ Flashcards ({flashcards.length})
                </button>
              </div>

              {learningTab === 'quiz' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {quizList.map((q, qi) => {
                    const answered = userAnswers[q.id]
                    return (
                      <div key={q.id} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '10px', padding: '16px' }}>
                        <div style={{ fontSize: '14px', fontWeight: '700', marginBottom: '10px' }}>
                          {qi + 1}. {q.question}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px', marginBottom: '10px' }}>
                          {q.options.map((opt, oi) => {
                            const isCorrect = opt === q.answer
                            const isChosen = answered === opt

                            let bg = '#f8fafc'
                            let border = '1px solid var(--line)'
                            if (answered) {
                              if (isCorrect) { bg = '#dcfce7'; border = '1px solid #86efac' }
                              else if (isChosen) { bg = '#fee2e2'; border = '1px solid #fca5a5' }
                            }

                            return (
                              <button
                                key={oi}
                                disabled={!!answered}
                                style={{
                                  padding: '8px 12px',
                                  textAlign: 'left',
                                  background: bg,
                                  border,
                                  borderRadius: '6px',
                                  fontSize: '13px',
                                  cursor: answered ? 'default' : 'pointer'
                                }}
                                onClick={() => setUserAnswers(a => ({ ...a, [q.id]: opt }))}
                              >
                                {opt}
                              </button>
                            )
                          })}
                        </div>
                        {answered && (
                          <div style={{ fontSize: '12px', color: 'var(--sub)', borderTop: '1px solid var(--line)', paddingTop: '8px' }}>
                            Source: Page {q.sourcePage} — "{q.evidence}"
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {learningTab === 'flashcards' && flashcards.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div
                    onClick={() => setCardFlipped(f => !f)}
                    style={{
                      width: '420px',
                      maxWidth: '90vw',
                      height: '240px',
                      borderRadius: '14px',
                      border: '1.5px solid var(--line)',
                      background: '#fff',
                      padding: '24px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      alignItems: 'center',
                      textAlign: 'center',
                      cursor: 'pointer',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
                      marginBottom: '16px'
                    }}
                  >
                    {!cardFlipped ? (
                      <div>
                        <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--sub)', letterSpacing: '0.04em', fontWeight: '700' }}>
                          {flashcards[currentCardIdx]?.type}
                        </span>
                        <div style={{ fontSize: '20px', fontWeight: '800', marginTop: '8px', color: 'var(--ink)' }}>
                          {flashcards[currentCardIdx]?.front}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '16px' }}>Click to flip</div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontSize: '14px', lineHeight: '1.5', color: 'var(--ink)' }}>
                          "{flashcards[currentCardIdx]?.back}"
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--green-dark)', fontWeight: '600', marginTop: '14px' }}>
                          Source: Page {flashcards[currentCardIdx]?.page}
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <button
                      className="btn btn-white sm"
                      disabled={currentCardIdx <= 0}
                      onClick={() => { setCurrentCardIdx(i => i - 1); setCardFlipped(false) }}
                    >
                      ← Previous
                    </button>
                    <span style={{ fontSize: '13px' }}>
                      {currentCardIdx + 1} of {flashcards.length}
                    </span>
                    <button
                      className="btn btn-white sm"
                      disabled={currentCardIdx >= flashcards.length - 1}
                      onClick={() => { setCurrentCardIdx(i => i + 1); setCardFlipped(false) }}
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: EXPORT PACKAGE */}
          {tab === 'export' && knowledgePkg && (
            <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '12px', padding: '20px' }}>
              <h3 style={{ margin: '0 0 10px', fontSize: '16px' }}>Export Structured Intelligence</h3>
              <p style={{ margin: '0 0 18px', fontSize: '13px', color: 'var(--sub)' }}>
                Export extracted knowledge representation (OKF-compatible), vector embeddings, node tables, and relationships.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    const zip = exportCompleteZip(knowledgePkg, embeddedChunks)
                    download(zip, `${baseOf(pdf.name)}-knowledge-pack.zip`)
                  }}
                >
                  📦 Complete Knowledge ZIP
                </button>
                <button
                  className="btn btn-white"
                  onClick={() => {
                    const str = exportKnowledgeJson(knowledgePkg)
                    download(new Blob([str], { type: 'application/json' }), `${baseOf(pdf.name)}-knowledge.json`)
                  }}
                >
                  JSON (OKF Format)
                </button>
                <button
                  className="btn btn-white"
                  onClick={() => {
                    const csv = exportNodesCsv(knowledgePkg.nodes)
                    download(new Blob([csv], { type: 'text/csv' }), `${baseOf(pdf.name)}-nodes.csv`)
                  }}
                >
                  Nodes Table (.csv)
                </button>
                <button
                  className="btn btn-white"
                  onClick={() => {
                    const csv = exportEdgesCsv(knowledgePkg.relationships)
                    download(new Blob([csv], { type: 'text/csv' }), `${baseOf(pdf.name)}-relationships.csv`)
                  }}
                >
                  Relationships (.csv)
                </button>
              </div>
            </div>
          )}

          {/* Model Manager Modal */}
          {modelModalOpen && (
            <div className="modal-wrap" onClick={() => setModelModalOpen(false)}>
              <div
                className="modal"
                style={{ width: '600px', maxWidth: '92vw', textAlign: 'left', padding: '24px' }}
                onClick={e => e.stopPropagation()}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px' }}>Local Model & Hardware Manager</h3>
                    <div style={{ fontSize: '12px', color: 'var(--sub)' }}>
                      On-device execution status and hardware acceleration
                    </div>
                  </div>
                  <button className="tool-back" style={{ margin: 0 }} onClick={() => setModelModalOpen(false)}>✕</button>
                </div>

                <div style={{ background: '#f8fafc', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px', marginBottom: '16px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: '12.5px' }}>
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
                    <span style={{ color: 'var(--sub)' }}>Recommended:</span>
                    <strong> {hardware?.recommendedBackend}</strong>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {REGISTERED_MODELS.map(m => (
                    <div key={m.id} style={{ border: '1px solid var(--line)', borderRadius: '6px', padding: '10px 12px', background: '#fff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: '13px' }}>{m.name}</strong>
                        <span style={{ fontSize: '11px', background: '#ecfdf5', color: '#047857', padding: '2px 6px', borderRadius: '4px', fontWeight: '700' }}>
                          {m.status}
                        </span>
                      </div>
                      <div style={{ fontSize: '11.5px', color: 'var(--sub)', margin: '4px 0' }}>
                        {m.description}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                        Size: {m.size} · Engine: {m.hardware}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </ToolShell>
  )
}
