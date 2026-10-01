import React, { useState } from 'react'
import { convertToPdfA } from '../../lib/pdfa'
import { DropArea, PageThumb, Result, ToolShell, baseOf, download, prettySize, usePdf } from './shell'

const CONFORMANCE_LEVELS = [
  {
    id: '1b',
    name: 'PDF/A-1b (ISO 19005-1)',
    blurb: 'Basic visual preservation compliance. The most widely accepted ISO archiving standard.'
  },
  {
    id: '2b',
    name: 'PDF/A-2b (ISO 19005-2)',
    blurb: 'Modern ISO archiving standard supporting layer transparency and modern compression.'
  }
]

export default function PdfATool({ tool, onBack }) {
  const [pdf, open, clear] = usePdf()
  const [conformance, setConformance] = useState('1b')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  const [error, setError] = useState(null)

  const reset = () => { clear(); setDone(null); setError(null); setBusy(false) }

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      const blob = await convertToPdfA(pdf.bytes, { conformance })
      const name = `${baseOf(pdf.name)}-PDFA.pdf`
      download(blob, name)
      setDone(
        `${name} downloaded — converted to PDF/A-${conformance.toUpperCase()} with embedded XMP archival metadata and standard color output intent.`
      )
    } catch (e) {
      setError(e?.message || String(e))
    }
    setBusy(false)
  }

  return (
    <ToolShell tool={tool} onBack={onBack}>
      {!pdf.doc ? (
        <DropArea label="Drop your PDF here to convert to PDF/A" hint="or click to browse your computer" onFiles={f => open(f[0])} />
      ) : done ? (
        <Result text={done} onReset={reset} />
      ) : (
        <>
          <div className="tool-file">
            <PageThumb doc={pdf.doc} index={0} width={84} />
            <div>
              <strong>{pdf.name}</strong>
              <span>{pdf.count} page{pdf.count === 1 ? '' : 's'} · {prettySize(pdf.size ?? pdf.bytes.byteLength)}</span>
            </div>
          </div>

          <p className="tool-note">
            PDF/A is an ISO-standardized version of the PDF format specialized for preservation
            and long-term archiving. It embeds standard color profiles, XMP schema validation,
            and strips non-archival scripts so your document remains viewable for decades.
          </p>

          <div className="tool-options">
            {CONFORMANCE_LEVELS.map(c => (
              <label key={c.id} className={`tool-option ${conformance === c.id ? 'on' : ''}`}>
                <input type="radio" checked={conformance === c.id} onChange={() => setConformance(c.id)} />
                <div>
                  <strong>{c.name}</strong>
                  <span>{c.blurb}</span>
                </div>
              </label>
            ))}
          </div>

          <div className="tool-actions">
            <button className="btn btn-white" onClick={reset}>Choose another file</button>
            <div style={{ flex: 1 }} />
            <button className="btn btn-primary" disabled={busy} onClick={run}>
              {busy ? 'Converting…' : 'Convert to PDF/A'}
            </button>
          </div>
        </>
      )}
      {(error || pdf.error) && <div className="error-box">{error || pdf.error}</div>}
    </ToolShell>
  )
}
