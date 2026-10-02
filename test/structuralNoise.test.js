import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  checkDocumentTextQuality,
  detectFrontMatterPages,
  isStructuralNoiseChunk,
  cleanCandidateText
} from '../src/lib/intelligence/structuralNoise.js'

test('detects when document has low text density and requires OCR', () => {
  const scannedPages = [
    { pageNum: 1, text: '' },
    { pageNum: 2, text: '   ' },
    { pageNum: 3, text: 'Scanned title' }
  ]
  const q1 = checkDocumentTextQuality(scannedPages)
  assert.equal(q1.needsOcr, true)

  const textPages = [
    { pageNum: 1, text: 'This is a normal digital textbook page with several complete sentences describing network protocols and security measures.' },
    { pageNum: 2, text: 'Another substantive page explaining the OSI model and packet transmission details in full depth.' }
  ]
  const q2 = checkDocumentTextQuality(textPages)
  assert.equal(q2.needsOcr, false)
})

test('detects front-matter pages structurally from roman numerals and copyright blocks', () => {
  const chunks = [
    { page: 1, text: 'Wiley Publishing, Inc. All rights reserved. ISBN 978-0-123456-78-9' },
    { page: 2, text: 'Table of Contents\nChapter 1: Networking Fundamentals .... 1\nChapter 2: Attack Types .... 15' },
    { page: 3, text: 'Acknowledgments\nI would like to thank my editor at Wiley...' },
    { page: 4, text: 'Chapter 1\nNetworking Fundamentals\nThe OSI Model consists of seven distinct layers.' }
  ]
  const fmPages = detectFrontMatterPages(chunks, 4)
  assert.equal(fmPages.has(1), true)
  assert.equal(fmPages.has(2), true)
  assert.equal(fmPages.has(3), true)
  assert.equal(fmPages.has(4), false)
})

test('flags boilerplate chunks as structural noise', () => {
  const fm = new Set([1, 2, 3])
  assert.equal(isStructuralNoiseChunk({ page: 2, text: 'Table of Contents' }, fm), true)
  assert.equal(isStructuralNoiseChunk({ page: 1, text: 'Copyright © 2024 All Rights Reserved' }, fm), true)
  assert.equal(isStructuralNoiseChunk({ page: 4, text: 'Page 14 of 250' }, fm), true)
  assert.equal(isStructuralNoiseChunk({ page: 4, text: '97 percent' }, fm), true)
  assert.equal(isStructuralNoiseChunk({ page: 4, text: 'https://example.com/docs' }, fm), true)
  assert.equal(isStructuralNoiseChunk({ page: 4, text: 'The Address Resolution Protocol translates IP addresses to MAC addresses.' }, fm), false)
})

test('cleans chapter and structural prefixes from candidate text', () => {
  assert.equal(cleanCandidateText('Chapter 1: Networking Fundamentals'), 'Networking Fundamentals')
  assert.equal(cleanCandidateText('Part II - Attack Vectors'), 'Attack Vectors')
  assert.equal(cleanCandidateText('Section 3.2: Firewalls'), 'Firewalls')
})
