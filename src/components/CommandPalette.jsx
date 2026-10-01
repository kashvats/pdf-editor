import React, { useEffect, useRef, useState } from 'react'
import { TOOLS } from '../tools'

export default function CommandPalette({ isOpen, onClose, onSelectTool, onAction }) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  const filtered = TOOLS.filter(t => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return (
      t.name.toLowerCase().includes(q) ||
      t.blurb.toLowerCase().includes(q) ||
      t.group.toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q)
    )
  }).sort((a, b) => {
    if (!query.trim()) return 0
    const q = query.toLowerCase()
    const aNameStart = a.name.toLowerCase().startsWith(q) || a.id.toLowerCase() === q
    const bNameStart = b.name.toLowerCase().startsWith(q) || b.id.toLowerCase() === q
    if (aNameStart && !bNameStart) return -1
    if (!aNameStart && bNameStart) return 1
    const aNameInc = a.name.toLowerCase().includes(q)
    const bNameInc = b.name.toLowerCase().includes(q)
    if (aNameInc && !bNameInc) return -1
    if (!aNameInc && bNameInc) return 1
    return 0
  })

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const handleKeyDown = e => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => (i + 1) % Math.max(1, filtered.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => (i - 1 + filtered.length) % Math.max(1, filtered.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[selectedIndex]) {
        onSelectTool(filtered[selectedIndex].id)
        onClose()
      }
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="modal-wrap"
      onClick={onClose}
      style={{ alignItems: 'flex-start', paddingTop: '12vh', backdropFilter: 'blur(3px)' }}
    >
      <div
        className="modal"
        style={{
          width: '580px',
          maxWidth: '92vw',
          padding: 0,
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 16px 40px rgba(0,0,0,0.22)',
          textAlign: 'left'
        }}
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--line)', background: '#fff' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--sub)', marginRight: '12px' }}>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a tool or command (e.g. OCR, Compress, Redact, Word)..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              fontSize: '15px',
              fontFamily: 'inherit',
              background: 'transparent'
            }}
          />
          <kbd style={{ fontSize: '11px', padding: '3px 6px', background: '#f0f2f0', borderRadius: '5px', color: 'var(--sub)', border: '1px solid var(--line)' }}>
            ESC
          </kbd>
        </div>

        <div style={{ maxHeight: '340px', overflowY: 'auto', padding: '6px' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--sub)', fontSize: '13px' }}>
              No matching tools found for "{query}"
            </div>
          ) : (
            filtered.map((t, idx) => {
              const active = idx === selectedIndex
              return (
                <div
                  key={t.id}
                  onClick={() => {
                    onSelectTool(t.id)
                    onClose()
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    background: active ? 'var(--green-soft)' : 'transparent',
                    color: active ? 'var(--green-dark)' : 'var(--ink)'
                  }}
                >
                  <span
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '6px',
                      display: 'grid',
                      placeItems: 'center',
                      background: t.tint,
                      color: t.ink,
                      flex: 'none'
                    }}
                  >
                    {t.icon}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: '600', fontSize: '13.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {t.name}
                      <span style={{ fontSize: '10.5px', color: 'var(--sub)', fontWeight: 'normal' }}>
                        {t.group}
                      </span>
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--sub)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.blurb}
                    </div>
                  </div>
                  {active && (
                    <span style={{ fontSize: '11px', color: 'var(--green-dark)', fontWeight: '600' }}>
                      ↵ Enter
                    </span>
                  )}
                </div>
              )
            })
          )}
        </div>

        <div style={{ padding: '8px 16px', background: '#f9faf9', borderTop: '1px solid var(--line)', fontSize: '11.5px', color: 'var(--sub)', display: 'flex', justifyContent: 'space-between' }}>
          <span>↑↓ to navigate · ↵ to select</span>
          <span>EditPDF Unified Workspace</span>
        </div>
      </div>
    </div>
  )
}
