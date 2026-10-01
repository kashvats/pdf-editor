import React, { useEffect, useRef, useState } from 'react'
import { extractLines } from '../../lib/extract'
import { BASE_SCALE } from '../../utils/misc'
import { DropArea, PageThumb, ToolShell, baseOf, download, prettySize, usePdf } from './shell'

function buildMindMapTree(docName, pagesLines) {
  const root = {
    id: 'root',
    title: docName.replace(/\.pdf$/i, ''),
    page: 1,
    children: []
  }

  pagesLines.forEach((lines, pageIdx) => {
    const pageNum = pageIdx + 1
    const headings = lines.filter(l => l.text && (l.fontSize > 13 || l.bold))
    const bodyLines = lines.filter(l => l.text && l.fontSize <= 13 && !l.bold)

    if (headings.length > 0) {
      headings.forEach(h => {
        const snippet = bodyLines.slice(0, 2).map(b => b.text).join(' ').slice(0, 90)
        root.children.push({
          id: `node_p${pageNum}_${Math.random().toString(36).slice(2, 6)}`,
          title: h.text,
          summary: snippet ? `${snippet}…` : `Section on page ${pageNum}`,
          page: pageNum,
          children: bodyLines.slice(0, 3).map((b, bi) => ({
            id: `sub_p${pageNum}_${bi}`,
            title: b.text.slice(0, 45) + (b.text.length > 45 ? '…' : ''),
            summary: b.text,
            page: pageNum,
            children: []
          }))
        })
      })
    } else {
      // Fallback topic
      const firstLine = lines[0]?.text || `Page ${pageNum}`
      root.children.push({
        id: `node_p${pageNum}`,
        title: firstLine.slice(0, 50),
        summary: lines.slice(1, 3).map(l => l.text).join(' ').slice(0, 90),
        page: pageNum,
        children: []
      })
    }
  })

  // Limit broad branching for readability
  if (root.children.length > 10) {
    root.children = root.children.slice(0, 10)
  }

  return root
}

export default function MindMapTool({ tool, onBack }) {
  const [pdf, open, clear] = usePdf()
  const [tree, setTree] = useState(null)
  const [selectedNode, setSelectedNode] = useState(null)
  const [previewPage, setPreviewPage] = useState(1)
  const [busy, setBusy] = useState(false)
  const svgRef = useRef(null)

  useEffect(() => {
    if (!pdf.doc) {
      setTree(null)
      return
    }
    setBusy(true)
    const generate = async () => {
      try {
        const pagesLines = []
        for (let i = 1; i <= Math.min(pdf.count, 12); i++) {
          const page = await pdf.doc.getPage(i)
          const lines = await extractLines(page, BASE_SCALE, i - 1)
          pagesLines.push(lines)
        }
        const root = buildMindMapTree(pdf.name, pagesLines)
        setTree(root)
        setSelectedNode(root.children[0] || root)
        setPreviewPage(root.children[0]?.page || 1)
      } catch {}
      setBusy(false)
    }
    generate()
  }, [pdf.doc])

  const handleNodeClick = node => {
    setSelectedNode(node)
    if (node.page) setPreviewPage(node.page)
  }

  const exportMarkdown = () => {
    if (!tree) return
    const lines = [`# Mind Map: ${tree.title}\n`]
    tree.children.forEach(c => {
      lines.push(`- **${c.title}** *(Page ${c.page})*`)
      if (c.summary) lines.push(`  > ${c.summary}`)
      c.children.forEach(sub => {
        lines.push(`  - ${sub.title}`)
      })
    })
    download(new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' }), `${baseOf(pdf.name)}-mindmap.md`)
  }

  const exportJson = () => {
    if (!tree) return
    download(new Blob([JSON.stringify(tree, null, 2)], { type: 'application/json' }), `${baseOf(pdf.name)}-mindmap.json`)
  }

  const exportSvg = () => {
    const el = svgRef.current
    if (!el) return
    const content = new XMLSerializer().serializeToString(el)
    download(new Blob([content], { type: 'image/svg+xml' }), `${baseOf(pdf.name)}-mindmap.svg`)
  }

  const reset = () => { clear(); setTree(null); setSelectedNode(null) }

  return (
    <ToolShell tool={tool} onBack={onBack}>
      {!pdf.doc ? (
        <DropArea label="Drop your PDF here to build Mind Map" hint="Generates interactive visual topic tree" onFiles={f => open(f[0])} />
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', background: '#fff', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--line)', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <PageThumb doc={pdf.doc} index={0} width={44} />
              <div>
                <strong style={{ fontSize: '14px' }}>{pdf.name}</strong>
                <div style={{ fontSize: '11.5px', color: 'var(--sub)' }}>{pdf.count} pages · Interactive Mind Map</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              <button className="btn btn-white sm" onClick={exportMarkdown}>Export Markdown</button>
              <button className="btn btn-white sm" onClick={exportJson}>Export JSON</button>
              <button className="btn btn-primary sm" onClick={exportSvg}>Export SVG</button>
              <button className="btn btn-white sm" onClick={reset}>Change PDF</button>
            </div>
          </div>

          {busy && <div className="ocr-bar"><span style={{ width: '100%' }} /></div>}

          {tree && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) 280px', gap: '20px', alignItems: 'start' }}>
              {/* Interactive SVG Mind Map Visualizer */}
              <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '12px', padding: '20px', minHeight: '440px', overflowX: 'auto', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
                <svg
                  ref={svgRef}
                  width="720"
                  height={Math.max(420, tree.children.length * 80 + 60)}
                  viewBox={`0 0 720 ${Math.max(420, tree.children.length * 80 + 60)}`}
                  style={{ display: 'block' }}
                >
                  {/* Root Node */}
                  <rect x="20" y={Math.max(200, (tree.children.length * 80) / 2 - 20)} width="160" height="48" rx="8" fill="var(--green)" />
                  <text x="100" y={Math.max(228, (tree.children.length * 80) / 2 + 8)} fill="#fff" fontSize="13" fontWeight="bold" textAnchor="middle">
                    {tree.title.slice(0, 18)}
                  </text>

                  {/* Level 1 Nodes & Connectors */}
                  {tree.children.map((child, idx) => {
                    const y = idx * 75 + 40
                    const isSelected = selectedNode?.id === child.id

                    return (
                      <g key={child.id} onClick={() => handleNodeClick(child)} style={{ cursor: 'pointer' }}>
                        {/* Curved Connector */}
                        <path
                          d={`M 180 ${Math.max(224, (tree.children.length * 80) / 2 + 4)} C 250 ${Math.max(224, (tree.children.length * 80) / 2 + 4)}, 240 ${y + 20}, 300 ${y + 20}`}
                          fill="none"
                          stroke={isSelected ? 'var(--green)' : '#cbd5e1'}
                          strokeWidth={isSelected ? '2.5' : '1.5'}
                        />

                        {/* Node Box */}
                        <rect
                          x="300"
                          y={y}
                          width="240"
                          height="42"
                          rx="6"
                          fill={isSelected ? 'var(--green-soft)' : '#f8fafc'}
                          stroke={isSelected ? 'var(--green)' : 'var(--line)'}
                          strokeWidth="1.5"
                        />
                        <text x="312" y={y + 24} fill="var(--ink)" fontSize="12" fontWeight="600">
                          {child.title.slice(0, 26)}
                        </text>
                        <text x="515" y={y + 24} fill="var(--sub)" fontSize="10.5" textAnchor="end">
                          p.{child.page}
                        </text>
                      </g>
                    )
                  })}
                </svg>
              </div>

              {/* Node Inspector & PDF Page Jump */}
              <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '12px', padding: '16px' }}>
                <h4 style={{ margin: '0 0 8px', fontSize: '14px' }}>Selected Topic</h4>
                {selectedNode ? (
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '14px', marginBottom: '6px', color: 'var(--green-dark)' }}>
                      {selectedNode.title}
                    </div>
                    {selectedNode.summary && (
                      <p style={{ fontSize: '12.5px', color: 'var(--ink)', lineHeight: '1.5', margin: '0 0 12px' }}>
                        {selectedNode.summary}
                      </p>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid var(--line)' }}>
                      <span style={{ fontSize: '12px', color: 'var(--sub)' }}>Source Page:</span>
                      <strong style={{ fontSize: '13px' }}>Page {previewPage}</strong>
                    </div>

                    <div style={{ marginTop: '12px', textAlign: 'center' }}>
                      <PageThumb doc={pdf.doc} index={Math.max(0, previewPage - 1)} width={140} />
                    </div>
                  </div>
                ) : (
                  <div style={{ color: 'var(--sub)', fontSize: '12.5px' }}>Click a mind map node to inspect</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </ToolShell>
  )
}
