import React, { useEffect, useRef, useState } from 'react'
import pdfjs from '../../lib/pdfjs'
import { DropArea, ToolShell, prettySize } from './shell'

const PREVIEW_W = 440

async function loadDoc(file) {
  const bytes = await file.arrayBuffer()
  const clone = new Uint8Array(bytes.byteLength)
  clone.set(new Uint8Array(bytes))
  const doc = await pdfjs.getDocument({ data: clone }).promise
  return { name: file.name, size: file.size, bytes, doc, count: doc.numPages }
}

export default function CompareTool({ tool, onBack }) {
  const [fileA, setFileA] = useState(null)
  const [fileB, setFileB] = useState(null)
  const [pageNo, setPageNo] = useState(0)
  const [mode, setMode] = useState('sideBySide') // 'sideBySide' | 'diff'
  const [diffPct, setDiffPct] = useState(100)
  const [changes, setChanges] = useState({ added: [], removed: [], modified: [], layout: false, imageDiff: false })
  const [currentChangeIdx, setCurrentChangeIdx] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const canvasARef = useRef(null)
  const canvasBRef = useRef(null)
  const canvasDiffRef = useRef(null)

  const maxPages = Math.max(fileA?.count || 0, fileB?.count || 0)

  const handleOpenA = async file => {
    setError(null)
    try {
      const data = await loadDoc(file)
      setFileA(data)
      setPageNo(0)
    } catch (e) {
      setError(`File 1: ${e?.message || e}`)
    }
  }

  const handleOpenB = async file => {
    setError(null)
    try {
      const data = await loadDoc(file)
      setFileB(data)
      setPageNo(0)
    } catch (e) {
      setError(`File 2: ${e?.message || e}`)
    }
  }

  const reset = () => {
    setFileA(null)
    setFileB(null)
    setPageNo(0)
    setError(null)
    setDiffPct(100)
  }

  // Render pages whenever fileA, fileB, or pageNo changes
  useEffect(() => {
    if (!fileA || !fileB) return
    let cancelled = false
    setBusy(true)

    const render = async () => {
      try {
        const canA = canvasARef.current
        const canB = canvasBRef.current
        const canDiff = canvasDiffRef.current
        if (!canA || !canB) return

        let wA = PREVIEW_W
        let hA = Math.round(PREVIEW_W * 1.414)
        let wB = PREVIEW_W
        let hB = Math.round(PREVIEW_W * 1.414)

        // Render Page A if exists
        if (pageNo < fileA.count) {
          const pA = await fileA.doc.getPage(pageNo + 1)
          const vpA1 = pA.getViewport({ scale: 1, rotation: 0 })
          const vpA = pA.getViewport({ scale: PREVIEW_W / vpA1.width, rotation: 0 })
          wA = Math.floor(vpA.width)
          hA = Math.floor(vpA.height)
          canA.width = wA
          canA.height = hA
          const ctxA = canA.getContext('2d')
          ctxA.fillStyle = '#ffffff'
          ctxA.fillRect(0, 0, wA, hA)
          await pA.render({ canvasContext: ctxA, viewport: vpA }).promise
        } else {
          canA.width = wA
          canA.height = hA
          const ctxA = canA.getContext('2d')
          ctxA.fillStyle = '#f5f5f5'
          ctxA.fillRect(0, 0, wA, hA)
          ctxA.fillStyle = '#999999'
          ctxA.font = '14px sans-serif'
          ctxA.textAlign = 'center'
          ctxA.fillText('No page in File 1', wA / 2, hA / 2)
        }

        // Render Page B if exists
        if (pageNo < fileB.count) {
          const pB = await fileB.doc.getPage(pageNo + 1)
          const vpB1 = pB.getViewport({ scale: 1, rotation: 0 })
          const vpB = pB.getViewport({ scale: PREVIEW_W / vpB1.width, rotation: 0 })
          wB = Math.floor(vpB.width)
          hB = Math.floor(vpB.height)
          canB.width = wB
          canB.height = hB
          const ctxB = canB.getContext('2d')
          ctxB.fillStyle = '#ffffff'
          ctxB.fillRect(0, 0, wB, hB)
          await pB.render({ canvasContext: ctxB, viewport: vpB }).promise
        } else {
          canB.width = wB
          canB.height = hB
          const ctxB = canB.getContext('2d')
          ctxB.fillStyle = '#f5f5f5'
          ctxB.fillRect(0, 0, wB, hB)
          ctxB.fillStyle = '#999999'
          ctxB.font = '14px sans-serif'
          ctxB.textAlign = 'center'
          ctxB.fillText('No page in File 2', wB / 2, hB / 2)
        }

        if (cancelled) return

        // Compute Pixel Diff
        if (canDiff) {
          const diffW = Math.max(wA, wB)
          const diffH = Math.max(hA, hB)
          canDiff.width = diffW
          canDiff.height = diffH
          const ctxDiff = canDiff.getContext('2d')

          const ctxA = canA.getContext('2d')
          const ctxB = canB.getContext('2d')
          const dataA = ctxA.getImageData(0, 0, Math.min(wA, diffW), Math.min(hA, diffH)).data
          const dataB = ctxB.getImageData(0, 0, Math.min(wB, diffW), Math.min(hB, diffH)).data
          const out = ctxDiff.createImageData(diffW, diffH)

          let diffPixels = 0
          const totalPixels = diffW * diffH

          for (let y = 0; y < diffH; y++) {
            for (let x = 0; x < diffW; x++) {
              const idx = (y * diffW + x) * 4
              if (x >= wA || y >= hA || x >= wB || y >= hB) {
                // Out of bounds on one document -> difference
                diffPixels++
                out.data[idx] = 230
                out.data[idx + 1] = 30
                out.data[idx + 2] = 80
                out.data[idx + 3] = 255
              } else {
                const dr = Math.abs(dataA[idx] - dataB[idx])
                const dg = Math.abs(dataA[idx + 1] - dataB[idx + 1])
                const db = Math.abs(dataA[idx + 2] - dataB[idx + 2])
                if (dr + dg + db > 40) {
                  diffPixels++
                  // Highlight change in vivid red/magenta
                  out.data[idx] = 225
                  out.data[idx + 1] = 29
                  out.data[idx + 2] = 72
                  out.data[idx + 3] = 255
                } else {
                  // Muted grayscale context
                  const grey = (dataA[idx] * 0.299 + dataA[idx + 1] * 0.587 + dataA[idx + 2] * 0.114) * 0.5 + 115
                  out.data[idx] = grey
                  out.data[idx + 1] = grey
                  out.data[idx + 2] = grey
                  out.data[idx + 3] = 255
                }
              }
            }
          }

          ctxDiff.putImageData(out, 0, 0)
          const matchRate = totalPixels > 0 ? Math.max(0, 100 - (diffPixels / totalPixels) * 100) : 100
          setDiffPct(Math.round(matchRate * 10) / 10)

          // Semantic text comparison
          let added = [], removed = [], modified = []
          try {
            const tcA = pageNo < fileA.count ? await (await fileA.doc.getPage(pageNo + 1)).getTextContent() : { items: [] }
            const tcB = pageNo < fileB.count ? await (await fileB.doc.getPage(pageNo + 1)).getTextContent() : { items: [] }
            const linesA = tcA.items.map(it => it.str.trim()).filter(Boolean)
            const linesB = tcB.items.map(it => it.str.trim()).filter(Boolean)

            linesB.forEach(lb => {
              if (!linesA.includes(lb)) added.push(lb)
            })
            linesA.forEach(la => {
              if (!linesB.includes(la)) removed.push(la)
            })
          } catch {}

          const layoutDiff = wA !== wB || hA !== hB
          const imageDiff = diffPixels > totalPixels * 0.04
          setChanges({ added, removed, modified, layout: layoutDiff, imageDiff })
          setCurrentChangeIdx(0)
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || String(err))
      } finally {
        if (!cancelled) setBusy(false)
      }
    }

    render()
    return () => { cancelled = true }
  }, [fileA, fileB, pageNo])

  return (
    <ToolShell tool={tool} onBack={onBack}>
      {(!fileA || !fileB) ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          <div>
            <h3 style={{ margin: '0 0 10px', fontSize: '15px' }}>First Document (Original)</h3>
            {fileA ? (
              <div className="tool-file" style={{ margin: 0 }}>
                <div>
                  <strong>{fileA.name}</strong>
                  <span>{fileA.count} pages · {prettySize(fileA.size)}</span>
                </div>
                <button className="btn btn-white sm" onClick={() => setFileA(null)}>Replace</button>
              </div>
            ) : (
              <DropArea label="Select Original PDF" hint="File 1" onFiles={f => handleOpenA(f[0])} />
            )}
          </div>

          <div>
            <h3 style={{ margin: '0 0 10px', fontSize: '15px' }}>Second Document (Modified)</h3>
            {fileB ? (
              <div className="tool-file" style={{ margin: 0 }}>
                <div>
                  <strong>{fileB.name}</strong>
                  <span>{fileB.count} pages · {prettySize(fileB.size)}</span>
                </div>
                <button className="btn btn-white sm" onClick={() => setFileB(null)}>Replace</button>
              </div>
            ) : (
              <DropArea label="Select Modified PDF" hint="File 2" onFiles={f => handleOpenB(f[0])} />
            )}
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px', background: '#fff', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                className="btn btn-white sm"
                disabled={pageNo <= 0}
                onClick={() => setPageNo(p => p - 1)}
              >
                Previous
              </button>
              <span style={{ fontSize: '13px', fontWeight: '600' }}>
                Page {pageNo + 1} of {maxPages}
              </span>
              <button
                className="btn btn-white sm"
                disabled={pageNo >= maxPages - 1}
                onClick={() => setPageNo(p => p + 1)}
              >
                Next
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: diffPct === 100 ? 'var(--green-dark)' : '#b91c1c', fontWeight: '700' }}>
                {diffPct === 100 ? '✓ Identical' : `⚠ ${diffPct}% match (${(100 - diffPct).toFixed(1)}% difference)`}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                className={`btn sm ${mode === 'sideBySide' ? 'btn-primary' : 'btn-white'}`}
                onClick={() => setMode('sideBySide')}
              >
                Side by Side
              </button>
              <button
                className={`btn sm ${mode === 'diff' ? 'btn-primary' : 'btn-white'}`}
                onClick={() => setMode('diff')}
              >
                Visual Diff
              </button>
              <button className="btn btn-white sm" onClick={reset} style={{ marginLeft: '6px' }}>
                Compare Others
              </button>
            </div>
          </div>

          {/* Changes Detected Badge Bar */}
          <div style={{ background: '#fff', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--line)', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', fontSize: '12.5px' }}>
              <strong style={{ color: 'var(--ink)' }}>Changes Detected:</strong>
              {changes.added.length > 0 && (
                <span style={{ color: '#16a34a', fontWeight: '600', background: '#dcfce7', padding: '2px 8px', borderRadius: '4px' }}>
                  + Added text ({changes.added.length})
                </span>
              )}
              {changes.removed.length > 0 && (
                <span style={{ color: '#dc2626', fontWeight: '600', background: '#fee2e2', padding: '2px 8px', borderRadius: '4px' }}>
                  - Removed text ({changes.removed.length})
                </span>
              )}
              {changes.imageDiff && (
                <span style={{ color: '#ca8a04', fontWeight: '600', background: '#fef9c3', padding: '2px 8px', borderRadius: '4px' }}>
                  🖼 Image changes
                </span>
              )}
              {changes.layout && (
                <span style={{ color: '#7c3aed', fontWeight: '600', background: '#ede9fe', padding: '2px 8px', borderRadius: '4px' }}>
                  📐 Layout changes
                </span>
              )}
              {!changes.added.length && !changes.removed.length && !changes.imageDiff && !changes.layout && (
                <span style={{ color: 'var(--sub)' }}>No text or layout modifications detected on this page.</span>
              )}
            </div>

            {(changes.added.length > 0 || changes.removed.length > 0) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  className="btn btn-white sm"
                  disabled={currentChangeIdx <= 0}
                  onClick={() => setCurrentChangeIdx(i => Math.max(0, i - 1))}
                >
                  ← Prev Change
                </button>
                <span style={{ fontSize: '11.5px', color: 'var(--sub)' }}>
                  Change {currentChangeIdx + 1} of {changes.added.length + changes.removed.length}
                </span>
                <button
                  className="btn btn-white sm"
                  disabled={currentChangeIdx >= changes.added.length + changes.removed.length - 1}
                  onClick={() => setCurrentChangeIdx(i => Math.min(changes.added.length + changes.removed.length - 1, i + 1))}
                >
                  Next Change →
                </button>
              </div>
            )}
          </div>

          {busy && <div className="ocr-bar"><span style={{ width: '100%' }} /></div>}

          {mode === 'sideBySide' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--sub)', marginBottom: '6px' }}>
                  FILE 1: {fileA.name}
                </div>
                <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '8px', overflow: 'hidden', display: 'flex', justifyContent: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
                  <canvas ref={canvasARef} style={{ maxWidth: '100%', height: 'auto', display: 'block' }} />
                </div>
              </div>

              <div>
                <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--sub)', marginBottom: '6px' }}>
                  FILE 2: {fileB.name}
                </div>
                <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '8px', overflow: 'hidden', display: 'flex', justifyContent: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
                  <canvas ref={canvasBRef} style={{ maxWidth: '100%', height: 'auto', display: 'block' }} />
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ fontSize: '12.5px', color: 'var(--sub)', marginBottom: '10px' }}>
                Visual Difference Overlay — Differences between File 1 and File 2 are highlighted in red.
              </div>
              <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
                <canvas ref={canvasDiffRef} style={{ maxWidth: '100%', height: 'auto', display: 'block' }} />
              </div>
              {/* Hidden offscreen canvases needed to render source bitmaps for diffing */}
              <div style={{ display: 'none' }}>
                <canvas ref={canvasARef} />
                <canvas ref={canvasBRef} />
              </div>
            </div>
          )}
        </div>
      )}
      {error && <div className="error-box">{error}</div>}
    </ToolShell>
  )
}
