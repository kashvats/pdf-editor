// PDF Security Resource Guards, Traversal Tracking & Anti-Bomb Protection

export const DEFAULT_RESOURCE_CONFIG = {
  maxFileSizeBytes: 150 * 1024 * 1024, // 150 MB
  maxUniqueObjects: 50000,
  maxRecursionDepth: 24,
  maxReferenceHops: 50000,
  maxDecodedStreamBytes: 30 * 1024 * 1024, // 30 MB per stream
  maxTotalDecodedBytes: 150 * 1024 * 1024, // 150 MB total cumulative
  maxExpansionRatio: 100, // 100x expansion ratio threshold
  maxImageDimension: 6000, // max width or height
  maxBitmapMemoryBytes: 48 * 1024 * 1024 // 48 MB conservative default
}

/**
 * Checks preflight limits on the raw PDF byte buffer before opening or parsing.
 */
export function checkPreflightLimits(bytes, config = {}) {
  const merged = { ...DEFAULT_RESOURCE_CONFIG, ...config }
  if (!bytes) {
    return { allowed: false, reason: 'Empty document bytes' }
  }

  const length = bytes.byteLength || bytes.length || 0
  if (length > merged.maxFileSizeBytes) {
    const mb = Math.round(length / (1024 * 1024))
    const limitMb = Math.round(merged.maxFileSizeBytes / (1024 * 1024))
    return {
      allowed: false,
      reason: `File size (${mb} MB) exceeds maximum allowed limit of ${limitMb} MB.`
    }
  }

  return { allowed: true }
}

/**
 * Creates an object graph traversal tracker that tracks depth and detects circular references.
 */
export function createTraversalTracker(config = {}) {
  const merged = { ...DEFAULT_RESOURCE_CONFIG, ...config }
  const visited = new Set()
  const cycles = new Set()
  let totalHops = 0

  return {
    visit(refKey, currentDepth = 1) {
      totalHops++
      if (totalHops > merged.maxReferenceHops) {
        return false
      }

      if (currentDepth > merged.maxRecursionDepth) {
        return false
      }

      if (visited.has(refKey)) {
        cycles.add(refKey)
        return false // Circular reference or already traversed
      }

      if (visited.size >= merged.maxUniqueObjects) {
        return false
      }

      visited.add(refKey)
      return true
    },

    isVisited(refKey) {
      return visited.has(refKey)
    },

    isCycle(refKey) {
      return cycles.has(refKey)
    },

    count() {
      return visited.size
    }
  }
}

/**
 * Checks if a stream decompression exceeds allowed safety ratios or cumulative limits.
 */
export function checkStreamExpansion(compressedSize, decompressedSize, totalDecodedBytesSoFar, config = {}) {
  const merged = { ...DEFAULT_RESOURCE_CONFIG, ...config }

  if (totalDecodedBytesSoFar > merged.maxTotalDecodedBytes) {
    return false
  }

  if (decompressedSize > merged.maxDecodedStreamBytes) {
    return false
  }

  if (compressedSize > 0) {
    const ratio = decompressedSize / compressedSize
    if (ratio > merged.maxExpansionRatio && decompressedSize >= 10000) {
      return false
    }
  }

  return true
}

/**
 * Checks image pixel dimensions and estimated RGBA memory before buffer allocation.
 */
export function checkImageLimits(width, height, config = {}) {
  const merged = { ...DEFAULT_RESOURCE_CONFIG, ...config }

  if (!width || !height || width <= 0 || height <= 0) {
    return { allowed: true }
  }

  if (width > merged.maxImageDimension || height > merged.maxImageDimension) {
    return {
      allowed: false,
      reason: `Image dimension (${width}x${height}) exceeds safe limit of ${merged.maxImageDimension}px.`
    }
  }

  // 4 bytes per pixel for uncompressed RGBA bitmap
  const estimatedBytes = width * height * 4
  const memoryLimit = getAdaptiveMemoryLimit(merged.maxBitmapMemoryBytes)

  if (estimatedBytes > memoryLimit) {
    const mb = Math.round(estimatedBytes / (1024 * 1024))
    const limitMb = Math.round(memoryLimit / (1024 * 1024))
    return {
      allowed: false,
      reason: `Estimated bitmap memory (${mb} MB) exceeds allowed page budget of ${limitMb} MB.`
    }
  }

  return { allowed: true }
}

function getAdaptiveMemoryLimit(defaultBudget) {
  if (typeof navigator !== 'undefined' && typeof navigator.deviceMemory === 'number') {
    // navigator.deviceMemory is in GB (e.g. 4, 8)
    const adaptive = Math.round(navigator.deviceMemory * 0.12 * 1024 * 1024 * 1024)
    return Math.min(128 * 1024 * 1024, Math.max(defaultBudget, adaptive))
  }
  return defaultBudget
}
