import { slackOf } from '../utils/misc.js'
import { cleanFontFamilyName, ensureFontLoadedInBrowser } from './fonts.js'

function mul(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
  ]
}

function normFam(f) {
  const s = String(f || '').toLowerCase()
  if (s.includes('monospace') || s.includes('courier')) return 'monospace'
  if (s.includes('serif') && !s.includes('sans')) return 'serif'
  return 'sans-serif'
}

// pdf.js hands back the embedded font's own name often enough that the weight
// and slant can simply be read off it.
const isBoldName = f => /bold|black|heavy|semibold|demibold/i.test(String(f || ''))
const isItalicName = f => /italic|oblique/i.test(String(f || ''))

// The glyph runs of a page in editor coordinates. Shared with the table
// reader, which needs the runs themselves rather than the lines they form.
export async function pageSegments(page, scale) {
  // Always read the page in its unrotated frame. A rotated viewport turns the
  // glyph runs sideways, and grouping by y would then stitch separate lines
  // together. Display rotation is handled by the editor instead.
  const vp = page.getViewport({ scale, rotation: 0 })
  try { await page.getOperatorList() } catch {}
  const tc = await page.getTextContent()
  const vt = vp.transform
  const segs = []
  const common = page.commonObjs || null

  tc.items.forEach(it => {
    if (typeof it.str !== 'string' || it.str === '') return
    const m = mul(vt, it.transform)
    const hy = Math.hypot(m[2], m[3])
    const hx = Math.hypot(m[0], m[1])
    const effectiveH = Math.max(hy, hx)
    if (effectiveH < 0.2) return
    const st = tc.styles[it.fontName] || {}
    const fontObj = common && common.has(it.fontName) ? common.get(it.fontName) : null
    const rawFontName = fontObj?.loadedName || fontObj?.name || st.fontFamily || ''
    const cleanFamily = cleanFontFamilyName(rawFontName)
    const isBold = !!(fontObj?.bold || fontObj?.black || isBoldName(fontObj?.name) || isBoldName(st.fontFamily))
    const isItalic = !!(fontObj?.italic || isItalicName(fontObj?.name) || isItalicName(st.fontFamily))
    const fontWeight = fontObj?.black ? 900 : (isBold ? 700 : 400)

    // Preload font in browser dynamically if missing
    ensureFontLoadedInBrowser(cleanFamily, { weight: fontWeight, italic: isItalic })

    const asc = typeof st.ascent === 'number' && st.ascent > 0 ? Math.min(st.ascent, 1.2) : 0.8
    const desc = typeof st.descent === 'number' && st.descent < 0 ? Math.max(st.descent, -0.35) : -0.2
    segs.push({
      str: it.str,
      x: m[4],
      y: m[5],
      w: (it.width || 0) * scale,
      h: hy,
      asc,
      desc,
      font: it.fontName || null,
      exactFont: cleanFamily,
      pdfFontName: fontObj?.name || null,
      fam: normFam(cleanFamily || st.fontFamily),
      bold: isBold,
      italic: isItalic,
      fontWeight
    })
  })

  // Reading order: top of the page first. The viewport transform puts y in
  // canvas space (growing downwards), so this must be ascending. Sorting the
  // other way round leaves the array bottom-to-top and every downstream step
  // that compares a line with the one that follows it silently breaks.
  segs.sort((a, b) => (a.y - b.y) || (a.x - b.x))
  return { segs, width: vp.width, height: vp.height }
}

// Runs that share a baseline, in reading order.
export function groupRows(segs) {

  const groups = []
  let cur = null
  for (const s of segs) {
    if (!cur) { cur = { y: s.y, segs: [s] }; continue }
    const tol = Math.max(1.5, 0.32 * Math.min(s.h, cur.segs[0].h))
    if (Math.abs(s.y - cur.y) <= tol) {
      cur.segs.push(s)
      cur.y = (cur.y * (cur.segs.length - 1) + s.y) / cur.segs.length
    } else {
      groups.push(cur)
      cur = { y: s.y, segs: [s] }
    }
  }
  if (cur) groups.push(cur)
  return groups
}

export async function extractLines(page, scale, pageNo) {
  const { segs } = await pageSegments(page, scale)
  const groups = groupRows(segs)

  const lines = []
  let li = 0
  for (const g of groups) {
    const ss = g.segs.filter(s => s.str.trim()).sort((a, b) => a.x - b.x)
    if (!ss.length) continue

    // Break horizontal runs into distinct clusters if there is a gap (separate diagram boxes/labels)
    const clusters = []
    let currentCluster = []
    let pen = null

    for (const s of ss) {
      if (pen) {
        const gap = s.x - (pen.x + pen.w)
        if (gap > Math.max(pen.h, s.h) * 2.2 && gap > 18) {
          if (currentCluster.length) clusters.push(currentCluster)
          currentCluster = [s]
          pen = s
          continue
        }
      }
      currentCluster.push(s)
      pen = s
    }
    if (currentCluster.length) clusters.push(currentCluster)

    for (const cluster of clusters) {
      let text = ''
      let cPen = null
      let wideGap = false
      for (const s of cluster) {
        if (cPen) {
          const gap = s.x - (cPen.x + cPen.w)
          if (gap > Math.max(cPen.h, s.h) * 1.4) wideGap = true
          if (gap > cPen.h * 0.12 && !/\s$/.test(text) && !/^\s/.test(s.str)) text += ' '
        }
        text += s.str
        cPen = s
      }
      const trimmed = text.replace(/\s+$/g, '')
      if (!trimmed.trim()) continue
      const x = Math.min(...cluster.map(s => s.x))
      const xe = Math.max(...cluster.map(s => s.x + s.w))
      const top = Math.min(...cluster.map(s => s.y - s.asc * s.h))
      const bot = Math.max(...cluster.map(s => s.y - s.desc * s.h))
      const dom = cluster.reduce((a, b) => (b.str.length > a.str.length ? b : a), cluster[0])
      const wsum = cluster.reduce((a, s) => a + s.str.length, 0) || 1
      const fs = cluster.reduce((a, s) => a + s.h * s.str.length, 0) / wsum
      const rectH = Math.max(bot - top, fs * 1.05, fs + fs * (-dom.desc))
      const w = Math.max(xe - x, 8)
      lines.push({
        id: `L${pageNo}_${li++}`,
        text: trimmed,
        x,
        w,
        wrapW: w + slackOf(w),
        baselineY: dom.y,
        lineHeight: Math.round(rectH),
        rectH,
        fontSize: fs,
        asc: dom.asc,
        desc: dom.desc,
        family: dom.fam,
        exactFont: dom.exactFont || null,
        pdfFont: dom.font || null,
        pdfFontName: dom.pdfFontName || null,
        bold: !!dom.bold,
        italic: !!dom.italic,
        fontWeight: dom.fontWeight || (dom.bold ? 700 : 400),
        wideGap,
        rect: { x: x - 1, y: top - 1, w: (xe - x) + 2, h: rectH + 2 },
        dirty: false,
        deleted: false,
        color: null,
        bg: null,
        underline: false
      })
    }
  }

  return groupParagraphs(lines, pageNo)
}

function overlapPct(a, b) {
  const o = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  return o > 0 ? o / Math.min(a.w, b.w) : -1
}

export function groupParagraphs(lines, pageNo) {
  const paras = []
  let cur = []
  const flush = () => {
    if (!cur.length) return
    paras.push(cur.length === 1 ? cur[0] : buildPara(cur, pageNo, paras.length))
    cur = []
  }
  for (const ln of lines) {
    if (!cur.length) { cur = [ln]; continue }
    const L = cur[cur.length - 1]
    const gap = ln.baselineY - L.baselineY
    const lh = Math.max(L.rectH, L.fontSize * 1.05)
    const ratio = gap / lh
    // Diagram labels or wide gaps should never be merged into running text
    const isDiagram = L.wideGap || ln.wideGap || (Math.abs(L.x - ln.x) > 40 && (L.w < 220 || ln.w < 220))
    const listy = ratio > 1.3 && /[.!?:;]["')\]]?\s*$/.test(L.text) && /^[A-Z0-9\u2022(\-\u2013\u2014]/.test(ln.text)
    const ok =
      !isDiagram && !listy &&
      ln.family === L.family &&
      !!ln.bold === !!L.bold &&
      !!ln.italic === !!L.italic &&
      Math.abs(ln.fontSize - L.fontSize) <= Math.max(1, 0.22 * L.fontSize) &&
      ratio > 0.55 &&
      ratio < 1.75 &&
      overlapPct(L, ln) > 0.3
    if (ok) cur.push(ln)
    else { flush(); cur = [ln] }
  }
  flush()
  return paras
}

// A paragraph is stored as one flowing string, not as the original hard line
// breaks, so that typing re-wraps the whole paragraph the way a word processor
// would instead of stretching a single line over its neighbour.
function joinFlowing(ls) {
  let out = ''
  for (let i = 0; i < ls.length; i++) {
    const t = ls[i].text
    if (i === 0) { out = t; continue }
    if (/[\p{Ll}]-$/u.test(out) && /^[\p{Ll}]/u.test(t)) out = out.slice(0, -1) + t
    else out += ' ' + t
  }
  return out
}

function buildPara(ls, pageNo, pi) {
  const wsum = ls.reduce((s, l) => s + l.text.length, 0) || 1
  const fs = ls.reduce((s, l) => s + l.fontSize * l.text.length, 0) / wsum
  const gaps = []
  for (let i = 1; i < ls.length; i++) gaps.push(ls[i].baselineY - ls[i - 1].baselineY)
  gaps.sort((a, b) => a - b)
  let lh = gaps[Math.floor(gaps.length / 2)]
  lh = Math.min(Math.max(lh, fs * 0.95), fs * 1.8)
  const x = Math.min(...ls.map(l => l.x))
  const xe = Math.max(...ls.map(l => l.x + l.w))
  const dom = ls.reduce((a, l) => (l.text.length > a.text.length ? l : a), ls[0])
  const rx = Math.min(...ls.map(l => l.rect.x))
  const ry = Math.min(...ls.map(l => l.rect.y))
  const re = Math.max(...ls.map(l => l.rect.x + l.rect.w))
  const rb = Math.max(...ls.map(l => l.rect.y + l.rect.h))
  const w = Math.max(xe - x, 6)
  return {
    id: `P${pageNo}_${pi}`,
    text: joinFlowing(ls),
    x,
    w,
    // Wrap at the column the paragraph already occupies, so re-flowed text
    // keeps the original block shape instead of running past the margin.
    wrapW: w + 2,
    baselineY: ls[0].baselineY,
    lineHeight: lh,
    rectH: rb - ry,
    fontSize: fs,
    asc: dom.asc,
    desc: dom.desc,
    family: dom.fam,
    pdfFont: dom.pdfFont || null,
    bold: !!dom.bold,
    italic: !!dom.italic,
    wideGap: false,
    rect: { x: rx, y: ry, w: re - rx, h: rb - ry },
    dirty: false,
    deleted: false,
    color: null,
    bg: null,
    underline: false
  }
}

// Extracts positions, dimensions, and metadata for all embedded raster images on a page
export async function extractPageImages(page, scale, pageNo) {
  let ops
  try {
    ops = await page.getOperatorList()
  } catch {
    return []
  }
  if (!ops || !ops.fnArray) return []
  const vp = page.getViewport({ scale, rotation: 0 })
  let ctm = [1, 0, 0, 1, 0, 0]
  const stack = []
  const images = []
  let imgIdx = 0

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i]
    const args = ops.argsArray[i]

    if (fn === 10 /* OPS.save */) {
      stack.push([...ctm])
    } else if (fn === 11 /* OPS.restore */) {
      if (stack.length) ctm = stack.pop()
    } else if (fn === 12 /* OPS.transform */) {
      ctm = mul(ctm, args)
    } else if (fn === 85 /* paintImageXObject */ || fn === 82 /* paintJpegXObject */ || fn === 86 /* paintInlineImageXObject */) {
      const imgName = args && args[0]
      if (typeof imgName !== 'string') continue

      const m = mul(vp.transform, ctm)
      const x = m[4]
      const y = m[5]
      const w = Math.hypot(m[0], m[1])
      const h = Math.hypot(m[2], m[3])

      if (w < 14 || h < 14) continue

      const rectY = Math.round(y - h)
      const box = {
        x: Math.round(x),
        y: Math.max(0, rectY),
        w: Math.round(w),
        h: Math.round(h)
      }

      images.push({
        id: `IMG_${pageNo}_${imgIdx++}`,
        kind: 'image',
        isOriginal: true,
        imgName,
        originalSrc: '',
        src: '',
        originalRect: { ...box },
        ...box,
        rotate: 0,
        filter: 'none'
      })
    }
  }

  return images
}

