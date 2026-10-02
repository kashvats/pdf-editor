import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { getOrBuildDocumentIntelligence, clearDocumentIntelligenceCache } from '../src/lib/intelligence/documentIntelligence.js'

test('Golden Regression: DNS and BIND on IPv6 Mind Map adheres to strict semantic hierarchy, coverage, and label cleanliness', async () => {
  clearDocumentIntelligenceCache()

  const pdfPath = 'books/DNS and BIND on IPv6.pdf'
  assert.ok(fs.existsSync(pdfPath), 'Golden fixture PDF must be present in books/DNS and BIND on IPv6.pdf')

  const buf = fs.readFileSync(pdfPath)
  const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)

  const intel = await getOrBuildDocumentIntelligence(bytes, 'DNS and BIND on IPv6.pdf', {
    forceRefresh: true
  })

  assert.ok(intel, 'Document intelligence must be built')
  const tree = intel.mindmapTree
  assert.ok(tree, 'Mind map tree must be built')

  // Flatten tree to inspect all nodes and parent-child edges
  const allNodes = []
  const parentChildPairs = []
  function walk(node, parent = null, depth = 0) {
    if (!node) return
    allNodes.push({ ...node, depth, parentId: parent?.id })
    if (parent) {
      parentChildPairs.push({ parent, child: node })
    }
    for (const ch of (node.children || [])) {
      walk(ch, node, depth + 1)
    }
  }
  walk(tree, null, 0)

  console.log(`Discovered ${allNodes.length} mind map nodes:`)
  allNodes.forEach(n => {
    console.log(`${'  '.repeat(n.depth)}- [${n.title}] (p.${n.displayPageLabel || n.page}, PDF p.${n.pdfPageNumber || n.page})`)
  })

  // 1. Root represents the whole book
  assert.match(tree.title, /DNS\s+and\s+BIND\s+on\s+IPv6/i, 'Root title must represent the whole book')

  // Collect all branch and sub-node titles
  const allTitles = allNodes.map(n => n.title)
  const allTitlesLower = allTitles.map(t => t.toLowerCase())

  // 2. IPv6 Addressing & DNS mapping is represented
  const hasIPv6DnsMapping = allTitlesLower.some(t =>
    (t.includes('ipv6') && (t.includes('address') || t.includes('mapping') || t.includes('dns'))) ||
    t.includes('aaaa') || t.includes('ip6.arpa')
  )
  assert.ok(hasIPv6DnsMapping, 'IPv6/DNS mapping must be represented in Mind Map')

  // 3. BIND on IPv6 configuration is represented
  const hasBindIPv6 = allTitlesLower.some(t =>
    t.includes('bind') || (t.includes('queries') && t.includes('listening')) || t.includes('zone transfer') || t.includes('acl')
  )
  assert.ok(hasBindIPv6, 'BIND IPv6 configuration must be represented in Mind Map')

  // 4. Resolver Configuration is represented
  const hasResolver = allTitlesLower.some(t =>
    t.includes('resolver') || t.includes('dhcpv6') || t.includes('router advertisement')
  )
  assert.ok(hasResolver, 'Resolver Configuration must be represented in Mind Map')

  // 5. DNS64 is represented
  const hasDns64 = allTitlesLower.some(t => t.includes('dns64'))
  assert.ok(hasDns64, 'DNS64 must be represented in Mind Map')

  // 6. Troubleshooting is represented
  const hasTroubleshooting = allTitlesLower.some(t =>
    t.includes('troubleshooting') || t.includes('nslookup') || t.includes('dig')
  )
  assert.ok(hasTroubleshooting, 'Troubleshooting must be represented in Mind Map')

  // 7. Unique Local Addresses and Link-Local Addresses are NOT parent/child
  const ulaLlaParentChild = parentChildPairs.some(({ parent, child }) => {
    const p = parent.title.toLowerCase()
    const c = child.title.toLowerCase()
    return (p.includes('unique local') && c.includes('link-local')) ||
           (p.includes('link-local') && c.includes('unique local'))
  })
  assert.equal(ulaLlaParentChild, false, 'Unique Local Addresses and Link-Local Addresses must NOT be parent/child')

  // 8. No page/footer text such as "| 3" in canonical labels
  for (const title of allTitles) {
    assert.doesNotMatch(title, /\|\s*\d+/, `Title "${title}" must not contain running footer pipe-page text`)
    assert.doesNotMatch(title, /^\d+\s*\|/, `Title "${title}" must not contain running header page-pipe text`)
  }

  // 9. No major branch is composed only of a single arbitrary section heading
  assert.ok(tree.children.length >= 4 && tree.children.length <= 8, `Major branches must be 4–8, got ${tree.children.length}`)
  for (const branch of tree.children) {
    assert.ok((branch.children || []).length >= 1, `Branch "${branch.title}" must have meaningful subtopics`)
  }

  // 10. Every visible node has source-grounded evidence (no bare placeholder summaries)
  for (const n of allNodes) {
    if (n.id === 'mm_root') continue
    assert.ok(n.page > 0, `Node "${n.title}" must have a valid source page`)
    assert.ok(n.summary && n.summary.length >= 15, `Node "${n.title}" must have a grounded summary`)
    assert.doesNotMatch(n.summary, /Key concept detailed in the document/i, `Node "${n.title}" must not have placeholder summary`)
    assert.doesNotMatch(n.summary, /Major semantic area covering/i, `Node "${n.title}" must not have generic group placeholder summary`)
    assert.doesNotMatch(n.summary, /discussed in document on page/i, `Node "${n.title}" must not have page-reference placeholder summary`)
  }

  // 11. Hierarchy passes broader/narrower semantic validation
  for (const { parent, child } of parentChildPairs) {
    if (parent.id === 'mm_root') continue
    // Sibling address types or queries must not be parent/child
    const pLower = parent.title.toLowerCase()
    const cLower = child.title.toLowerCase()
    if ((pLower.includes('unique local') && cLower.includes('link-local')) ||
        (pLower.includes('link-local') && cLower.includes('unique local'))) {
      assert.fail(`Sibling address types "${parent.title}" and "${child.title}" cannot be parent/child`)
    }
  }

  // 12. Covers entire document (from early pages to late pages >= 30)
  const pagesRepresented = allNodes.map(n => n.pdfPageNumber || n.page).filter(p => typeof p === 'number')
  const minPage = Math.min(...pagesRepresented)
  const maxPage = Math.max(...pagesRepresented)
  assert.ok(minPage <= 15, `Mind map must start in early chapters (min page: ${minPage})`)
  assert.ok(maxPage >= 30, `Mind map must extend to later chapters (Troubleshooting, DNS64, Resolver) (max page: ${maxPage})`)

  // 13. Dynamic complexity: total nodes between 20 and 35
  assert.ok(allNodes.length >= 18 && allNodes.length <= 40, `Total mind map nodes must be roughly 20–35, got ${allNodes.length}`)

  // 14. Physical and printed page references stored
  for (const n of allNodes) {
    if (n.id === 'mm_root') continue
    assert.ok(n.pdfPageNumber != null, `Node "${n.title}" must store pdfPageNumber`)
    assert.ok(n.displayPageLabel != null, `Node "${n.title}" must store displayPageLabel`)
  }

  // 15. Supporting entities (IETF, IANA, RIR etc) must not appear as Mind Map learning topics
  const supportingEntityPattern = /^(?:ietf|iana|rir|rirs|arin|ripe|apnic|lacnic|afrinic|icann|ieee|w3c)$/i
  for (const n of allNodes) {
    assert.ok(
      !supportingEntityPattern.test(n.title),
      `Supporting entity "${n.title}" must not appear as a Mind Map learning topic`
    )
    assert.doesNotMatch(n.title, /regional\s+internet\s+registr/i,
      `"${n.title}" is a registry organization, not a learning topic`)
    assert.doesNotMatch(n.title, /internet\s+engineering\s+task\s+force/i,
      `"${n.title}" is a standards body, not a learning topic`)
  }

  // 16. Knowledge Graph: no false example_of from mere cue words
  const rels = intel.relationships || []
  const falseExampleOf = rels.filter(r =>
    r.predicate === 'example_of' &&
    // If the evidence sentence uses "for example" or "such as" but NOT "is an example of"
    r.evidence &&
    /\bfor\s+example\b|\bsuch\s+as\b/i.test(r.evidence) &&
    !/\bis\s+an?\s+example\s+of\b|\bis\s+an?\s+instance\s+of\b/i.test(r.evidence)
  )
  assert.equal(falseExampleOf.length, 0,
    `No example_of edges must be inferred from cue words alone. Found: ${falseExampleOf.map(r => `${r.sourceName} → ${r.targetName}`).join(', ')}`)

  // 17. Synthetic group nodes must aggregate source pages (not claim one arbitrary page)
  for (const n of allNodes) {
    if (n.synthetic && n.isMajorGroup && n.children && n.children.length > 0) {
      assert.ok(Array.isArray(n.sourcePages), `Synthetic node "${n.title}" must have sourcePages array`)
    }
  }

  // 18. "Adding AAAA Records" topic must have a meaningful summary (not "Summary unavailable")
  const aaaaTopic = intel.topics.find(t => /adding.+aaaa/i.test(t.name))
  if (aaaaTopic) {
    assert.ok(aaaaTopic.summary && aaaaTopic.summary.length >= 20,
      `"Adding AAAA Records" topic must have a grounded summary, got: "${aaaaTopic.summary?.slice(0, 60)}"`)
    assert.doesNotMatch(aaaaTopic.summary, /Summary unavailable/i,
      '"Adding AAAA Records" must not have "Summary unavailable" as its summary')
  }

  // 19. "Adding AAAA Records" must have displayPageLabel "5" (printed book page), not PDF page "14"
  if (aaaaTopic) {
    assert.equal(String(aaaaTopic.displayPageLabel), '5',
      `"Adding AAAA Records" displayPageLabel must be "5" (printed book page), got "${aaaaTopic.displayPageLabel}"`)
    assert.equal(String(aaaaTopic.pdfPageNumber), '14',
      `"Adding AAAA Records" pdfPageNumber must be "14" (PDF page), got "${aaaaTopic.pdfPageNumber}"`)
  }

  // 20. No contrasts_with relationship generated from "unlike" cue word alone on the DNS book
  const falseContrastsWith = (intel.relationships || []).filter(r =>
    r.predicate === 'contrasts_with' &&
    r.evidence &&
    /\bunlike\b|\bcompared\s+(?:with|to)\b/i.test(r.evidence) &&
    !/\bcontrasts\s+with\b|\bin\s+contrast\s+to\b|\bopposed\s+to\b|\bwhereas\b/i.test(r.evidence)
  )
  assert.equal(falseContrastsWith.length, 0,
    `No contrasts_with edges from "unlike"/"compared with" alone. Found: ${falseContrastsWith.map(r => `${r.sourceName} → ${r.targetName}: "${r.evidence?.slice(0, 60)}"`).join('; ')}`)

  // 21. generateTopicSummary must return non-empty summary for "Adding AAAA Records"
  if (aaaaTopic) {
    const { generateTopicSummary } = await import('../src/lib/intelligence/localLlm.js')
    const sumResult = generateTopicSummary(aaaaTopic, intel.cleanChunks, intel.relationships)
    assert.ok(sumResult?.summary && sumResult.summary.length >= 20,
      `generateTopicSummary must return real content for "Adding AAAA Records", got: "${sumResult?.summary?.slice(0, 60)}"`)
    assert.doesNotMatch(sumResult?.summary || '', /Summary unavailable/i,
      'generateTopicSummary must not return placeholder for "Adding AAAA Records"')
  }
})
