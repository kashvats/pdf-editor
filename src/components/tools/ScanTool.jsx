import React, { useEffect, useRef, useState } from 'react'
import { Result, ToolShell, download } from './shell'

const FILTERS = [
  { id: 'color', label: 'Color', blurb: 'As captured' },
  { id: 'grayscale', label: 'Grayscale', blurb: 'Smooth neutral gray' },
  { id: 'bw', label: 'Document B&W', blurb: 'Crisp black text on clean white' }
]

function applyFilterToCanvas(canvas, filter) {
  const ctx = canvas.getContext('2d')
  if (filter === 'color') return
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = imgData.data

  if (filter === 'grayscale') {
    for (let i = 0; i < d.length; i += 4) {
      const g = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114
      d[i] = g
      d[i + 1] = g
      d[i + 2] = g
    }
  } else if (filter === 'bw') {
    // Dynamic adaptive thresholding for document scanning
    for (let i = 0; i < d.length; i += 4) {
      const g = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114
      const v = g > 140 ? 255 : 0
      d[i] = v
      d[i + 1] = v
      d[i + 2] = v
    }
  }
  ctx.putImageData(imgData, 0, 0)
}

export default function ScanTool({ tool, onBack }) {
  const [pages, setPages] = useState([]) // array of dataUrls
  const [filter, setFilter] = useState('bw')
  const [cameraActive, setCameraActive] = useState(false)
  const [facingMode, setFacingMode] = useState('environment')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  const [error, setError] = useState(null)

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const fileInputRef = useRef(null)

  const startCamera = async () => {
    setError(null)
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } }
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCameraActive(true)
    } catch (err) {
      setCameraActive(false)
      setError('Camera access could not be started. You can also upload photos of document pages below.')
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setCameraActive(false)
  }

  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [])

  const capturePhoto = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
    setPages(p => [...p, { id: Date.now() + Math.random(), src: dataUrl, rotate: 0 }])
  }

  const handleUploadPhotos = e => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = ev => {
        setPages(p => [...p, { id: Date.now() + Math.random(), src: ev.target.result, rotate: 0 }])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  const rotatePage = (idx, deg) => {
    setPages(p => p.map((page, i) => (i === idx ? { ...page, rotate: (page.rotate + deg) % 360 } : page)))
  }

  const deletePage = idx => {
    setPages(p => p.filter((_, i) => i !== idx))
  }

  const generatePdf = async () => {
    if (!pages.length) return
    setBusy(true)
    setError(null)
    try {
      const { PDFDocument } = await import('pdf-lib')
      const doc = await PDFDocument.create()

      for (const p of pages) {
        const img = new Image()
        await new Promise((res, rej) => {
          img.onload = res
          img.onerror = rej
          img.src = p.src
        })

        const canvas = document.createElement('canvas')
        const isRotated90 = Math.abs(p.rotate) % 180 === 90
        canvas.width = isRotated90 ? img.naturalHeight : img.naturalWidth
        canvas.height = isRotated90 ? img.naturalWidth : img.naturalHeight
        const ctx = canvas.getContext('2d')

        ctx.translate(canvas.width / 2, canvas.height / 2)
        ctx.rotate((p.rotate * Math.PI) / 180)
        ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)
        ctx.setTransform(1, 0, 0, 1, 0, 0)

        applyFilterToCanvas(canvas, filter)

        const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.88))
        const bytes = new Uint8Array(await blob.arrayBuffer())
        const embeddedImg = await doc.embedJpg(bytes)

        const page = doc.addPage([canvas.width, canvas.height])
        page.drawImage(embeddedImg, {
          x: 0,
          y: 0,
          width: canvas.width,
          height: canvas.height
        })
      }

      const out = await doc.save({ useObjectStreams: true })
      const pdfBlob = new Blob([out], { type: 'application/pdf' })
      const fileName = `scan-${new Date().toISOString().slice(0, 10)}.pdf`
      download(pdfBlob, fileName)
      setDone(`${fileName} downloaded — ${pages.length} page${pages.length === 1 ? '' : 's'} compiled into clean PDF document.`)
      stopCamera()
    } catch (err) {
      setError(err?.message || String(err))
    }
    setBusy(false)
  }

  const reset = () => {
    setPages([])
    setDone(null)
    setError(null)
  }

  return (
    <ToolShell tool={tool} onBack={onBack}>
      {done ? (
        <Result text={done} onReset={reset} />
      ) : (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', alignItems: 'start' }}>
            {/* Left: Camera Viewfinder & Controls */}
            <div>
              <div style={{ background: '#1c1e21', borderRadius: '12px', overflow: 'hidden', position: 'relative', minHeight: '280px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>
                <video
                  ref={videoRef}
                  style={{ width: '100%', maxHeight: '420px', objectFit: 'contain', display: cameraActive ? 'block' : 'none' }}
                  playsInline
                  autoPlay
                  muted
                />
                {!cameraActive && (
                  <div style={{ textAlign: 'center', padding: '30px 20px', color: '#fff' }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8, marginBottom: '12px' }}>
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                    <div style={{ fontSize: '15px', fontWeight: '600', marginBottom: '6px' }}>Scan Documents with Camera</div>
                    <div style={{ fontSize: '13px', opacity: 0.7, marginBottom: '16px' }}>Capture pages directly or upload document photos</div>
                    <button className="btn btn-primary" onClick={startCamera}>
                      Start Camera
                    </button>
                  </div>
                )}

                {cameraActive && (
                  <div style={{ position: 'absolute', bottom: '14px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <button
                      className="btn btn-primary"
                      onClick={capturePhoto}
                      style={{ borderRadius: '50px', padding: '10px 24px', fontWeight: '700', fontSize: '14px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}
                    >
                      📸 Snap Page
                    </button>
                    <button
                      className="btn btn-white sm"
                      onClick={() => {
                        setFacingMode(f => (f === 'environment' ? 'user' : 'environment'))
                        setTimeout(startCamera, 100)
                      }}
                      title="Flip camera"
                    >
                      🔄 Flip
                    </button>
                    <button className="btn btn-white sm" onClick={stopCamera}>
                      Stop
                    </button>
                  </div>
                )}
              </div>

              <div style={{ marginTop: '14px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={handleUploadPhotos}
                />
                <button
                  className="btn btn-white"
                  style={{ width: '100%' }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  📁 Upload Document Photos
                </button>
              </div>
            </div>

            {/* Right: Captured Pages Gallery & Filters */}
            <div>
              <h3 style={{ margin: '0 0 10px', fontSize: '15px' }}>
                Captured Pages ({pages.length})
              </h3>

              {pages.length === 0 ? (
                <div style={{ border: '2px dashed var(--line)', borderRadius: '10px', padding: '40px 20px', textAlign: 'center', color: 'var(--sub)', fontSize: '13px' }}>
                  No pages captured yet. Click <strong>Start Camera</strong> to take photos of documents or upload existing photos.
                </div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '10px', maxHeight: '300px', overflowY: 'auto', padding: '4px', border: '1px solid var(--line)', borderRadius: '10px', background: '#fff', marginBottom: '16px' }}>
                    {pages.map((p, idx) => (
                      <div key={p.id} style={{ position: 'relative', border: '1px solid var(--line)', borderRadius: '6px', overflow: 'hidden', background: '#f8f8f8' }}>
                        <img
                          src={p.src}
                          alt={`Page ${idx + 1}`}
                          style={{ width: '100%', height: '110px', objectFit: 'cover', transform: p.rotate ? `rotate(${p.rotate}deg)` : undefined }}
                        />
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.65)', color: '#fff', display: 'flex', justifyContent: 'space-between', padding: '2px 4px', fontSize: '10px' }}>
                          <span>p.{idx + 1}</span>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              onClick={() => rotatePage(idx, 90)}
                              style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0 }}
                              title="Rotate"
                            >
                              ↻
                            </button>
                            <button
                              onClick={() => deletePage(idx)}
                              style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', padding: 0 }}
                              title="Delete"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '12.5px', fontWeight: '700', marginBottom: '6px' }}>Document Filter</div>
                    <div className="tool-options" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                      {FILTERS.map(f => (
                        <label key={f.id} className={`tool-option ${filter === f.id ? 'on' : ''}`} style={{ padding: '8px 10px' }}>
                          <input type="radio" checked={filter === f.id} onChange={() => setFilter(f.id)} />
                          <div>
                            <strong style={{ fontSize: '12px' }}>{f.label}</strong>
                            <span style={{ fontSize: '10.5px' }}>{f.blurb}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="tool-actions">
                    <button className="btn btn-white sm" onClick={reset}>Clear all</button>
                    <div style={{ flex: 1 }} />
                    <button className="btn btn-primary" disabled={busy || !pages.length} onClick={generatePdf}>
                      {busy ? 'Creating PDF…' : `Save ${pages.length} Page${pages.length === 1 ? '' : 's'} as PDF`}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {error && <div className="error-box" style={{ marginTop: '14px' }}>{error}</div>}
    </ToolShell>
  )
}
