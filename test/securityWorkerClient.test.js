import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument } from '@cantoo/pdf-lib'
import { runSecurityInspectionPipeline } from '../src/lib/securityScanner/client.js'

test('runs security inspection pipeline with stage budgets and abort support', async () => {
  const doc = await PDFDocument.create()
  doc.addPage([300, 300])
  const bytes = await doc.save()

  const result = await runSecurityInspectionPipeline(bytes, { timeoutMs: 5000 })
  assert.ok(result.status === 'SCAN_COMPLETE')
  assert.ok(Array.isArray(result.findings))
  assert.ok(Array.isArray(result.safeChecks))

  // Test AbortController cancellation
  const controller = new AbortController()
  controller.abort()
  try {
    await runSecurityInspectionPipeline(bytes, { signal: controller.signal })
    assert.fail('Should have aborted')
  } catch (err) {
    assert.equal(err.name, 'AbortError')
  }
})
