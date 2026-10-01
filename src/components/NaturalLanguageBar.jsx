import React, { useState } from 'react'
import { deletePages, compressPdf, stampPdf, organisePages } from '../lib/pdfops'
import { protectPdf } from '../lib/security'
import { convertToPdfA } from '../lib/pdfa'
import { updateActiveDocument } from '../lib/workspace'
import { download, baseOf } from './tools/shell'

// Safe parsing: maps natural language intents strictly to static function recipes
export function parseNaturalLanguageCommands(input, pageCount) {
  const steps = []
  const text = input.trim()

  // 1. Delete / Remove pages (e.g. "remove pages 2-4", "delete page 3", "delete pages 1, 3, 5")
  const delMatch = /(?:remove|delete|drop)\s+page[s]?\s+([0-9\s,\-]+)/i.exec(text)
  if (delMatch) {
    const raw = delMatch[1].trim()
    const pagesToRemove = new Set()
    raw.split(',').forEach(part => {
      const range = part.trim().split('-')
      if (range.length === 2) {
        const from = Math.max(1, parseInt(range[0], 10))
        const to = Math.min(pageCount, parseInt(range[1], 10))
        for (let p = from; p <= to; p++) pagesToRemove.add(p - 1)
      } else {
        const p = parseInt(part.trim(), 10)
        if (!isNaN(p) && p >= 1 && p <= pageCount) pagesToRemove.add(p - 1)
      }
    })
    if (pagesToRemove.size > 0 && pagesToRemove.size < pageCount) {
      steps.push({
        id: 'delete',
        name: `Delete page(s) ${Array.from(pagesToRemove).map(p => p + 1).join(', ')}`,
        fn: async bytes => deletePages(bytes, Array.from(pagesToRemove))
      })
    }
  }

  // 2. Rotate (e.g. "rotate 90", "turn 180 degrees", "rotate clockwise")
  if (/rotate|turn/i.test(text)) {
    let deg = 90
    if (/180/i.test(text)) deg = 180
    else if (/270/i.test(text) || /counter/i.test(text)) deg = 270
    steps.push({
      id: 'rotate',
      name: `Rotate pages by ${deg}°`,
      fn: async bytes => {
        const entries = Array.from({ length: pageCount }, (_, i) => ({ src: i, rotate: deg }))
        return organisePages(bytes, entries)
      }
    })
  }

  // 3. Compress (e.g. "compress this file", "reduce size", "shrink PDF")
  if (/compress|shrink|reduce size/i.test(text)) {
    const isStrong = /strong|maximum|high/i.test(text)
    steps.push({
      id: 'compress',
      name: `Compress PDF (${isStrong ? 'Strong' : 'Balanced'})`,
      fn: async bytes => {
        const res = await compressPdf(bytes, { quality: isStrong ? 0.42 : 0.62, maxSide: isStrong ? 1400 : 1800 })
        return res.blob
      }
    })
  }

  // 4. Watermark (e.g. "add CONFIDENTIAL watermark", "stamp DRAFT")
  const wmMatch = /(?:watermark|stamp)\s+(?:["']([^"']+)["']|([A-Za-z0-9_\s]+))/i.exec(text)
  if (wmMatch) {
    const wmText = (wmMatch[1] || wmMatch[2] || 'CONFIDENTIAL').trim().replace(/watermark$/i, '').trim()
    if (wmText) {
      steps.push({
        id: 'watermark',
        name: `Add watermark "${wmText}"`,
        fn: async bytes => stampPdf(bytes, { kind: 'watermark', text: wmText, opacity: 0.2, angle: 45 })
      })
    }
  }

  // 5. Page Numbers (e.g. "add page numbers", "number the pages")
  if (/page number|numbering/i.test(text)) {
    steps.push({
      id: 'numbers',
      name: 'Add page numbers at bottom-center',
      fn: async bytes => stampPdf(bytes, { kind: 'numbers', position: 'bottom-center', format: '{n} / {total}' })
    })
  }

  // 6. Protect with password (e.g. "protect with password secret123", "password 'abc'")
  const pwdMatch = /(?:protect|password)\s+(?:with\s+)?(?:["']([^"']+)["']|([^\s,]+))/i.exec(text)
  if (pwdMatch) {
    const pwd = (pwdMatch[1] || pwdMatch[2] || '').trim()
    if (pwd && pwd.length >= 3) {
      steps.push({
        id: 'protect',
        name: `Protect PDF with password`,
        fn: async bytes => protectPdf(bytes, { userPassword: pwd, permissions: {} })
      })
    }
  }

  // 7. Convert to PDF/A (e.g. "archive", "convert to pdf/a")
  if (/pdf\/a|archive/i.test(text)) {
    steps.push({
      id: 'pdfa',
      name: 'Convert to PDF/A-1b archival standard',
      fn: async bytes => convertToPdfA(bytes, { conformance: '1b' })
    })
  }

  return steps
}

export default function NaturalLanguageBar({ doc, onClose, onSuccess }) {
  const [prompt, setPrompt] = useState('')
  const [plannedSteps, setPlannedSteps] = useState([])
  const [executing, setExecuting] = useState(false)
  const [currentStepIndex, setCurrentStepIndex] = useState(-1)
  const [error, setError] = useState(null)

  const handleParse = () => {
    setError(null)
    if (!doc || !doc.bytes) {
      setError('Please open a document in the workspace first.')
      return
    }
    const steps = parseNaturalLanguageCommands(prompt, doc.count)
    if (!steps.length) {
      setError('Could not identify registered actions from that prompt. Try e.g.: "Remove pages 2-3, compress this file, add CONFIDENTIAL watermark and protect with password 123".')
      return
    }
    setPlannedSteps(steps)
  }

  const handleExecute = async () => {
    if (!doc || !plannedSteps.length) return
    setExecuting(true)
    setError(null)
    try {
      let currentBytes = doc.bytes
      for (let i = 0; i < plannedSteps.length; i++) {
        setCurrentStepIndex(i)
        const step = plannedSteps[i]
        const blobOrResult = await step.fn(currentBytes)
        currentBytes = blobOrResult instanceof Blob
          ? new Uint8Array(await blobOrResult.arrayBuffer())
          : currentBytes
      }

      await updateActiveDocument(currentBytes, `AI Action: ${plannedSteps.map(s => s.id).join(', ')}`)
      download(new Blob([currentBytes], { type: 'application/pdf' }), `${baseOf(doc.name)}-actioned.pdf`)
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(`Action failed: ${err?.message || err}`)
    } finally {
      setExecuting(false)
      setCurrentStepIndex(-1)
    }
  }

  return (
    <div className="modal-wrap" onClick={onClose} style={{ alignItems: 'flex-start', paddingTop: '10vh' }}>
      <div
        className="modal"
        style={{ width: '600px', maxWidth: '92vw', padding: '24px', textAlign: 'left', borderRadius: '12px' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '17px' }}>Natural-Language PDF Actions</h3>
            <span style={{ fontSize: '12px', color: 'var(--sub)' }}>
              Type your intent in plain English — reviewed before execution
            </span>
          </div>
          <button className="tool-back" onClick={onClose} style={{ margin: 0 }}>✕</button>
        </div>

        <div style={{ marginBottom: '14px' }}>
          <textarea
            placeholder='e.g. "Delete page 2, compress PDF, and add CONFIDENTIAL watermark"'
            value={prompt}
            onChange={e => {
              setPrompt(e.target.value)
              setPlannedSteps([])
            }}
            rows={3}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid var(--line)',
              fontFamily: 'inherit',
              fontSize: '14px',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <button
            className="btn btn-primary sm"
            onClick={handleParse}
            disabled={!prompt.trim() || executing}
          >
            Review Planned Actions
          </button>
          <button
            className="btn btn-white sm"
            onClick={() => {
              setPrompt('Remove page 2, compress PDF, and add CONFIDENTIAL watermark')
              setPlannedSteps([])
            }}
          >
            Example prompt
          </button>
        </div>

        {plannedSteps.length > 0 && (
          <div style={{ background: '#f8faf8', border: '1px solid var(--line)', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: '700', marginBottom: '10px', color: 'var(--ink)' }}>
              Verified Action Plan ({plannedSteps.length} steps):
            </div>
            <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '13.5px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {plannedSteps.map((s, idx) => (
                <li key={idx} style={{ color: currentStepIndex === idx ? 'var(--green-dark)' : 'inherit', fontWeight: currentStepIndex === idx ? '700' : 'normal' }}>
                  {s.name} {currentStepIndex === idx && '⏳ (Running…)'}
                </li>
              ))}
            </ol>
            <div style={{ marginTop: '14px', display: 'flex', gap: '8px' }}>
              <button
                className="btn btn-primary"
                onClick={handleExecute}
                disabled={executing}
              >
                {executing ? 'Executing Plan…' : '✓ Execute & Download'}
              </button>
              <button
                className="btn btn-white"
                onClick={() => setPlannedSteps([])}
                disabled={executing}
              >
                Change
              </button>
            </div>
          </div>
        )}

        {error && <div className="error-box" style={{ marginTop: '10px' }}>{error}</div>}
      </div>
    </div>
  )
}
