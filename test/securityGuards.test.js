import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  checkPreflightLimits,
  createTraversalTracker,
  checkStreamExpansion,
  checkImageLimits
} from '../src/lib/securityScanner/resourceGuards.js'
import { createDefaultSanitizationPolicy } from '../src/lib/securityScanner/types.js'

test('enforces preflight file size limits', () => {
  const normalBytes = new Uint8Array(1024 * 1024) // 1MB
  assert.equal(checkPreflightLimits(normalBytes).allowed, true)

  const oversizedBytes = new Uint8Array(160 * 1024 * 1024) // 160MB
  const pre = checkPreflightLimits(oversizedBytes, { maxFileSizeBytes: 150 * 1024 * 1024 })
  assert.equal(pre.allowed, false)
  assert.ok(pre.reason.includes('exceeds'))
})

test('tracks recursion depth and breaks cyclic object loops', () => {
  const tracker = createTraversalTracker({ maxRecursionDepth: 5, maxUniqueObjects: 10 })
  assert.equal(tracker.visit('1R0', 1), true)
  assert.equal(tracker.visit('2R0', 2), true)
  assert.equal(tracker.visit('1R0', 3), false) // Already visited cycle!
  assert.equal(tracker.isCycle('1R0'), true)

  // Test depth limit
  assert.equal(tracker.visit('3R0', 6), false) // Exceeds depth 5
})

test('aborts stream decoding on extreme expansion ratio or excessive size', () => {
  // Safe stream
  assert.equal(checkStreamExpansion(1000, 5000, 5000), true)

  // Decompression bomb: 100 bytes expanding to 100,000 bytes (1000x ratio)
  assert.equal(checkStreamExpansion(100, 100000, 100000, { maxExpansionRatio: 100 }), false)

  // Cumulative budget exceeded: stream alone is ok but total decoded exceeds limit
  assert.equal(checkStreamExpansion(1000, 5000, 160 * 1024 * 1024, { maxTotalDecodedBytes: 150 * 1024 * 1024 }), false)
})

test('blocks oversized image dimensions before allocating bitmap memory', () => {
  assert.equal(checkImageLimits(1920, 1080).allowed, true)
  const huge = checkImageLimits(12000, 12000, { maxImageDimension: 6000 })
  assert.equal(huge.allowed, false)
  assert.ok(huge.reason.includes('dimension'))
})

test('creates default policies with correct URI defaults', () => {
  const standardPolicy = createDefaultSanitizationPolicy('standard')
  assert.equal(standardPolicy.allowedUriSchemes.has('https'), true)
  assert.equal(standardPolicy.allowedUriSchemes.has('http'), true)
  assert.equal(standardPolicy.allowedUriSchemes.has('mailto'), false) // mailto is opt-in

  const maxSafetyPolicy = createDefaultSanitizationPolicy('maximum_safety')
  assert.equal(maxSafetyPolicy.allowedUriSchemes.size, 0)
})
