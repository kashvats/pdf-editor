import React, { useEffect, useRef, useState } from 'react'
import { autoCropCanvas, deskewCanvas, cleanDocumentCanvas, rotateCanvas } from '../../lib/imageproc'
import { updateActiveDocument } from '../../lib/workspace'
import { DropArea, Result, ToolShell, baseOf, download, usePdf } from './shell'

export default function ScanCleanerTool({ tool, onBack }) {
  const [pdf, open, clear] = usePdf()
  const [pageNo, setPageNo] = useState(0)
  const [doCrop, setDoCrop] = useState(true)
  const [doDeskew, setDoDeskew] = useState(true)
  const [doCleanBg, setDoCleanBg] = useState(true)
  const [doEnhance, setDoEnhance] = useState(true)
  const [rotation, setRotation] = useState(0)

  const [busy, setBusy] = useState(false)
  const [pct, setPct] = useState(0)
  const [done, setDone] = useState(null)
  const [error, setError] = useState(null)

  const beforeCanvasRef = useRef(null)
  const afterCanvasRef = useRef(null)

  const reset = () => { clear(); setPageNo(0); setDone(null); setError(null) }

  // Render before and after preview for current page
  useEffect(() => {
    if (!pdf.doc) return
    let cancelled = false

    const renderPreview = async () => {
      try {
        const page = await pdf.doc.getPage(pageNo + 1)
        const vp = page.getViewport({ scale: 1.2 })

        const beforeCanvas = beforeCanvasRef.current
        const afterCanvas = afterCanvasRef.current
        if (!beforeCanvas || !afterCanvas) return

        beforeCanvas.width = vp.width
        beforeCanvas.height = vp.height
        const bCtx = beforeCanvas.getContext('2d')
        bCtx.fillStyle = '#ffffff'
        bCtx.fillRect(0, 0, vp.width, vp.height)
        await page.render({ canvasContext: bCtx, viewport: vp }).promise

        if (cancelled) return

        // Create working copy for after preview
        let c = document.createElement('canvas')
        c.width = vp.width
        c.height = vp.height
        c.getContext('2d').drawImage(beforeCanvas, 0, 0)

        if (rotation) c = rotateCanvas(c, rotation)
        if (doDeskew) c = deskewCanvas(c)
        if (doCrop) c = autoCropCanvas(c)
        if (doCleanBg || doEnhance) c = cleanDocumentCanvas(c, { cleanBg: doCleanBg, removeShadows: doCleanBg, enhanceText: doEnhance })

        afterCanvas.width = c.width
        afterCanvas.height = c.height
        afterCanvas.getContext('2d').drawImage(c, 0, 0)
      } catch (err) {
        if (!cancelled) setError(err?.message || String(err))
      }
    }

    renderPreview()
    return () => { cancelled = true }
  }, [pdf.doc, pageNo, doCrop, doDeskew, doCleanBg, doEnhance, rotation])

  const runAll = async () => {
    setBusy(true)
    setError(null)
    setPct(0)
    try {
      const { PDFDocument } = await import('pdf-lib')
      const doc = await PDFDocument.create()

      for (let i = 1; i <= pdf.count; i++) {
        const page = await pdf.doc.getPage(i)
        const vp = page.getViewport({ scale: 2.0 }) // High res
        const canvas = document.createElement('canvas')
        canvas.width = vp.width
        canvas.height = vp.height
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, vp.width, vp.height)
        await page.render({ canvasContext: ctx, viewport: vp }).promise

        let c = canvas
        if (rotation) c = rotateCanvas(c, rotation)
        if (doDeskew) c = deskewCanvas(c)
        if (doCrop) c = autoCropCanvas(c)
        if (doCleanBg || doEnhance) c = cleanDocumentCanvas(c, { cleanBg: doCleanBg, removeShadows: doCleanBg, enhanceText: doEnhance })

        const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9))
        const imgBytes = new Uint8Array(await blob.arrayBuffer())
        const embedded = await doc.embedJpg(imgBytes)

        const pdfPage = doc.addPage([c.width * 0.5, c.height * 0.5])
        pdfPage.drawImage(embedded, { x: 0, y: 0, width: c.width * 0.5, height: c.height * 0.5 })

        setPct(i / pdf.count)
      }

      const out = await doc.save({ useObjectStreams: true })
      const fileName = `${baseOf(pdf.name)}-cleaned.pdf`
      const outBlob = new Blob([out], { type: 'application/pdf' })

      await updateActiveDocument(out, 'Scan Cleaned')
      download(outBlob, fileName)
      setDone(`${fileName} downloaded — ${pdf.count} page${pdf.count === 1 ? '' : 's'} enhanced and cleaned.`)
    } catch (err) {
      setError(err?.message || String(err))
    }
    setBusy(false)
  }

  return (
    <ToolShell tool={tool} onBack={onBack}>
      {!pdf.doc ? (
        <DropArea label="Drop scanned PDF or photos here to clean" hint="or click to browse your computer" onFiles={f => open(f[0])} />
      ) : done ? (
        <Result text={done} onReset={reset} />
      ) : (
        <div>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '16px', background: '#fff', padding: '14px', borderRadius: '10px', border: '1px solid var(--line)' }}>
            <label className={`perm ${doCrop ? 'on' : ''}`}>
              <input type="checkbox" checked={doCrop} onChange={e => setDoCrop(e.target.checked)} />
              Auto Crop Margins
            </label>
            <label className={`perm ${doDeskew ? 'on' : ''}`}>
              <input type="checkbox" checked={doDeskew} onChange={e => setDoDeskew(e.target.checked)} />
              Deskew / Straighten
            </label>
            <label className={`perm ${doCleanBg ? 'on' : ''}`}>
              <input type="checkbox" checked={doCleanBg} onChange={e => setDoCleanBg(e.target.checked)} />
              Remove Shadows & Whiten
            </label>
            <label className={`perm ${doEnhance ? 'on' : ''}`}>
              <input type="checkbox" checked={doEnhance} onChange={e => setDoEnhance(e.target.checked)} />
              Enhance & Darken Text
            </label>
            <button
              className="btn btn-white sm"
              onClick={() => setRotation(r => (r + 90) % 360)}
            >
              Rotate 90° (Current: {rotation}°)
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '20px' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--sub)', marginBottom: '8px' }}>
                ORIGINAL (Before)
              </div>
              <div style={{ background: '#f5f5f5', border: '1px solid var(--line)', borderRadius: '8px', overflow: 'hidden', display: 'flex', justifyContent: 'center' }}>
                <canvas ref={beforeCanvasRef} style={{ maxWidth: '100%', height: 'auto', display: 'block' }} />
              </div>
            </div>

            <div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--green-dark)', marginBottom: '8px' }}>
                CLEANED (After)
              </div>
              <div style={{ background: '#fff', border: '1px solid var(--green)', borderRadius: '8px', overflow: 'hidden', display: 'flex', justifyContent: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
                <canvas ref={afterCanvasRef} style={{ maxWidth: '100%', height: 'auto', display: 'block' }} />
              </div>
            </div>
          </div>

          {pdf.count > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <button className="btn btn-white sm" disabled={pageNo <= 0} onClick={() => setPageNo(p => p - 1)}>
                Previous Page
              </button>
              <span style={{ fontSize: '13px' }}>Page {pageNo + 1} of {pdf.count}</span>
              <button className="btn btn-white sm" disabled={pageNo >= pdf.count - 1} onClick={() => setPageNo(p => p + 1)}>
                Next Page
              </button>
            </div>
          )}

          {busy && <div className="ocr-bar"><span style={{ width: `${Math.round(pct * 100)}%` }} /></div>}

          <div className="tool-actions">
            <button className="btn btn-white" onClick={reset}>Choose another file</button>
            <div style={{ flex: 1 }} />
            <button className="btn btn-primary" disabled={busy} onClick={runAll}>
              {busy ? 'Cleaning Pages…' : `Clean All ${pdf.count} Page${pdf.count === 1 ? '' : 's'} & Save`}
            </button>
          </div>
        </div>
      )}
      {error && <div className="error-box">{error}</div>}
    </ToolShell>
  )
}
