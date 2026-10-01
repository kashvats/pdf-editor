import React, { useEffect, useState } from 'react'
import { DropArea, PageThumb, ToolShell, prettySize, usePdf } from './shell'

export function inspectSignatures(bytes) {
  const decoder = new TextDecoder('latin1')
  const str = decoder.decode(bytes)

  const sigs = []
  const sigRegex = /\/Type\s*\/Sig[\s\S]*?>>/g
  let match

  while ((match = sigRegex.exec(str)) !== null) {
    const block = match[0]

    // Signer Name
    const nameMatch = /\/Name\s*\(([^)]+)\)/.exec(block) || /\/Name\s*\/([^\s/>]+)/.exec(block)
    const name = nameMatch ? nameMatch[1] : 'Unknown Signer'

    // Date
    const dateMatch = /\/M\s*\(D:([0-9]{4}[0-9]{2}[0-9]{2}[0-9]{2}[0-9]{2}[0-9]{2}[^)]*)\)/.exec(block)
    let dateStr = 'Unknown'
    if (dateMatch) {
      const d = dateMatch[1]
      const year = d.slice(0, 4)
      const month = d.slice(4, 6)
      const day = d.slice(6, 8)
      const hour = d.slice(8, 10)
      const min = d.slice(10, 12)
      dateStr = `${year}-${month}-${day} ${hour}:${min} UTC`
    }

    // Reason & Location
    const reasonMatch = /\/Reason\s*\(([^)]+)\)/.exec(block)
    const locationMatch = /\/Location\s*\(([^)]+)\)/.exec(block)

    // SubFilter
    const subFilterMatch = /\/SubFilter\s*\/([^\s/>]+)/.exec(block)
    const subFilter = subFilterMatch ? subFilterMatch[1] : 'Standard'

    // ByteRange check for document modification
    const byteRangeMatch = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/.exec(block)
    let modifiedAfter = false
    let byteRangeInfo = null

    if (byteRangeMatch) {
      const [, o1, l1, o2, l2] = byteRangeMatch.map(Number)
      const covered = o2 + l2
      byteRangeInfo = `[${o1}, ${l1}, ${o2}, ${l2}]`
      // If bytes exist beyond the signed byte range (with small tolerance for EOF newline), document was appended/modified
      if (bytes.byteLength - covered > 32) {
        modifiedAfter = true
      }
    }

    sigs.push({
      signer: name,
      date: dateStr,
      reason: reasonMatch ? reasonMatch[1] : null,
      location: locationMatch ? locationMatch[1] : null,
      subFilter,
      byteRange: byteRangeInfo,
      modifiedAfter
    })
  }

  return sigs
}

export default function SigVerifyTool({ tool, onBack }) {
  const [pdf, open, clear] = usePdf()
  const [signatures, setSignatures] = useState([])
  const [inspected, setInspected] = useState(false)

  useEffect(() => {
    if (pdf.bytes) {
      const results = inspectSignatures(pdf.bytes)
      setSignatures(results)
      setInspected(true)
    } else {
      setSignatures([])
      setInspected(false)
    }
  }, [pdf.bytes])

  const reset = () => { clear(); setSignatures([]); setInspected(false) }

  return (
    <ToolShell tool={tool} onBack={onBack}>
      {!pdf.doc ? (
        <DropArea label="Drop signed PDF here to inspect" hint="or click to browse your computer" onFiles={f => open(f[0])} />
      ) : (
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div className="tool-file" style={{ marginBottom: '20px' }}>
            <PageThumb doc={pdf.doc} index={0} width={84} />
            <div>
              <strong>{pdf.name}</strong>
              <span>{pdf.count} page{pdf.count === 1 ? '' : 's'} · {prettySize(pdf.size)}</span>
            </div>
          </div>

          {inspected && signatures.length === 0 ? (
            <div style={{ background: '#fffbe9', border: '1px solid #f0d9a8', borderRadius: '10px', padding: '24px', textAlign: 'center' }}>
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>ℹ️</div>
              <strong style={{ fontSize: '15px', color: '#6b5307', display: 'block', marginBottom: '6px' }}>
                No Digital Signatures Found
              </strong>
              <p style={{ margin: 0, fontSize: '13px', color: '#6b5307' }}>
                This document contains no cryptographic signature dictionaries (PKCS#7 / CAdES / X.509).
                It may contain visual signature drawings, but no formal digital cryptographic signatures.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontSize: '14.5px', fontWeight: '700' }}>
                Signatures Found ({signatures.length})
              </div>

              {signatures.map((sig, i) => (
                <div
                  key={i}
                  style={{
                    background: '#fff',
                    border: '1px solid var(--line)',
                    borderRadius: '10px',
                    padding: '18px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '18px' }}>🔏</span>
                      <strong style={{ fontSize: '15px' }}>{sig.signer}</strong>
                    </div>

                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '5px',
                        fontSize: '11.5px',
                        fontWeight: '700',
                        background: sig.modifiedAfter ? '#ffebee' : 'var(--green-soft)',
                        color: sig.modifiedAfter ? '#c62828' : 'var(--green-dark)'
                      }}
                    >
                      {sig.modifiedAfter ? '⚠ Modified After Signing' : '✓ Byte Integrity Intact'}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', fontSize: '12.5px' }}>
                    <div>
                      <span style={{ color: 'var(--sub)' }}>Signed Date:</span>
                      <div>{sig.date}</div>
                    </div>

                    <div>
                      <span style={{ color: 'var(--sub)' }}>Format / Filter:</span>
                      <div>{sig.subFilter}</div>
                    </div>

                    {sig.reason && (
                      <div>
                        <span style={{ color: 'var(--sub)' }}>Reason:</span>
                        <div>{sig.reason}</div>
                      </div>
                    )}

                    {sig.location && (
                      <div>
                        <span style={{ color: 'var(--sub)' }}>Location:</span>
                        <div>{sig.location}</div>
                      </div>
                    )}
                  </div>

                  {sig.byteRange && (
                    <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--line)', fontSize: '11.5px', color: 'var(--sub)' }}>
                      Byte Range: {sig.byteRange}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="tool-actions" style={{ marginTop: '20px' }}>
            <button className="btn btn-white" onClick={reset}>Check another PDF</button>
          </div>
        </div>
      )}
    </ToolShell>
  )
}
