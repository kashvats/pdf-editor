// PDF Security Worker Client & Watchdog Orchestrator
// Manages worker containment, heartbeat watchdogs, timeouts, and cooperative cancellation

import { scanPdfStructure } from './scanner.js'
import { sanitizeStandard, sanitizeMaximumSafety } from './sanitizer.js'
import { verifySanitizedDocument } from './verifier.js'

let activeWorker = null

function checkAbort(signal) {
  if (signal?.aborted) {
    const err = new Error('Operation aborted by user')
    err.name = 'AbortError'
    throw err
  }
}

export async function runSecurityInspectionPipeline(bytes, options = {}) {
  const { signal, timeoutMs = 20000, resourceConfig } = options
  checkAbort(signal)

  // In Node.js or when Web Workers are unavailable, run in-process with timeout & signal
  if (typeof Worker === 'undefined') {
    return runInProcessScan(bytes, { signal, timeoutMs, resourceConfig })
  }

  return runWorkerScan(bytes, { signal, timeoutMs, resourceConfig })
}

async function runInProcessScan(bytes, { signal, timeoutMs, resourceConfig }) {
  checkAbort(signal)
  return new Promise((resolve, reject) => {
    let timer = null
    const onAbort = () => {
      if (timer) clearTimeout(timer)
      const err = new Error('Operation aborted by user')
      err.name = 'AbortError'
      reject(err)
    }

    if (signal) {
      signal.addEventListener('abort', onAbort)
    }

    timer = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort)
      reject(new Error(`Security scan timed out after ${timeoutMs}ms.`))
    }, timeoutMs)

    scanPdfStructure(bytes, { resourceConfig })
      .then(res => {
        if (timer) clearTimeout(timer)
        if (signal) signal.removeEventListener('abort', onAbort)
        resolve(res)
      })
      .catch(err => {
        if (timer) clearTimeout(timer)
        if (signal) signal.removeEventListener('abort', onAbort)
        reject(err)
      })
  })
}

async function runWorkerScan(bytes, { signal, timeoutMs, resourceConfig }) {
  checkAbort(signal)

  return new Promise((resolve, reject) => {
    const requestId = `scan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    let worker = null

    try {
      worker = new Worker(new URL('../workers/pdfSecurity.worker.js', import.meta.url), { type: 'module' })
      activeWorker = worker
    } catch {
      // Fallback to in-process
      return runInProcessScan(bytes, { signal, timeoutMs, resourceConfig }).then(resolve, reject)
    }

    let lastHeartbeat = Date.now()
    let watchdogInterval = null
    let stageTimeout = null

    const cleanup = () => {
      if (watchdogInterval) clearInterval(watchdogInterval)
      if (stageTimeout) clearTimeout(stageTimeout)
      if (signal) signal.removeEventListener('abort', handleAbort)
    }

    const terminateWorker = (err) => {
      cleanup()
      try { worker.terminate() } catch {}
      if (activeWorker === worker) activeWorker = null
      reject(err)
    }

    const handleAbort = () => {
      const err = new Error('Operation aborted by user')
      err.name = 'AbortError'
      terminateWorker(err)
    }

    if (signal) {
      signal.addEventListener('abort', handleAbort)
    }

    // Progress-aware and tab-visibility aware watchdog
    watchdogInterval = setInterval(() => {
      // If tab is hidden, background timer throttling may cause delays
      const isDocumentHidden = typeof document !== 'undefined' && document.hidden
      const toleranceMs = isDocumentHidden ? 10000 : 4000

      if (Date.now() - lastHeartbeat > toleranceMs) {
        terminateWorker(new Error('Security worker stopped responding (watchdog timeout).'))
      }
    }, 1500)

    stageTimeout = setTimeout(() => {
      terminateWorker(new Error(`Security scan exceeded total budget of ${timeoutMs}ms.`))
    }, timeoutMs)

    worker.onmessage = (e) => {
      const msg = e.data || {}
      if (msg.requestId !== requestId) return

      if (msg.type === 'HEARTBEAT') {
        lastHeartbeat = Date.now()
      } else if (msg.type === 'SCAN_RESULT') {
        cleanup()
        resolve(msg.result)
      } else if (msg.type === 'ERROR') {
        cleanup()
        reject(new Error(msg.error))
      }
    }

    worker.onerror = (err) => {
      terminateWorker(new Error(`Worker encountered fatal error: ${err?.message || 'unknown'}`))
    }

    // Transfer bytes buffer
    const copyBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    worker.postMessage({
      type: 'SCAN',
      requestId,
      pdfBytes: copyBuffer,
      options: { resourceConfig }
    }, [copyBuffer])
  })
}

export async function runSecuritySanitizePipeline(bytes, mode, policy, options = {}) {
  const { signal, renderPageCallback } = options
  checkAbort(signal)

  if (mode === 'maximum_safety') {
    if (!renderPageCallback) {
      throw new Error('Maximum Safety mode requires a page rendering callback.')
    }
    const { sanitizedBytes, removedItems, preservedItems } = await sanitizeMaximumSafety(bytes, renderPageCallback, policy)
    checkAbort(signal)
    const verification = await verifySanitizedDocument(sanitizedBytes, policy)
    return { sanitizedBytes, removedItems, preservedItems, verification }
  }

  // Standard Sanitization
  const { sanitizedBytes, removedItems, preservedItems } = await sanitizeStandard(bytes, policy)
  checkAbort(signal)
  const verification = await verifySanitizedDocument(sanitizedBytes, policy)
  return { sanitizedBytes, removedItems, preservedItems, verification }
}
