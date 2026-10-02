import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractSemanticRelationships } from '../src/lib/intelligence/relations.js'

test('extracts evidenced semantic relationships and rejects co-occurrence alone', () => {
  const topics = [
    { id: 'top_firewall', name: 'Firewalls', aliases: ['firewall'] },
    { id: 'top_port_scan', name: 'Port Scanning', aliases: ['port scanning'] },
    { id: 'top_recon', name: 'Reconnaissance', aliases: ['reconnaissance'] },
    { id: 'top_arp', name: 'ARP', aliases: ['arp'] }
  ]

  const chunks = [
    // Evidenced: "protects_against / mitigates"
    {
      id: 'chk_1',
      page: 15,
      text: 'A properly configured Firewall protects against Port Scanning by dropping unauthorized packets.'
    },
    // Semantic entailment: "identifies / enables"
    {
      id: 'chk_2',
      page: 18,
      text: 'Port Scanning identifies network services to facilitate Reconnaissance of open targets.'
    },
    // Merely co-occurring without relationship verb - MUST NOT create edge
    {
      id: 'chk_3',
      page: 20,
      text: 'In this chapter we discussed Firewalls and also mentioned ARP in passing.'
    }
  ]

  const rels = extractSemanticRelationships(chunks, topics)
  assert.equal(rels.length, 2, 'Must extract exactly 2 evidenced relationships and reject co-occurrence')
  
  const rel1 = rels.find(r => (r.sourceName === 'Firewalls' || r.targetName === 'Firewalls') &&
                               (r.targetName === 'Port Scanning' || r.sourceName === 'Port Scanning'))
  assert.ok(rel1, 'Rel 1 between Firewalls and Port Scanning must exist')
  assert.ok(rel1.predicate === 'protects_against' || rel1.predicate === 'mitigates' || rel1.predicate === 'prevents')
  assert.ok(rel1.evidenceChunkIds.includes('chk_1'))
  assert.ok(rel1.sourcePages.includes(15))
  assert.ok(rel1.evidence.includes('protects against Port Scanning'))

  const rel2 = rels.find(r => (r.sourceName === 'Port Scanning' || r.targetName === 'Port Scanning') &&
                               (r.targetName === 'Reconnaissance' || r.sourceName === 'Reconnaissance'))
  assert.ok(rel2, 'Rel 2 between Port Scanning and Reconnaissance must exist')
  assert.ok(rel2.predicate === 'identifies' || rel2.predicate === 'enables' || rel2.predicate === 'supports')
  assert.ok(rel2.evidenceChunkIds.includes('chk_2'))
  assert.ok(rel2.sourcePages.includes(18))
})
