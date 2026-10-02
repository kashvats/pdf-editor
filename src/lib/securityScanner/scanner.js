// Structural PDF Security Scanner
// Traverses indirect object graph with cycle & recursion bounding without executing PDF code

import { parsePdfDocument } from './parser.js'
import { checkPreflightLimits, createTraversalTracker } from './resourceGuards.js'
import { SECURITY_CAPABILITIES } from './types.js'

const lib = () => import('@cantoo/pdf-lib')

function sanitizeUntrustedText(str, maxLength = 200) {
  if (!str || typeof str !== 'string') return ''
  // Strip control characters and trim
  const clean = str.replace(/[\x00-\x1F\x7F-\x9F]/g, ' ').replace(/\s+/g, ' ').trim()
  if (clean.length > maxLength) {
    return clean.slice(0, maxLength - 1) + '…'
  }
  return clean
}

export async function scanPdfStructure(bytes, options = {}) {
  const { PDFName, PDFDict, PDFArray, PDFRef, PDFString, PDFHexString, PDFStream } = await lib()
  const pre = checkPreflightLimits(bytes, options.resourceConfig)
  if (!pre.allowed) {
    return createFailedResult('RESOURCE_LIMIT_EXCEEDED', pre.reason, 'HIGH')
  }

  const { doc, encrypted, error } = await parsePdfDocument(bytes, options)
  if (error || !doc) {
    return createFailedResult(encrypted ? 'SCAN_PARTIAL' : 'SCAN_FAILED', error || 'Failed to parse document structure.', encrypted ? 'MEDIUM' : 'HIGH')
  }

  const findings = []
  const tracker = createTraversalTracker(options.resourceConfig)
  let findingCounter = 0

  const scanCompleteness = {
    catalog: 'complete',
    pages: 'complete',
    annotations: 'complete',
    forms: 'complete',
    attachments: 'complete',
    actions: 'complete'
  }

  function addFinding({ category, severity, title, description, pdfObjectRef, pageIndex, capabilities = [], triggerContext = 'manual', details = {}, removable = true }) {
    findings.push({
      id: `sec_find_${++findingCounter}`,
      category,
      severity,
      title,
      description,
      pdfObjectRef: pdfObjectRef ? String(pdfObjectRef) : undefined,
      pageIndex,
      capabilities,
      triggerContext,
      removable,
      details: {
        ...details,
        target: details.target ? sanitizeUntrustedText(details.target) : undefined,
        filename: details.filename ? sanitizeUntrustedText(details.filename) : undefined
      }
    })
  }

  // Central recursive action inspector
  function inspectAction(actionObj, triggerContext = 'manual', pageIndex = undefined, depth = 1) {
    if (!actionObj || depth > 10) return
    const resolved = resolveObject(actionObj)
    if (!(resolved instanceof PDFDict)) return

    const rawS = resolved.get(PDFName.of('S'))?.asString() || ''
    const sType = rawS.replace(/^\//, '')
    const objRef = actionObj instanceof PDFRef ? actionObj.toString() : undefined

    // 1. JavaScript Action
    if (sType === 'JavaScript') {
      const jsContent = resolved.get(PDFName.of('JS'))
      let snippet = ''
      if (jsContent instanceof PDFString || jsContent instanceof PDFHexString) {
        snippet = sanitizeUntrustedText(jsContent.asString(), 80)
      } else if (jsContent instanceof PDFStream) {
        snippet = '[Stream-based script]'
      }

      addFinding({
        category: 'ActiveScripting',
        severity: 'high',
        title: 'Embedded JavaScript Action',
        description: triggerContext.includes('open') || triggerContext.includes('auto')
          ? 'An active JavaScript action executes automatically when the document or page opens.'
          : 'Document contains interactive JavaScript actions.',
        pdfObjectRef: objRef,
        pageIndex,
        capabilities: triggerContext.includes('auto') || triggerContext.includes('open')
          ? [SECURITY_CAPABILITIES.EXECUTE_JAVASCRIPT, SECURITY_CAPABILITIES.AUTO_EXECUTION]
          : [SECURITY_CAPABILITIES.EXECUTE_JAVASCRIPT],
        triggerContext,
        removable: true,
        details: { actionType: 'JavaScript', scriptSnippet: snippet }
      })
    }

    // 2. Launch Action
    else if (sType === 'Launch') {
      const targetFile = resolved.get(PDFName.of('F'))?.asString() || ''
      addFinding({
        category: 'AutomaticExecution',
        severity: 'high',
        title: 'Process Launch Action',
        description: 'Action configured to launch an external application or process.',
        pdfObjectRef: objRef,
        pageIndex,
        capabilities: [SECURITY_CAPABILITIES.LAUNCH_PROCESS],
        triggerContext,
        removable: true,
        details: { actionType: 'Launch', target: targetFile }
      })
    }

    // 3. URI Action
    else if (sType === 'URI') {
      const uriVal = resolved.get(PDFName.of('URI'))?.asString() || ''
      const lowerUri = uriVal.toLowerCase().trim()
      const isDangerousScheme = lowerUri.startsWith('javascript:') || lowerUri.startsWith('data:') || lowerUri.startsWith('file:') || /^[a-z0-9+.-]+:/.test(lowerUri) && !lowerUri.startsWith('http:') && !lowerUri.startsWith('https:') && !lowerUri.startsWith('mailto:')

      addFinding({
        category: 'DataTransmission',
        severity: isDangerousScheme ? 'high' : 'info',
        title: isDangerousScheme ? 'Suspicious URI Action' : 'External Web Link',
        description: isDangerousScheme
          ? `Action specifies an unusual or risky URI scheme: ${sanitizeUntrustedText(uriVal, 60)}`
          : `Document links to external destination: ${sanitizeUntrustedText(uriVal, 80)}`,
        pdfObjectRef: objRef,
        pageIndex,
        capabilities: [SECURITY_CAPABILITIES.EXTERNAL_NAVIGATION],
        triggerContext,
        removable: true,
        details: { actionType: 'URI', target: uriVal }
      })
    }

    // 4. SubmitForm / ImportData Actions
    else if (sType === 'SubmitForm') {
      addFinding({
        category: 'DataTransmission',
        severity: 'high',
        title: 'Form Submission Action',
        description: 'Action configured to transmit document data to a remote URL.',
        pdfObjectRef: objRef,
        pageIndex,
        capabilities: [SECURITY_CAPABILITIES.FORM_SUBMISSION],
        triggerContext,
        removable: true,
        details: { actionType: 'SubmitForm' }
      })
    } else if (sType === 'ImportData') {
      addFinding({
        category: 'DataTransmission',
        severity: 'medium',
        title: 'Remote Data Import Action',
        description: 'Action configured to import data from an external resource.',
        pdfObjectRef: objRef,
        pageIndex,
        capabilities: [SECURITY_CAPABILITIES.DATA_IMPORT],
        triggerContext,
        removable: true,
        details: { actionType: 'ImportData' }
      })
    }

    // 5. Remote Document Links (GoToR, GoToE)
    else if (sType === 'GoToR' || sType === 'GoToE') {
      addFinding({
        category: 'AutomaticExecution',
        severity: 'medium',
        title: sType === 'GoToE' ? 'Embedded Target Navigation' : 'Remote Document Link',
        description: `Action references an external or embedded PDF target (${sType}).`,
        pdfObjectRef: objRef,
        pageIndex,
        capabilities: [SECURITY_CAPABILITIES.EXTERNAL_NAVIGATION],
        triggerContext,
        removable: true,
        details: { actionType: sType }
      })
    }

    // 6. RichMedia / Rendition
    else if (sType === 'Rendition') {
      addFinding({
        category: 'InteractiveMultimedia',
        severity: 'medium',
        title: 'Rendition Multimedia Action',
        description: 'Action configured to trigger media or audio playback.',
        pdfObjectRef: objRef,
        pageIndex,
        capabilities: [SECURITY_CAPABILITIES.MULTIMEDIA_PLAYBACK],
        triggerContext,
        removable: true,
        details: { actionType: 'Rendition' }
      })
    }

    // 7. Unknown Action Subtypes
    else if (sType && !['GoTo', 'Named', 'SetOCGState'].includes(sType)) {
      addFinding({
        category: 'AutomaticExecution',
        severity: 'low',
        title: `Unrecognized Action Type (${sType})`,
        description: `Encountered unknown active PDF action subtype: /${sType}`,
        pdfObjectRef: objRef,
        pageIndex,
        capabilities: ['unknown_action'],
        triggerContext,
        removable: true,
        details: { actionType: sType }
      })
    }

    // Follow /Next action chains recursively
    const nextAction = resolved.get(PDFName.of('Next'))
    if (nextAction) {
      if (nextAction instanceof PDFArray) {
        for (let idx = 0; idx < nextAction.size(); idx++) {
          inspectAction(nextAction.get(idx), triggerContext, pageIndex, depth + 1)
        }
      } else {
        inspectAction(nextAction, triggerContext, pageIndex, depth + 1)
      }
    }
  }

  function resolveObject(refOrObj) {
    if (refOrObj instanceof PDFRef) {
      return doc.context.lookup(refOrObj)
    }
    return refOrObj
  }

  // 1. Traverse Catalog (/Root)
  try {
    const catalog = doc.catalog

    // Check OpenAction
    const openAction = catalog.get(PDFName.of('OpenAction'))
    if (openAction) {
      const resolvedOpen = resolveObject(openAction)
      if (resolvedOpen instanceof PDFArray) {
        // Normal page/destination array: safe, not active
      } else if (resolvedOpen instanceof PDFDict) {
        const rawS = resolvedOpen.get(PDFName.of('S'))?.asString() || ''
        const sType = rawS.replace(/^\//, '')
        if (sType && !['GoTo', 'Named'].includes(sType)) {
          inspectAction(openAction, 'document_open_auto')
        }
      }
    }

    // Check Catalog /AA (Additional Actions)
    const catalogAA = catalog.get(PDFName.of('AA'))
    if (catalogAA) {
      const resolvedAA = resolveObject(catalogAA)
      if (resolvedAA instanceof PDFDict) {
        addFinding({
          category: 'ActiveScripting',
          severity: 'high',
          title: 'Document-Level Additional Actions (/AA)',
          description: 'Document has event actions configured on document close, print, or save.',
          pdfObjectRef: catalogAA instanceof PDFRef ? catalogAA.toString() : undefined,
          capabilities: [SECURITY_CAPABILITIES.AUTO_EXECUTION],
          triggerContext: 'document_event',
          removable: true
        })
        resolvedAA.entries().forEach(([_, act]) => inspectAction(act, 'document_event_auto'))
      }
    }

    // Traverse /Names tree
    const names = catalog.get(PDFName.of('Names'))
    if (names) {
      const resolvedNames = resolveObject(names)
      if (resolvedNames instanceof PDFDict) {
        // /JavaScript Name Tree
        const jsNameTree = resolvedNames.get(PDFName.of('JavaScript'))
        if (jsNameTree) {
          inspectNameTree(jsNameTree, (nameStr, val) => {
            addFinding({
              category: 'ActiveScripting',
              severity: 'high',
              title: 'Document-Level Named JavaScript',
              description: `Script found in document names tree: "${sanitizeUntrustedText(nameStr, 40)}"`,
              capabilities: [SECURITY_CAPABILITIES.EXECUTE_JAVASCRIPT],
              triggerContext: 'document_load',
              removable: true,
              details: { scriptName: nameStr }
            })
            inspectAction(val, 'document_load_auto')
          })
        }

        // /EmbeddedFiles Name Tree
        const efNameTree = resolvedNames.get(PDFName.of('EmbeddedFiles'))
        if (efNameTree) {
          inspectNameTree(efNameTree, (nameStr, val) => {
            const fileSpec = resolveObject(val)
            const filename = fileSpec instanceof PDFDict ? (fileSpec.get(PDFName.of('UF'))?.asString() || fileSpec.get(PDFName.of('F'))?.asString() || nameStr) : nameStr
            const isExe = /\.(exe|scr|bat|cmd|ps1|vbs|js|hta|dll|jar)$/i.test(filename)

            addFinding({
              category: 'EmbeddedContent',
              severity: isExe ? 'high' : 'medium',
              title: isExe ? 'Executable File Attachment' : 'Embedded File Attachment',
              description: `Embedded file located in document: "${sanitizeUntrustedText(filename, 50)}"`,
              capabilities: [SECURITY_CAPABILITIES.EMBEDDED_FILES],
              triggerContext: 'attachment',
              removable: true,
              details: { filename, declaredMimeType: 'application/octet-stream' }
            })
          })
        }
      }
    }
  } catch (err) {
    scanCompleteness.catalog = 'partial'
  }

  function inspectNameTree(treeRefOrDict, onLeaf, depth = 1) {
    if (!treeRefOrDict || depth > 8) return
    const dict = resolveObject(treeRefOrDict)
    if (!(dict instanceof PDFDict)) return

    const namesArr = dict.get(PDFName.of('Names'))
    if (namesArr instanceof PDFArray) {
      for (let i = 0; i < namesArr.size() - 1; i += 2) {
        const key = namesArr.get(i)?.asString?.() || `entry_${i}`
        const val = namesArr.get(i + 1)
        onLeaf(key, val)
      }
    }

    const kidsArr = dict.get(PDFName.of('Kids'))
    if (kidsArr instanceof PDFArray) {
      for (let i = 0; i < kidsArr.size(); i++) {
        inspectNameTree(kidsArr.get(i), onLeaf, depth + 1)
      }
    }
  }

  // 2. Traverse Pages, Annotations & Widgets
  try {
    const pageCount = doc.getPageCount()
    for (let pi = 0; pi < pageCount; pi++) {
      const page = doc.getPage(pi)
      const pageDict = page.node

      // Page /AA
      const pageAA = pageDict.get(PDFName.of('AA'))
      if (pageAA) {
        const resolvedPageAA = resolveObject(pageAA)
        if (resolvedPageAA instanceof PDFDict) {
          addFinding({
            category: 'AutomaticExecution',
            severity: 'high',
            title: 'Page-Level Action (/AA)',
            description: `Page ${pi + 1} has an action triggered when the page opens or closes.`,
            pageIndex: pi,
            capabilities: [SECURITY_CAPABILITIES.AUTO_EXECUTION],
            triggerContext: 'page_open_auto',
            removable: true
          })
          resolvedPageAA.entries().forEach(([_, act]) => inspectAction(act, 'page_open_auto', pi))
        }
      }

      // Annotations
      const annots = pageDict.get(PDFName.of('Annots'))
      if (annots) {
        const resolvedAnnots = resolveObject(annots)
        if (resolvedAnnots instanceof PDFArray) {
          for (let ai = 0; ai < resolvedAnnots.size(); ai++) {
            const annotRef = resolvedAnnots.get(ai)
            const annotDict = resolveObject(annotRef)
            if (!(annotDict instanceof PDFDict)) continue

            const rawSub = annotDict.get(PDFName.of('Subtype'))?.asString() || ''
            const subtype = rawSub.replace(/^\//, '')
            const objRef = annotRef instanceof PDFRef ? annotRef.toString() : undefined

            // Check multimedia
            if (['Screen', 'Movie', 'Sound'].includes(subtype)) {
              addFinding({
                category: 'InteractiveMultimedia',
                severity: 'medium',
                title: `Interactive ${subtype} Annotation`,
                description: `Page ${pi + 1} contains active multimedia (${subtype}).`,
                pageIndex: pi,
                pdfObjectRef: objRef,
                capabilities: [SECURITY_CAPABILITIES.MULTIMEDIA_PLAYBACK],
                triggerContext: 'multimedia',
                removable: true
              })
            } else if (subtype === 'RichMedia') {
              addFinding({
                category: 'InteractiveMultimedia',
                severity: 'medium',
                title: 'RichMedia Active Content',
                description: `Page ${pi + 1} contains RichMedia interactive content.`,
                pageIndex: pi,
                pdfObjectRef: objRef,
                capabilities: [SECURITY_CAPABILITIES.MULTIMEDIA_PLAYBACK],
                triggerContext: 'multimedia',
                removable: true
              })
            } else if (subtype === 'FileAttachment') {
              const fileSpec = resolveObject(annotDict.get(PDFName.of('FS')))
              const fname = fileSpec instanceof PDFDict ? (fileSpec.get(PDFName.of('UF'))?.asString() || fileSpec.get(PDFName.of('F'))?.asString() || 'attachment') : 'attachment'
              addFinding({
                category: 'EmbeddedContent',
                severity: 'medium',
                title: 'FileAttachment Annotation',
                description: `Page ${pi + 1} has an embedded file attachment: "${sanitizeUntrustedText(fname, 50)}"`,
                pageIndex: pi,
                pdfObjectRef: objRef,
                capabilities: [SECURITY_CAPABILITIES.EMBEDDED_FILES],
                triggerContext: 'annotation_attachment',
                removable: true,
                details: { filename: fname }
              })
            }

            // Check actions on annotation (/A and /AA)
            const action = annotDict.get(PDFName.of('A'))
            if (action) inspectAction(action, 'annotation_click', pi)

            const annotAA = annotDict.get(PDFName.of('AA'))
            if (annotAA) {
              const resolvedAAA = resolveObject(annotAA)
              if (resolvedAAA instanceof PDFDict) {
                resolvedAAA.entries().forEach(([_, a]) => inspectAction(a, 'annotation_event', pi))
              }
            }
          }
        }
      }
    }
  } catch (err) {
    scanCompleteness.pages = 'partial'
    scanCompleteness.annotations = 'partial'
  }

  // 3. Traverse AcroForm & XFA
  try {
    const acroForm = doc.catalog.get(PDFName.of('AcroForm'))
    if (acroForm) {
      const formDict = resolveObject(acroForm)
      if (formDict instanceof PDFDict) {
        // Check XFA
        const xfa = formDict.get(PDFName.of('XFA'))
        if (xfa) {
          addFinding({
            category: 'InteractiveMultimedia',
            severity: 'medium',
            title: 'XFA Dynamic Forms Packet',
            description: 'Document contains dynamic XML Forms Architecture (XFA) packages.',
            capabilities: [SECURITY_CAPABILITIES.XFA_PROCESSING],
            triggerContext: 'form_xfa',
            removable: true
          })
        }

        // Check Digital Signatures (/SigFlags)
        const sigFlags = formDict.get(PDFName.of('SigFlags'))
        if (sigFlags) {
          addFinding({
            category: 'StructuralAnomaly',
            severity: 'info',
            title: 'Digital Signature Structure Detected',
            description: 'Document contains digital signature fields. Sanitization will invalidate signature verification.',
            capabilities: [],
            triggerContext: 'digital_signature',
            removable: false
          })
        }
      }
    }
  } catch {
    scanCompleteness.forms = 'partial'
  }

  // Compute Tri-State Safe Checks
  const hasHighRisk = findings.some(f => f.severity === 'high')
  const hasMediumRisk = findings.some(f => f.severity === 'medium')
  const riskLevel = hasHighRisk ? 'HIGH' : (hasMediumRisk ? 'MEDIUM' : (findings.length ? 'LOW' : 'NONE'))

  const isComplete = Object.values(scanCompleteness).every(s => s === 'complete')
  const status = isComplete ? 'SCAN_COMPLETE' : 'SCAN_PARTIAL'

  const safeChecks = [
    {
      id: 'no-launch',
      label: 'No process launch actions detected',
      status: isComplete ? (findings.some(f => f.capabilities.includes(SECURITY_CAPABILITIES.LAUNCH_PROCESS)) ? 'failed' : 'passed') : 'unknown'
    },
    {
      id: 'no-xfa',
      label: 'No XFA dynamic form packets detected',
      status: scanCompleteness.forms === 'complete' ? (findings.some(f => f.capabilities.includes(SECURITY_CAPABILITIES.XFA_PROCESSING)) ? 'failed' : 'passed') : 'unknown'
    },
    {
      id: 'no-multimedia',
      label: 'No RichMedia or multimedia streams detected',
      status: scanCompleteness.annotations === 'complete' ? (findings.some(f => f.capabilities.includes(SECURITY_CAPABILITIES.MULTIMEDIA_PLAYBACK)) ? 'failed' : 'passed') : 'unknown'
    },
    {
      id: 'no-scripts',
      label: 'No active JavaScript actions detected',
      status: isComplete ? (findings.some(f => f.capabilities.includes(SECURITY_CAPABILITIES.EXECUTE_JAVASCRIPT)) ? 'failed' : 'passed') : 'unknown'
    },
    {
      id: 'no-embedded-files',
      label: 'No embedded file attachments detected',
      status: isComplete ? (findings.some(f => f.capabilities.includes(SECURITY_CAPABILITIES.EMBEDDED_FILES)) ? 'failed' : 'passed') : 'unknown'
    }
  ]

  return {
    status,
    riskLevel,
    findings,
    safeChecks,
    scanCompleteness,
    metadata: {
      numPages: doc.getPageCount(),
      fileSize: bytes.byteLength
    }
  }
}

function createFailedResult(status, message, riskLevel = 'HIGH') {
  return {
    status,
    riskLevel,
    findings: [{
      id: 'sec_find_fail',
      category: 'StructuralAnomaly',
      severity: riskLevel.toLowerCase(),
      title: 'Structural Inspection Failed or Partial',
      description: message,
      removable: false,
      capabilities: [],
      triggerContext: 'parser_failure'
    }],
    safeChecks: [
      { id: 'no-launch', label: 'No process launch actions detected', status: 'unknown' },
      { id: 'no-xfa', label: 'No XFA dynamic form packets detected', status: 'unknown' },
      { id: 'no-multimedia', label: 'No RichMedia or multimedia streams detected', status: 'unknown' },
      { id: 'no-scripts', label: 'No active JavaScript actions detected', status: 'unknown' }
    ],
    scanCompleteness: {
      catalog: 'not_scanned',
      pages: 'not_scanned',
      annotations: 'not_scanned',
      forms: 'not_scanned',
      attachments: 'not_scanned',
      actions: 'not_scanned'
    },
    metadata: {}
  }
}
