// Lightweight IndexedDB storage for document versions, active sessions, and workflows
const DB_NAME = 'editpdf_workspace'
const DB_VERSION = 2

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
      if (!db.objectStoreNames.contains('active_doc')) {
        db.createObjectStore('active_doc', { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveActiveDocumentSession(name, bytes, label = 'Active') {
  try {
    const db = await openDB()
    const entry = { id: 'current', name, bytes, label, timestamp: Date.now() }
    return new Promise((resolve) => {
      const tx = db.transaction('active_doc', 'readwrite')
      tx.objectStore('active_doc').put(entry)
      tx.oncomplete = () => resolve(entry)
      tx.onerror = () => {
        console.warn('Storage or quota warning on active document save:', tx.error)
        resolve(null)
      }
    })
  } catch (err) {
    console.warn('Could not save active document session:', err)
    return null
  }
}

export async function getActiveDocumentSession() {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction('active_doc', 'readonly')
      const req = tx.objectStore('active_doc').get('current')
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

export async function clearActiveDocumentSession() {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction('active_doc', 'readwrite')
      tx.objectStore('active_doc').delete('current')
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
    })
  } catch {
    return false
  }
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
