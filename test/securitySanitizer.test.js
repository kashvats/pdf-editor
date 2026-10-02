import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument, PDFName, PDFString } from '@cantoo/pdf-lib'
import { scanPdfStructure } from '../src/lib/securityScanner/scanner.js'
import { sanitizeStandard, sanitizeMaximumSafety } from '../src/lib/securityScanner/sanitizer.js'
import { verifySanitizedDocument } from '../src/lib/securityScanner/verifier.js'
import { createDefaultSanitizationPolicy } from '../src/lib/securityScanner/types.js'

test('standard sanitization strips JavaScript, OpenAction, and verifies clean output', async () => {
  const doc = await PDFDocument.create()
  doc.addPage([400, 400])

  // Add OpenAction and JavaScript
  const jsAction = doc.context.obj({
    Type: 'Action',
    S: 'JavaScript',
    JS: PDFString.of('app.alert("Dangerous");')
  })
  const jsRef = doc.context.register(jsAction)
  doc.catalog.set(PDFName.of('OpenAction'), jsRef)

  const dirtyBytes = await doc.save()
  const policy = createDefaultSanitizationPolicy('standard')
  const { sanitizedBytes, removedItems } = await sanitizeStandard(dirtyBytes, policy)

  assert.ok(removedItems.length > 0)

  // Mandatory verification
  const verification = await verifySanitizedDocument(sanitizedBytes, policy)
  assert.equal(verification.verified, true)
  assert.equal(verification.remainingFindings.filter(f => f.severity === 'high').length, 0)

  // Verify structure
  const reScan = await scanPdfStructure(sanitizedBytes)
  assert.equal(reScan.findings.some(f => f.category === 'ActiveScripting'), false)
  assert.equal(reScan.findings.some(f => f.category === 'AutomaticExecution'), false)
})

test('maximum safety rebuilds new clean document discarding legacy objects', async () => {
  const doc = await PDFDocument.create()
  doc.addPage([300, 500])

  const dirtyBytes = await doc.save()
  const valid1x1Png = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0,31,21,196,137,0,0,0,13,73,68,65,84,120,218,99,100,248,207,80,15,0,3,134,1,128,90,52,125,107,0,0,0,0,73,69,78,68,174,66,96,130])
  const mockRender = async (pageIndex) => ({
    width: 300,
    height: 500,
    imageBytes: valid1x1Png
  })

  const policy = createDefaultSanitizationPolicy('maximum_safety')
  const { sanitizedBytes } = await sanitizeMaximumSafety(dirtyBytes, mockRender, policy)
  const reScan = await scanPdfStructure(sanitizedBytes)
  assert.equal(reScan.status, 'SCAN_COMPLETE')
  assert.equal(reScan.riskLevel, 'NONE')
  assert.equal(reScan.findings.length, 0)
})
