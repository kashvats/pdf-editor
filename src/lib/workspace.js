import { useEffect, useState } from 'react'
import pdfjs from './pdfjs'
import { saveDocumentVersion } from './db'

let currentDoc = null
const listeners = new Set()

function notify() {
  const copy = currentDoc ? { ...currentDoc } : null
  listeners.forEach(fn => fn(copy))
}

export function getActiveDocument() {
  return currentDoc
}

export async function setActiveDocument({ name, bytes, saveVersion = true, label = 'Opened' }) {
  if (!bytes) {
    currentDoc = null
    notify()
    return null
  }

  const clone = new Uint8Array(bytes.byteLength)
  clone.set(new Uint8Array(bytes))
  const doc = await pdfjs.getDocument({ data: clone }).promise

  currentDoc = {
    name: name || 'document.pdf',
    bytes,
    doc,
    count: doc.numPages,
    size: bytes.byteLength,
    modifiedAt: Date.now()
  }

  if (saveVersion) {
    saveDocumentVersion(currentDoc.name, label, bytes)
  }

  notify()
  return currentDoc
}

export async function updateActiveDocument(newBytes, label = 'Modified') {
  if (!currentDoc) return null
  return setActiveDocument({
    name: currentDoc.name,
    bytes: newBytes,
    saveVersion: true,
    label
  })
}

export function clearActiveDocument() {
  currentDoc = null
  notify()
}

export function useWorkspaceDoc() {
  const [doc, setDoc] = useState(currentDoc)

  useEffect(() => {
    const handler = d => setDoc(d)
    listeners.add(handler)
    return () => listeners.delete(handler)
  }, [])

  return doc
}
