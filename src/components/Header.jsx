import React from 'react'
import { baseName } from '../utils/misc'
import { useI18n } from '../lib/i18n'

export default function Header({ fileName, dirty, busy, onRestart, onApply, onHome }) {
  const { t } = useI18n()
  return (
    <div className="header">
      <div className="brand-mini">
        <div className="brand-logo">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" fill="#fff" />
            <path d="M14 3l4 4h-4z" fill="#10b981" />
            <path d="M8.6 15.2l5-5 1.7 1.7-5 5-2 .3z" fill="#10b981" />
          </svg>
        </div>
        <strong>EditPDF</strong>
      </div>

      <button className="header-home" onClick={onHome} title="Back to all tools">{t('allTools', 'All tools')}</button>

      <span className="fname">{fileName}</span>
      {dirty && <span className="badge-dirty">{t('modified', 'Modified')}</span>}

      <div className="spacer" />

      <button className="btn btn-white" onClick={onRestart} disabled={!!busy}>{t('startOver', 'Start over')}</button>
      <button className="btn btn-primary" onClick={onApply} disabled={!!busy}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" />
        </svg>
        {t('applyChanges', 'Apply Changes')}
      </button>
    </div>
  )
}
