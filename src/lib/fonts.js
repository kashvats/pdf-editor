// The 14 standard PDF fonts cost nothing to embed and match the metrics the
// page was laid out with, but they can only encode WinAnsi. Anything outside
// that repertoire needs a real font file, so a metric-compatible Liberation
// face is fetched on demand and subset into the document.

export const STD = {
  serif: ['Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic'],
  'sans-serif': ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique'],
  monospace: ['Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique']
}

export const LIBERATION = {
  serif: ['LiberationSerif-Regular', 'LiberationSerif-Bold', 'LiberationSerif-Italic', 'LiberationSerif-BoldItalic'],
  'sans-serif': ['LiberationSans-Regular', 'LiberationSans-Bold', 'LiberationSans-Italic', 'LiberationSans-BoldItalic'],
  monospace: ['LiberationMono-Regular', 'LiberationMono-Bold', 'LiberationMono-Italic', 'LiberationMono-BoldItalic']
}

// The code points WinAnsi maps above Latin-1.
const WIN_ANSI_HIGH = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022,
  0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178
])

export function winAnsiCanEncode(text) {
  for (const ch of String(text ?? '')) {
    const c = ch.codePointAt(0)
    if (c <= 0xff) continue
    if (!WIN_ANSI_HIGH.has(c)) return false
  }
  return true
}

export const styleIndex = (bold, italic) => (bold ? 1 : 0) + (italic ? 2 : 0)

export function fontUrl(name) {
  const base = typeof document !== 'undefined' ? document.baseURI : 'http://localhost/'
  return new URL(`fonts/${name}.ttf`, base).href
}

// Clean and extract family name from PDF PostScript/subset names (e.g. "BCDFEE+Inter-Bold" -> "Inter")
export function cleanFontFamilyName(raw) {
  if (!raw) return 'sans-serif'
  let s = String(raw).trim()
  s = s.replace(/^[A-Z]{6}\+/, '') // Strip subset tag
  s = s.replace(/PSMT$|MT$|PS$/i, '')
  s = s.replace(/[-_,](Bold|Italic|Regular|Medium|Light|SemiBold|Black|Oblique|BoldItalic|BoldOblique).*/i, '')
  s = s.replace(/([a-z])([A-Z])/g, '$1 $2').trim()
  return s || 'sans-serif'
}

// Automatically load font in the browser on-demand via Google Fonts CDN
const loadedWebFonts = new Set()

export function ensureFontLoadedInBrowser(fontFamily, { weight = 400, italic = false } = {}) {
  if (typeof document === 'undefined' || !fontFamily) return
  const clean = cleanFontFamilyName(fontFamily)
  if (['sans-serif', 'serif', 'monospace', 'system-ui', 'helvetica', 'times', 'courier'].includes(clean.toLowerCase())) return

  const fontKey = `${clean}_${weight}_${italic}`
  if (loadedWebFonts.has(fontKey)) return
  loadedWebFonts.add(fontKey)

  try {
    const isAvail = document.fonts && document.fonts.check(`${italic ? 'italic ' : ''}${weight} 16px "${clean}"`)
    if (isAvail) return

    const fontId = `wf_${clean.toLowerCase().replace(/[^a-z0-9]/g, '_')}`
    if (!document.getElementById(fontId)) {
      const link = document.createElement('link')
      link.id = fontId
      link.rel = 'stylesheet'
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(clean)}:ital,wght@0,300;0,400;0,500;0,600;0,700;0,900;1,400;1,700&display=swap`
      document.head.appendChild(link)
    }
  } catch (err) {
    console.warn(`Font load attempt for ${clean}:`, err)
  }
}

// Download raw TTF font buffer on demand for pdf-lib embedding
const ttfCache = new Map()

export async function fetchTtfBuffer(fontFamily, { bold = false, italic = false } = {}) {
  const clean = cleanFontFamilyName(fontFamily)
  const slug = clean.toLowerCase().replace(/[^a-z0-9]/g, '')
  const weight = bold ? 700 : 400
  const style = italic ? 'italic' : 'normal'
  const key = `${slug}_${weight}_${style}`

  if (ttfCache.has(key)) return ttfCache.get(key)

  const urls = [
    `https://cdn.jsdelivr.net/fontsource/fonts/${slug}@latest/latin-${weight}-${style}.ttf`,
    `https://cdn.jsdelivr.net/fontsource/fonts/${slug}@latest/latin-${weight}-normal.ttf`,
    `https://cdn.jsdelivr.net/fontsource/fonts/${slug}@latest/latin-400-normal.ttf`
  ]

  for (const url of urls) {
    try {
      const res = await fetch(url, { mode: 'cors' })
      if (res.ok) {
        const buf = await res.arrayBuffer()
        ttfCache.set(key, buf)
        return buf
      }
    } catch {}
  }

  return null
}

