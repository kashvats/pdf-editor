import React, { useState } from 'react'
import { ocrToSearchablePdf, ocrToWord, ocrToMarkdown } from '../../lib/ocrpdf'
import { pdfToText } from '../../lib/pdfraster'
import { DropArea, PageThumb, Result, ToolShell, baseOf, download, usePdf } from './shell'

const LANGS = [
  ['eng', 'English'], ['rus', 'Russian'], ['deu', 'German'],
  ['hin', 'Hindi'], ['tel', 'Telugu'], ['tam', 'Tamil'],
  ['ben', 'Bengali'], ['mar', 'Marathi'], ['spa', 'Spanish'],
  ['fra', 'French'], ['ara', 'Arabic'], ['por', 'Portuguese'],
  ['ita', 'Italian'], ['nld', 'Dutch'], ['ind', 'Indonesian'],
  ['msa', 'Malay'], ['chi_sim', 'Chinese'], ['jpn', 'Japanese']
]

export default function OcrTool({ tool, onBack }) {
  const [pdf, open, clear] = usePdf()
  const [langs, setLangs] = useState(['eng'])
  const [onlyEmpty, setOnlyEmpty] = useState(true)
  const [deskew, setDeskew] = useState(true)
  const [contrast, setContrast] = useState(true)
  const [output, setOutput] = useState('pdf')
  const [busy, setBusy] = useState(null)
  const [done, setDone] = useState(null)
  const [error, setError] = useState(null)

  const reset = () => { clear(); setDone(null); setError(null); setBusy(null) }

  const toggle = id => setLangs(l => (l.includes(id) ? l.filter(x => x !== id) : [...l, id]))

  const run = async () => {
    setError(null)
    setBusy({ label: 'Loading the recognition model…', pct: 0 })
    try {
      const base = baseOf(pdf.name)

      if (output === 'docx') {
        const { blob, pages, words } = await ocrToWord(
          pdf.bytes,
          { langs: langs.join('+'), onlyEmpty },
          p => setBusy(p)
        )
        const name = `${base}.docx`
        download(blob, name)
        setDone(`${name} downloaded — ${words} words extracted across ${pages} page${pages === 1 ? '' : 's'}.`)
      } else if (output === 'md') {
        const { text, pages, words } = await ocrToMarkdown(
          pdf.bytes,
          { langs: langs.join('+'), onlyEmpty },
          p => setBusy(p)
        )
        const name = `${base}.md`
        download(new Blob([text], { type: 'text/markdown;charset=utf-8' }), name)
        setDone(`${name} downloaded — ${words} words structured into Markdown across ${pages} page${pages === 1 ? '' : 's'}.`)
      } else if (output === 'text') {
        const { blob, pages, words } = await ocrToSearchablePdf(
          pdf.bytes,
          { langs: langs.join('+'), onlyEmpty },
          p => setBusy(p)
        )
        const text = await pdfToText(await blob.arrayBuffer())
        download(new Blob([text], { type: 'text/plain;charset=utf-8' }), `${base}.txt`)
        setDone(`${base}.txt downloaded — ${words} words read from ${pages} page${pages === 1 ? '' : 's'}.`)
      } else {
        const { blob, pages, words } = await ocrToSearchablePdf(
          pdf.bytes,
          { langs: langs.join('+'), onlyEmpty },
          p => setBusy(p)
        )
        const name = `${base}-searchable.pdf`
        download(blob, name)
        setDone(`${name} downloaded — ${words} words laid over ${pages} page${pages === 1 ? '' : 's'}. It looks the same and can now be searched.`)
      }
    } catch (e) {
      setError(e?.message || String(e))
    }
    setBusy(null)
  }

  return (
    <ToolShell tool={tool} onBack={onBack}>
      {!pdf.doc ? (
        <DropArea label="Drop your scanned PDF here" hint="or click to browse your computer" onFiles={f => open(f[0])} />
      ) : done ? (
        <Result text={done} onReset={reset} />
      ) : (
        <>
          <div className="tool-file">
            <PageThumb doc={pdf.doc} index={0} width={84} />
            <div>
              <strong>{pdf.name}</strong>
              <span>{pdf.count} page{pdf.count === 1 ? '' : 's'}</span>
            </div>
          </div>

          <div className="tool-options">
            <label className={`tool-option ${output === 'pdf' ? 'on' : ''}`}>
              <input type="radio" checked={output === 'pdf'} onChange={() => setOutput('pdf')} />
              <div>
                <strong>A searchable PDF</strong>
                <span>The page keeps its look; the words are laid over it invisibly so they can be selected, searched and copied</span>
              </div>
            </label>
            <label className={`tool-option ${output === 'docx' ? 'on' : ''}`}>
              <input type="radio" checked={output === 'docx'} onChange={() => setOutput('docx')} />
              <div>
                <strong>An editable Word document (.docx)</strong>
                <span>Recognise scanned text and format into an editable Microsoft Word document</span>
              </div>
            </label>
            <label className={`tool-option ${output === 'md' ? 'on' : ''}`}>
              <input type="radio" checked={output === 'md'} onChange={() => setOutput('md')} />
              <div>
                <strong>Markdown (.md)</strong>
                <span>Recognise scanned text with headings and lists for AI prompts, notes and docs</span>
              </div>
            </label>
            <label className={`tool-option ${output === 'text' ? 'on' : ''}`}>
              <input type="radio" checked={output === 'text'} onChange={() => setOutput('text')} />
              <div>
                <strong>Just the text</strong>
                <span>A plain .txt file of everything that was read</span>
              </div>
            </label>
          </div>

          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '14px' }}>
            <label className={`perm ${onlyEmpty ? 'on' : ''}`}>
              <input type="checkbox" checked={onlyEmpty} onChange={e => setOnlyEmpty(e.target.checked)} />
              Skip pages with text
            </label>
            <label className={`perm ${deskew ? 'on' : ''}`}>
              <input type="checkbox" checked={deskew} onChange={e => setDeskew(e.target.checked)} />
              Deskew / Straighten
            </label>
            <label className={`perm ${contrast ? 'on' : ''}`}>
              <input type="checkbox" checked={contrast} onChange={e => setContrast(e.target.checked)} />
              Improve Contrast
            </label>
          </div>

          <div className="ocr-row">
            <span className="ocr-label">Languages</span>
            <div className="ocr-choices">
              {LANGS.map(([id, label]) => (
                <button key={id} className={`ocr-choice ${langs.includes(id) ? 'on' : ''}`} onClick={() => toggle(id)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <p className="tool-fine">
            Recognition runs in your browser. The language model is downloaded once from the
            tesseract.js CDN — your document is not uploaded anywhere.
          </p>

          {busy && (
            <>
              <div className="ocr-bar"><span style={{ width: `${Math.round((busy.pct || 0) * 100)}%` }} /></div>
              <div className="ocr-status">{busy.label}</div>
            </>
          )}

          <div className="tool-actions">
            <button className="btn btn-white" onClick={reset}>Choose another file</button>
            <div style={{ flex: 1 }} />
            <button className="btn btn-primary" disabled={!!busy || !langs.length} onClick={run}>
              {busy ? 'Recognising…' : 'Run OCR'}
            </button>
          </div>
        </>
      )}
      {(error || pdf.error) && <div className="error-box">{error || pdf.error}</div>}
    </ToolShell>
  )
}
