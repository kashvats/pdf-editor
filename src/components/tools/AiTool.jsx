import React, { useEffect, useState } from 'react'
import { pdfToText } from '../../lib/pdfraster'
import { DropArea, PageThumb, ToolShell, baseOf, download, prettySize, usePdf } from './shell'

// Local extractive algorithm (100% offline, zero network, zero API key)
function localExtractiveSummary(pagesText, mode) {
  const allSentences = []
  pagesText.forEach((text, pageIdx) => {
    const rawSentences = text
      .split(/(?<=[.?!])\s+(?=[A-Z0-9])/)
      .map(s => s.trim())
      .filter(s => s.length > 25 && !/^Page \d+/i.test(s))

    rawSentences.forEach(s => allSentences.push({ s, page: pageIdx + 1 }))
  })

  if (!allSentences.length) return 'No readable text content found to summarize.'

  // Word frequency calculation
  const words = allSentences.flatMap(item => item.s.toLowerCase().match(/[a-z]{3,}/g) || [])
  const freq = {}
  words.forEach(w => { freq[w] = (freq[w] || 0) + 1 })

  // Score sentences
  const scored = allSentences.map(item => {
    const sWords = item.s.toLowerCase().match(/[a-z]{3,}/g) || []
    let score = 0
    sWords.forEach(w => { score += (freq[w] || 0) })
    score /= Math.sqrt(sWords.length || 1)
    return { ...item, score }
  })

  scored.sort((a, b) => b.score - a.score)

  if (mode === 'quick') {
    return scored.slice(0, 3).map(i => i.s).join(' ')
  }
  if (mode === 'bullets') {
    return scored.slice(0, 6).map(i => `• ${i.s} (Page ${i.page})`).join('\n\n')
  }
  if (mode === 'key_points') {
    return scored.slice(0, 5).map((i, idx) => `${idx + 1}. **Key Insight:** ${i.s} *(Source: Page ${i.page})*`).join('\n\n')
  }
  if (mode === 'action_items') {
    const actions = scored.filter(i => /\b(must|should|will|shall|agreed|responsible|deliver|submit|due|by|deadline)\b/i.test(i.s))
    const list = actions.length ? actions.slice(0, 6) : scored.slice(0, 4)
    return list.map(i => `☐ [Action] ${i.s} — Page ${i.page}`).join('\n\n')
  }
  if (mode === 'executive') {
    return `### Executive Overview\n\n${scored.slice(0, 2).map(i => i.s).join(' ')}\n\n### Strategic Findings\n\n${scored.slice(2, 6).map(i => `• ${i.s} *(Page ${i.page})*`).join('\n')}`
  }
  // Detailed
  return scored.slice(0, 9).map(i => `${i.s} *(Page ${i.page})*`).join('\n\n')
}

// Local extractive Q&A search across pages
function searchDocumentAnswer(pagesText, question) {
  const qWords = question.toLowerCase().match(/[a-z0-9]{3,}/g) || []
  if (!qWords.length) return { answer: 'Please enter a specific question about the document.', page: null }

  const candidates = []
  pagesText.forEach((text, pageIdx) => {
    const sentences = text.split(/(?<=[.?!])\s+/).filter(s => s.trim().length > 15)
    sentences.forEach(s => {
      const lower = s.toLowerCase()
      let matches = 0
      qWords.forEach(w => {
        if (lower.includes(w)) matches++
      })
      if (matches > 0) {
        candidates.push({ sentence: s.trim(), page: pageIdx + 1, score: matches / qWords.length })
      }
    })
  })

  if (!candidates.length) {
    return {
      answer: `I could not find a direct reference answering "${question}" in this document.`,
      page: null
    }
  }

  candidates.sort((a, b) => b.score - a.score)
  const top = candidates.slice(0, 3)
  const bestAnswer = top.map(c => `"${c.sentence}"`).join('\n\n')
  return {
    answer: bestAnswer,
    pages: [...new Set(top.map(c => c.page))]
  }
}

export default function AiTool({ tool, onBack }) {
  const [pdf, open, clear] = usePdf()
  const [tab, setTab] = useState('chat') // 'chat' | 'summarize' | 'translate'
  const [pagesText, setPagesText] = useState([])
  const [extracted, setExtracted] = useState(false)

  // Chat state
  const [chatMessages, setChatMessages] = useState([])
  const [question, setQuestion] = useState('')

  // Summarize state
  const [summaryMode, setSummaryMode] = useState('executive')
  const [summaryResult, setSummaryResult] = useState('')

  // Translate state
  const [targetLang, setTargetLang] = useState('es')
  const [translateResult, setTranslateResult] = useState('')
  const [busy, setBusy] = useState(false)

  // Extract text on load
  useEffect(() => {
    if (pdf.doc) {
      setBusy(true)
      const extract = async () => {
        const texts = []
        for (let i = 1; i <= pdf.count; i++) {
          const page = await pdf.doc.getPage(i)
          const tc = await page.getTextContent()
          const pageStr = tc.items.map(it => it.str).join(' ')
          texts.push(pageStr)
        }
        setPagesText(texts)
        setExtracted(true)
        setBusy(false)

        // Seed initial summary
        const initialSum = localExtractiveSummary(texts, 'executive')
        setSummaryResult(initialSum)
      }
      extract()
    } else {
      setPagesText([])
      setExtracted(false)
      setChatMessages([])
      setSummaryResult('')
    }
  }, [pdf.doc])

  const handleAsk = e => {
    e?.preventDefault()
    if (!question.trim()) return
    const userQ = question.trim()
    setQuestion('')

    const { answer, pages } = searchDocumentAnswer(pagesText, userQ)
    const citation = pages && pages.length ? `(Source: Page ${pages.join(', ')})` : ''

    setChatMessages(prev => [
      ...prev,
      { role: 'user', text: userQ },
      { role: 'assistant', text: answer, citation }
    ])
  }

  const handleRegenerateSummary = mode => {
    setSummaryMode(mode)
    if (pagesText.length) {
      setSummaryResult(localExtractiveSummary(pagesText, mode))
    }
  }

  const reset = () => { clear(); setChatMessages([]); setSummaryResult('') }

  return (
    <ToolShell tool={tool} onBack={onBack}>
      {!pdf.doc ? (
        <DropArea label="Drop your PDF here for AI analysis" hint="Chat, Summarize, and Extract Insights" onFiles={f => open(f[0])} />
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', background: '#fff', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--line)', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <PageThumb doc={pdf.doc} index={0} width={44} />
              <div>
                <strong style={{ fontSize: '14px' }}>{pdf.name}</strong>
                <div style={{ fontSize: '11.5px', color: 'var(--sub)' }}>{pdf.count} pages · 100% Private On-Device AI</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                className={`btn sm ${tab === 'chat' ? 'btn-primary' : 'btn-white'}`}
                onClick={() => setTab('chat')}
              >
                💬 Chat with PDF
              </button>
              <button
                className={`btn sm ${tab === 'summarize' ? 'btn-primary' : 'btn-white'}`}
                onClick={() => setTab('summarize')}
              >
                📝 Summarizer
              </button>
              <button className="btn btn-white sm" onClick={reset}>
                Change Document
              </button>
            </div>
          </div>

          {busy && <div className="ocr-bar"><span style={{ width: '100%' }} /></div>}

          {/* Chat Tab */}
          {tab === 'chat' && (
            <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '480px' }}>
              <div style={{ flex: 1, padding: '18px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ background: '#f5f8f5', padding: '12px 16px', borderRadius: '8px', fontSize: '13.5px', color: 'var(--ink)' }}>
                  👋 Ask anything about <strong>{pdf.name}</strong>. Answers are cited with direct page references and processed entirely in your browser.
                </div>

                {chatMessages.map((m, idx) => (
                  <div
                    key={idx}
                    style={{
                      alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '82%',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      background: m.role === 'user' ? 'var(--green)' : '#f2f4f2',
                      color: m.role === 'user' ? '#fff' : 'var(--ink)',
                      fontSize: '13.5px',
                      lineHeight: '1.5'
                    }}
                  >
                    <div>{m.text}</div>
                    {m.citation && (
                      <div style={{ fontSize: '11px', marginTop: '6px', opacity: 0.85, fontWeight: '600' }}>
                        {m.citation}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <form onSubmit={handleAsk} style={{ display: 'flex', gap: '8px', padding: '12px', borderTop: '1px solid var(--line)', background: '#fafbfa' }}>
                <input
                  type="text"
                  placeholder='e.g. "What are the payment terms?", "When does this agreement expire?"'
                  className="tool-input"
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button type="submit" className="btn btn-primary" disabled={!question.trim()}>
                  Ask
                </button>
              </form>
            </div>
          )}

          {/* Summarizer Tab */}
          {tab === 'summarize' && (
            <div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                {[
                  ['executive', 'Executive Summary'],
                  ['quick', 'Quick (3 sentences)'],
                  ['bullets', 'Bullet Points'],
                  ['key_points', 'Key Points'],
                  ['action_items', 'Action Items'],
                  ['detailed', 'Detailed']
                ].map(([m, label]) => (
                  <button
                    key={m}
                    className={`btn sm ${summaryMode === m ? 'btn-primary' : 'btn-white'}`}
                    onClick={() => handleRegenerateSummary(m)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '10px', padding: '20px', minHeight: '300px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '10px', borderBottom: '1px solid var(--line)' }}>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--sub)' }}>
                    {summaryMode.toUpperCase().replace('_', ' ')}
                  </span>
                  <button
                    className="btn btn-white sm"
                    onClick={() => download(new Blob([summaryResult], { type: 'text/markdown;charset=utf-8' }), `${baseOf(pdf.name)}-summary.md`)}
                  >
                    💾 Download Summary (.md)
                  </button>
                </div>

                <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.7', fontSize: '14px', fontFamily: 'inherit' }}>
                  {summaryResult}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </ToolShell>
  )
}
