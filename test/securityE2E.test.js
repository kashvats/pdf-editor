import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PDFDocument, PDFName, PDFString } from '@cantoo/pdf-lib'
import { scanPdfStructure } from '../src/lib/securityScanner/scanner.js'
import { sanitizeStandard, sanitizeMaximumSafety } from '../src/lib/securityScanner/sanitizer.js'
import { verifySanitizedDocument } from '../src/lib/securityScanner/verifier.js'
import { createDefaultSanitizationPolicy } from '../src/lib/securityScanner/types.js'

test('E2E Matrix 1: Clean textbook scans with zero high-severity findings', async () => {
  const pdfPath = 'books/34. Computer Viruses, Hacking and Malware attacks for Dummies.pdf'
  if (!fs.existsSync(pdfPath)) return

  const buffer = fs.readFileSync(pdfPath)
  const result = await scanPdfStructure(new Uint8Array(buffer))

  assert.equal(result.status, 'SCAN_COMPLETE')
  assert.ok(result.safeChecks.length >= 4)
  assert.ok(result.findings.filter(f => f.severity === 'high').length === 0)
  assert.notEqual(result.riskLevel, 'HIGH')
})

test('E2E Matrix 2: PDF with simulated malicious Launch and JS actions is detected and sanitized', async () => {
  const doc = await PDFDocument.create()
  const page = doc.addPage([400, 400])

  // 1. Add Launch action on Page AA
  const launchAction = doc.context.obj({
    Type: 'Action',
    S: 'Launch',
    F: PDFString.of('calc.exe')
  })
  page.node.set(PDFName.of('AA'), doc.context.obj({
    O: doc.context.register(launchAction)
  }))

  // 2. Add JavaScript on OpenAction
  const jsAction = doc.context.obj({
    Type: 'Action',
    S: 'JavaScript',
    JS: PDFString.of('this.exportDataObject({ cName: "exploit", nLaunch: 2 });')
  })
  doc.catalog.set(PDFName.of('OpenAction'), doc.context.register(jsAction))

  const dirtyBytes = await doc.save()

  // 1. Scan dirty
  const scan1 = await scanPdfStructure(dirtyBytes)
  assert.equal(scan1.riskLevel, 'HIGH')
  assert.ok(scan1.findings.some(f => f.category === 'ActiveScripting'))
  assert.ok(scan1.findings.some(f => f.category === 'AutomaticExecution'))

  // 2. Sanitize
  const policy = createDefaultSanitizationPolicy('standard')
  const { sanitizedBytes, removedItems, preservedItems } = await sanitizeStandard(dirtyBytes, policy)
  assert.ok(removedItems.length >= 2)

  // 3. Post-scan verification
  const verification = await verifySanitizedDocument(sanitizedBytes, policy)
  assert.equal(verification.verified, true)

  const scan2 = await scanPdfStructure(sanitizedBytes)
  assert.equal(scan2.riskLevel, 'NONE')
  assert.equal(scan2.findings.length, 0)
})

test('E2E Matrix 3: External URIs differentiate safe https from dangerous file schemes', async () => {
  const doc = await PDFDocument.create()
  const page = doc.addPage([400, 400])

  const safeUri = doc.context.obj({ Type: 'Action', S: 'URI', URI: PDFString.of('https://example.com') })
  const dangerousUri = doc.context.obj({ Type: 'Action', S: 'URI', URI: PDFString.of('file:///etc/passwd') })

  const annot1 = doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [10, 10, 50, 50], A: safeUri })
  const annot2 = doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [60, 10, 100, 50], A: dangerousUri })

  page.node.set(PDFName.of('Annots'), doc.context.obj([
    doc.context.register(annot1),
    doc.context.register(annot2)
  ]))

  const bytes = await doc.save()
  const scan = await scanPdfStructure(bytes)

  const safeFinding = scan.findings.find(f => f.details?.target === 'https://example.com')
  const dangFinding = scan.findings.find(f => f.details?.target === 'file:///etc/passwd')

  assert.ok(safeFinding)
  assert.equal(safeFinding.severity, 'info')

  assert.ok(dangFinding)
  assert.equal(dangFinding.severity, 'high')

  // Sanitize with default policy
  const policy = createDefaultSanitizationPolicy('standard')
  const { sanitizedBytes } = await sanitizeStandard(bytes, policy)
  const rescan = await scanPdfStructure(sanitizedBytes)

  // Dangerous file scheme stripped, https preserved
  assert.equal(rescan.findings.some(f => f.details?.target === 'file:///etc/passwd'), false)
  assert.equal(rescan.findings.some(f => f.details?.target === 'https://example.com'), true)
})
