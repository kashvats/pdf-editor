import React, { useState } from 'react'
import { GROUPS, TOOLS } from '../tools'
import { useI18n } from '../lib/i18n'

export default function Home({ onOpen }) {
  const { t } = useI18n()
  const [filterQuery, setFilterQuery] = useState('')
  const [activeGroup, setActiveGroup] = useState('All')

  const groups = ['All', ...GROUPS]

  const matchesSearch = t => {
    if (!filterQuery.trim()) return true
    const q = filterQuery.toLowerCase()
    return (
      t.name.toLowerCase().includes(q) ||
      t.blurb.toLowerCase().includes(q) ||
      t.group.toLowerCase().includes(q)
    )
  }

  return (
    <div className="home">
      <div className="brand">
        <div className="brand-logo">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" fill="#fff" />
            <path d="M14 3l4 4h-4z" fill="#10b981" />
            <path d="M8.6 15.2l5-5 1.7 1.7-5 5-2 .3z" fill="#10b981" />
          </svg>
        </div>
        <div className="brand-name">Edit<span>PDF</span></div>
      </div>

      <h1>{t('tagline', 'The Private Document Workspace')}</h1>
      <p className="sub">
        {t('subTagline', '50+ client-side PDF tools running 100% locally in your browser. Zero uploads, zero servers, and guaranteed document privacy.')}
      </p>

      {/* Filter and Quick Search Bar */}
      <div style={{ width: '100%', maxWidth: '1040px', marginBottom: '28px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ position: 'relative', width: '100%' }}>
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ position: 'absolute', left: '14px', top: '12px', color: 'var(--muted)' }}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder={t('searchPlaceholder', 'Search all 50+ tools (e.g. OCR, Compress, Redact, Word, Mind Map)...')}
            value={filterQuery}
            onChange={e => setFilterQuery(e.target.value)}
            style={{
              width: '100%',
              height: '42px',
              padding: '0 40px 0 40px',
              borderRadius: '8px',
              border: '1px solid var(--line)',
              background: '#fff',
              fontSize: '13.5px',
              boxSizing: 'border-box',
              outline: 'none',
              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)'
            }}
          />
          {filterQuery && (
            <button
              onClick={() => setFilterQuery('')}
              style={{ position: 'absolute', right: '12px', top: '12px', color: 'var(--sub)', fontSize: '13px' }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Group Filter Pills */}
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
          {groups.map(g => (
            <button
              key={g}
              onClick={() => setActiveGroup(g)}
              style={{
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '600',
                whiteSpace: 'nowrap',
                border: '1px solid',
                borderColor: activeGroup === g ? 'var(--ink)' : 'var(--line)',
                background: activeGroup === g ? 'var(--ink)' : '#fff',
                color: activeGroup === g ? '#fff' : 'var(--sub)',
                transition: 'all 0.12s'
              }}
            >
              {g === 'All' ? t('all', 'All') : t(g, g)}
            </button>
          ))}
        </div>
      </div>

      {GROUPS.filter(g => activeGroup === 'All' || activeGroup === g).map(group => {
        const tools = TOOLS.filter(t => t.group === group && matchesSearch(t))
        if (!tools.length) return null
        return (
          <section className="home-section" key={group}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h2 className="home-group" style={{ margin: 0 }}>{t(group, group)}</h2>
              <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600' }}>
                {tools.length} {t('toolsCount', 'tools')}
              </span>
            </div>
            <div className="home-grid">
              {tools.map(t => (
                <button key={t.id} className="home-card" onClick={() => onOpen(t.id)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <span className="home-ic" style={{ background: '#f1f5f9', color: 'var(--ink)', margin: 0 }}>
                      {t.icon}
                    </span>
                    <span className="home-name" style={{ margin: 0 }}>{t.name}</span>
                  </div>
                  <span className="home-blurb">{t.blurb}</span>
                </button>
              ))}
            </div>
          </section>
        )
      })}

      <div className="privacy">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
        {t('privacyNote', '100% private — files are processed in your browser and never uploaded')}
      </div>
    </div>
  )
}

