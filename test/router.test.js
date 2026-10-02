import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRoute, routeToPath } from '../src/lib/router.js'

test('parses canonical routes consistently', () => {
  const r1 = parseRoute({ pathname: '/document-intelligence', search: '?tab=knowledge-graph' })
  assert.equal(r1.tool, 'intelligence')
  assert.equal(r1.tab, 'knowledge-graph')

  const r2 = parseRoute({ pathname: '/document-intelligence', search: '?tab=mind-map' })
  assert.equal(r2.tool, 'intelligence')
  assert.equal(r2.tab, 'mind-map')

  const r2b = parseRoute({ pathname: '/document-intelligence', search: '?tab=knowledge-map' })
  assert.equal(r2b.tool, 'intelligence')
  assert.equal(r2b.tab, 'knowledge-map')

  const r3 = parseRoute({ pathname: '/pdf-editor', search: '' })
  assert.equal(r3.tool, 'editor')

  const r4 = parseRoute({ pathname: '/extract-data', search: '' })
  assert.equal(r4.tool, 'extractdata')

  const r5 = parseRoute({ pathname: '/workflow-builder', search: '' })
  assert.equal(r5.tool, 'workflow')

  const r6 = parseRoute({ pathname: '/batch-processing', search: '' })
  assert.equal(r6.tool, 'batch')

  const r7 = parseRoute({ pathname: '/compress', search: '' })
  assert.equal(r7.tool, 'compress')
})

test('converts route to canonical URL path', () => {
  assert.equal(routeToPath('intelligence', 'knowledge-graph'), '/document-intelligence?tab=knowledge-graph')
  assert.equal(routeToPath('intelligence', 'mind-map'), '/document-intelligence?tab=mind-map')
  assert.equal(routeToPath('intelligence', 'graph'), '/document-intelligence?tab=knowledge-graph')
  assert.equal(routeToPath('intelligence', 'mindmap'), '/document-intelligence?tab=mind-map')
  assert.equal(routeToPath('intelligence', 'knowledge-map'), '/document-intelligence?tab=knowledge-map')
  assert.equal(routeToPath('intelligence', 'knowledgemap'), '/document-intelligence?tab=knowledge-map')
  assert.equal(routeToPath('editor'), '/pdf-editor')
  assert.equal(routeToPath('extractdata'), '/extract-data')
  assert.equal(routeToPath('workflow'), '/workflow-builder')
  assert.equal(routeToPath('batch'), '/batch-processing')
  assert.equal(routeToPath('compress'), '/compress')
  assert.equal(routeToPath('home'), '/')
})
