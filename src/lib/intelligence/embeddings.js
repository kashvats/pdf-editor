// Deterministic semantic embedding generator (128 dimensions, L2 normalized)
// Runs 100% on device with zero server dependency, compatible with WebGPU & WASM math.

const EMBEDDING_DIM = 128
const DB_NAME = 'editpdf_intelligence'
const DB_VERSION = 1

function openIntelligenceDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = e => {
      const db = e.target.result
      if (!db.objectStoreNames.contains('embeddings')) {
        const store = db.createObjectStore('embeddings', { keyPath: 'id' })
        store.createIndex('docName', 'docName', { unique: false })
      }
      if (!db.objectStoreNames.contains('knowledge')) {
        const store = db.createObjectStore('knowledge', { keyPath: 'id' })
        store.createIndex('docName', 'docName', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// Fast hash projection into embedding dimensions
function hashTokenToBucket(str, seed = 0) {
  let h = 0x811c9dc5 ^ seed
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return Math.abs(h)
}

export function generateEmbedding(text) {
  const vec = new Float32Array(EMBEDDING_DIM)
  if (!text || !text.trim()) return vec

  const clean = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
  const tokens = clean.split(/\s+/).filter(t => t.length > 1)

  // Character n-grams (trigrams) + word tokens for semantic and syntactic coverage
  const ngrams = []
  for (const token of tokens) {
    ngrams.push(token)
    if (token.length > 3) {
      for (let i = 0; i < token.length - 2; i++) {
        ngrams.push(token.slice(i, i + 3))
      }
    }
  }

  for (const gram of ngrams) {
    const b1 = hashTokenToBucket(gram, 13) % EMBEDDING_DIM
    const b2 = hashTokenToBucket(gram, 37) % EMBEDDING_DIM
    const b3 = hashTokenToBucket(gram, 97) % EMBEDDING_DIM

    // Sign hashing
    const sign1 = (hashTokenToBucket(gram, 53) % 2 === 0) ? 1 : -1
    const sign2 = (hashTokenToBucket(gram, 79) % 2 === 0) ? 1 : -1

    vec[b1] += sign1 * 1.0
    vec[b2] += sign2 * 0.7
    vec[b3] += 0.5
  }

  // L2 Normalization
  let norm = 0
  for (let i = 0; i < EMBEDDING_DIM; i++) norm += vec[i] * vec[i]
  norm = Math.sqrt(norm)

  if (norm > 0) {
    for (let i = 0; i < EMBEDDING_DIM; i++) vec[i] /= norm
  }

  return vec
}

export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0
  let dot = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
  }
  return Math.max(-1, Math.min(1, dot))
}

export async function batchEmbedChunks(chunks, onProgress) {
  const embedded = []
  const total = chunks.length

  for (let i = 0; i < total; i++) {
    const chunk = chunks[i]
    const vector = generateEmbedding(chunk.text)
    embedded.push({
      ...chunk,
      vector: Array.from(vector)
    })
    onProgress?.((i + 1) / total)
  }

  return embedded
}

export async function saveDocumentEmbeddings(docName, embeddedChunks) {
  try {
    const db = await openIntelligenceDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('embeddings', 'readwrite')
      const store = tx.objectStore('embeddings')
      store.put({ id: docName, docName, chunks: embeddedChunks, updatedAt: Date.now() })
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('Could not save embeddings in IndexedDB:', err)
    return false
  }
}

export async function getDocumentEmbeddings(docName) {
  try {
    const db = await openIntelligenceDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('embeddings', 'readonly')
      const store = tx.objectStore('embeddings')
      const req = store.get(docName)
      req.onsuccess = () => resolve(req.result ? req.result.chunks : null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}
