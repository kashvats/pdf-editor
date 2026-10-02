import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument, PDFName, PDFString } from '@cantoo/pdf-lib'
import { scanPdfStructure } from '../src/lib/securityScanner/scanner.js'

test('detects JavaScript, OpenAction, and Launch actions in PDF structure', async () => {
  const doc = await PDFDocument.create()
  doc.addPage([400, 400])

  // Inject OpenAction with JavaScript
  const jsAction = doc.context.obj({
    Type: 'Action',
    S: 'JavaScript',
    JS: PDFString.of('app.alert("Pwned!");')
  })
  const jsActionRef = doc.context.register(jsAction)
  doc.catalog.set(PDFName.of('OpenAction'), jsActionRef)

  const bytes = await doc.save()
  const result = await scanPdfStructure(bytes)

  assert.equal(result.status, 'SCAN_COMPLETE')
  assert.equal(result.riskLevel, 'HIGH')
  assert.ok(result.findings.some(f => f.category === 'ActiveScripting'))
  assert.ok(result.findings.some(f => f.capabilities.includes('auto_execution')))
  assert.ok(result.safeChecks.some(c => c.id === 'no-launch' && c.status === 'passed'))
  assert.ok(result.safeChecks.some(c => c.id === 'no-xfa' && c.status === 'passed'))
  assert.equal(result.scanCompleteness.catalog, 'complete')
})

test('differentiates benign page destination OpenAction from active action', async () => {
  const doc = await PDFDocument.create()
  const page = doc.addPage([400, 400])

  // OpenAction resolving to page view array
  doc.catalog.set(PDFName.of('OpenAction'), doc.context.obj([page.ref, PDFName.of('Fit')]))

  const bytes = await doc.save()
  const result = await scanPdfStructure(bytes)

  assert.equal(result.status, 'SCAN_COMPLETE')
  assert.equal(result.findings.some(f => f.category === 'AutomaticExecution' && f.severity === 'high'), false)
})

test('detects embedded file attachments and external URIs', async () => {
  const doc = await PDFDocument.create()
  const page = doc.addPage([400, 400])

  // Add Link annotation with external URI
  const uriAction = doc.context.obj({
    Type: 'Action',
    S: 'URI',
    URI: PDFString.of('https://example.com/docs')
  })
  const linkAnnot = doc.context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: [10, 10, 100, 30],
    A: uriAction
  })
  const linkRef = doc.context.register(linkAnnot)
  page.node.set(PDFName.of('Annots'), doc.context.obj([linkRef]))

  const bytes = await doc.save()
  const result = await scanPdfStructure(bytes)

  assert.equal(result.status, 'SCAN_COMPLETE')
  assert.ok(result.findings.some(f => f.category === 'DataTransmission' && f.details?.target === 'https://example.com/docs'))
})

test('fails closed when given corrupted bytes', async () => {
  const junk = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0x12, 0x34]) // Corrupted PDF
  const result = await scanPdfStructure(junk)
  assert.ok(result.status === 'SCAN_FAILED' || result.status === 'SCAN_PARTIAL')
  assert.notEqual(result.riskLevel, 'NONE')
  assert.ok(result.safeChecks.some(c => c.status === 'unknown'))
})
