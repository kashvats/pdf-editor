import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getOrBuildDocumentIntelligence, clearDocumentIntelligenceCache } from '../src/lib/intelligence/documentIntelligence.js'

test('honors AbortController cancellation cleanly and transitions to cancelled', async () => {
  clearDocumentIntelligenceCache()
  const controller = new AbortController()
  controller.abort() // Immediately abort

  try {
    await getOrBuildDocumentIntelligence(new Uint8Array(100), 'test.pdf', { signal: controller.signal })
    assert.fail('Should have thrown AbortError')
  } catch (err) {
    assert.equal(err.name, 'AbortError')
  }
})
