// Dual Sanitizer Engine: Standard Surgical Cleanse & Maximum Safety Rebuild
// Neutralizes prohibited active capabilities and ensures output compliance

import { createDefaultSanitizationPolicy, SECURITY_CAPABILITIES } from './types.js'

const lib = () => import('@cantoo/pdf-lib')

export async function sanitizeStandard(bytes, policy = createDefaultSanitizationPolicy('standard')) {
  const { PDFDocument, PDFName, PDFDict, PDFArray, PDFRef } = await lib()
  const doc = await PDFDocument.load(bytes, {
    ignoreEncryption: true,
    throwOnInvalidObject: false,
    updateMetadata: false
  })

  const removedItems = []
  const preservedItems = []
  const catalog = doc.catalog

  // 1. Catalog & OpenAction
  const openAction = catalog.get(PDFName.of('OpenAction'))
  if (openAction) {
    const resolved = openAction instanceof PDFRef ? doc.context.lookup(openAction) : openAction
    if (resolved instanceof PDFDict && resolved.get(PDFName.of('S'))) {
      catalog.delete(PDFName.of('OpenAction'))
      removedItems.push('Automatic OpenAction')
    } else {
      preservedItems.push('Page view OpenAction')
    }
  }

  // 2. Document-level Additional Actions (/AA)
  if (catalog.get(PDFName.of('AA'))) {
    catalog.delete(PDFName.of('AA'))
    removedItems.push('Document event actions (/AA)')
  }

  // 3. Name Trees (/Names)
  const names = catalog.get(PDFName.of('Names'))
  if (names) {
    const resolvedNames = names instanceof PDFRef ? doc.context.lookup(names) : names
    if (resolvedNames instanceof PDFDict) {
      if (resolvedNames.get(PDFName.of('JavaScript'))) {
        resolvedNames.delete(PDFName.of('JavaScript'))
        removedItems.push('Named JavaScript scripts')
      }
      if (policy.removeEmbeddedFiles && resolvedNames.get(PDFName.of('EmbeddedFiles'))) {
        resolvedNames.delete(PDFName.of('EmbeddedFiles'))
        removedItems.push('Embedded file attachments')
      }
    }
  }

  // 4. Associated Files (/AF)
  if (policy.removeEmbeddedFiles && catalog.get(PDFName.of('AF'))) {
    catalog.delete(PDFName.of('AF'))
    removedItems.push('Associated files (/AF)')
  }

  // 5. Pages & Annotations
  const pageCount = doc.getPageCount()
  let removedAnnotsCount = 0

  for (let pi = 0; pi < pageCount; pi++) {
    const page = doc.getPage(pi)
    const pageDict = page.node

    // Remove Page /AA
    if (pageDict.get(PDFName.of('AA'))) {
      pageDict.delete(PDFName.of('AA'))
      removedItems.push(`Page ${pi + 1} action (/AA)`)
    }

    // Sanitize Annotations
    const annots = pageDict.get(PDFName.of('Annots'))
    if (annots) {
      const resolvedAnnots = annots instanceof PDFRef ? doc.context.lookup(annots) : annots
      if (resolvedAnnots instanceof PDFArray) {
        const keptAnnots = []
        for (let ai = 0; ai < resolvedAnnots.size(); ai++) {
          const annotRef = resolvedAnnots.get(ai)
          const annotDict = annotRef instanceof PDFRef ? doc.context.lookup(annotRef) : annotRef
          if (!(annotDict instanceof PDFDict)) continue

          const rawSub = annotDict.get(PDFName.of('Subtype'))?.asString() || ''
          const subtype = rawSub.replace(/^\//, '')

          // Strip multimedia
          if (['Screen', 'Movie', 'Sound', 'RichMedia'].includes(subtype)) {
            removedAnnotsCount++
            continue
          }

          // Strip file attachments
          if (subtype === 'FileAttachment' && policy.removeEmbeddedFiles) {
            removedAnnotsCount++
            continue
          }

          // Widget (form fields): delete /A and /AA
          if (subtype === 'Widget') {
            if (annotDict.get(PDFName.of('A'))) annotDict.delete(PDFName.of('A'))
            if (annotDict.get(PDFName.of('AA'))) annotDict.delete(PDFName.of('AA'))
            keptAnnots.push(annotRef)
            continue
          }

          // Links: inspect action
          if (subtype === 'Link') {
            const act = annotDict.get(PDFName.of('A'))
            if (act) {
              const actDict = act instanceof PDFRef ? doc.context.lookup(act) : act
              if (actDict instanceof PDFDict) {
                const rawS = actDict.get(PDFName.of('S'))?.asString() || ''
                const sType = rawS.replace(/^\//, '')

                if (['JavaScript', 'Launch', 'SubmitForm', 'ImportData', 'GoToR', 'GoToE', 'Rendition'].includes(sType)) {
                  annotDict.delete(PDFName.of('A'))
                  removedItems.push(`Action /${sType} on link`)
                } else if (sType === 'URI') {
                  const uriVal = actDict.get(PDFName.of('URI'))?.asString() || ''
                  const schemeMatch = /^([a-z0-9+.-]+):/i.exec(uriVal.trim())
                  const scheme = schemeMatch ? schemeMatch[1].toLowerCase() : ''

                  if (!policy.allowedUriSchemes.has(scheme)) {
                    annotDict.delete(PDFName.of('A'))
                    removedItems.push(`Prohibited URI link (${scheme || 'unknown'})`)
                  } else {
                    preservedItems.push(`Safe ${scheme} link`)
                  }
                }
              }
            }
            if (annotDict.get(PDFName.of('AA'))) annotDict.delete(PDFName.of('AA'))
            keptAnnots.push(annotRef)
            continue
          }

          // Retain ordinary visual annotations
          keptAnnots.push(annotRef)
        }

        pageDict.set(PDFName.of('Annots'), doc.context.obj(keptAnnots))
      }
    }
  }

  if (removedAnnotsCount > 0) {
    removedItems.push(`${removedAnnotsCount} active annotation(s)`)
  }

  // 6. AcroForm & XFA
  const acroForm = catalog.get(PDFName.of('AcroForm'))
  if (acroForm) {
    const formDict = acroForm instanceof PDFRef ? doc.context.lookup(acroForm) : acroForm
    if (formDict instanceof PDFDict) {
      if (policy.removeMultimediaAndXfa && formDict.get(PDFName.of('XFA'))) {
        formDict.delete(PDFName.of('XFA'))
        removedItems.push('XFA dynamic form packets')
      }

      // Remove digital signature fields or invalidation
      if (formDict.get(PDFName.of('SigFlags'))) {
        formDict.delete(PDFName.of('SigFlags'))
        removedItems.push('Digital signature validation semantics')
      }
    }
  }

  // Re-serialize completely fresh
  const sanitizedBytes = await doc.save({ useObjectStreams: false })
  return {
    sanitizedBytes,
    removedItems: Array.from(new Set(removedItems)),
    preservedItems: Array.from(new Set(preservedItems))
  }
}

export async function sanitizeMaximumSafety(bytes, renderPageCallback, policy = createDefaultSanitizationPolicy('maximum_safety')) {
  const { PDFDocument } = await lib()
  const sourceDoc = await PDFDocument.load(bytes, {
    ignoreEncryption: true,
    throwOnInvalidObject: false,
    updateMetadata: false
  })

  const pageCount = sourceDoc.getPageCount()
  const newDoc = await PDFDocument.create()

  for (let pi = 0; pi < pageCount; pi++) {
    const rendered = await renderPageCallback(pi)
    if (!rendered || !rendered.imageBytes) {
      throw new Error(`Failed to render page ${pi + 1} in Maximum Safety mode.`)
    }

    const { width, height, imageBytes } = rendered
    // Embed clean PNG image
    const embeddedImg = await newDoc.embedPng(imageBytes)
    const newPage = newDoc.addPage([width, height])
    newPage.drawImage(embeddedImg, {
      x: 0,
      y: 0,
      width,
      height
    })
  }

  const sanitizedBytes = await newDoc.save({ useObjectStreams: false })
  return {
    sanitizedBytes,
    removedItems: ['All interactive objects, forms, scripts, links, and attachments reconstructed as visual pages'],
    preservedItems: ['Rendered visual page content']
  }
}
