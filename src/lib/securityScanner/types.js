// PDF Security Types, Capabilities & Policy Definitions

export const SECURITY_CAPABILITIES = {
  EXECUTE_JAVASCRIPT: 'execute_javascript',
  LAUNCH_PROCESS: 'launch_process',
  EXTERNAL_NAVIGATION: 'external_navigation',
  FORM_SUBMISSION: 'form_submission',
  DATA_IMPORT: 'data_import',
  EMBEDDED_FILES: 'embedded_files',
  MULTIMEDIA_PLAYBACK: 'multimedia_playback',
  XFA_PROCESSING: 'xfa_processing',
  AUTO_EXECUTION: 'auto_execution'
}

export function createDefaultSanitizationPolicy(mode = 'standard') {
  if (mode === 'maximum_safety') {
    return {
      mode: 'maximum_safety',
      prohibitedCapabilities: new Set(Object.values(SECURITY_CAPABILITIES)),
      allowedUriSchemes: new Set(), // No external actions in maximum safety
      removeEmbeddedFiles: true,
      removeMultimediaAndXfa: true,
      flattenForms: true,
      preserveSignatureAppearance: true,
      renderingConfig: {
        targetDpi: 150,
        maxBitmapMemoryBytes: 48 * 1024 * 1024,
        maxPixelsPerPage: 36_000_000,
        timeoutPerStageMs: 30000
      }
    }
  }

  return {
    mode: 'standard',
    prohibitedCapabilities: new Set([
      SECURITY_CAPABILITIES.EXECUTE_JAVASCRIPT,
      SECURITY_CAPABILITIES.LAUNCH_PROCESS,
      SECURITY_CAPABILITIES.FORM_SUBMISSION,
      SECURITY_CAPABILITIES.DATA_IMPORT,
      SECURITY_CAPABILITIES.EMBEDDED_FILES,
      SECURITY_CAPABILITIES.MULTIMEDIA_PLAYBACK,
      SECURITY_CAPABILITIES.XFA_PROCESSING,
      SECURITY_CAPABILITIES.AUTO_EXECUTION
    ]),
    allowedUriSchemes: new Set(['https', 'http']), // mailto is explicit opt-in
    removeEmbeddedFiles: true,
    removeMultimediaAndXfa: true,
    flattenForms: false,
    preserveSignatureAppearance: true,
    renderingConfig: {
      targetDpi: 150,
      maxBitmapMemoryBytes: 48 * 1024 * 1024,
      maxPixelsPerPage: 36_000_000,
      timeoutPerStageMs: 20000
    }
  }
}
