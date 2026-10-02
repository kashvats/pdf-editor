// Post-Sanitization Policy Verification Gate
// Validates that output document contains zero prohibited capabilities

import { scanPdfStructure } from './scanner.js'

export async function verifySanitizedDocument(sanitizedBytes, policy) {
  const errors = []
  const result = await scanPdfStructure(sanitizedBytes)

  if (result.status !== 'SCAN_COMPLETE') {
    errors.push('Sanitized output document could not be completely validated by the scanner.')
  }

  // Filter findings against policy.prohibitedCapabilities
  const violatingFindings = result.findings.filter(f => {
    // If finding has high severity, it's an automatic violation
    if (f.severity === 'high') return true

    // Check if any finding capability is prohibited
    if (f.capabilities && f.capabilities.some(c => policy.prohibitedCapabilities.has(c))) {
      return true
    }

    return false
  })

  if (violatingFindings.length > 0) {
    errors.push(`Output document still contains ${violatingFindings.length} prohibited feature(s).`)
  }

  return {
    verified: errors.length === 0,
    remainingFindings: violatingFindings,
    errors
  }
}
