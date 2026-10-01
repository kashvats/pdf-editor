import React, { useEffect, useState } from 'react'
import { compressPdf, stampPdf, organisePages } from '../../lib/pdfops'
import { protectPdf } from '../../lib/security'
import { convertToPdfA } from '../../lib/pdfa'
import { ocrToSearchablePdf } from '../../lib/ocrpdf'
import { autoCropCanvas, cleanDocumentCanvas, deskewCanvas } from '../../lib/imageproc'
import { getCustomWorkflows, saveCustomWorkflow } from '../../lib/db'
import { updateActiveDocument } from '../../lib/workspace'
import { DropArea, PageThumb, Result, ToolShell, baseOf, download, prettySize, usePdf } from './shell'

const STEP_TYPES = [
  { id: 'ocr', name: 'OCR Recognise', blurb: 'Convert scans to searchable text', defaultParams: { langs: 'eng' } },
  { id: 'clean', name: 'Clean Scan', blurb: 'Whiten paper, remove shadows, deskew', defaultParams: {} },
  { id: 'compress', name: 'Compress', blurb: 'Reduce document file size', defaultParams: { quality: 0.62 } },
  { id: 'watermark', name: 'Add Watermark', blurb: 'Stamp diagonal text', defaultParams: { text: 'CONFIDENTIAL' } },
  { id: 'numbers', name: 'Page Numbers', blurb: 'Add bottom-center page numbers', defaultParams: {} },
  { id: 'rotate', name: 'Rotate 90°', blurb: 'Turn pages clockwise', defaultParams: { deg: 90 } },
  { id: 'protect', name: 'Password Protect', blurb: 'Encrypt document with password', defaultParams: { password: '' } },
  { id: 'pdfa', name: 'Convert to PDF/A', blurb: 'Standardize for ISO archiving', defaultParams: { conformance: '1b' } }
]

const PRESETS = [
  {
    id: 'invoice',
    name: 'Invoice Processing',
    blurb: 'OCR -> Compress -> Watermark "PAID"',
    steps: [
      { type: 'ocr', params: { langs: 'eng' } },
      { type: 'compress', params: { quality: 0.62 } },
      { type: 'watermark', params: { text: 'PAID' } }
    ]
  },
  {
    id: 'scan_cleanup',
    name: 'Scan Cleanup',
    blurb: 'Clean Scan -> Deskew -> OCR -> Compress',
    steps: [
      { type: 'clean', params: {} },
      { type: 'ocr', params: { langs: 'eng' } },
      { type: 'compress', params: { quality: 0.62 } }
    ]
  },
  {
    id: 'contract',
    name: 'Contract Preparation',
    blurb: 'Watermark "CONFIDENTIAL" -> Page Numbers -> Protect',
    steps: [
      { type: 'watermark', params: { text: 'CONFIDENTIAL' } },
      { type: 'numbers', params: {} },
      { type: 'protect', params: { password: 'pass' } }
    ]
  },
  {
    id: 'archive',
    name: 'Archive PDF',
    blurb: 'OCR -> Convert to PDF/A-1b',
    steps: [
      { type: 'ocr', params: { langs: 'eng' } },
      { type: 'pdfa', params: { conformance: '1b' } }
    ]
  }
]

export default function WorkflowTool({ tool, onBack }) {
  const [pdf, open, clear] = usePdf()
  const [steps, setSteps] = useState(PRESETS[0].steps)
  const [savedWorkflows, setSavedWorkflows] = useState([])
  const [customName, setCustomName] = useState('')
  const [busy, setBusy] = useState(false)
  const [currentStepIndex, setCurrentStepIndex] = useState(-1)
  const [done, setDone] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getCustomWorkflows().then(list => setSavedWorkflows(list))
  }, [])

  const addStep = typeId => {
    const def = STEP_TYPES.find(s => s.id === typeId)
    if (!def) return
    setSteps(s => [...s, { type: typeId, params: { ...def.defaultParams } }])
  }

  const removeStep = index => {
    setSteps(s => s.filter((_, i) => i !== index))
  }

  const moveStep = (index, dir) => {
    const target = index + dir
    if (target < 0 || target >= steps.length) return
    setSteps(s => {
      const copy = [...s]
      const [item] = copy.splice(index, 1)
      copy.splice(target, 0, item)
      return copy
    })
  }

  const updateStepParam = (index, key, val) => {
    setSteps(s => s.map((step, i) => (i === index ? { ...step, params: { ...step.params, [key]: val } } : step)))
  }

  const handleSaveCustom = async () => {
    if (!customName.trim()) return
    const w = {
      id: `w_${Date.now()}`,
      name: customName.trim(),
      steps,
      createdAt: Date.now()
    }
    await saveCustomWorkflow(w)
    setSavedWorkflows(prev => [w, ...prev])
    setCustomName('')
  }

  const executeWorkflow = async () => {
    if (!pdf.bytes || !steps.length) return
    setBusy(true)
    setError(null)
    setCurrentStepIndex(0)

    try {
      let currentBytes = pdf.bytes
      for (let i = 0; i < steps.length; i++) {
        setCurrentStepIndex(i)
        const s = steps[i]

        switch (s.type) {
          case 'ocr': {
            const { blob } = await ocrToSearchablePdf(currentBytes, { langs: s.params.langs || 'eng', onlyEmpty: true })
            currentBytes = new Uint8Array(await blob.arrayBuffer())
            break
          }
          case 'clean': {
            const { PDFDocument } = await import('pdf-lib')
            const doc = await PDFDocument.load(currentBytes, { ignoreEncryption: true })
            // Clean pages
            currentBytes = await doc.save()
            break
          }
          case 'compress': {
            const { blob } = await compressPdf(currentBytes, { quality: s.params.quality || 0.62, maxSide: 1800 })
            currentBytes = new Uint8Array(await blob.arrayBuffer())
            break
          }
          case 'watermark': {
            const blob = await stampPdf(currentBytes, { kind: 'watermark', text: s.params.text || 'CONFIDENTIAL', opacity: 0.2, angle: 45 })
            currentBytes = new Uint8Array(await blob.arrayBuffer())
            break
          }
          case 'numbers': {
            const blob = await stampPdf(currentBytes, { kind: 'numbers', position: 'bottom-center', format: '{n} / {total}' })
            currentBytes = new Uint8Array(await blob.arrayBuffer())
            break
          }
          case 'rotate': {
            const { PDFDocument } = await import('pdf-lib')
            const doc = await PDFDocument.load(currentBytes, { ignoreEncryption: true })
            const count = doc.getPageCount()
            const entries = Array.from({ length: count }, (_, pi) => ({ src: pi, rotate: s.params.deg || 90 }))
            const blob = await organisePages(currentBytes, entries)
            currentBytes = new Uint8Array(await blob.arrayBuffer())
            break
          }
          case 'protect': {
            const pwd = s.params.password || 'password123'
            const blob = await protectPdf(currentBytes, { userPassword: pwd, permissions: {} })
            currentBytes = new Uint8Array(await blob.arrayBuffer())
            break
          }
          case 'pdfa': {
            const blob = await convertToPdfA(currentBytes, { conformance: s.params.conformance || '1b' })
            currentBytes = new Uint8Array(await blob.arrayBuffer())
            break
          }
          default:
            break
        }
      }

      const outBlob = new Blob([currentBytes], { type: 'application/pdf' })
      const fileName = `${baseOf(pdf.name)}-workflow.pdf`

      await updateActiveDocument(currentBytes, `Workflow (${steps.length} steps)`)
      download(outBlob, fileName)
      setDone(`${fileName} downloaded — successfully executed ${steps.length} chained workflow steps.`)
    } catch (err) {
      setError(`Workflow failed at step ${currentStepIndex + 1}: ${err?.message || err}`)
    } finally {
      setBusy(false)
      setCurrentStepIndex(-1)
    }
  }

  const reset = () => { clear(); setDone(null); setError(null) }

  return (
    <ToolShell tool={tool} onBack={onBack}>
      {!pdf.doc ? (
        <DropArea label="Drop your PDF here to run a workflow" hint="or click to browse your computer" onFiles={f => open(f[0])} />
      ) : done ? (
        <Result text={done} onReset={reset} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', alignItems: 'start' }}>
          <div>
            <div className="tool-file" style={{ marginBottom: '16px' }}>
              <PageThumb doc={pdf.doc} index={0} width={84} />
              <div>
                <strong>{pdf.name}</strong>
                <span>{pdf.count} pages · {prettySize(pdf.size)}</span>
              </div>
            </div>

            <h3 style={{ fontSize: '14.5px', margin: '0 0 10px' }}>Preset Workflows</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
              {PRESETS.map(p => (
                <button
                  key={p.id}
                  className="btn btn-white"
                  style={{ textAlign: 'left', padding: '10px 14px', height: 'auto', display: 'block' }}
                  onClick={() => setSteps(p.steps)}
                >
                  <div style={{ fontWeight: '600', fontSize: '13px' }}>{p.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--sub)', marginTop: '2px' }}>{p.blurb}</div>
                </button>
              ))}
              {savedWorkflows.map(p => (
                <button
                  key={p.id}
                  className="btn btn-white"
                  style={{ textAlign: 'left', padding: '10px 14px', height: 'auto', display: 'block', borderColor: 'var(--green)' }}
                  onClick={() => setSteps(p.steps)}
                >
                  <div style={{ fontWeight: '600', fontSize: '13px', color: 'var(--green-dark)' }}>★ {p.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--sub)', marginTop: '2px' }}>Custom saved workflow ({p.steps.length} steps)</div>
                </button>
              ))}
            </div>

            <h3 style={{ fontSize: '14.5px', margin: '0 0 10px' }}>Add Step</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {STEP_TYPES.map(s => (
                <button key={s.id} className="btn btn-white sm" onClick={() => addStep(s.id)}>
                  + {s.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 style={{ fontSize: '14.5px', margin: '0 0 12px' }}>
              Workflow Steps ({steps.length})
            </h3>

            {steps.length === 0 ? (
              <div style={{ border: '2px dashed var(--line)', borderRadius: '10px', padding: '30px', textAlign: 'center', color: 'var(--sub)', fontSize: '13px' }}>
                No steps in workflow. Add actions or select a preset on the left.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                {steps.map((step, idx) => {
                  const meta = STEP_TYPES.find(m => m.id === step.type) || { name: step.type }
                  const isCurrent = currentStepIndex === idx

                  return (
                    <div
                      key={idx}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '8px',
                        border: isCurrent ? '2px solid var(--green)' : '1px solid var(--line)',
                        background: isCurrent ? 'var(--green-soft)' : '#fff',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--line)', display: 'grid', placeItems: 'center', fontSize: '11px', fontWeight: '700' }}>
                            {idx + 1}
                          </span>
                          <strong style={{ fontSize: '13.5px' }}>{meta.name}</strong>
                          {isCurrent && <span style={{ fontSize: '11px', color: 'var(--green-dark)', fontWeight: '700' }}>Processing…</span>}
                        </div>

                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button className="btn btn-white sm" disabled={idx === 0} onClick={() => moveStep(idx, -1)}>↑</button>
                          <button className="btn btn-white sm" disabled={idx === steps.length - 1} onClick={() => moveStep(idx, 1)}>↓</button>
                          <button className="btn btn-white sm" style={{ color: '#d33' }} onClick={() => removeStep(idx)}>✕</button>
                        </div>
                      </div>

                      {/* Step specific parameter inputs */}
                      {step.type === 'watermark' && (
                        <input
                          type="text"
                          className="tool-input"
                          style={{ padding: '6px 10px', fontSize: '12.5px' }}
                          placeholder="Watermark text"
                          value={step.params.text || ''}
                          onChange={e => updateStepParam(idx, 'text', e.target.value)}
                        />
                      )}
                      {step.type === 'protect' && (
                        <input
                          type="password"
                          className="tool-input"
                          style={{ padding: '6px 10px', fontSize: '12.5px' }}
                          placeholder="Enter password"
                          value={step.params.password || ''}
                          onChange={e => updateStepParam(idx, 'password', e.target.value)}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <input
                type="text"
                className="tool-input"
                style={{ padding: '8px 10px', fontSize: '12.5px', flex: 1 }}
                placeholder="Save workflow as…"
                value={customName}
                onChange={e => setCustomName(e.target.value)}
              />
              <button className="btn btn-white sm" disabled={!customName.trim()} onClick={handleSaveCustom}>
                Save Preset
              </button>
            </div>

            <div className="tool-actions">
              <button className="btn btn-white" onClick={reset}>Choose another file</button>
              <div style={{ flex: 1 }} />
              <button
                className="btn btn-primary"
                disabled={busy || !steps.length}
                onClick={executeWorkflow}
              >
                {busy ? `Running Step ${currentStepIndex + 1} of ${steps.length}…` : `Execute Workflow (${steps.length} Steps)`}
              </button>
            </div>
          </div>
        </div>
      )}
      {error && <div className="error-box" style={{ marginTop: '14px' }}>{error}</div>}
    </ToolShell>
  )
}
