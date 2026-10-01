import React, { useRef, useState } from 'react'
import { compressPdf, stampPdf, organisePages, zipFiles } from '../../lib/pdfops'
import { protectPdf } from '../../lib/security'
import { ocrToSearchablePdf } from '../../lib/ocrpdf'
import { pdfToMarkdown } from '../../lib/markdown'
import { pdfToText, pagesToImages } from '../../lib/pdfraster'
import { DropArea, ToolShell, baseOf, download, prettySize } from './shell'

const BATCH_OPERATIONS = [
  { id: 'compress', name: 'Compress PDFs', blurb: 'Reduce file size across all files' },
  { id: 'ocr', name: 'Run OCR', blurb: 'Make all scanned documents searchable' },
  { id: 'watermark', name: 'Add Watermark', blurb: 'Apply a custom stamp or watermark' },
  { id: 'numbers', name: 'Add Page Numbers', blurb: 'Number all pages in each file' },
  { id: 'rotate', name: 'Rotate Pages', blurb: 'Turn every page 90 degrees clockwise' },
  { id: 'markdown', name: 'Convert to Markdown', blurb: 'Extract structured .md files' },
  { id: 'text', name: 'Convert to Text', blurb: 'Extract plain .txt from each file' },
  { id: 'images', name: 'Convert to JPG', blurb: 'Render all pages to images' },
  { id: 'protect', name: 'Password Protect', blurb: 'Encrypt all files with a password' }
]

export default function BatchTool({ tool, onBack }) {
  const [files, setFiles] = useState([])
  const [op, setOp] = useState('compress')
  const [param, setParam] = useState('')
  const [running, setRunning] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const cancelRef = useRef(false)

  const handleAddFiles = incoming => {
    const list = Array.from(incoming || [])
    const newItems = list.map(f => ({
      id: `${f.name}_${Date.now()}_${Math.random()}`,
      file: f,
      name: f.name,
      size: f.size,
      status: 'pending', // pending | processing | done | error
      progress: 0,
      resultBlob: null,
      resultName: null,
      error: null
    }))
    setFiles(prev => [...prev, ...newItems])
  }

  const removeFile = id => setFiles(prev => prev.filter(f => f.id !== id))
  const clearAll = () => { if (!running) setFiles([]) }

  const runSingle = async item => {
    const bytes = await item.file.arrayBuffer()
    const base = baseOf(item.name)

    switch (op) {
      case 'compress': {
        const res = await compressPdf(bytes, { quality: 0.62, maxSide: 1800 })
        return { blob: res.blob, name: `${base}-compressed.pdf` }
      }
      case 'ocr': {
        const res = await ocrToSearchablePdf(bytes, { langs: 'eng', onlyEmpty: true })
        return { blob: res.blob, name: `${base}-searchable.pdf` }
      }
      case 'watermark': {
        const text = param.trim() || 'CONFIDENTIAL'
        const blob = await stampPdf(bytes, { kind: 'watermark', text, opacity: 0.2, angle: 45 })
        return { blob, name: `${base}-watermarked.pdf` }
      }
      case 'numbers': {
        const blob = await stampPdf(bytes, { kind: 'numbers', position: 'bottom-center', format: '{n}' })
        return { blob, name: `${base}-numbered.pdf` }
      }
      case 'rotate': {
        const { PDFDocument } = await import('pdf-lib')
        const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
        const count = doc.getPageCount()
        const entries = Array.from({ length: count }, (_, i) => ({ src: i, rotate: 90 }))
        const blob = await organisePages(bytes, entries)
        return { blob, name: `${base}-rotated.pdf` }
      }
      case 'markdown': {
        const md = await pdfToMarkdown(bytes)
        return { blob: new Blob([md], { type: 'text/markdown;charset=utf-8' }), name: `${base}.md` }
      }
      case 'text': {
        const txt = await pdfToText(bytes)
        return { blob: new Blob([txt], { type: 'text/plain;charset=utf-8' }), name: `${base}.txt` }
      }
      case 'images': {
        const imgs = await pagesToImages(bytes, { format: 'jpeg', dpi: 150, baseName: base })
        const zipBlob = zipFiles(imgs)
        return { blob: zipBlob, name: `${base}-images.zip` }
      }
      case 'protect': {
        const pwd = param.trim() || '123456'
        const blob = await protectPdf(bytes, { userPassword: pwd, permissions: {} })
        return { blob, name: `${base}-protected.pdf` }
      }
      default:
        throw new Error('Unknown operation')
    }
  }

  const runBatch = async () => {
    setRunning(true)
    setCancelling(false)
    cancelRef.current = false

    for (let i = 0; i < files.length; i++) {
      if (cancelRef.current) break
      const item = files[i]
      if (item.status === 'done') continue

      setFiles(prev => prev.map((f, idx) => (idx === i ? { ...f, status: 'processing', progress: 30 } : f)))

      try {
        const result = await runSingle(item)
        setFiles(prev =>
          prev.map((f, idx) =>
            idx === i
              ? { ...f, status: 'done', progress: 100, resultBlob: result.blob, resultName: result.name }
              : f
          )
        )
      } catch (err) {
        setFiles(prev =>
          prev.map((f, idx) =>
            idx === i ? { ...f, status: 'error', progress: 0, error: err?.message || String(err) } : f
          )
        )
      }
    }

    setRunning(false)
    setCancelling(false)
  }

  const cancelBatch = () => {
    cancelRef.current = true
    setCancelling(true)
  }

  const downloadAllZip = async () => {
    const completed = files.filter(f => f.status === 'done' && f.resultBlob)
    if (!completed.length) return
    const zipEntries = []
    for (const f of completed) {
      zipEntries.push({
        name: f.resultName || f.name,
        data: new Uint8Array(await f.resultBlob.arrayBuffer())
      })
    }
    const zipBlob = zipFiles(zipEntries)
    download(zipBlob, `batch-${op}-${new Date().toISOString().slice(0, 10)}.zip`)
  }

  const doneCount = files.filter(f => f.status === 'done').length

  return (
    <ToolShell tool={tool} onBack={onBack}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', alignItems: 'start' }}>
        <div>
          <h3 style={{ margin: '0 0 10px', fontSize: '15px' }}>1. Choose Batch Operation</h3>
          <div className="tool-options" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', marginBottom: '16px' }}>
            {BATCH_OPERATIONS.map(b => (
              <label key={b.id} className={`tool-option ${op === b.id ? 'on' : ''}`} style={{ padding: '10px 12px' }}>
                <input type="radio" checked={op === b.id} onChange={() => setOp(b.id)} disabled={running} />
                <div>
                  <strong style={{ fontSize: '12.5px' }}>{b.name}</strong>
                  <span style={{ fontSize: '11px' }}>{b.blurb}</span>
                </div>
              </label>
            ))}
          </div>

          {(op === 'watermark' || op === 'protect') && (
            <div style={{ marginBottom: '16px' }}>
              <label className="tool-field">
                <span>{op === 'watermark' ? 'Watermark Text' : 'Protection Password'}</span>
                <input
                  type={op === 'protect' ? 'password' : 'text'}
                  className="tool-input"
                  placeholder={op === 'watermark' ? 'CONFIDENTIAL' : 'Enter password'}
                  value={param}
                  onChange={e => setParam(e.target.value)}
                  disabled={running}
                />
              </label>
            </div>
          )}

          <DropArea
            label="Drop PDF files here to batch process"
            hint="Select 2 or more files"
            multiple={true}
            onFiles={handleAddFiles}
          />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h3 style={{ margin: 0, fontSize: '15px' }}>
              Files to Process ({files.length})
            </h3>
            {files.length > 0 && !running && (
              <button className="btn btn-white sm" onClick={clearAll}>Clear all</button>
            )}
          </div>

          {files.length === 0 ? (
            <div style={{ border: '2px dashed var(--line)', borderRadius: '10px', padding: '40px 20px', textAlign: 'center', color: 'var(--sub)', fontSize: '13px' }}>
              No files queued. Add multiple PDF files to process them together.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '380px', overflowY: 'auto', marginBottom: '16px' }}>
              {files.map(f => (
                <div
                  key={f.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--line)',
                    background: '#fff'
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0, marginRight: '10px' }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.name}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--sub)' }}>
                      {prettySize(f.size)} · {f.status.toUpperCase()}
                      {f.error && <span style={{ color: '#d33', marginLeft: '6px' }}>({f.error})</span>}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {f.status === 'done' && f.resultBlob && (
                      <button
                        className="btn btn-white sm"
                        onClick={() => download(f.resultBlob, f.resultName || f.name)}
                        title="Download file"
                      >
                        💾
                      </button>
                    )}
                    {!running && (
                      <button
                        className="btn btn-white sm"
                        style={{ color: '#d33' }}
                        onClick={() => removeFile(f.id)}
                        title="Remove"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="tool-actions">
            {running ? (
              <button className="btn btn-white sm" onClick={cancelBatch}>
                {cancelling ? 'Cancelling…' : 'Cancel Batch'}
              </button>
            ) : (
              <button
                className="btn btn-primary"
                disabled={files.length === 0}
                onClick={runBatch}
              >
                Start Batch ({files.length} files)
              </button>
            )}

            {doneCount > 0 && !running && (
              <button className="btn btn-white" onClick={downloadAllZip}>
                📦 Download All as ZIP ({doneCount})
              </button>
            )}
          </div>
        </div>
      </div>
    </ToolShell>
  )
}
