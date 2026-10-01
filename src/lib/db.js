// Lightweight IndexedDB storage for document versions and workflows
const DB_NAME = 'editpdf_workspace'
const DB_VERSION = 1

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = e => {
      const db = e.target.result
      if (!db.objectStoreNames.contains('versions')) {
        const store = db.createObjectStore('versions', { keyPath: 'id' })
        store.createIndex('docName', 'docName', { unique: false })
        store.createIndex('timestamp', 'timestamp', { unique: false })
      }
      if (!db.objectStoreNames.contains('workflows')) {
        db.createObjectStore('workflows', { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveDocumentVersion(docName, label, bytes) {
  try {
    const db = await openDB()
    const id = `${docName}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const entry = {
      id,
      docName,
      label,
      size: bytes.byteLength,
      timestamp: Date.now(),
      bytes
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction('versions', 'readwrite')
      tx.objectStore('versions').put(entry)
      tx.oncomplete = () => resolve(entry)
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('Could not save version to IndexedDB:', err)
    return null
  }
}

export async function getDocumentVersions(docName) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('versions', 'readonly')
      const index = tx.objectStore('versions').index('docName')
      const req = index.getAll(IDBKeyRange.only(docName))
      req.onsuccess = () => {
        const list = (req.result || []).sort((a, b) => b.timestamp - a.timestamp)
        resolve(list)
      }
      req.onerror = () => reject(req.error)
    })
  } catch {
    return []
  }
}

export async function deleteDocumentVersion(id) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('versions', 'readwrite')
      tx.objectStore('versions').delete(id)
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    return false
  }
}

export async function saveCustomWorkflow(workflow) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('workflows', 'readwrite')
      tx.objectStore('workflows').put(workflow)
      tx.oncomplete = () => resolve(workflow)
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    return null
  }
}

export async function getCustomWorkflows() {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('workflows', 'readonly')
      const req = tx.objectStore('workflows').getAll()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => reject(req.error)
    })
  } catch {
    return []
  }
}

export async function deleteCustomWorkflow(id) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('workflows', 'readwrite')
      tx.objectStore('workflows').delete(id)
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    return false
  }
}
