import React, { useEffect, useState, useRef } from 'react'
import { DropArea, PageThumb, ToolShell, baseOf, download, prettySize, usePdf } from './shell'
import { runSecurityInspectionPipeline, runSecuritySanitizePipeline } from '../../lib/securityScanner/client'
import { createDefaultSanitizationPolicy, SECURITY_CAPABILITIES } from '../../lib/securityScanner/types'
import { navigate } from '../../lib/router'

export default function SecurityScannerTool({ tool, initialTab = 'scan', onBack }) {
  const [pdf, open, clear] = usePdf()
  const [tab, setTab] = useState(initialTab) // 'scan' | 'sanitize'
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState(null)
  const [scanError, setScanError] = useState(null)
  const [expandedFindings, setExpandedFindings] = useState(new Set())

  // Sanitization State
  const [sanitizing, setSanitizing] = useState(false)
  const [sanitizeMode, setSanitizeMode] = useState('standard') // 'standard' | 'maximum_safety'
  const [removeAttachments, setRemoveAttachments] = useState(true)
  const [removeMultimedia, setRemoveMultimedia] = useState(true)
  const [stripAllUrls, setStripAllUrls] = useState(false)
  const [flattenForms, setFlattenForms] = useState(false)
  const [allowMailto, setAllowMailto] = useState(false)
  const [confirmSignatureInvalidation, setConfirmSignatureInvalidation] = useState(false)
  const [confirmMaxSafety, setConfirmMaxSafety] = useState(false)

  // Sanitized Output State
  const [sanitizedDoc, setSanitizedDoc] = useState(null)
  const [sanitizeError, setSanitizeError] = useState(null)

  // Sync tab with route
  const handleTabChange = (newTab) => {
    setTab(newTab)
    navigate(newTab === 'sanitize' ? 'sanitize' : 'scanner')
  }

  // Scan PDF whenever a document is opened
  useEffect(() => {
    if (!pdf.bytes) {
      setScanResult(null)
      setSanitizedDoc(null)
      setScanError(null)
      return
    }

    let cancelled = false
    setScanning(true)
    setScanError(null)
    setSanitizedDoc(null)

    runSecurityInspectionPipeline(pdf.bytes, { timeoutMs: 25000 })
      .then(res => {
        if (cancelled) return
        setScanResult(res)
        setScanning(false)
      })
      .catch(err => {
        if (cancelled) return
        setScanError(err?.message || 'Scanning encountered an error.')
        setScanning(false)
      })

    return () => { cancelled = true }
  }, [pdf.bytes])

  const toggleFindingDetails = (id) => {
    setExpandedFindings(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSanitize = async () => {
    if (!pdf.bytes) return
    setSanitizing(true)
    setSanitizeError(null)

    const policy = createDefaultSanitizationPolicy(sanitizeMode)
    policy.removeEmbeddedFiles = removeAttachments
    policy.removeMultimediaAndXfa = removeMultimedia
    policy.flattenForms = flattenForms
    if (allowMailto && sanitizeMode === 'standard') {
      policy.allowedUriSchemes.add('mailto')
    }
    if (stripAllUrls) {
      policy.allowedUriSchemes.clear()
    }

    // Page rendering callback for Maximum Safety mode
    const renderPageCallback = async (pageIndex) => {
      if (!pdf.doc) throw new Error('Document not loaded')
      const page = await pdf.doc.getPage(pageIndex + 1)
      const viewport = page.getViewport({ scale: 2.0 }) // 144-150 DPI target
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      const ctx = canvas.getContext('2d')
      await page.render({ canvasContext: ctx, viewport }).promise

      // Convert canvas to clean PNG bytes
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'))
      const buf = await blob.arrayBuffer()
      return {
        width: Math.floor(viewport.width / 2.0),
        height: Math.floor(viewport.height / 2.0),
        imageBytes: new Uint8Array(buf)
      }
    }

    try {
      const result = await runSecuritySanitizePipeline(pdf.bytes, sanitizeMode, policy, {
        renderPageCallback
      })
      setSanitizedDoc(result)
    } catch (err) {
      setSanitizeError(err?.message || 'Sanitization failed.')
    } finally {
      setSanitizing(false)
    }
  }

  const handleDownload = () => {
    if (!sanitizedDoc?.sanitizedBytes) return
    const blob = new Blob([sanitizedDoc.sanitizedBytes], { type: 'application/pdf' })
    const filename = `${baseOf(pdf.name)}-sanitized.pdf`
    download(blob, filename)
  }

  const hasSignatures = scanResult?.findings?.some(f => f.triggerContext === 'digital_signature')
  const isClean = scanResult?.riskLevel === 'NONE'
  const isPartial = scanResult?.status === 'SCAN_PARTIAL' || scanResult?.status === 'SCAN_FAILED'

  return (
    <ToolShell tool={tool} onBack={onBack}>
      {!pdf.doc ? (
        <div style={{ maxWidth: '520px', margin: '40px auto', textAlign: 'center' }}>
          <div style={{ fontSize: '42px', marginBottom: '10px' }}>🛡️</div>
          <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '6px', color: 'var(--ink)' }}>
            PDF Security Scanner & Sanitizer
          </h3>
          <p style={{ color: 'var(--sub)', fontSize: '13px', marginBottom: '20px', lineHeight: '1.5' }}>
            Inspect PDF structure for active scripts, launch commands, embedded files, and form actions. Sanitize or rebuild a clean copy 100% locally on your device.
          </p>
          <DropArea
            label="Drop PDF here to scan"
            hint="Treats every PDF as untrusted input. Never executes active code."
            onFiles={f => open(f[0])}
          />
        </div>
      ) : (
        <div>
          {/* Top Document Header & Tabs */}
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <PageThumb doc={pdf.doc} index={0} width={42} />
                <div>
                  <strong style={{ fontSize: '14.5px', color: 'var(--ink)' }}>{pdf.name}</strong>
                  <div style={{ fontSize: '12px', color: 'var(--sub)', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                    <span>{pdf.count} pages · {prettySize(pdf.size)}</span>
                    <span style={{ background: '#f1f5f9', color: 'var(--sub)', padding: '2px 6px', borderRadius: '4px', fontWeight: '600' }}>
                      🔒 Local Execution Containment
                    </span>
                  </div>
                </div>
              </div>

              <button className="btn btn-white sm" onClick={clear}>
                Choose another file
              </button>
            </div>

            {/* Mode Tabs */}
            <div style={{ display: 'flex', gap: '6px', borderTop: '1px solid var(--line)', paddingTop: '10px' }}>
              <button
                className={`btn sm ${tab === 'scan' ? 'btn-primary' : 'btn-white'}`}
                style={{
                  height: '28px',
                  fontSize: '12px',
                  background: tab === 'scan' ? 'var(--ink)' : '#fff',
                  color: tab === 'scan' ? '#fff' : 'var(--sub)',
                  borderColor: tab === 'scan' ? 'var(--ink)' : 'var(--line)'
                }}
                onClick={() => handleTabChange('scan')}
              >
                🛡️ Scan & Inspect
              </button>
              <button
                className={`btn sm ${tab === 'sanitize' ? 'btn-primary' : 'btn-white'}`}
                style={{
                  height: '28px',
                  fontSize: '12px',
                  background: tab === 'sanitize' ? 'var(--ink)' : '#fff',
                  color: tab === 'sanitize' ? '#fff' : 'var(--sub)',
                  borderColor: tab === 'sanitize' ? 'var(--ink)' : 'var(--line)'
                }}
                onClick={() => handleTabChange('sanitize')}
              >
                ⚡ Sanitize Document
              </button>
            </div>
          </div>

          {/* Scanning Progress */}
          {scanning && (
            <div style={{ background: '#f8fafc', border: '1px solid var(--line)', borderRadius: '10px', padding: '24px', textAlign: 'center', marginBottom: '16px' }}>
              <div className="spinner" style={{ margin: '0 auto 12px', width: '28px', height: '28px' }} />
              <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--ink)', marginBottom: '4px' }}>
                Analyzing PDF structure for active and dangerous content…
              </div>
              <div style={{ fontSize: '12px', color: 'var(--sub)' }}>
                Checking object graph, actions, annotations, names, and streams without executing code.
              </div>
            </div>
          )}

          {scanError && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '16px', color: '#991b1b', marginBottom: '16px', fontSize: '13px' }}>
              <strong>Scan Error:</strong> {scanError}
            </div>
          )}

          {/* TAB 1: SCAN & INSPECT */}
          {tab === 'scan' && scanResult && !scanning && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Potential Risk Banner */}
              <div style={{
                background: scanResult.riskLevel === 'HIGH' ? '#fef2f2' : (scanResult.riskLevel === 'MEDIUM' ? '#fffbeb' : (scanResult.riskLevel === 'LOW' ? '#f0f9ff' : '#f0fdf4')),
                border: `1px solid ${scanResult.riskLevel === 'HIGH' ? '#fecaca' : (scanResult.riskLevel === 'MEDIUM' ? '#fde68a' : (scanResult.riskLevel === 'LOW' ? '#bae6fd' : '#bbf7d0'))}`,
                borderRadius: '10px',
                padding: '16px 20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                <div>
                  <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: '700', color: scanResult.riskLevel === 'HIGH' ? '#991b1b' : (scanResult.riskLevel === 'MEDIUM' ? '#92400e' : (scanResult.riskLevel === 'LOW' ? '#0369a1' : '#166534')) }}>
                    Potential Risk: {scanResult.riskLevel === 'HIGH' ? 'HIGH RISK' : (scanResult.riskLevel === 'MEDIUM' ? 'MEDIUM RISK' : (scanResult.riskLevel === 'LOW' ? 'LOW RISK' : 'NONE DETECTED'))}
                  </div>
                  <div style={{ fontSize: '13.5px', color: 'var(--ink)', marginTop: '4px', lineHeight: '1.4' }}>
                    {isClean
                      ? 'No potentially unsafe PDF features were detected by this scanner. You may still sanitize the document if you want to remove interactive functionality.'
                      : (isPartial
                          ? 'Security scan incomplete. Some document structures could not be fully inspected. Maximum Safety may be available if render preflight succeeds.'
                          : `${scanResult.findings.length} potentially active or suspicious feature(s) detected in the PDF structure.`)}
                  </div>
                </div>

                <button
                  className="btn sm"
                  style={{
                    height: '32px',
                    padding: '0 14px',
                    fontSize: '12px',
                    fontWeight: '600',
                    background: scanResult.riskLevel === 'HIGH' ? '#dc2626' : 'var(--ink)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px'
                  }}
                  onClick={() => handleTabChange('sanitize')}
                >
                  ⚡ Sanitize PDF Now
                </button>
              </div>

              {/* Findings List */}
              <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '10px', padding: '16px' }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '14.5px', color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Security Inspection Findings ({scanResult.findings.length})</span>
                  <span style={{ fontSize: '11.5px', fontWeight: 'normal', color: 'var(--sub)' }}>
                    Structural analysis · Zero execution
                  </span>
                </h4>

                {scanResult.findings.length === 0 ? (
                  <div style={{ background: '#f8fafc', border: '1px dashed var(--line)', borderRadius: '8px', padding: '24px', textAlign: 'center', color: 'var(--sub)', fontSize: '13px' }}>
                    ✓ No active scripts, launch commands, embedded files, or form submission actions were found.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {scanResult.findings.map(finding => {
                      const isExpanded = expandedFindings.has(finding.id)
                      const sevColor = {
                        high: '#ef4444',
                        medium: '#f59e0b',
                        low: '#3b82f6',
                        info: '#64748b'
                      }[finding.severity] || '#64748b'

                      return (
                        <div key={finding.id} style={{ background: '#f8fafc', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px 14px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{
                                fontSize: '10.5px',
                                fontWeight: '700',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: `${sevColor}15`,
                                color: sevColor,
                                border: `1px solid ${sevColor}40`,
                                textTransform: 'uppercase'
                              }}>
                                {finding.severity}
                              </span>
                              <strong style={{ fontSize: '13px', color: 'var(--ink)' }}>{finding.title}</strong>
                            </div>

                            <button
                              className="btn btn-white sm"
                              style={{ height: '22px', fontSize: '11px', padding: '0 8px' }}
                              onClick={() => toggleFindingDetails(finding.id)}
                            >
                              {isExpanded ? 'Hide Details ▴' : 'Why flagged? ▾'}
                            </button>
                          </div>

                          <div style={{ fontSize: '12.5px', color: 'var(--sub)', marginTop: '6px', lineHeight: '1.4' }}>
                            {finding.description}
                          </div>

                          {/* Expandable Technical Details */}
                          {isExpanded && (
                            <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--line)', fontSize: '11.5px', color: 'var(--sub)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '6px' }}>
                              <div><strong>Category:</strong> {finding.category}</div>
                              <div><strong>Trigger:</strong> {finding.triggerContext}</div>
                              {finding.pageIndex != null && <div><strong>Page:</strong> Page {finding.pageIndex + 1}</div>}
                              {finding.pdfObjectRef && <div><strong>PDF Object:</strong> {finding.pdfObjectRef}</div>}
                              <div><strong>Standard Removable:</strong> {finding.removable ? 'Yes' : 'No'}</div>
                              {finding.details?.target && <div><strong>Target:</strong> {finding.details.target}</div>}
                              {finding.details?.filename && <div><strong>Filename:</strong> {finding.details.filename}</div>}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Feature Checklist */}
              <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '10px', padding: '16px' }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--ink)' }}>
                  Active Feature Inspection Checklist
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '8px' }}>
                  {scanResult.safeChecks.map(check => {
                    const statusIcon = {
                      passed: '✓',
                      failed: '⚠',
                      unknown: '?',
                      info: 'ℹ'
                    }[check.status] || '?'

                    const statusColor = {
                      passed: '#059669',
                      failed: '#dc2626',
                      unknown: '#64748b',
                      info: '#0284c7'
                    }[check.status] || '#64748b'

                    return (
                      <div key={check.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '12px' }}>
                        <span style={{ color: 'var(--ink)' }}>{check.label}</span>
                        <span style={{ fontWeight: '700', color: statusColor, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <span>{statusIcon}</span>
                          <span style={{ textTransform: 'capitalize' }}>{check.status}</span>
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SANITIZE DOCUMENT */}
          {tab === 'sanitize' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Sanitization Options Card */}
              <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '10px', padding: '18px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)' }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '15px', color: 'var(--ink)' }}>
                  Choose Sanitization Mode
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                  {/* Mode 1: Standard */}
                  <div
                    onClick={() => setSanitizeMode('standard')}
                    style={{
                      border: `2px solid ${sanitizeMode === 'standard' ? 'var(--ink)' : 'var(--line)'}`,
                      borderRadius: '8px',
                      padding: '14px',
                      cursor: 'pointer',
                      background: sanitizeMode === 'standard' ? '#f8fafc' : '#fff'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <input type="radio" checked={sanitizeMode === 'standard'} onChange={() => setSanitizeMode('standard')} />
                      <strong style={{ fontSize: '13.5px', color: 'var(--ink)' }}>Standard Sanitization</strong>
                    </div>
                    <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--sub)', lineHeight: '1.45' }}>
                      Surgically strips active scripts, launch actions & attachments in a fresh context while preserving vector text, fonts, images, and safe page layout.
                    </p>
                  </div>

                  {/* Mode 2: Maximum Safety */}
                  <div
                    onClick={() => setSanitizeMode('maximum_safety')}
                    style={{
                      border: `2px solid ${sanitizeMode === 'maximum_safety' ? 'var(--ink)' : 'var(--line)'}`,
                      borderRadius: '8px',
                      padding: '14px',
                      cursor: 'pointer',
                      background: sanitizeMode === 'maximum_safety' ? '#f8fafc' : '#fff'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <input type="radio" checked={sanitizeMode === 'maximum_safety'} onChange={() => setSanitizeMode('maximum_safety')} />
                      <strong style={{ fontSize: '13.5px', color: 'var(--ink)' }}>Maximum Safety (Rebuild & Flatten)</strong>
                    </div>
                    <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--sub)', lineHeight: '1.45' }}>
                      Renders visual pages and reconstructs a completely new PDF. Discards all interactive elements, forms, links, and original object structures.
                    </p>
                  </div>
                </div>

                {/* Maximum Safety Confirmation */}
                {sanitizeMode === 'maximum_safety' && (
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px', fontSize: '12px', color: '#92400e' }}>
                    <div style={{ fontWeight: '700', marginBottom: '4px' }}>⚠️ Destructive Change Confirmation</div>
                    Maximum Safety reconstructs this PDF from rendered visual pages. This will remove form fields, clickable links, annotations, bookmarks, and accessibility tags.
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', cursor: 'pointer', fontWeight: '600' }}>
                      <input type="checkbox" checked={confirmMaxSafety} onChange={e => setConfirmMaxSafety(e.target.checked)} />
                      I understand that interactive features will be permanently flattened
                    </label>
                  </div>
                )}

                {/* Digital Signature Warning */}
                {hasSignatures && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px', fontSize: '12px', color: '#991b1b' }}>
                    <div style={{ fontWeight: '700', marginBottom: '4px' }}>⚠️ Digital Signature Invalidation</div>
                    This document contains a digital signature. Sanitization will invalidate its cryptographic verification while preserving visual stamp appearance.
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', cursor: 'pointer', fontWeight: '600' }}>
                      <input type="checkbox" checked={confirmSignatureInvalidation} onChange={e => setConfirmSignatureInvalidation(e.target.checked)} />
                      I acknowledge that digital signature verification will be invalidated
                    </label>
                  </div>
                )}

                {/* Granular Options */}
                {sanitizeMode === 'standard' && (
                  <div style={{ borderTop: '1px solid var(--line)', paddingTop: '12px', marginTop: '12px' }}>
                    <div style={{ fontSize: '12.5px', fontWeight: '600', color: 'var(--ink)', marginBottom: '8px' }}>
                      Sanitization Options
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px', fontSize: '12px', color: 'var(--sub)' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input type="checkbox" checked disabled /> Remove JavaScript & Launch Actions (Mandatory)
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input type="checkbox" checked={removeAttachments} onChange={e => setRemoveAttachments(e.target.checked)} /> Remove Embedded Attachments
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input type="checkbox" checked={removeMultimedia} onChange={e => setRemoveMultimedia(e.target.checked)} /> Remove Multimedia & XFA
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input type="checkbox" checked={stripAllUrls} onChange={e => setStripAllUrls(e.target.checked)} /> Strip All External URLs
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input type="checkbox" checked={flattenForms} onChange={e => setFlattenForms(e.target.checked)} /> Flatten Form Fields
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input type="checkbox" checked={allowMailto} onChange={e => setAllowMailto(e.target.checked)} /> Allow mailto: Links
                      </label>
                    </div>
                  </div>
                )}

                {/* Sanitize Trigger Button */}
                <div style={{ marginTop: '18px' }}>
                  <button
                    className="btn btn-primary"
                    disabled={sanitizing || (hasSignatures && !confirmSignatureInvalidation) || (sanitizeMode === 'maximum_safety' && !confirmMaxSafety)}
                    onClick={handleSanitize}
                    style={{ background: 'var(--ink)', padding: '8px 20px', fontSize: '13px' }}
                  >
                    {sanitizing ? 'Sanitizing & Verifying…' : '⚡ Sanitize & Re-Scan Document'}
                  </button>
                </div>
              </div>

              {sanitizeError && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '16px', color: '#991b1b', fontSize: '13px' }}>
                  <strong>Sanitization Error:</strong> {sanitizeError}
                </div>
              )}

              {/* Post-Sanitization Verification Gate Result */}
              {sanitizedDoc && (
                <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '10px', padding: '18px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '24px' }}>
                      {sanitizedDoc.verification.verified ? '✅' : '🚫'}
                    </span>
                    <div>
                      <div style={{ fontSize: '14.5px', fontWeight: '700', color: sanitizedDoc.verification.verified ? '#15803d' : '#b91c1c' }}>
                        {sanitizedDoc.verification.verified
                          ? 'Sanitization complete. No features prohibited by the selected sanitization policy were detected in the output.'
                          : 'Sanitization verification failed: Prohibited active features were still detected in the output document. Download has been blocked for safety.'}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--sub)' }}>
                        Mandatory compliance re-scan verified {sanitizedDoc.sanitizedBytes.byteLength} output bytes.
                      </div>
                    </div>
                  </div>

                  {/* Summary of What Changed */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', marginBottom: '16px', fontSize: '12px' }}>
                    <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--line)' }}>
                      <strong style={{ color: '#b91c1c', display: 'block', marginBottom: '4px' }}>Removed Features:</strong>
                      <ul style={{ margin: 0, paddingLeft: '16px', lineHeight: '1.5' }}>
                        {sanitizedDoc.removedItems.map((it, idx) => <li key={idx}>{it}</li>)}
                      </ul>
                    </div>

                    <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--line)' }}>
                      <strong style={{ color: '#15803d', display: 'block', marginBottom: '4px' }}>Preserved Features:</strong>
                      <ul style={{ margin: 0, paddingLeft: '16px', lineHeight: '1.5' }}>
                        {sanitizedDoc.preservedItems.map((it, idx) => <li key={idx}>{it}</li>)}
                      </ul>
                    </div>
                  </div>

                  {sanitizedDoc.verification.verified && (
                    <button
                      className="btn btn-primary"
                      onClick={handleDownload}
                      style={{ background: '#059669', padding: '8px 24px', fontSize: '13.5px', fontWeight: '600' }}
                    >
                      📥 Download Sanitized PDF ({prettySize(sanitizedDoc.sanitizedBytes.byteLength)})
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </ToolShell>
  )
}
