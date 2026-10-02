// Dedicated PDF Security Web Worker
// Execution-containment & fault-isolation boundary for scanning and sanitization

import { scanPdfStructure } from '../securityScanner/scanner.js'
import { sanitizeStandard } from '../securityScanner/sanitizer.js'
import { verifySanitizedDocument } from '../securityScanner/verifier.js'

let activeHeartbeatInterval = null

function startHeartbeat(requestId) {
  stopHeartbeat()
  activeHeartbeatInterval = setInterval(() => {
    try {
      self.postMessage({ type: 'HEARTBEAT', requestId, timestamp: Date.now() })
    } catch {}
  }, 1000)
}

function stopHeartbeat() {
  if (activeHeartbeatInterval) {
    clearInterval(activeHeartbeatInterval)
    activeHeartbeatInterval = null
  }
}

if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  self.onmessage = async (e) => {
    const { type, requestId, pdfBytes, mode, policy, options } = e.data || {}
    if (!requestId) return

    if (type === 'SCAN') {
      startHeartbeat(requestId)
      try {
        const bytes = new Uint8Array(pdfBytes)
        const result = await scanPdfStructure(bytes, options)
        stopHeartbeat()
        self.postMessage({ type: 'SCAN_RESULT', requestId, result })
      } catch (err) {
        stopHeartbeat()
        self.postMessage({ type: 'ERROR', requestId, error: err?.message || 'Scanning encountered an unexpected error.' })
      }
    } else if (type === 'SANITIZE') {
      startHeartbeat(requestId)
      try {
        const bytes = new Uint8Array(pdfBytes)
        if (mode === 'standard') {
          const { sanitizedBytes, removedItems, preservedItems } = await sanitizeStandard(bytes, policy)
          const verification = await verifySanitizedDocument(sanitizedBytes, policy)
          stopHeartbeat()

          // Send back transferable ArrayBuffer
          const buffer = sanitizedBytes.buffer.slice(sanitizedBytes.byteOffset, sanitizedBytes.byteOffset + sanitizedBytes.byteLength)
          self.postMessage(
            {
              type: 'SANITIZE_RESULT',
              requestId,
              sanitizedBytes: buffer,
              removedItems,
              preservedItems,
              verification
            },
            [buffer]
          )
        } else {
          stopHeartbeat()
          self.postMessage({ type: 'ERROR', requestId, error: 'Maximum Safety rendering must be orchestrated via the host client.' })
        }
      } catch (err) {
        stopHeartbeat()
        self.postMessage({ type: 'ERROR', requestId, error: err?.message || 'Sanitization encountered an unexpected error.' })
      }
    } else if (type === 'CANCEL') {
      stopHeartbeat()
    }
  }
}
