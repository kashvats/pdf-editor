import { zipSync } from '../zip.js'

// Unified Knowledge Format (OKF-compatible)
export function createKnowledgePackage({ docName, structure, entities, relationships, embeddings = [] }) {
  const nodes = entities.map(e => ({
    id: e.id,
    type: e.type,
    title: e.name,
    summary: `${e.type} entity referenced ${e.count} time${e.count === 1 ? '' : 's'} in document.`,
    sourcePages: e.pages,
    sourceChunks: e.chunkIds,
    metadata: {
      frequency: e.count
    },
    relationships: relationships.filter(r => r.sourceId === e.id).map(r => ({
      targetId: r.targetId,
      type: r.type,
      confidence: r.confidence
    })),
    confidence: e.confidence
  }))

  return {
    version: '1.0.0',
    schema: 'okf-v1',
    document: {
      name: docName,
      numPages: structure.numPages,
      createdAt: new Date().toISOString()
    },
    structure: {
      headings: structure.headings,
      facts: structure.facts
    },
    nodes,
    relationships,
    embeddingsCount: embeddings.length
  }
}

export function exportKnowledgeJson(pkg) {
  return JSON.stringify(pkg, null, 2)
}

export function exportNodesCsv(nodes) {
  const header = ['id', 'type', 'title', 'sourcePages', 'confidence']
  const rows = nodes.map(n => [
    `"${n.id}"`,
    `"${n.type}"`,
    `"${String(n.title).replace(/"/g, '""')}"`,
    `"${(n.sourcePages || []).join(';')}"`,
    n.confidence || 1.0
  ])
  return [header.join(','), ...rows.map(r => r.join(','))].join('\n')
}

export function exportEdgesCsv(relationships) {
  const header = ['id', 'sourceId', 'sourceName', 'type', 'targetId', 'targetName', 'page', 'confidence', 'evidence']
  const rows = relationships.map(r => [
    `"${r.id}"`,
    `"${r.sourceId}"`,
    `"${String(r.sourceName).replace(/"/g, '""')}"`,
    `"${r.type}"`,
    `"${r.targetId}"`,
    `"${String(r.targetName).replace(/"/g, '""')}"`,
    r.page || 1,
    r.confidence || 0.8,
    `"${String(r.evidence || '').replace(/"/g, '""')}"`
  ])
  return [header.join(','), ...rows.map(r => r.join(','))].join('\n')
}

export function exportMarkdownOutline(structure, entities) {
  const lines = [`# Knowledge Outline: ${structure.docName || 'Document'}\n`]

  if (structure.headings && structure.headings.length) {
    lines.push('## Document Structure\n')
    structure.headings.forEach(h => {
      const hashes = '#'.repeat(Math.min(6, h.level + 1))
      lines.push(`${hashes} ${h.text} *(Page ${h.page})*`)
    })
    lines.push('')
  }

  if (entities && entities.length) {
    lines.push('## Extracted Entities & Concepts\n')
    const byType = {}
    entities.forEach(e => {
      if (!byType[e.type]) byType[e.type] = []
      byType[e.type].push(e)
    })

    Object.entries(byType).forEach(([type, items]) => {
      lines.push(`### ${type} (${items.length})`)
      items.forEach(it => {
        lines.push(`- **${it.name}** — Pages: ${it.pages.join(', ')}`)
      })
      lines.push('')
    })
  }

  return lines.join('\n')
}

export function exportCompleteZip(pkg, embeddings = []) {
  const encoder = new TextEncoder()
  const files = [
    {
      name: 'knowledge.json',
      data: encoder.encode(exportKnowledgeJson(pkg))
    },
    {
      name: 'nodes.csv',
      data: encoder.encode(exportNodesCsv(pkg.nodes))
    },
    {
      name: 'relationships.csv',
      data: encoder.encode(exportEdgesCsv(pkg.relationships))
    },
    {
      name: 'outline.md',
      data: encoder.encode(exportMarkdownOutline({ docName: pkg.document.name, headings: pkg.structure.headings }, pkg.nodes.map(n => ({ name: n.title, type: n.type, pages: n.sourcePages }))))
    }
  ]

  if (embeddings.length) {
    files.push({
      name: 'embeddings.json',
      data: encoder.encode(JSON.stringify(embeddings, null, 2))
    })
  }

  return zipSync(files)
}
