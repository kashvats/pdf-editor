import React, { useEffect, useState } from 'react'
import { getDocumentVersions, deleteDocumentVersion } from '../lib/db'
import { setActiveDocument } from '../lib/workspace'
import { download, prettySize } from './tools/shell'

export default function DocumentHistoryModal({ docName, onClose, onRestore }) {
  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const list = await getDocumentVersions(docName)
    setVersions(list)
    setLoading(false)
  }

  useEffect(() => {
    if (docName) load()
  }, [docName])

  const handleRestore = async v => {
    await setActiveDocument({
      name: v.docName,
      bytes: v.bytes,
      saveVersion: false
    })
    onRestore?.(v)
    onClose()
  }

  const handleDelete = async (id, e) => {
    e.stopPropagation()
    await deleteDocumentVersion(id)
    load()
  }

  return (
    <div className="modal-wrap" onClick={onClose}>
      <div
        className="modal"
        style={{ width: '560px', maxWidth: '92vw', padding: '24px', textAlign: 'left' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '17px' }}>Document History</h3>
            <span style={{ fontSize: '12.5px', color: 'var(--sub)' }}>{docName}</span>
          </div>
          <button className="tool-back" onClick={onClose} style={{ margin: 0 }}>
            ✕
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '24px' }}>Loading history…</div>
        ) : versions.length === 0 ? (
          <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--sub)', fontSize: '13px' }}>
            No previous versions recorded in local browser storage yet. Changes made in tools and the editor are saved here automatically.
          </div>
        ) : (
          <div style={{ maxHeight: '360px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {versions.map((v, i) => (
              <div
                key={v.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--line)',
                  background: i === 0 ? '#f6fbf7' : '#fff'
                }}
              >
                <div>
                  <div style={{ fontWeight: '600', fontSize: '13.5px' }}>
                    {v.label || `Version ${versions.length - i}`}
                    {i === 0 && <span style={{ marginLeft: '8px', fontSize: '11px', background: 'var(--green)', color: '#fff', padding: '2px 6px', borderRadius: '4px' }}>Latest</span>}
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--sub)', marginTop: '2px' }}>
                    {new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · {prettySize(v.size)}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    className="btn btn-white sm"
                    onClick={() => download(new Blob([v.bytes], { type: 'application/pdf' }), `${v.docName}-v${versions.length - i}.pdf`)}
                    title="Download version"
                  >
                    💾
                  </button>
                  <button
                    className="btn btn-primary sm"
                    onClick={() => handleRestore(v)}
                  >
                    Restore
                  </button>
                  <button
                    className="btn btn-white sm"
                    style={{ color: '#d33' }}
                    onClick={e => handleDelete(v.id, e)}
                    title="Delete record"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
