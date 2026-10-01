import React, { useState } from 'react'
import { pdfToMarkdown } from '../../lib/markdown'
import { DropArea, PageThumb, ToolShell, baseOf, download, prettySize, usePdf } from './shell'

export default function MarkdownTool({ tool, onBack }) {
  const [pdf, open, clear] = usePdf()
  const [markdown, setMarkdown] = useState(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pct, setPct] = useState(0)
  const [error, setError] = useState(null)

  const reset = () => {
    clear()
    setMarkdown(null)
    setCopied(false)
    setError(null)
    setPct(0)
  }

  const run = async () => {
    setBusy(true)
    setError(null)
    setPct(0)
    try {
      const md = await pdfToMarkdown(pdf.bytes, setPct)
      setMarkdown(md)
    } catch (e) {
      setError(e?.message || String(e))
    }
    setBusy(false)
  }

  const handleCopy = async () => {
    if (!markdown) return
    try {
      await navigator.clipboard.writeText(markdown)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
      const ta = document.createElement('textarea')
      ta.value = markdown
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleDownload = () => {
    if (!markdown) return
    const name = `${baseOf(pdf.name)}.md`
    download(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }), name)
  }

  const wordCount = markdown ? markdown.split(/\s+/).filter(Boolean).length : 0

  return (
    <ToolShell tool={tool} onBack={onBack}>
      {!pdf.doc ? (
        <DropArea label="Drop your PDF here to convert to Markdown" hint="or click to browse your computer" onFiles={f => open(f[0])} />
      ) : markdown !== null ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '14px', background: '#fff', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--line)' }}>
            <div>
              <strong style={{ fontSize: '14px' }}>{baseOf(pdf.name)}.md</strong>
              <div style={{ fontSize: '12px', color: 'var(--sub)', marginTop: '2px' }}>
                {wordCount} words · {markdown.length} characters · {pdf.count} page{pdf.count === 1 ? '' : 's'}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-white sm" onClick={handleCopy}>
                {copied ? '✓ Copied!' : '📋 Copy Markdown'}
              </button>
              <button className="btn btn-primary sm" onClick={handleDownload}>
                💾 Download .md
              </button>
              <button className="btn btn-white sm" onClick={reset}>
                Start another
              </button>
            </div>
          </div>

          <div style={{ position: 'relative' }}>
            <textarea
              readOnly
              value={markdown}
              style={{
                width: '100%',
                minHeight: '380px',
                maxHeight: '600px',
                fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                fontSize: '13px',
                lineHeight: '1.6',
                padding: '16px',
                background: '#fafbfa',
                border: '1px solid var(--line)',
                borderRadius: '10px',
                color: 'var(--ink)',
                resize: 'vertical',
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>
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
            Extracts document content into structured GitHub-flavored Markdown with detected
            headings (#, ##, ###), bullet lists, bold/italic accents, and tabular data formatted as Markdown tables.
            Perfect for feeding documents into ChatGPT, Claude, Obsidian, Notion, or documentation sites.
          </p>

          {busy && <div className="ocr-bar"><span style={{ width: `${Math.round(pct * 100)}%` }} /></div>}

          <div className="tool-actions">
            <button className="btn btn-white" onClick={reset}>Choose another file</button>
            <div style={{ flex: 1 }} />
            <button className="btn btn-primary" disabled={busy} onClick={run}>
              {busy ? 'Extracting Markdown…' : 'Convert to Markdown'}
            </button>
          </div>
        </>
      )}
      {(error || pdf.error) && <div className="error-box">{error || pdf.error}</div>}
    </ToolShell>
  )
}
